// @vitest-environment node

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

// frontend#238 (autorepo 4, the owner's adoption of 16 Nov 2026): when the drift canary
// sees a pinned upstream move, a job puts the new pin in a throwaway tree, regenerates r/
// and its stamp, runs `pnpm check` and files an issue: green names the bump and attaches
// the check output, red files a Repair brief. It pushes nothing. Every test here is
// offline: the commands run through an injected `exec`, `gh` is a fake, and the npm answers
// are the ones recorded on 25 Nov 2026 in test/fixtures/drift-canary/. The idea is from
// rauchg/xeet's sync.yml (Apache-2.0); the code is written for this repo.

// @ts-expect-error: a plain .mjs module with no type declarations
import * as follow from "../scripts/upstream-follow/follow.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const read = (path: string, at = root) => readFileSync(join(at, path), "utf8")

// The files that carry a pin, copied from the real tree so the bump is tested against the
// bytes it will really rewrite.
const PIN_FILES = [
  "scripts/check.sh",
  "scripts/stamp/pins.mjs",
  ".github/workflows/design.yml",
  ".github/workflows/release.yml",
  "README.md",
]

let tree: string

beforeEach(() => {
  tree = mkdtempSync(join(tmpdir(), "upstream-follow-"))
  for (const file of PIN_FILES) {
    mkdirSync(dirname(join(tree, file)), { recursive: true })
    cpSync(join(root, file), join(tree, file))
  }
})

afterEach(() => {
  rmSync(tree, { recursive: true, force: true })
})

