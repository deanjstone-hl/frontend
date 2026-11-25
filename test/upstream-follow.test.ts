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
