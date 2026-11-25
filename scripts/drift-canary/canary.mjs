#!/usr/bin/env node
// The upstream drift canary (frontend#237, autorepo 2).
//
// Three probes, run on a schedule (.github/workflows/drift-canary.yml):
//
//   shadcn-pin        the pinned `shadcn` CLI against npm's `latest`
//   impeccable-pin    the pinned `impeccable` detector against npm's `latest`
//   upstream-sources  shadcn's published base-nova items against a recorded baseline of
//                     their hashes (scripts/drift-canary/upstream-baseline.json)
//
// A probe that reports drift does not file at once. The same drift must be seen on
// `--threshold` consecutive runs (default 2, so about two days on the daily schedule) before
// one Repair brief is filed through the helper from frontend#235; a probe that goes clean in
// between starts over, so a flapping upstream never floods the queue. Once filed, the same
// drift is not filed again; a drift that moves to a new value is filed afresh (the helper
// comments on the open brief, because the title key holds no version).
//
// The streak lives in a small JSON file (`--state`), which the workflow keeps in the Actions
// cache. A lost cache only delays a filing by one threshold. A probe that cannot reach its
// upstream is its own status, `error`, with its own brief key, so a silent canary is noticed.
//
//   node scripts/drift-canary/canary.mjs --dry-run                  print what each probe sees
//   node scripts/drift-canary/canary.mjs --state .state/state.json  the scheduled run
//   node scripts/drift-canary/canary.mjs record                     re-baseline the upstream hashes
//
// Re-baseline only after a worker has looked at what moved: the baseline is "upstream as
// last reviewed". The idea comes from rauchg/xeet's upstream-canary.mjs (Apache-2.0); this
// code is written for this repo and copies none of it.
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { SHADCN_VERSION } from "../stamp/pins.mjs"
import { fileRepairBrief } from "../repair-brief/repair-brief.mjs"

const ROOT = fileURLToPath(new URL("../../", import.meta.url))
const BASELINE_PATH = "scripts/drift-canary/upstream-baseline.json"
const UI_DIR = "registry/base-nova/ui"

export const UPSTREAM_ITEM_URL = (name) => `https://ui.shadcn.com/r/styles/base-nova/${name}.json`
export const NPM_LATEST_URL = (pkg) => `https://registry.npmjs.org/${pkg}/latest`

const FETCH_TIMEOUT_MS = 20_000
const CONCURRENCY = 4

// Each probe's brief keys. A key holds nothing that moves per run (no version), so the helper
// finds the one open brief for the probe.
export const PROBES = Object.freeze({
  "shadcn-pin": { driftKey: "shadcn pin drift", errorKey: "shadcn pin probe broken" },
  "impeccable-pin": { driftKey: "impeccable pin drift", errorKey: "impeccable pin probe broken" },
  "upstream-sources": {
    driftKey: "upstream shadcn source drift",
    errorKey: "upstream shadcn source probe broken",
  },
})

export const readPins = (root = ROOT) => {
  const checkSh = readFileSync(join(root, "scripts/check.sh"), "utf8")
  const impeccable = /^IMPECCABLE_VERSION=(\S+)$/m.exec(checkSh)?.[1]
  if (!impeccable) throw new Error("drift-canary: scripts/check.sh has no IMPECCABLE_VERSION= line")
  return { shadcn: SHADCN_VERSION, impeccable }
}

// ── Reads ────────────────────────────────────────────────────────────────────────────────

const httpError = (url, status) => Object.assign(new Error(`GET ${url} -> ${status}`), { status })

// Every network read goes through here, so a test hands in a `fetch` that answers from
// recorded fixtures and nothing leaves the machine.
export const createSources = ({ fetch: fetchImpl = globalThis.fetch } = {}) => {
  const getJson = async (url) => {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) throw httpError(url, response.status)
    return response.json()
  }
  return {
    npmLatest: async (pkg) => {
      const body = await getJson(NPM_LATEST_URL(pkg))
      if (typeof body.version !== "string") throw new Error(`${NPM_LATEST_URL(pkg)} has no version`)
      return body.version
    },
    // The upstream item, or null when upstream has no such item (a 404).
    upstreamItem: async (name) => {
      try {
        return await getJson(UPSTREAM_ITEM_URL(name))
      } catch (error) {
        if (error.status === 404) return null
        throw error
      }
    },
  }
}