const pinsNow = () => ({ shadcn: read("scripts/stamp/pins.mjs").match(/SHADCN_VERSION = "([^"]+)"/)![1], impeccable: read("scripts/check.sh").match(/^IMPECCABLE_VERSION=(\S+)$/m)![1] })

describe("bumpPin", () => {
  it("moves the shadcn pin in every file that writes it, and nowhere else", () => {
    const from = pinsNow().shadcn
    const touched = follow.bumpPin({ root: tree, pkg: "shadcn", from, to: "9.9.9" })
    expect([...touched].sort()).toEqual([
      ".github/workflows/design.yml",
      ".github/workflows/release.yml",
      "README.md",
      "scripts/check.sh",
      "scripts/stamp/pins.mjs",
    ])
    expect(read("scripts/check.sh", tree)).toMatch(/^SHADCN_VERSION=9\.9\.9$/m)
    expect(read("scripts/stamp/pins.mjs", tree)).toContain('export const SHADCN_VERSION = "9.9.9"')
    expect(read(".github/workflows/design.yml", tree)).toContain("npx --yes shadcn@9.9.9 build --output ./r")
    const release = read(".github/workflows/release.yml", tree)
    expect(release).toContain("npx --yes shadcn@9.9.9 build --output ./r")
    expect(release).toContain("Run 'npx shadcn@9.9.9 build --output ./r'")
    expect(release).not.toContain(`shadcn@${from}`)
    // The impeccable pin is a different tool and does not move.
    expect(read("scripts/check.sh", tree)).toMatch(new RegExp(`^IMPECCABLE_VERSION=${pinsNow().impeccable.replace(/\./g, "\\.")}$`, "m"))
  })

  it("moves the impeccable pin in check.sh, design.yml and release.yml only", () => {
    const from = pinsNow().impeccable
    const touched = follow.bumpPin({ root: tree, pkg: "impeccable", from, to: "9.8.7" })
    expect([...touched].sort()).toEqual([".github/workflows/design.yml", ".github/workflows/release.yml", "scripts/check.sh"])
    expect(read("scripts/check.sh", tree)).toMatch(/^IMPECCABLE_VERSION=9\.8\.7$/m)
    expect(read(".github/workflows/design.yml", tree)).toContain("npx --yes impeccable@9.8.7 detect registry/ theme/")
    expect(read(".github/workflows/release.yml", tree)).toContain("npx --yes impeccable@9.8.7 detect registry/ theme/")
    expect(read("scripts/stamp/pins.mjs", tree)).toBe(read("scripts/stamp/pins.mjs"))
  })

  it("does not touch a longer version that merely starts with the pin", () => {
    const check = join(tree, "scripts/check.sh")
    writeFileSync(check, `${read("scripts/check.sh", tree)}# other: shadcn@${pinsNow().shadcn}0 stays\n`)
    follow.bumpPin({ root: tree, pkg: "shadcn", from: pinsNow().shadcn, to: "9.9.9" })
    expect(read("scripts/check.sh", tree)).toContain(`shadcn@${pinsNow().shadcn}0 stays`)
  })

  it("throws, and writes nothing, when a required file does not hold the pin it was told to move", () => {
    const before = read("scripts/check.sh", tree)
    expect(() => follow.bumpPin({ root: tree, pkg: "shadcn", from: "3.0.0", to: "9.9.9" })).toThrow(/scripts\/check\.sh/)
    expect(read("scripts/check.sh", tree)).toBe(before)
  })

  it("names the file that lost its pin when one site has gone, and writes nothing", () => {
    const design = join(tree, ".github/workflows/design.yml")
    writeFileSync(design, read(".github/workflows/design.yml", tree).replaceAll(`shadcn@${pinsNow().shadcn}`, "shadcn@latest"))
    const before = read("scripts/check.sh", tree)
    expect(() => follow.bumpPin({ root: tree, pkg: "shadcn", from: pinsNow().shadcn, to: "9.9.9" })).toThrow(/design\.yml/)
    expect(read("scripts/check.sh", tree)).toBe(before)
  })

  it("refuses a target that is not a plain version, since it is written into files and run by npx", () => {
    for (const to of ["latest", "4.23", "9.9.9; rm -rf /", "$(id)", "9.9.9\n", "../9.9.9"]) {
      expect(() => follow.bumpPin({ root: tree, pkg: "shadcn", from: pinsNow().shadcn, to }), to).toThrow(/version/i)
    }
  })

  it("refuses a package it does not know", () => {
    expect(() => follow.bumpPin({ root: tree, pkg: "left-pad", from: "1.0.0", to: "1.0.1" })).toThrow(/left-pad/)
  })

  it("leaves a tree where the repo's own pin tests would still agree with each other", () => {
    follow.bumpPin({ root: tree, pkg: "shadcn", from: pinsNow().shadcn, to: "9.9.9" })
    const ci = read(".github/workflows/design.yml", tree).match(/npx --yes shadcn@(\S+) build --output \.\/r/)?.[1]
    expect(read("scripts/check.sh", tree)).toMatch(new RegExp(`^SHADCN_VERSION=${ci}$`, "m"))
    expect(read("scripts/stamp/pins.mjs", tree)).toContain(`export const SHADCN_VERSION = "${ci}"`)
  })
})

// A fake `exec`: records every command with the env it was given, answers from `answer`.
type Call = { line: string; cwd?: string; env?: Record<string, string | undefined> }
type Result = { status: number; output: string }
const fakeExec = (answer: (line: string) => Partial<Result> | undefined = () => undefined) => {
  const calls: Call[] = []
  const run = async (command: string, args: string[], options: { cwd?: string; env?: Record<string, string | undefined> } = {}): Promise<Result> => {
    const line = [command, ...args].join(" ")
    calls.push({ line, cwd: options.cwd, env: options.env })
    return { status: 0, output: "", ...answer(line) }
  }
  return { calls, run, lines: () => calls.map((call) => call.line) }
}

const PASS_LOG = "RUN v5.0.3\n Test Files  120 passed (120)\ncheck: step 2/4 impeccable detect\ncheck: pass 61296b3\n"
const GIT_STATUS = " M scripts/check.sh\n M .github/workflows/design.yml\n"
const GIT_STAT = " 2 files changed, 2 insertions(+), 2 deletions(-)\n"

const happy = (line: string): Partial<Result> | undefined => {
  if (line === "bash scripts/check.sh") return { output: PASS_LOG }
  if (line === "git status --short") return { output: GIT_STATUS }
  if (line === "git diff --stat") return { output: GIT_STAT }
  return undefined
}

describe("trial", () => {
  const impeccable = () => ({ root: tree, pkg: "impeccable", from: pinsNow().impeccable, to: "9.8.7" })
  const shadcn = () => ({ root: tree, pkg: "shadcn", from: pinsNow().shadcn, to: "9.9.9" })

  it("is green when the check passes: bumps, runs the check, reports what changed", async () => {
    const exec = fakeExec(happy)
    const outcome = await follow.trial({ ...impeccable(), run: exec.run })
    expect(outcome).toMatchObject({
      ok: true,
      pkg: "impeccable",
      from: pinsNow().impeccable,
      to: "9.8.7",
      output: PASS_LOG,
      changes: { status: GIT_STATUS.trim(), stat: GIT_STAT.trim() },
    })
    expect(read("scripts/check.sh", tree)).toMatch(/^IMPECCABLE_VERSION=9\.8\.7$/m)
    expect(exec.lines()).toEqual(["bash scripts/check.sh", "git status --short", "git diff --stat"])
  })

  it("regenerates r/ and its stamp with the new shadcn before it checks", async () => {
    const exec = fakeExec(happy)
    const outcome = await follow.trial({ ...shadcn(), run: exec.run })
    expect(outcome.ok).toBe(true)
    expect(exec.lines().slice(0, 2)).toEqual(["pnpm build:registry", "bash scripts/check.sh"])
  })

  it("is red when the regenerate fails, and never runs the check on a half-built r/", async () => {
    const exec = fakeExec((line) => (line === "pnpm build:registry" ? { status: 1, output: "shadcn: unknown option --output" } : happy(line)))
    const outcome = await follow.trial({ ...shadcn(), run: exec.run })
    expect(outcome.ok).toBe(false)
    expect(outcome.failingCheck).toContain("pnpm build:registry")
    expect(outcome.output).toContain("unknown option --output")
    expect(exec.lines()).not.toContain("bash scripts/check.sh")
  })

  it("is red when the check fails, and names the step check.sh reports", async () => {
    const log = "check: step 3/4 registry output current\ncheck: FAIL at step 3/4 (r/ is out of date: run 'pnpm build:registry' and commit the result)\n"
    const exec = fakeExec((line) => (line === "bash scripts/check.sh" ? { status: 1, output: log } : happy(line)))
    const outcome = await follow.trial({ ...shadcn(), run: exec.run })
    expect(outcome.ok).toBe(false)
    expect(outcome.failingCheck).toBe("pnpm check, step 3/4 (r/ is out of date: run 'pnpm build:registry' and commit the result)")
    expect(outcome.output).toBe(log)
  })

  it("is red, with the check's own words, when the check dies without naming a step", async () => {
    const exec = fakeExec((line) => (line === "bash scripts/check.sh" ? { status: 137, output: "Killed" } : happy(line)))
    const outcome = await follow.trial({ ...impeccable(), run: exec.run })
    expect(outcome.ok).toBe(false)
    expect(outcome.failingCheck).toBe("pnpm check (exit 137)")
    expect(outcome.output).toBe("Killed")
  })

  it("is red, saying so, when the pin files no longer hold the pin to move", async () => {
    const exec = fakeExec(happy)
    const outcome = await follow.trial({ ...impeccable(), from: "1.0.0", run: exec.run })
    expect(outcome.ok).toBe(false)
    expect(outcome.failingCheck).toMatch(/bump the pin/i)
    expect(outcome.output).toContain("scripts/check.sh")
    expect(exec.calls).toEqual([])
  })
})

describe("trialAll", () => {
  const drift = (pkg: string, from: string, to: string) => ({ id: `${pkg}-pin`, pkg, from, to, fingerprint: `latest=${to}` })
  const ciEnv = { CI: "true", PATH: "/usr/bin", GH_TOKEN: "ghs_secret", GITHUB_TOKEN: "ghs_secret2", ACTIONS_RUNTIME_TOKEN: "rt" }

  it("does nothing, not even an install, when there is nothing to follow", async () => {
    const exec = fakeExec(happy)
    expect(await follow.trialAll({ root: tree, followups: [], exec: exec.run, env: ciEnv })).toEqual([])
    expect(exec.calls).toEqual([])
  })

  it("installs once, then tries each bump from a clean tree and restores the tree after each", async () => {
    const exec = fakeExec(happy)
    const outcomes = await follow.trialAll({
      root: tree,
      followups: [drift("shadcn", pinsNow().shadcn, "9.9.9"), drift("impeccable", pinsNow().impeccable, "9.8.7")],
      exec: exec.run,
      env: ciEnv,
    })
    expect(outcomes.map((outcome: { pkg: string; ok: boolean }) => [outcome.pkg, outcome.ok])).toEqual([
      ["shadcn", true],
      ["impeccable", true],
    ])
    expect(exec.lines()).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm build:registry",
      "bash scripts/check.sh",
      "git status --short",
      "git diff --stat",
      "git checkout -- .",
      "git clean -fdq -- r stamps",
      "bash scripts/check.sh",
      "git status --short",
      "git diff --stat",
      "git checkout -- .",
      "git clean -fdq -- r stamps",
    ])
  })

  it("keeps going after a red bump, and the red one carries its failing check", async () => {
    const exec = fakeExec((line) => (line === "pnpm build:registry" ? { status: 1, output: "boom" } : happy(line)))
    const outcomes = await follow.trialAll({
      root: tree,
      followups: [drift("shadcn", pinsNow().shadcn, "9.9.9"), drift("impeccable", pinsNow().impeccable, "9.8.7")],
      exec: exec.run,
      env: ciEnv,
    })
    expect(outcomes.map((outcome: { ok: boolean }) => outcome.ok)).toEqual([false, true])
    expect(outcomes[0].failingCheck).toContain("pnpm build:registry")
  })

  it("never hands a token to a command: the new upstream's code runs without one", async () => {
    const exec = fakeExec(happy)
    await follow.trialAll({ root: tree, followups: [drift("impeccable", pinsNow().impeccable, "9.8.7")], exec: exec.run, env: ciEnv })
    expect(exec.calls.length).toBeGreaterThan(0)
    for (const call of exec.calls) {
      expect(call.cwd, call.line).toBe(tree)
      expect(Object.keys(call.env ?? {}), call.line).not.toContain("GH_TOKEN")
      expect(Object.keys(call.env ?? {}), call.line).not.toContain("GITHUB_TOKEN")
      expect(Object.keys(call.env ?? {}), call.line).not.toContain("ACTIONS_RUNTIME_TOKEN")
      expect(call.env?.PATH, call.line).toBe("/usr/bin")
    }
  })

  it("throws, running nothing, when the install fails: that is the runner's fault, not the bump's", async () => {
    const exec = fakeExec((line) => (line.startsWith("pnpm install") ? { status: 1, output: "ERR_PNPM_FETCH_502" } : happy(line)))
    await expect(
      follow.trialAll({ root: tree, followups: [drift("impeccable", pinsNow().impeccable, "9.8.7")], exec: exec.run, env: ciEnv }),
    ).rejects.toThrow(/pnpm install.*ERR_PNPM_FETCH_502/s)
    expect(exec.lines()).toEqual(["pnpm install --frozen-lockfile"])
  })

  it("refuses outside CI, because it rewrites the working tree and then discards it", async () => {
    const exec = fakeExec(happy)
    const followups = [drift("impeccable", pinsNow().impeccable, "9.8.7")]
    await expect(follow.trialAll({ root: tree, followups, exec: exec.run, env: { PATH: "/usr/bin" } })).rejects.toThrow(/CI|--in-place/)
    expect(exec.calls).toEqual([])
    const allowed = await follow.trialAll({ root: tree, followups, exec: exec.run, env: { PATH: "/usr/bin" }, inPlace: true })
    expect(allowed).toHaveLength(1)
  })
})

