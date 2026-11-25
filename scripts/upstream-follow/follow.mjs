#!/usr/bin/env node
// The upstream-follow job (frontend#238, autorepo 4).
//
// When the drift canary (scripts/drift-canary/canary.mjs) sees a pinned upstream move, this
// puts the new pin in a throwaway tree, regenerates r/ and its stamp, runs `pnpm check`, and
// files an issue with the outcome:
//
//   green   an issue that names the bump and attaches the check output, with the command
//           that lands it
//   red     a Repair brief (frontend#235) with the failing step and its output
//
// Issues only. Nothing here commits or pushes: an automatic push to main would put this
// repo's own trunk-health rule (3 reds in a day pause the repo) in the hands of someone
// else's release, so auto-push stays the owner's later decision.
//
//   node scripts/upstream-follow/follow.mjs apply shadcn 4.23.0   bump the pin and regenerate, here
//   node scripts/upstream-follow/follow.mjs trial --followups f.json --out o.json
//                                                                  CI only: try each bump
//   node scripts/upstream-follow/follow.mjs file --outcomes o.json --state s.json --repo owner/name
//                                                                  file what the trial found
//
// The workflow runs `trial` in a step with no token and `file` in a later step with one, so a
// new upstream release never executes beside a token that can write issues.
// The idea comes from rauchg/xeet's sync.yml (Apache-2.0); this code is written for this
// repo and copies none of it.
import { spawn } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { PROBES } from "../drift-canary/canary.mjs"
import { defaultGh, fenced, fileRepairBrief, tail, withRepo } from "../repair-brief/repair-brief.mjs"

// ── The pin sites ────────────────────────────────────────────────────────────────────────

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// A version with nothing version-like after it, so 4.19.1 never matches inside 4.19.10.
const versionPattern = (version) => `${escapeRegExp(version)}(?![0-9A-Za-z.-])`

// What each pin looks like in each file that writes it. `required` sites must hold the pin:
// a file that lost it means the pins are no longer where this job thinks, and a half bump
// would fail `pnpm check` for a reason that has nothing to do with the new version.
export const PIN_SITES = Object.freeze({
  shadcn: [
    { file: "scripts/check.sh", required: true, text: (v) => `SHADCN_VERSION=${v}` },
    {
      file: "scripts/stamp/pins.mjs",
      required: true,
      text: (v) => `SHADCN_VERSION = "${v}"`,
    },
    { file: ".github/workflows/design.yml", required: true, text: (v) => `shadcn@${v}` },
    { file: ".github/workflows/release.yml", required: true, text: (v) => `shadcn@${v}` },
    {
      file: "README.md",
      required: false,
      text: (v) => `shadcn@${v} build --output ./r`,
    },
  ],
  impeccable: [
    {
      file: "scripts/check.sh",
      required: true,
      text: (v) => `IMPECCABLE_VERSION=${v}`,
    },
    { file: ".github/workflows/design.yml", required: true, text: (v) => `impeccable@${v}` },
    { file: ".github/workflows/release.yml", required: true, text: (v) => `impeccable@${v}` },
  ],
})

// The version is written into files and run by npx, and it came off the network.
export const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z][0-9A-Za-z.-]*)?$/

const assertVersion = (label, version) => {
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
    throw new Error(`upstream-follow: ${label} "${version}" is not a plain version (1.2.3)`)
  }
}

// Moves one pin from `from` to `to` in every file that writes it. Returns the files it
// changed. Nothing is written unless every required site holds the pin.
export const bumpPin = ({ root, pkg, from, to }) => {
  const sites = PIN_SITES[pkg]
  if (!sites) throw new Error(`upstream-follow: no pin sites known for "${pkg}" (known: ${Object.keys(PIN_SITES).join(", ")})`)
  assertVersion("the target version", to)
  assertVersion("the current pin", from)

  const pending = []
  for (const site of sites) {
    let before
    try {
      before = readFileSync(join(root, site.file), "utf8")
    } catch (error) {
      if (!site.required && error.code === "ENOENT") continue
      throw new Error(`upstream-follow: cannot read ${site.file}: ${error.message}`)
    }
    const matcher = new RegExp(versionedPattern(site, from), "g")
    if (!matcher.test(before)) {
      if (site.required) throw new Error(`upstream-follow: ${site.file} does not pin ${pkg} at ${from}`)
      continue
    }
    pending.push({ file: site.file, after: before.replace(new RegExp(versionedPattern(site, from), "g"), () => site.text(to)) })
  }
  for (const { file, after } of pending) writeFileSync(join(root, file), after)
  return pending.map(({ file }) => file)
}

// The site's pattern with `from` as a whole version: the pattern escapes the surrounding text
// and puts the version through versionPattern.
const versionedPattern = (site, version) => {
  const marker = "\u0000"
  const template = site.text(marker)
  return template
    .split(marker)
    .map(escapeRegExp)
    .join(versionPattern(version))
}

