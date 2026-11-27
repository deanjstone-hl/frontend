// @vitest-environment node

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// frontend#237 (autorepo 2, the owner's adoption of 16 Nov 2026): a scheduled canary notices
// when an upstream this registry copies from changes and files a Repair brief (#235). The
// probe logic is tested offline: every network read goes through an injected `fetch` that
// answers from fixtures recorded on 25 Nov 2026 (test/fixtures/drift-canary/). The idea is
// from rauchg/xeet (Apache-2.0); the code is written for this repo.

// @ts-expect-error: a plain .mjs module with no type declarations
import * as canary from "../scripts/drift-canary/canary.mjs"
// @ts-expect-error: a plain .mjs module with no type declarations
import { SHADCN_VERSION } from "../scripts/stamp/pins.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const read = (path: string) => readFileSync(join(root, path), "utf8")
const fixture = (name: string) => read(`test/fixtures/drift-canary/${name}`)

type Json = Record<string, unknown>

// A fake `fetch`: answers from a url -> body map, 404 for anything else, and records the urls.
const fakeFetch = (bodies: Record<string, string>) => {
  const urls: string[] = []
  const run = async (url: string) => {
    urls.push(url)
    const body = bodies[url]
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => JSON.parse(body) as Json }
  }
  return { urls, run }
}

const NPM_SHADCN = "https://registry.npmjs.org/shadcn/latest"
const NPM_IMPECCABLE = "https://registry.npmjs.org/impeccable/latest"
const upstreamUrl = (name: string) => `https://ui.shadcn.com/r/styles/base-nova/${name}.json`

describe("pins", () => {
  it("reads the shadcn pin from the stamp pins and the impeccable pin from check.sh", () => {
    const pins = canary.readPins(root)
    expect(pins.shadcn).toBe(SHADCN_VERSION)
    expect(read("scripts/check.sh")).toContain(`IMPECCABLE_VERSION=${pins.impeccable}\n`)
  })
})

describe("probePin", () => {
  const sources = (version: string) =>
    canary.createSources({
      fetch: fakeFetch({ [NPM_SHADCN]: JSON.stringify({ name: "shadcn", version }) }).run,
    })

  it("is ok when npm latest equals the pin", async () => {
    const result = await canary.probePin({ id: "shadcn-pin", pkg: "shadcn", pinned: "4.19.1", sources: sources("4.19.1") })
    expect(result.status).toBe("ok")
  })

  it("is drift, naming both versions, when npm latest is newer than the pin", async () => {
    const result = await canary.probePin({ id: "shadcn-pin", pkg: "shadcn", pinned: "4.19.1", sources: sources("4.23.0") })
    expect(result.status).toBe("drift")
    expect(result.changed).toBe("shadcn 4.19.1 -> 4.23.0 (npm latest)")
    expect(result.fingerprint).toBe("latest=4.23.0")
  })

  it("is an error, not ok, when the registry answers 404", async () => {
    const result = await canary.probePin({
      id: "shadcn-pin",
      pkg: "shadcn",
      pinned: "4.19.1",
      sources: canary.createSources({ fetch: fakeFetch({}).run }),
    })
    expect(result.status).toBe("error")
    expect(result.detail).toContain("404")
  })

  it("reads the recorded npm responses for the real pins", async () => {
    const f = fakeFetch({ [NPM_SHADCN]: fixture("npm-shadcn-latest.json"), [NPM_IMPECCABLE]: fixture("npm-impeccable-latest.json") })
    const sourcesFromFixtures = canary.createSources({ fetch: f.run })
    const shadcn = await canary.probePin({ id: "shadcn-pin", pkg: "shadcn", pinned: "4.19.1", sources: sourcesFromFixtures })
    const impeccable = await canary.probePin({ id: "impeccable-pin", pkg: "impeccable", pinned: "3.6.1", sources: sourcesFromFixtures })
    expect(shadcn.fingerprint).toBe("latest=4.23.0")
    expect(impeccable.fingerprint).toBe("latest=4.11.0")
    expect(f.urls).toEqual([NPM_SHADCN, NPM_IMPECCABLE])
  })
})

describe("hashUpstreamItem", () => {
  it("is stable for the same item and moves when a file's content moves", () => {
    const button = JSON.parse(fixture("upstream-button.json"))
    expect(canary.hashUpstreamItem(button)).toBe(canary.hashUpstreamItem(JSON.parse(fixture("upstream-button.json"))))
    const edited = JSON.parse(fixture("upstream-button.json"))
    edited.files[0].content += "\n// changed"
    expect(canary.hashUpstreamItem(edited)).not.toBe(canary.hashUpstreamItem(button))
  })

  it("moves when the item's dependencies move, and ignores key order", () => {
    const button = JSON.parse(fixture("upstream-button.json"))
    const moreDeps = { ...button, dependencies: [...(button.dependencies ?? []), "new-dependency"] }
    expect(canary.hashUpstreamItem(moreDeps)).not.toBe(canary.hashUpstreamItem(button))
    const reordered = Object.fromEntries(Object.entries(button).reverse())
    expect(canary.hashUpstreamItem(reordered)).toBe(canary.hashUpstreamItem(button))
  })
})

