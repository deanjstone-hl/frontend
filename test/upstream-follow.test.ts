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
    const touched = follow.bumpPin({ root: tree, pkg: "shadcn", from, to: "4.23.0" })
    expect([...touched].sort()).toEqual([
      ".github/workflows/design.yml",
      ".github/workflows/release.yml",
      "README.md",
      "scripts/check.sh",
      "scripts/stamp/pins.mjs",
    ])
    expect(read("scripts/check.sh", tree)).toMatch(/^SHADCN_VERSION=4\.23\.0$/m)
    expect(read("scripts/stamp/pins.mjs", tree)).toContain('export const SHADCN_VERSION = "4.23.0"')
    expect(read(".github/workflows/design.yml", tree)).toContain("npx --yes shadcn@4.23.0 build --output ./r")
    const release = read(".github/workflows/release.yml", tree)
    expect(release).toContain("npx --yes shadcn@4.23.0 build --output ./r")
    expect(release).toContain("Run 'npx shadcn@4.23.0 build --output ./r'")
    expect(release).not.toContain(`shadcn@${from}`)
    // The impeccable pin is a different tool and does not move.
    expect(read("scripts/check.sh", tree)).toMatch(new RegExp(`^IMPECCABLE_VERSION=${pinsNow().impeccable.replace(/\./g, "\\.")}$`, "m"))
  })

  it("moves the impeccable pin in check.sh, design.yml and release.yml only", () => {
    const from = pinsNow().impeccable
    const touched = follow.bumpPin({ root: tree, pkg: "impeccable", from, to: "4.11.0" })
    expect([...touched].sort()).toEqual([".github/workflows/design.yml", ".github/workflows/release.yml", "scripts/check.sh"])
    expect(read("scripts/check.sh", tree)).toMatch(/^IMPECCABLE_VERSION=4\.11\.0$/m)
    expect(read(".github/workflows/design.yml", tree)).toContain("npx --yes impeccable@4.11.0 detect registry/ theme/")
    expect(read(".github/workflows/release.yml", tree)).toContain("npx --yes impeccable@4.11.0 detect registry/ theme/")
    expect(read("scripts/stamp/pins.mjs", tree)).toBe(read("scripts/stamp/pins.mjs"))
  })

  it("does not touch a longer version that merely starts with the pin", () => {
    const check = join(tree, "scripts/check.sh")
    writeFileSync(check, `${read("scripts/check.sh", tree)}# other: shadcn@${pinsNow().shadcn}0 stays\n`)
    follow.bumpPin({ root: tree, pkg: "shadcn", from: pinsNow().shadcn, to: "4.23.0" })
    expect(read("scripts/check.sh", tree)).toContain(`shadcn@${pinsNow().shadcn}0 stays`)
  })

  it("throws, and writes nothing, when a required file does not hold the pin it was told to move", () => {
    const before = read("scripts/check.sh", tree)
    expect(() => follow.bumpPin({ root: tree, pkg: "shadcn", from: "3.0.0", to: "4.23.0" })).toThrow(/scripts\/check\.sh/)
    expect(read("scripts/check.sh", tree)).toBe(before)
  })

  it("names the file that lost its pin when one site has gone, and writes nothing", () => {
    const design = join(tree, ".github/workflows/design.yml")
    writeFileSync(design, read(".github/workflows/design.yml", tree).replaceAll(`shadcn@${pinsNow().shadcn}`, "shadcn@latest"))
    const before = read("scripts/check.sh", tree)
    expect(() => follow.bumpPin({ root: tree, pkg: "shadcn", from: pinsNow().shadcn, to: "4.23.0" })).toThrow(/design\.yml/)
    expect(read("scripts/check.sh", tree)).toBe(before)
  })

  it("refuses a target that is not a plain version, since it is written into files and run by npx", () => {
    for (const to of ["latest", "4.23", "4.23.0; rm -rf /", "$(id)", "4.23.0\n", "../4.23.0"]) {
      expect(() => follow.bumpPin({ root: tree, pkg: "shadcn", from: pinsNow().shadcn, to }), to).toThrow(/version/i)
    }
  })

  it("refuses a package it does not know", () => {
    expect(() => follow.bumpPin({ root: tree, pkg: "left-pad", from: "1.0.0", to: "1.0.1" })).toThrow(/left-pad/)
  })

  it("leaves a tree where the repo's own pin tests would still agree with each other", () => {
    follow.bumpPin({ root: tree, pkg: "shadcn", from: pinsNow().shadcn, to: "4.23.0" })
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
  const impeccable = () => ({ root: tree, pkg: "impeccable", from: pinsNow().impeccable, to: "4.11.0" })
  const shadcn = () => ({ root: tree, pkg: "shadcn", from: pinsNow().shadcn, to: "4.23.0" })

  it("is green when the check passes: bumps, runs the check, reports what changed", async () => {
    const exec = fakeExec(happy)
    const outcome = await follow.trial({ ...impeccable(), run: exec.run })
    expect(outcome).toMatchObject({
      ok: true,
      pkg: "impeccable",
      from: pinsNow().impeccable,
      to: "4.11.0",
      output: PASS_LOG,
      changes: { status: GIT_STATUS.trim(), stat: GIT_STAT.trim() },
    })
    expect(read("scripts/check.sh", tree)).toMatch(/^IMPECCABLE_VERSION=4\.11\.0$/m)
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
      followups: [drift("shadcn", pinsNow().shadcn, "4.23.0"), drift("impeccable", pinsNow().impeccable, "4.11.0")],
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
      followups: [drift("shadcn", pinsNow().shadcn, "4.23.0"), drift("impeccable", pinsNow().impeccable, "4.11.0")],
      exec: exec.run,
      env: ciEnv,
    })
    expect(outcomes.map((outcome: { ok: boolean }) => outcome.ok)).toEqual([false, true])
    expect(outcomes[0].failingCheck).toContain("pnpm build:registry")
  })

  it("never hands a token to a command: the new upstream's code runs without one", async () => {
    const exec = fakeExec(happy)
    await follow.trialAll({ root: tree, followups: [drift("impeccable", pinsNow().impeccable, "4.11.0")], exec: exec.run, env: ciEnv })
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
      follow.trialAll({ root: tree, followups: [drift("impeccable", pinsNow().impeccable, "4.11.0")], exec: exec.run, env: ciEnv }),
    ).rejects.toThrow(/pnpm install.*ERR_PNPM_FETCH_502/s)
    expect(exec.lines()).toEqual(["pnpm install --frozen-lockfile"])
  })

  it("refuses outside CI, because it rewrites the working tree and then discards it", async () => {
    const exec = fakeExec(happy)
    const followups = [drift("impeccable", pinsNow().impeccable, "4.11.0")]
    await expect(follow.trialAll({ root: tree, followups, exec: exec.run, env: { PATH: "/usr/bin" } })).rejects.toThrow(/CI|--in-place/)
    expect(exec.calls).toEqual([])
    const allowed = await follow.trialAll({ root: tree, followups, exec: exec.run, env: { PATH: "/usr/bin" }, inPlace: true })
    expect(allowed).toHaveLength(1)
  })
})