// ── One trial ────────────────────────────────────────────────────────────────────────────

// What regenerates after a pin moves. A new shadcn writes different bytes into r/ and the
// stamp records the pin; a new impeccable only changes what `pnpm check` accepts.
const REGENERATE = Object.freeze({
  shadcn: [{ command: "pnpm", args: ["build:registry"], label: "pnpm build:registry (regenerate r/ and its stamp)" }],
  impeccable: [],
})

const CHECK = { command: "bash", args: ["scripts/check.sh"] }

// check.sh names its failing step on the last lines: `check: FAIL at step 3/4 (shadcn build)`.
const failingStep = (output, status) => {
  const named = /check: FAIL at step (\S+) \(([^\n]*)\)\s*$/m.exec(output)
  return named ? `pnpm check, step ${named[1]} (${named[2]})` : `pnpm check (exit ${status})`
}

const text = (result) => String(result.output ?? "")

// Puts the new pin in `root`, regenerates, runs the check. `run(command, args)` runs a command
// in `root`. Resolves one outcome: `ok` with what changed, or not `ok` with the failing check
// and its output. A failure here is a finding, never an exception: the bump is what is on trial.
export const trial = async ({ root, pkg, from, to, run }) => {
  const base = { pkg, from, to }
  try {
    bumpPin({ root, pkg, from, to })
  } catch (error) {
    return { ...base, ok: false, failingCheck: "bump the pin (scripts/upstream-follow/follow.mjs)", output: error.message }
  }

  for (const step of REGENERATE[pkg] ?? []) {
    const result = await run(step.command, step.args)
    if (result.status !== 0) return { ...base, ok: false, failingCheck: step.label, output: text(result) }
  }

  const check = await run(CHECK.command, CHECK.args)
  if (check.status !== 0) return { ...base, ok: false, failingCheck: failingStep(text(check), check.status), output: text(check) }

  const status = await run("git", ["status", "--short"])
  const stat = await run("git", ["diff", "--stat"])
  return { ...base, ok: true, output: text(check), changes: { status: text(status).trim(), stat: text(stat).trim() } }
}

// ── Every bump the canary handed over ────────────────────────────────────────────────────

const SECRET_ENV = /^(GH_TOKEN|GITHUB_TOKEN|ACTIONS_RUNTIME_TOKEN|ACTIONS_ID_TOKEN_REQUEST_TOKEN|ACTIONS_ID_TOKEN_REQUEST_URL)$/

// The environment a bumped upstream runs in: the caller's, minus every token. A release this
// job has not read yet runs `pnpm check` here, so it must find nothing that can write issues.
export const withoutTokens = (env) => Object.fromEntries(Object.entries(env).filter(([name]) => !SECRET_ENV.test(name)))

const MAX_CAPTURE = 4 * 1024 * 1024
const COMMAND_TIMEOUT_MS = 40 * 60 * 1000

// Runs one command, resolves { status, output } with stdout and stderr interleaved and the
// tail kept if it is huge. Never rejects: a command that cannot start is a status of 127.
export const spawnExec = (command, args, { cwd, env } = {}) =>
  new Promise((resolve) => {
    let output = ""
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], timeout: COMMAND_TIMEOUT_MS })
    const collect = (chunk) => {
      output += chunk
      if (output.length > MAX_CAPTURE) output = output.slice(output.length - MAX_CAPTURE)
    }
    child.stdout.on("data", collect)
    child.stderr.on("data", collect)
    child.on("error", (error) => resolve({ status: 127, output: `${output}${error.message}\n` }))
    child.on("close", (code, signal) => resolve({ status: code ?? (signal ? 128 : 1), output }))
  })

// Tries each bump in turn, each from a clean tree. `followups` are the canary's drifts:
// { id, pkg, from, to, fingerprint }. Rewrites and then discards the working tree, so it runs
// only in CI (or with `inPlace`, which says the caller accepts that).
export const trialAll = async ({ root, followups, exec = spawnExec, env = process.env, inPlace = false }) => {
  if (followups.length === 0) return []
  if (!inPlace && env.CI !== "true") {
    throw new Error("upstream-follow: trial rewrites the working tree and then discards it; run it in CI, or pass --in-place to accept that here")
  }
  const cleanEnv = withoutTokens(env)
  const run = (command, args) => exec(command, args, { cwd: root, env: cleanEnv })

  const installed = await run("pnpm", ["install", "--frozen-lockfile"])
  if (installed.status !== 0) {
    throw new Error(`upstream-follow: pnpm install --frozen-lockfile failed (exit ${installed.status}):\n${text(installed).slice(-4000)}`)
  }

  const outcomes = []
  for (const followup of followups) {
    const outcome = await trial({ root, pkg: followup.pkg, from: followup.from, to: followup.to, run })
    outcomes.push({ id: followup.id, fingerprint: followup.fingerprint, ...outcome })
    await run("git", ["checkout", "--", "."])
    await run("git", ["clean", "-fdq", "--", "r", "stamps"])
  }
  return outcomes
}