describe("probeUpstreamSources", () => {
  const baselineFor = (names: string[]) =>
    Object.fromEntries(
      names.map((name) => [name, canary.hashUpstreamItem(JSON.parse(fixture(`upstream-${name}.json`)))]),
    )

  const sourcesWith = (bodies: Record<string, string>) => canary.createSources({ fetch: fakeFetch(bodies).run })

  it("is ok when every baseline item still hashes the same", async () => {
    const result = await canary.probeUpstreamSources({
      baseline: baselineFor(["button", "badge"]),
      sources: sourcesWith({
        [upstreamUrl("button")]: fixture("upstream-button.json"),
        [upstreamUrl("badge")]: fixture("upstream-badge.json"),
      }),
    })
    expect(result.status).toBe("ok")
  })

  it("is drift, naming only the item that moved", async () => {
    const edited = JSON.parse(fixture("upstream-button.json"))
    edited.files[0].content += "\n// changed upstream"
    const result = await canary.probeUpstreamSources({
      baseline: baselineFor(["button", "badge"]),
      sources: sourcesWith({
        [upstreamUrl("button")]: JSON.stringify(edited),
        [upstreamUrl("badge")]: fixture("upstream-badge.json"),
      }),
    })
    expect(result.status).toBe("drift")
    expect(result.changed).toBe("upstream shadcn sources changed: button")
    expect(result.detail).toContain("button")
    expect(result.detail).not.toContain("badge")
  })

  it("is drift when an item the baseline lists is gone upstream", async () => {
    const result = await canary.probeUpstreamSources({
      baseline: baselineFor(["button", "badge"]),
      sources: sourcesWith({ [upstreamUrl("button")]: fixture("upstream-button.json") }),
    })
    expect(result.status).toBe("drift")
    expect(result.detail).toContain("badge: gone upstream")
  })

  it("keeps the same fingerprint for the same drift, whatever order the items were fetched in", async () => {
    const edit = (name: string) => {
      const item = JSON.parse(fixture(`upstream-${name}.json`))
      item.files[0].content += "\n// changed"
      return JSON.stringify(item)
    }
    const bodies = { [upstreamUrl("button")]: edit("button"), [upstreamUrl("badge")]: edit("badge") }
    const first = await canary.probeUpstreamSources({ baseline: baselineFor(["button", "badge"]), sources: sourcesWith(bodies) })
    const second = await canary.probeUpstreamSources({ baseline: baselineFor(["badge", "button"]), sources: sourcesWith(bodies) })
    expect(first.fingerprint).toBe(second.fingerprint)
  })

  it("is an error, not drift, when upstream is unreachable", async () => {
    const result = await canary.probeUpstreamSources({
      baseline: baselineFor(["button"]),
      sources: canary.createSources({
        fetch: async () => {
          throw new Error("getaddrinfo ENOTFOUND ui.shadcn.com")
        },
      }),
    })
    expect(result.status).toBe("error")
    expect(result.detail).toContain("ENOTFOUND")
  })
})

