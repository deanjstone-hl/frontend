// @vitest-environment node

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
// @ts-expect-error - plain ESM script
import { digest, fileEntries, sha256, stampPath, verifyStamp, writeStamp } from "../scripts/stamp/stamp.mjs"

// frontend#234: a generated artefact or golden carries a stamp (generator hash, input hash,
// tool pins, output hash). The check fails when the stamp is missing, the bytes moved, or the
// generator, inputs or a pin moved without a regenerate. These tests use a throwaway tree
// and a fake generator; test/stamps.test.ts holds the repo's real artefacts.

let root: string
let pin = "1.0.0"

const put = (path: string, text: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

const spec = () => ({
  name: "demo",
  regenerate: "node gen.mjs",
  generator: ["gen.mjs"],
  inputs: () => ["in.txt"],
  outputs: (at: string) => fileEntries(at, ["out.txt"]),
  pins: () => ({ tool: pin }),
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "stamp-core-"))
  pin = "1.0.0"
  put("gen.mjs", "// the generator\n")
  put("in.txt", "input\n")
  put("out.txt", "output\n")
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

const stampFile = () => JSON.parse(readFileSync(stampPath(root, "demo"), "utf8"))

describe("writeStamp and verifyStamp", () => {
  it("passes right after the generator writes the stamp", () => {
    writeStamp(spec(), root)
    expect(verifyStamp(spec(), root)).toEqual([])
  })

  it("records the generator hash, the input hash, the pins and the output hash", () => {
    writeStamp(spec(), root)
    const stamp = stampFile()
    expect(stamp.generator.files).toEqual({ "gen.mjs": sha256("// the generator\n") })
    expect(stamp.input.files).toEqual({ "in.txt": sha256("input\n") })
    expect(stamp.output.files).toEqual({ "out.txt": sha256("output\n") })
    expect(stamp.pins).toEqual({ tool: "1.0.0" })
    expect(stamp.generator.hash).toBe(digest(stamp.generator.files))
  })

  it("fails when there is no stamp, and names the regenerate command", () => {
    const problems = verifyStamp(spec(), root)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("demo has no stamp")
    expect(problems[0]).toContain("node gen.mjs")
  })

  it("fails when the output bytes no longer match the stamp, and says a re-stamp is not the fix", () => {
    writeStamp(spec(), root)
    put("out.txt", "edited by hand\n")
    const problems = verifyStamp(spec(), root)
    expect(problems.join("\n")).toContain("out.txt")
    expect(problems.join("\n")).toContain("no longer match")
    expect(problems.join("\n")).toContain("never re-stamp")
  })

  it("fails when an output file is added or removed", () => {
    writeStamp(spec(), root)
    const added = { ...spec(), outputs: (at: string) => fileEntries(at, ["out.txt", "extra.txt"]) }
    put("extra.txt", "x\n")
    expect(verifyStamp(added, root).join("\n")).toContain("extra.txt")
    const removed = { ...spec(), outputs: () => [] }
    expect(verifyStamp(removed, root).join("\n")).toContain("out.txt")
  })

  it("fails when the generator moved without a regenerate", () => {
    writeStamp(spec(), root)
    put("gen.mjs", "// the generator, changed\n")
    const problems = verifyStamp(spec(), root)
    expect(problems.join("\n")).toContain("generator moved")
    expect(problems.join("\n")).toContain("gen.mjs")
  })

  it("fails when an input moved without a regenerate", () => {
    writeStamp(spec(), root)
    put("in.txt", "new input\n")
    expect(verifyStamp(spec(), root).join("\n")).toContain("inputs moved")
  })

  it("fails when a tool pin moved without a regenerate, naming both versions", () => {
    writeStamp(spec(), root)
    pin = "2.0.0"
    const problems = verifyStamp(spec(), root).join("\n")
    expect(problems).toContain("pin tool moved")
    expect(problems).toContain("1.0.0")
    expect(problems).toContain("2.0.0")
  })

  it("hashes only the files the spec names, not the directory around them", () => {
    writeStamp(spec(), root)
    put("unrelated.txt", "noise\n")
    put("sibling/other.mjs", "noise\n")
    expect(verifyStamp(spec(), root)).toEqual([])
  })

  it("fails a stamp whose recorded hash does not match its own file list", () => {
    writeStamp(spec(), root)
    const stamp = stampFile()
    stamp.output.hash = sha256("a hash typed by hand")
    writeFileSync(stampPath(root, "demo"), JSON.stringify(stamp))
    expect(verifyStamp(spec(), root).join("\n")).toContain("edited by hand")
  })

  it("fails a stamp that is not valid JSON", () => {
    mkdirSync(dirname(stampPath(root, "demo")), { recursive: true })
    writeFileSync(stampPath(root, "demo"), "{not json")
    expect(verifyStamp(spec(), root).join("\n")).toContain("edited by hand")
  })

  it("refuses to stamp when a generator or input file is missing", () => {
    rmSync(join(root, "gen.mjs"))
    expect(() => writeStamp(spec(), root)).toThrow(/gen\.mjs/)
  })

  it("is stable: stamping twice writes identical bytes", () => {
    writeStamp(spec(), root)
    const first = readFileSync(stampPath(root, "demo"), "utf8")
    writeStamp(spec(), root)
    expect(readFileSync(stampPath(root, "demo"), "utf8")).toBe(first)
  })
})
