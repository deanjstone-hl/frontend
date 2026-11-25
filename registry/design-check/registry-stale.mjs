#!/usr/bin/env node
// Reports registry files in a consumer that match an older release than the consumer's pin.
// Moving the `@frontend` pin in components.json does not move the code `shadcn add` already
// copied into the app, so a fix the pin has had for months can still be missing from a copy
// (frontend#211). This check lists those copies. It does not change a file.
//
//   node scripts/registry-stale.mjs [--pin <tag>] [--registry-url <template>] [--remote <git url>]
//
// For every components.json in the repo it reads the pin from `registries["@frontend"]`
// (or the old `@design-system`), finds the copies under `aliases.ui` and `aliases.components`
// that carry a registry file's name, and fingerprints each against the registry at the pin.
// A copy that differs from the pin is then compared with every older release. One that equals
// one of them is stale. One that equals none is a local edit or a fork, and is not reported.
//
// Warn-only: the workflow step is continue-on-error, so it never blocks a merge.
// Exit status: 0 nothing stale, 1 the registry could not be read, 2 stale copies found.
//
// Needs `git` and Node 20 or later (global fetch). It reads release tags with
// `git ls-remote` and each item's `r/<item>.json` over HTTP from the URL the pin names.
//
// Shipped by the frontend `design-check` registry item. The audit in
// docs/audits/primitives-usage uses the same fingerprint (`fingerprint` below).
import { execFileSync } from "node:child_process"
import { appendFileSync, readFileSync } from "node:fs"
import { basename, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const SEMVER = /^v(\d+)\.(\d+)\.(\d+)$/
const PINNED_URL = /^(.*)\/(v\d+\.\d+\.\d+)\/r\/\{name\}\.json$/
const RAW_BASE = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)$/
const TEMPLATE_TAIL = /\/[^/]+\/r\/\{name\}\.json$/
const ALIASES = ["@frontend", "@design-system"]
const FETCH_CONCURRENCY = 8
const FETCH_TIMEOUT_MS = 20_000

