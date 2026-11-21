// @vitest-environment node

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// frontend#235 (autorepo 3, the owner's adoption of 16 Nov 2026): every automated failure
// this repo files uses one Repair brief shape, so a worker gets everything from the issue
// alone. The helper deduplicates on a stable title, labels the issue `mode:afk` and
// `type:bug`, and never sets a `wave:` label: Aquila places the wave on its next wave
// check (owner, 16 Nov 2026 20:00 AEDT). The reference is rauchg/xeet (Apache-2.0); the
// code here is written for this repo.

// @ts-expect-error: a plain .mjs module with no type declarations
import * as helper from "../scripts/repair-brief/repair-brief.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const read = (path: string) => readFileSync(join(root, path), "utf8")

type GhCall = string[]
type GhResult = { stdout: string }

// A fake `gh`: records every call and answers `issue list` with the issues given.
const fakeGh = (openIssues: { number: number; title: string }[] = []) => {
  const calls: GhCall[] = []
  const bodies: string[] = []
  const run = async (args: string[]): Promise<GhResult> => {
    calls.push(args)
    const bodyFlag = args.indexOf("--body-file")
    if (bodyFlag !== -1) bodies.push(readFileSync(args[bodyFlag + 1], "utf8"))
    if (args[0] === "issue" && args[1] === "list") {
      return { stdout: JSON.stringify(openIssues) }
    }
    if (args[0] === "issue" && args[1] === "create") {
      return { stdout: "https://github.com/deanjstone/frontend/issues/900\n" }
    }
    return { stdout: "" }
  }
  return { calls, bodies, run }
}

const brief = {
  key: "shadcn pin drift",
  runUrl: "https://github.com/deanjstone/frontend/actions/runs/1",
  changed: "shadcn 4.19.1 -> 4.20.0",
  failingCheck: "pnpm check, step 3/4",
  output: "r/ is out of date",
  repro: ["pnpm install", "pnpm check"],
}

describe("repairBriefTitle", () => {
  it("prefixes the key", () => {
    expect(helper.repairBriefTitle("shadcn pin drift")).toBe("Repair brief: shadcn pin drift")
  })

  it("collapses whitespace so the same key always gives the same title", () => {
    expect(helper.repairBriefTitle("  shadcn \n pin\tdrift ")).toBe("Repair brief: shadcn pin drift")
  })

  it("rejects an empty key", () => {
    expect(() => helper.repairBriefTitle("   ")).toThrow(/key/i)
  })
})

describe("labels", () => {
  it("is exactly mode:afk and type:bug", () => {
    expect([...helper.REPAIR_BRIEF_LABELS].sort()).toEqual(["mode:afk", "type:bug"])
  })

  it("has no wave: label (Aquila places the wave)", () => {
    expect(helper.REPAIR_BRIEF_LABELS.some((label: string) => label.startsWith("wave:"))).toBe(false)
  })
})

describe("renderBrief", () => {
  const body = helper.renderBrief(brief)

  it("carries the run link, the change, the failing check, its output and the repro commands", () => {
    expect(body).toContain(brief.runUrl)
    expect(body).toContain(brief.changed)
    expect(body).toContain(brief.failingCheck)
    expect(body).toContain(brief.output)
    expect(body).toContain("pnpm install\npnpm check")
  })

  it("uses the headings the issue template uses", () => {
    const template = read(".github/ISSUE_TEMPLATE/repair-brief.md")
    for (const heading of helper.BRIEF_HEADINGS) {
      expect(body).toContain(`## ${heading}`)
      expect(template).toContain(`## ${heading}`)
    }
  })

  it("fences output that itself contains backtick fences", () => {
    const fenced = helper.renderBrief({ ...brief, output: "before\n```\ninner\n```\nafter" })
    expect(fenced).toContain("````\nbefore\n```\ninner\n```\nafter\n````")
  })

  it("keeps the tail of an oversized output and says it was cut", () => {
    const long = `${"x".repeat(80_000)}\nlast failing line`
    const cut = helper.renderBrief({ ...brief, output: long })
    expect(cut.length).toBeLessThan(65_536)
    expect(cut).toContain("last failing line")
    expect(cut).toMatch(/truncated/i)
  })

  it("says so when there is no output or no repro command", () => {
    const bare = helper.renderBrief({ ...brief, output: "", repro: [] })
    expect(bare).toMatch(/no output captured/i)
    expect(bare).toMatch(/no repro commands/i)
  })
})