// A fake `gh`, as test/repair-brief.test.ts has: records every call and the body files.
const fakeGh = (openIssues: { number: number; title: string }[] = []) => {
  const calls: string[][] = []
  const bodies: string[] = []
  const run = async (args: string[]) => {
    calls.push(args)
    const bodyFlag = args.indexOf("--body-file")
    if (bodyFlag !== -1) bodies.push(readFileSync(args[bodyFlag + 1], "utf8"))
    if (args[0] === "issue" && args[1] === "list") return { stdout: JSON.stringify(openIssues) }
    if (args[0] === "issue" && args[1] === "create") return { stdout: "https://github.com/deanjstone-hl/frontend/issues/901\n" }
    return { stdout: "" }
  }
  return { calls, bodies, run }
}

const RUN_URL = "https://github.com/deanjstone-hl/frontend/actions/runs/42"
const green = {
  id: "shadcn-pin",
  fingerprint: "latest=4.23.0",
  ok: true,
  pkg: "shadcn",
  from: "4.19.1",
  to: "4.23.0",
  output: PASS_LOG,
  changes: { status: " M r/button.json\n M stamps/registry-output.json", stat: "2 files changed, 9 insertions(+), 3 deletions(-)" },
}
const red = {
  id: "impeccable-pin",
  fingerprint: "latest=4.11.0",
  ok: false,
  pkg: "impeccable",
  from: "3.6.1",
  to: "4.11.0",
  failingCheck: "pnpm check, step 2/4 (impeccable detect registry/ theme/)",
  output: "registry/ui/button.tsx: 3 findings\ncheck: FAIL at step 2/4 (impeccable detect registry/ theme/)\n",
}