const mapLimited = async (items, limit, fn) => {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// ── Probes ───────────────────────────────────────────────────────────────────────────────

const errorResult = (id, error) => ({
  id,
  status: "error",
  fingerprint: `error=${error.message}`,
  changed: `the ${id} probe could not read its upstream`,
  detail: `${error.message}\n\nNothing was compared. If this persists, the upstream address moved or the runner has no network.`,
})

export const probePin = async ({ id, pkg, pinned, sources }) => {
  let latest
  try {
    latest = await sources.npmLatest(pkg)
  } catch (error) {
    return errorResult(id, error)
  }
  if (latest === pinned) return { id, status: "ok" }
  return {
    id,
    status: "drift",
    pkg,
    pinned,
    latest,
    fingerprint: `latest=${latest}`,
    changed: `${pkg} ${pinned} -> ${latest} (npm latest)`,
    detail: [
      `${pkg} is pinned at ${pinned} and npm's latest is ${latest}.`,
      "",
      "Read the release notes first: a newer shadcn can change what `shadcn build` writes into r/, a",
      "newer impeccable what `pnpm check` accepts. Then bump the pin in every file that writes it (scripts/check.sh,",
      ".github/workflows/design.yml and release.yml, and for shadcn scripts/stamp/pins.mjs;",
      "test/check-script.test.ts fails when two copies disagree), rebuild r/ and run `pnpm check`.",
    ].join("\n"),
  }
}

// One upstream item as the bytes that matter: its files and what it asks a consumer to install.
// Key order is fixed here, so the hash does not move with how upstream orders its JSON.
export const hashUpstreamItem = (item) => {
  const canonical = {
    dependencies: item.dependencies ?? [],
    devDependencies: item.devDependencies ?? [],
    registryDependencies: item.registryDependencies ?? [],
    files: [...(item.files ?? [])]
      .map((file) => ({ path: file.path, content: file.content }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  }
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
}

const short = (hash) => hash.slice(0, 12)

export const probeUpstreamSources = async ({ baseline, sources }) => {
  const id = "upstream-sources"
  const names = Object.keys(baseline).sort()
  const checked = await mapLimited(names, CONCURRENCY, async (name) => {
    try {
      const item = await sources.upstreamItem(name)
      if (item === null) return { name, kind: "gone" }
      const now = hashUpstreamItem(item)
      return now === baseline[name] ? { name, kind: "same" } : { name, kind: "moved", now }
    } catch (error) {
      return { name, kind: "error", message: error.message }
    }
  })
  const drifted = checked.filter((entry) => entry.kind === "moved" || entry.kind === "gone")
  const errors = checked.filter((entry) => entry.kind === "error")

  if (drifted.length === 0 && errors.length > 0) {
    return errorResult(id, new Error(errors.map((entry) => `${entry.name}: ${entry.message}`).join("; ")))
  }
  if (drifted.length === 0) return { id, status: "ok" }

  const lines = drifted.map((entry) =>
    entry.kind === "gone"
      ? `${entry.name}: gone upstream (${UPSTREAM_ITEM_URL(entry.name)} answers 404)`
      : `${entry.name}: changed upstream (baseline ${short(baseline[entry.name])}, now ${short(entry.now)}) ${UPSTREAM_ITEM_URL(entry.name)}`,
  )
  if (errors.length > 0) lines.push(...errors.map((entry) => `${entry.name}: not compared (${entry.message})`))
  return {
    id,
    status: "drift",
    fingerprint: drifted.map((entry) => `${entry.name}=${entry.kind === "gone" ? "gone" : short(entry.now)}`).join(","),
    changed: `upstream shadcn sources changed: ${drifted.map((entry) => entry.name).join(", ")}`,
    detail: [
      ...lines,
      "",
      "Read each upstream file against registry/base-nova/ui/<name>.tsx, port what belongs here, then",
      `re-baseline with \`node scripts/drift-canary/canary.mjs record\` and commit ${BASELINE_PATH}.`,
    ].join("\n"),
  }
}

// ── The threshold ────────────────────────────────────────────────────────────────────────

// State per probe: { key, streak, filed }. `key` is the status plus fingerprint last seen,
// `streak` how many consecutive runs saw exactly it, `filed` the key last filed (or null).
const keyOf = (result) => `${result.status}:${result.fingerprint}`

export const nextState = (previous, results, { threshold }) => {
  const state = { ...previous }
  const toFile = []
  for (const result of results) {
    const before = previous[result.id] ?? { key: null, streak: 0, filed: null }
    if (result.status === "ok") {
      state[result.id] = { key: null, streak: 0, filed: null }
      continue
    }
    const key = keyOf(result)
    const streak = before.key === key ? before.streak + 1 : 1
    state[result.id] = { key, streak, filed: before.filed }
    if (streak >= threshold && before.filed !== key) toFile.push(result)
  }
  return { state, toFile }
}

export const markFiled = (state, result) => ({
  ...state,
  [result.id]: { ...state[result.id], filed: keyOf(result) },
})

// ── The brief ────────────────────────────────────────────────────────────────────────────

export const runUrlOf = (env = process.env) =>
  env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
    ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    : undefined

export const briefFor = (result, env = process.env) => {
  const probe = PROBES[result.id]
  const runUrl = runUrlOf(env)
  return {
    key: result.status === "error" ? probe.errorKey : probe.driftKey,
    runUrl,
    changed: result.changed,
    failingCheck: `Drift canary probe \`${result.id}\` (scripts/drift-canary/canary.mjs)`,
    output: result.detail,
    repro: ["node scripts/drift-canary/canary.mjs --dry-run", "pnpm install", "pnpm check"],
  }
}

// ── One run ──────────────────────────────────────────────────────────────────────────────

// `deferPins` hands a pin drift that reached the threshold to the upstream-follow job
// (scripts/upstream-follow/follow.mjs) instead of filing a plain brief: the job tries the bump
// and files what it found. A deferred drift is not marked filed; the follow job marks it once
// it has filed, so a run that is lost in between hands it over again.
export const run = async ({ state, pins, baseline, sources, file, threshold, dryRun = false, deferPins = false, env = process.env }) => {
  const results = [
    await probePin({ id: "shadcn-pin", pkg: "shadcn", pinned: pins.shadcn, sources }),
    await probePin({ id: "impeccable-pin", pkg: "impeccable", pinned: pins.impeccable, sources }),
    await probeUpstreamSources({ baseline, sources }),
  ]
  if (dryRun) return { results, state, filed: [], failures: [], deferred: [] }

  const next = nextState(state, results, { threshold })
  let current = next.state
  const filed = []
  const failures = []
  const deferred = []
  for (const result of next.toFile) {
    if (deferPins && result.status === "drift" && result.pkg) {
      deferred.push({ id: result.id, pkg: result.pkg, from: result.pinned, to: result.latest, fingerprint: result.fingerprint })
      continue
    }
    try {
      const outcome = await file(briefFor(result, env))
      current = markFiled(current, result)
      filed.push({ id: result.id, ...outcome })
    } catch (error) {
      failures.push({ id: result.id, error: error.message })
    }
  }
  return { results, state: current, filed, failures, deferred }
}

// ── Baseline ─────────────────────────────────────────────────────────────────────────────

export const recordBaseline = async ({ root = ROOT, sources = createSources() } = {}) => {
  const names = readdirSync(join(root, UI_DIR))
    .filter((entry) => entry.endsWith(".tsx"))
    .map((entry) => entry.slice(0, -".tsx".length))
    .sort()
  const hashes = await mapLimited(names, CONCURRENCY, async (name) => {
    const item = await sources.upstreamItem(name)
    return item === null ? null : [name, hashUpstreamItem(item)]
  })
  // An item with no upstream counterpart is this registry's own (graph-3d, link-pill, ...).
  return {
    _note:
      "sha256 of each upstream shadcn base-nova item (files, dependencies) as last reviewed. Regenerate with `node scripts/drift-canary/canary.mjs record` after reading what moved.",
    source: UPSTREAM_ITEM_URL("<name>"),
    items: Object.fromEntries(hashes.filter(Boolean)),
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────

const readJsonIfPresent = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return null
    throw new Error(`drift-canary: cannot read ${path}: ${error.message}`)
  }
}

export const parseCli = (argv) => {
  const options = { command: "run", threshold: 2, dryRun: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    switch (arg) {
      case "record":
        options.command = "record"
        break
      case "--dry-run":
        options.dryRun = true
        break
      case "--state":
      case "--threshold":
      case "--repo": {
        const value = argv[i + 1]
        if (value === undefined) throw new Error(`${arg} needs a value`)
        i += 1
        if (arg === "--state") options.statePath = value
        else if (arg === "--repo") options.repo = value
        else {
          options.threshold = Number(value)
          if (!Number.isInteger(options.threshold) || options.threshold < 1) {
            throw new Error("--threshold must be a whole number of 1 or more")
          }
        }
        break
      }
      default:
        throw new Error(`unknown argument: ${arg}`)
    }
  }
  return options
}

const main = async () => {
  const options = parseCli(process.argv.slice(2))

  if (options.command === "record") {
    const baseline = await recordBaseline()
    writeFileSync(join(ROOT, BASELINE_PATH), `${JSON.stringify(baseline, null, 2)}\n`)
    console.log(`drift-canary: baseline written, ${Object.keys(baseline.items).length} items`)
    return
  }

  const baseline = JSON.parse(readFileSync(join(ROOT, BASELINE_PATH), "utf8")).items
  const state = (options.statePath && readJsonIfPresent(options.statePath)) || {}
  const outcome = await run({
    state,
    pins: readPins(),
    baseline,
    sources: createSources(),
    file: (brief) => fileRepairBrief(brief, { repo: options.repo }),
    threshold: options.threshold,
    dryRun: options.dryRun,
  })

  for (const result of outcome.results) {
    const streak = outcome.state[result.id]?.streak ?? 0
    const suffix = result.status === "ok" ? "" : ` (seen ${streak}/${options.threshold} runs): ${result.changed}`
    console.log(`drift-canary: ${result.id} ${result.status}${options.dryRun ? "" : suffix}`)
    if (options.dryRun && result.status !== "ok") console.log(`${result.changed}\n${result.detail}`)
  }
  for (const filed of outcome.filed) console.log(`drift-canary: filed ${filed.id}: ${filed.action} ${filed.url ?? `#${filed.number}`}`)

  if (options.statePath && !options.dryRun) {
    mkdirSync(dirname(options.statePath), { recursive: true })
    writeFileSync(options.statePath, `${JSON.stringify(outcome.state, null, 2)}\n`)
  }
  for (const failure of outcome.failures) console.error(`drift-canary: could not file ${failure.id}: ${failure.error}`)
  if (outcome.failures.length > 0) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`drift-canary: ${error.message}`)
    process.exit(1)
  })
}