describe("nextState (the threshold)", () => {
  const drift = (fingerprint = "latest=4.23.0") => ({ id: "shadcn-pin", status: "drift", fingerprint })
  const ok = { id: "shadcn-pin", status: "ok" }

  it("does not file on the first sighting", () => {
    const { toFile } = canary.nextState({}, [drift()], { threshold: 2 })
    expect(toFile).toEqual([])
  })

  it("files once the same drift is seen on the threshold's consecutive runs", () => {
    const first = canary.nextState({}, [drift()], { threshold: 2 })
    const second = canary.nextState(first.state, [drift()], { threshold: 2 })
    expect(second.toFile.map((r: { id: string }) => r.id)).toEqual(["shadcn-pin"])
  })

  it("does not file again while the same drift stays unchanged and was filed", () => {
    let state = {}
    let filedRuns = 0
    for (let run = 0; run < 6; run += 1) {
      const next = canary.nextState(state, [drift()], { threshold: 2 })
      for (const result of next.toFile) state = canary.markFiled(next.state, result)
      if (next.toFile.length > 0) filedRuns += 1
      else state = next.state
    }
    expect(filedRuns).toBe(1)
  })

  it("keeps retrying a drift whose filing failed", () => {
    const first = canary.nextState({}, [drift()], { threshold: 2 })
    const second = canary.nextState(first.state, [drift()], { threshold: 2 })
    expect(second.toFile).toHaveLength(1)
    // The filing threw, so markFiled was never called: the next run asks again.
    const third = canary.nextState(second.state, [drift()], { threshold: 2 })
    expect(third.toFile).toHaveLength(1)
  })

  it("a flapping probe never reaches the threshold", () => {
    let state = {}
    const sequence = [drift(), ok, drift(), ok, drift(), ok]
    for (const result of sequence) {
      const next = canary.nextState(state, [result], { threshold: 2 })
      expect(next.toFile).toEqual([])
      state = next.state
    }
  })

  it("a drift that moves to a new value restarts the streak", () => {
    const first = canary.nextState({}, [drift("latest=4.23.0")], { threshold: 2 })
    const second = canary.nextState(first.state, [drift("latest=4.24.0")], { threshold: 2 })
    expect(second.toFile).toEqual([])
  })

  it("files a new value after an earlier one was filed", () => {
    let state = {}
    for (const fingerprint of ["latest=4.23.0", "latest=4.23.0"]) {
      const next = canary.nextState(state, [drift(fingerprint)], { threshold: 2 })
      state = next.toFile.length > 0 ? canary.markFiled(next.state, next.toFile[0]) : next.state
    }
    const a = canary.nextState(state, [drift("latest=4.24.0")], { threshold: 2 })
    const b = canary.nextState(a.state, [drift("latest=4.24.0")], { threshold: 2 })
    expect(b.toFile).toHaveLength(1)
  })

  it("a clean run clears the probe so a later drift is filed afresh", () => {
    let state = {}
    for (const result of [drift(), drift()]) {
      const next = canary.nextState(state, [result], { threshold: 2 })
      state = next.toFile.length > 0 ? canary.markFiled(next.state, next.toFile[0]) : next.state
    }
    state = canary.nextState(state, [ok], { threshold: 2 }).state
    const a = canary.nextState(state, [drift()], { threshold: 2 })
    const b = canary.nextState(a.state, [drift()], { threshold: 2 })
    expect(b.toFile).toHaveLength(1)
  })

  it("keeps each probe's streak apart", () => {
    const other = { id: "impeccable-pin", status: "drift", fingerprint: "latest=4.11.0" }
    const first = canary.nextState({}, [drift(), other], { threshold: 2 })
    const second = canary.nextState(first.state, [drift(), ok2()], { threshold: 2 })
    expect(second.toFile.map((r: { id: string }) => r.id)).toEqual(["shadcn-pin"])
  })

  const ok2 = () => ({ id: "impeccable-pin", status: "ok" })
})

describe("briefFor", () => {
  const env = { GITHUB_SERVER_URL: "https://github.com", GITHUB_REPOSITORY: "deanjstone-hl/frontend", GITHUB_RUN_ID: "42" }

  it("gives a drift a stable key with no version in it, so the helper dedupes", () => {
    const a = canary.briefFor({ id: "shadcn-pin", status: "drift", changed: "shadcn 4.19.1 -> 4.23.0 (npm latest)", detail: "d" }, env)
    const b = canary.briefFor({ id: "shadcn-pin", status: "drift", changed: "shadcn 4.19.1 -> 4.24.0 (npm latest)", detail: "d" }, env)
    expect(a.key).toBe("shadcn pin drift")
    expect(b.key).toBe(a.key)
  })

  it("gives a broken probe its own key, apart from the drift", () => {
    expect(canary.briefFor({ id: "upstream-sources", status: "error", changed: "x", detail: "d" }, env).key).toBe(
      "upstream shadcn source probe broken",
    )
  })

  it("carries the run link and repro commands a worker needs", () => {
    const brief = canary.briefFor({ id: "impeccable-pin", status: "drift", changed: "c", detail: "output" }, env)
    expect(brief.runUrl).toBe("https://github.com/deanjstone-hl/frontend/actions/runs/42")
    expect(brief.output).toBe("output")
    expect(brief.repro.join("\n")).toContain("node scripts/drift-canary/canary.mjs --dry-run")
    expect(brief.repro).toContain("pnpm check")
  })

  it("has no run link outside Actions", () => {
    expect(canary.briefFor({ id: "shadcn-pin", status: "drift", changed: "c", detail: "d" }, {}).runUrl).toBeUndefined()
  })
})