describe("the green issue", () => {
  it("is titled with the bump, labelled mode:afk and type:build, and has no wave label", async () => {
    const gh = fakeGh([])
    const result = await follow.fileOutcome(green, { gh: gh.run, runUrl: RUN_URL })
    expect(result).toEqual({ action: "created", url: "https://github.com/deanjstone-hl/frontend/issues/901" })
    const create = gh.calls.find((args) => args[1] === "create")!
    expect(create).toContain("Upstream follow: bump shadcn 4.19.1 -> 4.23.0")
    const labels = create.flatMap((arg, i) => (arg === "--label" ? [create[i + 1]] : []))
    expect(labels.sort()).toEqual(["mode:afk", "type:build"])
    expect(create.join(" ")).not.toMatch(/wave:/)
  })

  it("names the bump, attaches the check output with its pass line, and says how to land it", async () => {
    const gh = fakeGh([])
    await follow.fileOutcome(green, { gh: gh.run, runUrl: RUN_URL })
    const body = gh.bodies[0]
    expect(body).toContain("shadcn 4.19.1 -> 4.23.0")
    expect(body).toContain(RUN_URL)
    expect(body).toContain("check: pass 61296b3")
    expect(body).toContain("M r/button.json")
    expect(body).toContain("2 files changed, 9 insertions(+), 3 deletions(-)")
    expect(body).toContain("node scripts/upstream-follow/follow.mjs apply shadcn 4.23.0\npnpm check")
    expect(body).toMatch(/nothing was pushed/i)
    expect(body.trimEnd().endsWith("Mode: AFK")).toBe(true)
  })

  it("keeps the tail of a very long check output, where the pass line is", async () => {
    const gh = fakeGh([])
    await follow.fileOutcome({ ...green, output: `${"noise\n".repeat(20_000)}check: pass abcdef1\n` }, { gh: gh.run, runUrl: RUN_URL })
    expect(gh.bodies[0].length).toBeLessThan(65_536)
    expect(gh.bodies[0]).toContain("check: pass abcdef1")
    expect(gh.bodies[0]).toMatch(/truncated/i)
  })

  it("comments on the open issue for the same bump instead of filing a second", async () => {
    const gh = fakeGh([{ number: 77, title: "Upstream follow: bump shadcn 4.19.1 -> 4.23.0" }])
    const result = await follow.fileOutcome(green, { gh: gh.run, runUrl: RUN_URL })
    expect(result).toMatchObject({ action: "commented", number: 77 })
    expect(gh.calls.some((args) => args[1] === "create")).toBe(false)
  })

  it("files a new issue for a newer bump of the same package", async () => {
    const gh = fakeGh([{ number: 77, title: "Upstream follow: bump shadcn 4.19.1 -> 4.22.0" }])
    const result = await follow.fileOutcome(green, { gh: gh.run, runUrl: RUN_URL })
    expect(result.action).toBe("created")
  })

  it("passes the repo through to gh, and the body as a file, never inline", async () => {
    const gh = fakeGh([])
    await follow.fileOutcome(green, { gh: gh.run, runUrl: RUN_URL, repo: "deanjstone-hl/frontend" })
    for (const args of gh.calls) expect(args.slice(-2)).toEqual(["-R", "deanjstone-hl/frontend"])
    expect(gh.calls.find((args) => args[1] === "create")).not.toContain("--body")
  })
})

