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
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

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