// What the shadcn CLI changes on install, undone so a consumer copy can be compared with
// the registry source: the "use client" directive (dropped when rsc is false), a leading
// comment block, and the cn-* marker classes and font-heading (removed by the style
// transform, which also reflows the cn() call they sat in).
// The comment is only stripped from the registry side: a comment a consumer added is an edit.
export function normaliseSource(source, { stripLeadingComment = false } = {}) {
  const body = source.replaceAll("\r\n", "\n").replace(/^\s*["']use client["'];?\s*\n+/, "")
  const uncommented = stripLeadingComment ? body.replace(/^(?:\s*\/\/[^\n]*\n)+/, "").replace(/^\s*\/\*[\s\S]*?\*\/\s*\n/, "") : body
  return uncommented
    .replace(/\s?\b(?:cn-[a-z-]+|font-heading)\b/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()
}

// Two copies with the same fingerprint differ only in whitespace and the transforms above.
export function fingerprint(source, options) {
  return normaliseSource(source, options).replace(/\s+/g, "")
}

const versionOf = (tag) => SEMVER.exec(tag).slice(1).map(Number)
const compareTags = (a, b) => {
  const [x, y] = [versionOf(a), versionOf(b)]
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}

// The pin a components.json names, or null: { tag, template, remote }. `template` is the
// alias URL with its `{name}` slot, `remote` the git URL of the repository it points at
// (null when the URL is not a raw.githubusercontent.com one).
// A URL not ending in a release tag, such as `main`, is no pin.
export function parsePin(config) {
  for (const alias of ALIASES) {
    const entry = config?.registries?.[alias]
    const template = typeof entry === "string" ? entry : entry?.url
    if (typeof template !== "string") continue
    const match = PINNED_URL.exec(template)
    if (!match) continue
    const raw = RAW_BASE.exec(match[1])
    return { tag: match[2], template, remote: raw ? `https://github.com/${raw[1]}/${raw[2]}.git` : null }
  }
  return null
}

const aliasDir = (alias) =>
  // A workspace-package alias (@scope/pkg/dir) cannot be mapped to a directory.
  !alias || (alias.startsWith("@") && !alias.startsWith("@/"))
    ? null
    : alias.replace(/^(?:@|~|#)\//, "").replace(/^\.\//, "").replace(/\/$/, "")

// The files, among the repo's tracked paths, that sit directly in the ui directory or the
// components directory of the app a components.json describes.
export function uiFilesOf(configPath, config, listed) {
  const appDir = dirname(configPath) === "." ? "" : `${dirname(configPath)}/`
  const aliases = config?.aliases ?? {}
  const uiAlias = aliases.ui ?? (aliases.components ? `${aliases.components}/ui` : null)
  const dirs = [aliasDir(uiAlias), aliasDir(aliases.components)].filter(Boolean)
  const wanted = new Set()
  for (const dir of dirs) {
    for (const prefix of ["", "src/"]) wanted.add(`${appDir}${prefix}${dir}/`)
  }
  return listed
    .filter((path) => /\.(?:tsx|ts)$/.test(path))
    .filter((path) => {
      const folder = path.slice(0, path.lastIndexOf("/") + 1)
      return wanted.has(folder)
    })
    .sort()
}

// Runs `task` over `items`, at most `limit` at a time, and keeps the order of the results.
async function mapLimit(items, limit, task) {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// Fingerprints each copy against the registry at `pin`, then against every older release.
//   files:     [{ path, text }]
//   tags:      every release tag; only those older than the pin are read
//   loadIndex: (tag) => Promise<{ items: [{ name, files: [{ path }] }] }>   (r/registry.json)
//   loadItem:  (tag, name) => Promise<{ files: [{ path, content }] } | null> (r/<name>.json; null: no such item)
export async function findStale({ files, pin, tags, loadIndex, loadItem }) {
  const index = await loadIndex(pin)
  const itemOf = new Map()
  for (const entry of index.items) {
    for (const file of entry.files ?? []) if (!itemOf.has(basename(file.path))) itemOf.set(basename(file.path), entry.name)
  }
  const older = tags.filter((tag) => compareTags(tag, pin) < 0).sort(compareTags)

  const cache = new Map()
  const failed = new Set()
  const item = (tag, name) => {
    const key = `${tag}/${name}`
    if (!cache.has(key)) {
      cache.set(
        key,
        loadItem(tag, name).catch(() => {
          failed.add(key)
          return null
        }),
      )
    }
    return cache.get(key)
  }
  const contentAt = async (tag, name, file) => {
    const found = (await item(tag, name))?.files.find((candidate) => basename(candidate.path) === file)
    return found?.content ?? null
  }
  const matches = (copy, content) =>
    content !== null && [fingerprint(content), fingerprint(content, { stripLeadingComment: true })].includes(copy)

  const result = { checked: 0, identical: [], stale: [], unreadable: 0 }
  for (const file of files) {
    const name = itemOf.get(basename(file.path))
    if (!name) continue
    const atPin = await contentAt(pin, name, basename(file.path))
    if (atPin === null) continue
    result.checked += 1
    const copy = fingerprint(file.text)
    if (matches(copy, atPin)) {
      result.identical.push(file.path)
      continue
    }
    const hits = (
      await mapLimit(older, FETCH_CONCURRENCY, async (tag) => (matches(copy, await contentAt(tag, name, basename(file.path))) ? tag : null))
    ).filter(Boolean)
    if (hits.length > 0) result.stale.push({ path: file.path, first: hits[0], last: hits.at(-1), pin })
  }
  result.unreadable = failed.size
  return result
}

const release = ({ first, last }) => (first === last ? first : `${first} to ${last}`)

export function formatReport({ app, pin, checked, identical, stale, unreadable }) {
  const lines = [`### Registry copies older than the pin (\`${app}\`, pin ${pin}, not blocking)`, ""]
  if (stale.length === 0) {
    lines.push(`No copy is older than ${pin}: ${identical.length} of ${checked} registry copies match it.`, "")
  } else {
    lines.push(
      `${stale.length} of ${checked} registry copies match an older release than ${pin}:`,
      "",
      "| File | Matches | Pin |",
      "|---|---|---|",
      ...stale.map((entry) => `| \`${entry.path}\` | ${release(entry)} | ${entry.pin} |`),
      "",
      "Look at the diff, then bring a copy to the pin with `npx shadcn add @frontend/<item> --overwrite`. It replaces local edits.",
      "",
    )
  }
  if (unreadable > 0) lines.push(`Incomplete: ${unreadable} release file(s) could not be read, so a copy may match a release not listed.`, "")
  return lines.join("\n")
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })

async function fetchJson(url, { missingIsNull }) {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (response.status === 404 && missingIsNull) return null
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response.json()
}

const urlAt = (template, tag, name) => template.replace(TEMPLATE_TAIL, `/${tag}/r/{name}.json`).replace("{name}", name)

function releaseTags(remote) {
  return git("ls-remote", "--tags", "--refs", remote)
    .split("\n")
    .map((line) => line.split("\t")[1]?.replace(/^refs\/tags\//, ""))
    .filter((tag) => tag && SEMVER.test(tag))
    .sort(compareTags)
}

function parseArgs(argv) {
  const options = {}
  const known = { "--pin": "pin", "--registry-url": "registryUrl", "--remote": "remote" }
  for (let index = 0; index < argv.length; index += 2) {
    const key = known[argv[index]]
    if (!key || argv[index + 1] === undefined) return null
    options[key] = argv[index + 1]
  }
  return options
}

export async function main(argv) {
  const options = parseArgs(argv)
  if (!options) {
    console.error("usage: registry-stale.mjs [--pin <tag>] [--registry-url <template>] [--remote <git url>]")
    return 2
  }
  const topLevel = git("rev-parse", "--show-toplevel").trim()
  const listed = git("-C", topLevel, "ls-files").split("\n").filter(Boolean)
  const configs = listed.filter((path) => basename(path) === "components.json")

  const out = []
  const emit = () => {
    const text = out.join("\n")
    console.log(text)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
  }
  let status = 0
  const releaseCache = new Map()

  for (const configPath of configs) {
    const app = dirname(configPath)
    try {
      const config = JSON.parse(readFileSync(`${topLevel}/${configPath}`, "utf8"))
      const parsed = parsePin(config)
      const tag = options.pin ?? parsed?.tag
      const template = options.registryUrl ?? parsed?.template
      if (!tag || !template) {
        out.push(`### Registry copies older than the pin (\`${app}\`, not blocking)`, "", `\`${configPath}\` has no pin: add a \`registries["@frontend"]\` URL ending \`/<tag>/r/{name}.json\`, or pass \`--pin\` and \`--registry-url\`.`, "")
        continue
      }
      const remote = options.remote ?? parsed?.remote
      if (!remote) throw new Error("could not list releases: pass --remote with the repository's git URL")
      if (!releaseCache.has(remote)) releaseCache.set(remote, releaseTags(remote))

      const files = uiFilesOf(configPath, config, listed).map((path) => ({ path, text: readFileSync(`${topLevel}/${path}`, "utf8") }))
      const result = await findStale({
        files,
        pin: tag,
        tags: releaseCache.get(remote),
        loadIndex: async (at) => {
          try {
            return await fetchJson(urlAt(template, at, "registry"), { missingIsNull: false })
          } catch (error) {
            throw new Error(`could not read the registry at ${at}: ${error.message}`)
          }
        },
        loadItem: (at, name) => fetchJson(urlAt(template, at, name), { missingIsNull: true }),
      })
      out.push(formatReport({ app, pin: tag, ...result }))
      if (result.stale.length > 0 && status === 0) status = 2
    } catch (error) {
      out.push(`### Registry copies older than the pin (\`${app}\`, not blocking)`, "", `${configPath}: ${error.message}`, "")
      status = 1
    }
  }
  if (configs.length === 0) out.push("### Registry copies older than the pin", "", "No components.json found.", "")
  emit()
  return status
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error)
      process.exit(1)
    },
  )
}