describe("the red Repair brief", () => {
  it("goes through the Repair brief helper under the probe's own key", async () => {
    const gh = fakeGh([])
    const result = await follow.fileOutcome(red, { gh: gh.run, runUrl: RUN_URL })
    expect(result.action).toBe("created")
    const create = gh.calls.find((args) => args[1] === "create")!
    expect(create).toContain("Repair brief: impeccable pin drift")
    const labels = create.flatMap((arg, i) => (arg === "--label" ? [create[i + 1]] : []))
    expect(labels.sort()).toEqual(["mode:afk", "type:bug"])
  })

  it("carries the run link, the bump, the failing step, its output and a repro that starts from a fresh checkout", async () => {
    const gh = fakeGh([])
    await follow.fileOutcome(red, { gh: gh.run, runUrl: RUN_URL })
    const body = gh.bodies[0]
    expect(body).toContain(RUN_URL)
    expect(body).toContain("impeccable 3.6.1 -> 4.11.0")
    expect(body).toContain("pnpm check, step 2/4 (impeccable detect registry/ theme/)")
    expect(body).toContain("registry/ui/button.tsx: 3 findings")
    expect(body).toContain("pnpm install --frozen-lockfile\nnode scripts/upstream-follow/follow.mjs apply impeccable 4.11.0\npnpm check")
  })

  it("comments on the open brief when the same probe is red for a newer version, since the key holds no version", async () => {
    const gh = fakeGh([{ number: 55, title: "Repair brief: impeccable pin drift" }])
    const result = await follow.fileOutcome(red, { gh: gh.run, runUrl: RUN_URL })
    expect(result).toMatchObject({ action: "commented", number: 55 })
  })
})

// @ts-expect-error: a plain .mjs module with no type declarations
import * as canary from "../scripts/drift-canary/canary.mjs"

const NPM_SHADCN = "https://registry.npmjs.org/shadcn/latest"
const NPM_IMPECCABLE = "https://registry.npmjs.org/impeccable/latest"
const fixture = (name: string) => read(`test/fixtures/drift-canary/${name}`)