// ── Filing ───────────────────────────────────────────────────────────────────────────────

// Labels are fixed, as the Repair brief's are: no `wave:` label, because the orchestrator's
// wave check places the wave (owner, 16 Nov 2026 20:00 AEDT).
export const FOLLOW_LABELS = Object.freeze(["mode:afk", "type:build"])

const MAX_BODY_CHARS = 60_000
const MAX_OUTPUT_CHARS = 12_000
const MAX_CHANGE_LINES = 60

export const followTitle = ({ pkg, from, to }) => `Upstream follow: bump ${pkg} ${from} -> ${to}`

const cappedLines = (value, limit) => {
  const lines = value.split("\n")
  return lines.length <= limit ? value : `${lines.slice(0, limit).join("\n")}\n... and ${lines.length - limit} more`
}

export const renderFollowIssue = ({ pkg, from, to, output, changes }, runUrl) => {
  const shown = tail(String(output ?? "").trim(), MAX_OUTPUT_CHARS)
  const changed = `${changes?.status ?? ""}`.trim()
  const sections = [
    `The drift canary saw \`${pkg}\` move from ${from} to ${to} (npm latest). With the new pin, regenerated output and \`pnpm check\` pass in a throwaway tree. Nothing was pushed.`,
    `## Run\n\n${runUrl ?? "No run link given."}`,
    `## Bump\n\n${pkg} ${from} -> ${to}`,
    `## What the bump changes\n\n${
      changed === ""
        ? "Nothing changed beyond the pin."
        : fenced(`${cappedLines(changed, MAX_CHANGE_LINES)}${changes.stat ? `\n\n${changes.stat}` : ""}`)
    }`,
    `## Check output\n\n${
      shown.text === ""
        ? "No output captured."
        : `${shown.cut ? `Output truncated to its last ${MAX_OUTPUT_CHARS} characters.\n\n` : ""}${fenced(shown.text)}`
    }`,
    `## Land it\n\nRead ${pkg}'s release notes first, then, from a worktree on main:\n\n${fenced(
      [`node scripts/upstream-follow/follow.mjs apply ${pkg} ${to}`, "pnpm check"].join("\n"),
      "sh",
    )}\n\nCommit the result with \`Refs\` to this issue. When it changes what \`r/\` serves, say what changed for consumers in the commit type and message.`,
    "Mode: AFK",
  ]
  const body = sections.join("\n\n")
  return body.length > MAX_BODY_CHARS ? `${body.slice(0, MAX_BODY_CHARS)}\n\n(body truncated)\n\nMode: AFK` : body
}

const withBodyFile = async (body, use) => {
  const dir = mkdtempSync(join(tmpdir(), "upstream-follow-"))
  const bodyFile = join(dir, "body.md")
  writeFileSync(bodyFile, body)
  try {
    return await use(bodyFile)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// One green outcome as one issue, or a comment on the open issue for the same bump.
export const fileFollowIssue = async (outcome, { gh = defaultGh, repo, runUrl } = {}) => {
  const title = followTitle(outcome)
  const listed = await gh(
    withRepo(["issue", "list", "--state", "open", "--search", `"${title}" in:title`, "--limit", "30", "--json", "number,title"], repo),
  )
  const existing = JSON.parse(listed.stdout || "[]").find((issue) => issue.title === title)
  return withBodyFile(renderFollowIssue(outcome, runUrl), async (bodyFile) => {
    if (existing) {
      await gh(withRepo(["issue", "comment", String(existing.number), "--body-file", bodyFile], repo))
      return { action: "commented", number: existing.number }
    }
    const labels = FOLLOW_LABELS.flatMap((label) => ["--label", label])
    const created = await gh(withRepo(["issue", "create", "--title", title, "--body-file", bodyFile, ...labels], repo))
    return { action: "created", url: created.stdout.trim() }
  })
}

// A red outcome as a Repair brief under the probe's own key, so the canary's brief for the
// same probe and this one are the same issue.
export const briefForRed = (outcome, runUrl) => ({
  key: PROBES[outcome.id].driftKey,
  runUrl,
  changed: `${outcome.pkg} ${outcome.from} -> ${outcome.to} (npm latest); the check fails with the new pin`,
  failingCheck: outcome.failingCheck,
  output: outcome.output,
  repro: ["pnpm install --frozen-lockfile", `node scripts/upstream-follow/follow.mjs apply ${outcome.pkg} ${outcome.to}`, "pnpm check"],
})

export const fileOutcome = (outcome, { gh = defaultGh, repo, runUrl } = {}) =>
  outcome.ok
    ? fileFollowIssue(outcome, { gh, repo, runUrl })
    : fileRepairBrief(briefForRed(outcome, runUrl), { gh, repo })