describe("run", () => {
  const bodies = (shadcn: string) => ({
    [NPM_SHADCN]: JSON.stringify({ name: "shadcn", version: shadcn }),
    [NPM_IMPECCABLE]: fixture("npm-impeccable-latest.json"),
    [upstreamUrl("button")]: fixture("upstream-button.json"),
  })
  const baseline = { button: canary.hashUpstreamItem(JSON.parse(fixture("upstream-button.json"))) }
  const pins = { shadcn: "4.19.1", impeccable: "4.11.0" }

  const filer = () => {
    const filed: { key: string }[] = []
    const file = async (brief: { key: string }) => {
      filed.push(brief)
      return { action: "created", url: "https://github.com/deanjstone-hl/frontend/issues/900" }
    }
    return { filed, file }
  }

  it("files nothing on the first drifting run, one deduplicated brief on the second, then stays quiet", async () => {
    const { filed, file } = filer()
    let state = {}
    for (let day = 0; day < 4; day += 1) {
      const outcome = await canary.run({
        state,
        pins,
        baseline,
        sources: canary.createSources({ fetch: fakeFetch(bodies("4.23.0")).run }),
        file,
        threshold: 2,
        env: {},
      })
      state = outcome.state
    }
    expect(filed.map((brief) => brief.key)).toEqual(["shadcn pin drift"])
  })

  it("files nothing when every probe is clean", async () => {
    const { filed, file } = filer()
    let state = {}
    for (let day = 0; day < 3; day += 1) {
      const outcome = await canary.run({
        state,
        pins,
        baseline,
        sources: canary.createSources({ fetch: fakeFetch(bodies("4.19.1")).run }),
        file,
        threshold: 2,
        env: {},
      })
      state = outcome.state
    }
    expect(filed).toEqual([])
  })

  it("files nothing and files no state change when --dry-run", async () => {
    const { filed, file } = filer()
    const outcome = await canary.run({
      state: {},
      pins,
      baseline,
      sources: canary.createSources({ fetch: fakeFetch(bodies("4.23.0")).run }),
      file,
      threshold: 1,
      dryRun: true,
      env: {},
    })
    expect(filed).toEqual([])
    expect(outcome.results.find((r: { id: string }) => r.id === "shadcn-pin").status).toBe("drift")
  })

  it("does not record a brief as filed when filing throws, so the next run retries", async () => {
    const failing = async () => {
      throw new Error("gh: HTTP 502")
    }
    const outcome = await canary.run({
      state: {},
      pins,
      baseline,
      sources: canary.createSources({ fetch: fakeFetch(bodies("4.23.0")).run }),
      file: failing,
      threshold: 1,
      env: {},
    })
    expect(outcome.failures).toHaveLength(1)
    expect(outcome.state["shadcn-pin"].filed).toBeNull()
    const retried = canary.nextState(outcome.state, [{ id: "shadcn-pin", status: "drift", fingerprint: "latest=4.23.0" }], { threshold: 1 })
    expect(retried.toFile).toHaveLength(1)
  })
})

describe("the baseline and the workflow", () => {
  it("lists only items that have a source under registry/base-nova/ui, each with a sha256", () => {
    const baseline = JSON.parse(read("scripts/drift-canary/upstream-baseline.json"))
    const names = Object.keys(baseline.items)
    expect(names.length).toBeGreaterThan(10)
    for (const name of names) {
      expect(read(`registry/base-nova/ui/${name}.tsx`).length).toBeGreaterThan(0)
      expect(baseline.items[name]).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  const workflow = read(".github/workflows/drift-canary.yml")

  it("runs on a schedule and by hand, and never on a push or pull request", () => {
    expect(workflow).toMatch(/^on:\n {2}schedule:\n {4}- cron: "\d+ \d+ \* \* \*"\n {2}workflow_dispatch:/m)
    expect(workflow).not.toMatch(/^ {2}(push|pull_request|pull_request_target):/m)
  })

  it("runs on a GitHub-hosted runner only: the repo is public, so it costs no minutes and reads no CI_RUNS_ON", () => {
    expect(workflow).toMatch(/^ {4}runs-on: ubuntu-latest$/m)
    expect(workflow).not.toContain("CI_RUNS_ON")
  })

  it("holds only the permissions it uses: read the repo, write issues", () => {
    expect(workflow).toMatch(/^permissions: \{\}$/m)
    expect(workflow).toMatch(/ {4}permissions:\n {6}contents: read\n {6}issues: write\n/)
  })

  it("has no install step of its own: a quiet day runs Node built-ins only, and the follow job installs only when a pin moved (test/upstream-follow.test.ts)", () => {
    expect(workflow).not.toContain("pnpm install")
    expect(workflow).not.toContain("npm install")
  })

  it("keeps the streak between runs in a cache, and files with the helper through gh", () => {
    expect(workflow).toMatch(/actions\/cache@[0-9a-f]{40} # v\d+/)
    expect(workflow).toContain("node scripts/drift-canary/canary.mjs")
    expect(workflow).toContain("GH_TOKEN: ${{ github.token }}")
  })

  it("does not queue behind itself", () => {
    expect(workflow).toMatch(/concurrency:\n {2}group: drift-canary\n {2}cancel-in-progress: false\n/)
  })
})