describe("the canary's hand-off to the follow job", () => {
  // The npm answers recorded on 25 Nov 2026: shadcn latest 4.23.0, impeccable latest 4.11.0.
  const answers = (shadcn = fixture("npm-shadcn-latest.json")) => {
    const bodies: Record<string, string> = { [NPM_SHADCN]: shadcn, [NPM_IMPECCABLE]: fixture("npm-impeccable-latest.json") }
    const fetch = async (url: string) =>
      bodies[url] === undefined
        ? { ok: false, status: 404, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => JSON.parse(bodies[url]) }
    return canary.createSources({ fetch })
  }
  const pins = { shadcn: "4.19.1", impeccable: "3.6.1" }
  const baseline = {}

  const filer = () => {
    const keys: string[] = []
    return { keys, file: async (brief: { key: string }) => (keys.push(brief.key), { action: "created", url: "u" }) }
  }

  it("says what moved from and to, so the follow job needs no parsing of prose", async () => {
    const result = await canary.probePin({ id: "shadcn-pin", pkg: "shadcn", pinned: "4.19.1", sources: answers() })
    expect(result).toMatchObject({ status: "drift", pkg: "shadcn", pinned: "4.19.1", latest: "4.23.0" })
  })

  it("hands a pin that reached the threshold to the follow job, files nothing, and does not mark it filed", async () => {
    const { keys, file } = filer()
    let state = {}
    let deferred: unknown[] = []
    for (let day = 0; day < 2; day += 1) {
      const outcome = await canary.run({ state, pins, baseline, sources: answers(), file, threshold: 2, env: {}, deferPins: true })
      state = outcome.state
      deferred = outcome.deferred
    }
    expect(keys).toEqual([])
    expect(deferred).toEqual([
      { id: "shadcn-pin", pkg: "shadcn", from: "4.19.1", to: "4.23.0", fingerprint: "latest=4.23.0" },
      { id: "impeccable-pin", pkg: "impeccable", from: "3.6.1", to: "4.11.0", fingerprint: "latest=4.11.0" },
    ])
    expect((state as Record<string, { filed: string | null }>)["shadcn-pin"].filed).toBeNull()
  })

  it("hands over nothing on the first sighting: the threshold still applies", async () => {
    const { file } = filer()
    const outcome = await canary.run({ state: {}, pins, baseline, sources: answers(), file, threshold: 2, env: {}, deferPins: true })
    expect(outcome.deferred).toEqual([])
  })

  it("hands over again on the next run until the follow job has filed, so a lost run retries", async () => {
    const { file } = filer()
    let state = {}
    let deferred: unknown[] = []
    for (let day = 0; day < 4; day += 1) {
      const outcome = await canary.run({ state, pins, baseline, sources: answers(), file, threshold: 2, env: {}, deferPins: true })
      state = outcome.state
      deferred = outcome.deferred
    }
    expect(deferred).toHaveLength(2)
  })

  it("still files a broken pin probe through the plain helper: there is nothing to try", async () => {
    const { keys, file } = filer()
    const broken = canary.createSources({ fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }) })
    let state = {}
    for (let day = 0; day < 2; day += 1) {
      state = (await canary.run({ state, pins, baseline, sources: broken, file, threshold: 2, env: {}, deferPins: true })).state
    }
    expect(keys.sort()).toEqual(["impeccable pin probe broken", "shadcn pin probe broken"])
  })

  it("still files upstream source drift through the plain helper", async () => {
    const { keys, file } = filer()
    const item = JSON.parse(fixture("upstream-button.json"))
    const sources = canary.createSources({
      fetch: async (url: string) =>
        url === "https://ui.shadcn.com/r/styles/base-nova/button.json"
          ? { ok: true, status: 200, json: async () => ({ ...item, files: [{ ...item.files[0], content: "changed" }] }) }
          : { ok: true, status: 200, json: async () => ({ version: pins.shadcn }) },
    })
    let state = {}
    for (let day = 0; day < 2; day += 1) {
      state = (
        await canary.run({
          state,
          pins: { shadcn: pins.shadcn, impeccable: pins.shadcn },
          baseline: { button: canary.hashUpstreamItem(item) },
          sources,
          file,
          threshold: 2,
          env: {},
          deferPins: true,
        })
      ).state
    }
    expect(keys).toEqual(["upstream shadcn source drift"])
  })

  it("files pins the old way when no hand-off is asked for, so a local run is unchanged", async () => {
    const { keys, file } = filer()
    let state = {}
    for (let day = 0; day < 2; day += 1) {
      state = (await canary.run({ state, pins, baseline, sources: answers(), file, threshold: 2, env: {} })).state
    }
    expect(keys.sort()).toEqual(["impeccable pin drift", "shadcn pin drift"])
  })
})

