#!/usr/bin/env node
// The Repair brief helper (frontend#235, autorepo 3).
//
// Every automated failure this repo files (the drift canary, the upstream-follow job)
// goes through here, so a worker gets the run link, what changed, the failing check with
// its output and the repro commands from the issue alone. It files at most one open issue
// per stable title key: an open issue with the same title gets a comment, otherwise a new
// issue is created.
//
// Labels are fixed: `mode:afk` and `type:bug`. There is never a `wave:` label. Aquila
// places the wave on its next wave check (owner, 16 Nov 2026 20:00 AEDT), and the CLI
// has no flag that could add one. The idea comes from rauchg/xeet (Apache-2.0); this
// code is written for this repo.
//
//   node scripts/repair-brief/repair-brief.mjs --key "shadcn pin drift" \
//     --run-url "$RUN_URL" --changed "shadcn 4.19.1 -> 4.20.0" \
//     --failing-check "pnpm check, step 3/4" --output-file check.log \
//     --repro "pnpm install" --repro "pnpm check"
//
// The key must not hold anything that varies per run (a run id, a timestamp, a version
// that moves on every probe), or each run files a new issue.
import { execFile } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export const REPAIR_BRIEF_LABELS = Object.freeze(["mode:afk", "type:bug"])

export const BRIEF_HEADINGS = Object.freeze([
  "Run",
  "What changed",
  "Failing check",
  "Output",
  "Repro",
])

const TITLE_PREFIX = "Repair brief: "

// GitHub rejects an issue or comment body over 65536 characters.
const MAX_BODY_CHARS = 60_000
const MAX_OUTPUT_CHARS = 50_000

export const repairBriefTitle = (key) => {
  const normalised = String(key ?? "").replace(/\s+/g, " ").trim()
  if (normalised === "") throw new Error("a repair brief needs a non-empty --key")
  return `${TITLE_PREFIX}${normalised}`
}

// A fence one backtick longer than the longest run inside the text, so output that holds
// its own fences cannot close ours early.
const fenceFor = (text) => {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  return "`".repeat(Math.max(3, longest + 1))
}

const fenced = (text, info = "") => {
  const fence = fenceFor(text)
  return `${fence}${info}\n${text}\n${fence}`
}

// The failing line is at the bottom of a log, so a cut keeps the tail.
const tail = (text, limit) => {
  if (text.length <= limit) return { text, cut: false }
  return { text: text.slice(text.length - limit), cut: true }
}

export const renderBrief = ({ runUrl, changed, failingCheck, output, repro }) => {
  const trimmedOutput = String(output ?? "").trim()
  const commands = (repro ?? []).map((command) => String(command).trim()).filter(Boolean)
  const shown = tail(trimmedOutput, MAX_OUTPUT_CHARS)

  const sections = [
    "A check failed. This issue is the brief a worker picks up; it holds everything needed.",
    `## ${BRIEF_HEADINGS[0]}\n\n${runUrl ? String(runUrl).trim() : "No run link given."}`,
    `## ${BRIEF_HEADINGS[1]}\n\n${changed ? String(changed).trim() : "Not stated."}`,
    `## ${BRIEF_HEADINGS[2]}\n\n${failingCheck ? String(failingCheck).trim() : "Not stated."}`,
    `## ${BRIEF_HEADINGS[3]}\n\n${
      trimmedOutput === ""
        ? "No output captured."
        : `${shown.cut ? `Output truncated to its last ${MAX_OUTPUT_CHARS} characters.\n\n` : ""}${fenced(shown.text)}`
    }`,
    `## ${BRIEF_HEADINGS[4]}\n\n${
      commands.length === 0 ? "No repro commands given." : fenced(commands.join("\n"), "sh")
    }`,
  ]
  const body = sections.join("\n\n")
  return body.length > MAX_BODY_CHARS ? `${body.slice(0, MAX_BODY_CHARS)}\n\n(body truncated)` : body
}

const withRepo = (args, repo) => (repo ? [...args, "-R", repo] : args)

const defaultGh = async (args) => {
  const { stdout } = await execFileAsync("gh", args, { maxBuffer: 16 * 1024 * 1024 })
  return { stdout }
}

// Files or updates one deduplicated Repair brief.
// Resolves `{ action: "created", url }` or `{ action: "commented", number }`.
export const fileRepairBrief = async (brief, { gh = defaultGh, repo } = {}) => {
  const title = repairBriefTitle(brief.key)
  const body = renderBrief(brief)

  // `--search` is fuzzy, so ask for several hits and keep only an exact title match.
  const listed = await gh(
    withRepo(
      ["issue", "list", "--state", "open", "--search", `"${title}" in:title`, "--limit", "30", "--json", "number,title"],
      repo,
    ),
  )
  const open = JSON.parse(listed.stdout || "[]")
  const existing = open.find((issue) => issue.title === title)

  const dir = mkdtempSync(join(tmpdir(), "repair-brief-"))
  const bodyFile = join(dir, "body.md")
  writeFileSync(bodyFile, body)
  try {
    if (existing) {
      await gh(withRepo(["issue", "comment", String(existing.number), "--body-file", bodyFile], repo))
      return { action: "commented", number: existing.number }
    }
    const labels = REPAIR_BRIEF_LABELS.flatMap((label) => ["--label", label])
    const created = await gh(
      withRepo(["issue", "create", "--title", title, "--body-file", bodyFile, ...labels], repo),
    )
    return { action: "created", url: created.stdout.trim() }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const FLAGS = new Set([
  "--key",
  "--run-url",
  "--changed",
  "--failing-check",
  "--output-file",
  "--repro",
  "--repo",
])

export const parseArgs = (argv, { readFile = (path) => readFileSync(path, "utf8") } = {}) => {
  const parsed = { repro: [] }
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]
    if (!FLAGS.has(flag)) throw new Error(`unknown flag: ${flag}`)
    const value = argv[i + 1]
    if (value === undefined) throw new Error(`${flag} needs a value`)
    switch (flag) {
      case "--key":
        parsed.key = value
        break
      case "--run-url":
        parsed.runUrl = value
        break
      case "--changed":
        parsed.changed = value
        break
      case "--failing-check":
        parsed.failingCheck = value
        break
      case "--output-file":
        parsed.output = readFile(value)
        break
      case "--repro":
        parsed.repro.push(value)
        break
      case "--repo":
        parsed.repo = value
        break
    }
  }
  if (!parsed.key) throw new Error("--key is required")
  return parsed
}

const main = async () => {
  const { repo, ...brief } = parseArgs(process.argv.slice(2))
  const result = await fileRepairBrief(brief, { repo })
  console.log(
    result.action === "created"
      ? `repair-brief: created ${result.url}`
      : `repair-brief: commented on #${result.number}`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`repair-brief: ${error.message}`)
    process.exit(1)
  })
}