describe("fileRepairBrief", () => {
  it("creates one issue when none is open, with exactly the two labels and no wave", async () => {
    const gh = fakeGh([])
    const result = await helper.fileRepairBrief(brief, { gh: gh.run })
    expect(result).toEqual({ action: "created", url: "https://github.com/deanjstone/frontend/issues/900" })

    const create = gh.calls.find((args) => args[0] === "issue" && args[1] === "create")
    expect(create).toBeDefined()
    const labels = create!.flatMap((arg, i) => (arg === "--label" ? [create![i + 1]] : []))
    expect(labels.sort()).toEqual(["mode:afk", "type:bug"])
    expect(create!.join(" ")).not.toMatch(/wave:/)
    expect(create).toContain("Repair brief: shadcn pin drift")
    expect(gh.bodies[0]).toContain(brief.runUrl)
  })

  it("comments on the open issue with the same title instead of creating", async () => {
    const gh = fakeGh([{ number: 41, title: "Repair brief: shadcn pin drift" }])
    const result = await helper.fileRepairBrief(brief, { gh: gh.run })
    expect(result).toMatchObject({ action: "commented", number: 41 })
    expect(gh.calls.some((args) => args[1] === "create")).toBe(false)
    const comment = gh.calls.find((args) => args[0] === "issue" && args[1] === "comment")
    expect(comment).toContain("41")
    expect(gh.bodies[0]).toContain(brief.runUrl)
    expect(comment!.join(" ")).not.toMatch(/--label|wave:/)
  })

  it("matches the title exactly: a search hit with a longer title does not count", async () => {
    const gh = fakeGh([{ number: 7, title: "Repair brief: shadcn pin drift, again" }])
    const result = await helper.fileRepairBrief(brief, { gh: gh.run })
    expect(result.action).toBe("created")
  })

  it("only searches open issues", async () => {
    const gh = fakeGh([])
    await helper.fileRepairBrief(brief, { gh: gh.run })
    const list = gh.calls.find((args) => args[1] === "list")!
    expect(list).toContain("--state")
    expect(list[list.indexOf("--state") + 1]).toBe("open")
  })

  it("passes -R when a repo is given", async () => {
    const gh = fakeGh([])
    await helper.fileRepairBrief(brief, { gh: gh.run, repo: "deanjstone/frontend" })
    for (const args of gh.calls) {
      expect(args[args.indexOf("-R") + 1]).toBe("deanjstone/frontend")
    }
  })

  it("lets a gh failure through instead of swallowing it", async () => {
    const run = async () => {
      throw new Error("gh: HTTP 502")
    }
    await expect(helper.fileRepairBrief(brief, { gh: run })).rejects.toThrow(/502/)
  })
})

describe("parseArgs", () => {
  it("reads the flags, repeatable --repro and output from a file", () => {
    const parsed = helper.parseArgs(
      ["--key", "k", "--run-url", "u", "--changed", "c", "--failing-check", "f", "--repro", "a", "--repro", "b"],
      { readFile: () => "unused" },
    )
    expect(parsed).toMatchObject({ key: "k", runUrl: "u", changed: "c", failingCheck: "f", repro: ["a", "b"] })
  })

  it("reads --output-file through the injected reader", () => {
    const parsed = helper.parseArgs(["--key", "k", "--output-file", "out.txt"], { readFile: () => "log text" })
    expect(parsed.output).toBe("log text")
  })

  it("refuses a --label or --wave flag so a caller cannot add a wave", () => {
    expect(() => helper.parseArgs(["--key", "k", "--label", "wave:w1"], { readFile: () => "" })).toThrow(/unknown/i)
    expect(() => helper.parseArgs(["--key", "k", "--wave", "w1"], { readFile: () => "" })).toThrow(/unknown/i)
  })

  it("requires a key", () => {
    expect(() => helper.parseArgs(["--run-url", "u"], { readFile: () => "" })).toThrow(/--key/)
  })
})

describe("the issue template", () => {
  const template = read(".github/ISSUE_TEMPLATE/repair-brief.md")

  it("names the title key convention and the labels, with no wave", () => {
    expect(template).toMatch(/^name: Repair brief$/m)
    expect(template).toMatch(/title: "Repair brief: /)
    expect(template).toMatch(/labels: \["mode:afk", "type:bug"\]/)
    expect(template).not.toMatch(/wave:/)
  })
})