describe("fileOutcomes (the filing step after the trial)", () => {
  const filedState = () => ({
    "shadcn-pin": { key: "drift:latest=4.23.0", streak: 2, filed: null },
    "impeccable-pin": { key: "drift:latest=4.11.0", streak: 2, filed: null },
  })

  it("files each outcome and marks exactly those probes filed, so the canary stops handing them over", async () => {
    const gh = fakeGh([])
    const outcome = await follow.fileOutcomes({ outcomes: [green, red], state: filedState(), gh: gh.run, runUrl: RUN_URL })
    expect(outcome.failures).toEqual([])
    expect(outcome.filed.map((entry: { id: string }) => entry.id)).toEqual(["shadcn-pin", "impeccable-pin"])
    expect(outcome.state["shadcn-pin"].filed).toBe("drift:latest=4.23.0")
    expect(outcome.state["impeccable-pin"].filed).toBe("drift:latest=4.11.0")
  })

  it("leaves a probe unfiled, and says why, when its filing fails; the others still file", async () => {
    const gh = fakeGh([])
    const flaky = async (args: string[]) => {
      if (args[1] === "create" && args.includes("Upstream follow: bump shadcn 4.19.1 -> 4.23.0")) throw new Error("gh: HTTP 502")
      return gh.run(args)
    }
    const outcome = await follow.fileOutcomes({ outcomes: [green, red], state: filedState(), gh: flaky, runUrl: RUN_URL })
    expect(outcome.failures).toEqual([{ id: "shadcn-pin", error: "gh: HTTP 502" }])
    expect(outcome.state["shadcn-pin"].filed).toBeNull()
    expect(outcome.state["impeccable-pin"].filed).toBe("drift:latest=4.11.0")
  })
})

describe("applyPin (what a worker runs to land a bump)", () => {
  it("reads the current pin from the tree, moves it, and regenerates with the new shadcn", async () => {
    const exec = fakeExec()
    const result = await follow.applyPin({ root: tree, pkg: "shadcn", to: "9.9.9", run: exec.run })
    expect(result).toMatchObject({ pkg: "shadcn", from: pinsNow().shadcn, to: "9.9.9" })
    expect(read("scripts/check.sh", tree)).toMatch(/^SHADCN_VERSION=9\.9\.9$/m)
    expect(exec.lines()).toEqual(["pnpm build:registry"])
  })

  it("regenerates nothing for impeccable, which writes no output", async () => {
    const exec = fakeExec()
    await follow.applyPin({ root: tree, pkg: "impeccable", to: "9.8.7", run: exec.run })
    expect(read("scripts/check.sh", tree)).toMatch(/^IMPECCABLE_VERSION=9\.8\.7$/m)
    expect(exec.calls).toEqual([])
  })

  it("throws, naming the step, when the regenerate fails, so the worker does not run the check on a half-built r/", async () => {
    const exec = fakeExec((line) => (line === "pnpm build:registry" ? { status: 2, output: "boom" } : undefined))
    await expect(follow.applyPin({ root: tree, pkg: "shadcn", to: "9.9.9", run: exec.run })).rejects.toThrow(/pnpm build:registry.*exit 2/s)
  })

  it("does nothing when the pin is already at the target", async () => {
    const exec = fakeExec()
    await expect(follow.applyPin({ root: tree, pkg: "impeccable", to: pinsNow().impeccable, run: exec.run })).rejects.toThrow(/already/i)
    expect(exec.calls).toEqual([])
  })
})

describe("the command lines", () => {
  it("follow.mjs: apply, trial and file, each with what it needs", () => {
    expect(follow.parseCli(["apply", "shadcn", "4.23.0"])).toMatchObject({ command: "apply", pkg: "shadcn", to: "4.23.0" })
    expect(follow.parseCli(["trial", "--followups", "f.json", "--out", "o.json"])).toMatchObject({
      command: "trial",
      followups: "f.json",
      out: "o.json",
      inPlace: false,
    })
    expect(follow.parseCli(["trial", "--followups", "f.json", "--out", "o.json", "--in-place"]).inPlace).toBe(true)
    expect(follow.parseCli(["file", "--outcomes", "o.json", "--state", "s.json", "--repo", "a/b"])).toMatchObject({
      command: "file",
      outcomes: "o.json",
      state: "s.json",
      repo: "a/b",
    })
  })

  it("rejects what it cannot run, naming the problem", () => {
    expect(() => follow.parseCli([])).toThrow(/command/i)
    expect(() => follow.parseCli(["apply", "shadcn"])).toThrow(/version/i)
    expect(() => follow.parseCli(["trial", "--out", "o.json"])).toThrow(/--followups/)
    expect(() => follow.parseCli(["file", "--outcomes", "o.json"])).toThrow(/--state/)
    expect(() => follow.parseCli(["trial", "--bogus"])).toThrow(/--bogus/)
  })

  it("canary.mjs: --followups turns the hand-off on", () => {
    expect(canary.parseCli(["--state", "s.json", "--followups", "f.json"]).followupsPath).toBe("f.json")
    expect(canary.parseCli(["--state", "s.json"]).followupsPath).toBeUndefined()
    expect(() => canary.parseCli(["--followups"])).toThrow(/needs a value/)
  })
})

describe("the workflow", () => {
  const workflow = read(".github/workflows/drift-canary.yml")
  // The steps of the one job, each as its own text, in order.
  const steps = workflow
    .slice(workflow.indexOf("    steps:\n") + "    steps:\n".length)
    .split(/\n(?=      - )/)
    .map((step) => step.replace(/^( {6}#.*\n)+/gm, ""))
  const named = (name: string) => {
    const step = steps.find((candidate) => candidate.includes(`name: ${name}`))
    expect(step, name).toBeDefined()
    return step as string
  }

  it("probes, then tries the bumps, then files what they found, in that order", () => {
    const order = ["Probe the upstreams", "Try the bumps", "File what the bumps found"].map((name) => workflow.indexOf(`name: ${name}`))
    expect(order.every((index) => index > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it("hands the pins to the follow job through the state directory the cache keeps", () => {
    expect(named("Probe the upstreams")).toContain("--followups .drift-canary-state/followups.json")
    expect(named("Try the bumps")).toContain("trial --followups .drift-canary-state/followups.json --out .drift-canary-state/outcomes.json")
    const filing = named("File what the bumps found")
    expect(filing).toContain("file --outcomes .drift-canary-state/outcomes.json --state .drift-canary-state/state.json")
  })

  it("gives the token to the steps that file and never to the one that runs the new upstream", () => {
    expect(named("Probe the upstreams")).toContain("GH_TOKEN: ${{ github.token }}")
    expect(named("File what the bumps found")).toContain("GH_TOKEN: ${{ github.token }}")
    const trying = named("Try the bumps")
    expect(trying).not.toMatch(/GH_TOKEN|GITHUB_TOKEN|github\.token|secrets\./)
    expect(trying).not.toMatch(/^\s+env:/m)
  })

  it("sets pnpm up for the trial, from the same pinned action test.yml uses", () => {
    const sha = (text: string) => text.match(/pnpm\/action-setup@([0-9a-f]{40})/)?.[1]
    expect(sha(workflow)).toBeDefined()
    expect(sha(workflow)).toBe(sha(read(".github/workflows/test.yml")))
  })

  it("leaves time for an install and a full check per pin, and still ends", () => {
    const minutes = Number(workflow.match(/^ {4}timeout-minutes: (\d+)$/m)?.[1])
    expect(minutes).toBeGreaterThanOrEqual(30)
    expect(minutes).toBeLessThanOrEqual(120)
  })

  it("pushes nothing and writes no issue except through the helper scripts", () => {
    expect(workflow).not.toMatch(/git push|gh issue|gh pr/)
  })
})

describe("recorded trials (real runs of follow.mjs trial on 25 Nov 2026)", () => {
  // shadcn 4.19.1 -> 4.23.0 and impeccable 3.6.1 -> 4.11.0, each with the real check output
  // and the real `git status` of the bump. Both were green.
  const recorded = (name: string) => JSON.parse(read(`test/fixtures/upstream-follow/${name}`))

  it("files the real shadcn 4.23.0 trial as a green issue: the pin files and the re-stamped r/ output", async () => {
    const outcome = recorded("trial-shadcn-4.23.0-green.json")
    expect(outcome.ok).toBe(true)
    const gh = fakeGh([])
    await follow.fileOutcome({ id: "shadcn-pin", fingerprint: "latest=4.23.0", ...outcome }, { gh: gh.run, runUrl: RUN_URL })
    const body = gh.bodies[0]
    expect(body).toContain("shadcn 4.19.1 -> 4.23.0")
    expect(body).toContain("M stamps/registry-output.json")
    expect(body).toContain("M scripts/stamp/pins.mjs")
    expect(body).toMatch(/check: pass [0-9a-f]{7}/)
    expect(body.length).toBeLessThan(65_536)
  })

  it("files the real impeccable 4.11.0 trial as a green issue touching the three pin files only", async () => {
    const outcome = recorded("trial-impeccable-4.11.0-green.json")
    const gh = fakeGh([])
    await follow.fileOutcome({ id: "impeccable-pin", fingerprint: "latest=4.11.0", ...outcome }, { gh: gh.run, runUrl: RUN_URL })
    const body = gh.bodies[0]
    expect(body).toContain("impeccable 3.6.1 -> 4.11.0")
    expect(outcome.changes.status.split("\n")).toHaveLength(3)
    expect(body).toMatch(/check: pass [0-9a-f]{7}/)
  })
})
