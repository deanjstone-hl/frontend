// @vitest-environment node

import { execFile, execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  fingerprint,
  findStale,
  formatReport,
  parsePin,
  uiFilesOf,
} from "../registry/design-check/registry-stale.mjs"
import { fingerprint as auditFingerprint } from "../docs/audits/primitives-usage/measure.mjs"

// design-check reports registry copies older than the consumer's pin (frontend#211):
// moving an app's pin does not move the code `shadcn add` already copied into it.

const run = promisify(execFile)
const root = fileURLToPath(new URL("../", import.meta.url))
const scriptPath = join(root, "registry/design-check/registry-stale.mjs")

type Item = { name: string; files: { path: string; content: string }[] }
type Release = { items: Item[] }

const item = (name: string, content: string): Item => ({
  name,
  files: [{ path: `registry/base-nova/ui/${name}.tsx`, content }],
})

// What each release shipped, oldest first.
const releases: Record<string, Release> = {
  "v3.0.0": { items: [item("card", "export const Card = 'one'\n"), item("badge", "export const Badge = 'one'\n")] },
  "v3.1.0": { items: [item("card", "export const Card = 'two'\n"), item("badge", "export const Badge = 'one'\n")] },
  "v3.2.0": { items: [item("card", "export const Card = 'two'\n"), item("badge", "export const Badge = 'two'\n")] },
  "v3.3.0": { items: [item("card", "export const Card = 'three'\n"), item("badge", "export const Badge = 'two'\n")] },
  "v3.4.0": { items: [item("card", "export const Card = 'four'\n"), item("badge", "export const Badge = 'two'\n")] },
}
const tags = Object.keys(releases)

const loadItem = async (tag: string, name: string) => releases[tag]?.items.find((candidate) => candidate.name === name) ?? null
const loadIndex = async (tag: string) => ({
  items: releases[tag].items.map((candidate) => ({
    name: candidate.name,
    files: candidate.files.map((file) => ({ path: file.path })),
  })),
})

describe("fingerprint", () => {
  // The audit's measurement and the shipped check read a copy the same way.
  it("is the audit's fingerprint", () => {
    const source = `"use client"\n\nimport { cn } from "@/lib/utils"\nexport const a = cn("cn-menu-target relative font-heading text-base", className)\n`
    expect(fingerprint(source)).toBe(auditFingerprint(source))
    expect(fingerprint(source, { stripLeadingComment: true })).toBe(auditFingerprint(source, { stripLeadingComment: true }))
  })
})

describe("parsePin", () => {
  const url = "https://raw.githubusercontent.com/deanjstone/frontend/v3.18.0/r/{name}.json"

  it("reads the release from an @frontend alias, string or object form", () => {
    expect(parsePin({ registries: { "@frontend": { url } } })).toMatchObject({ tag: "v3.18.0", template: url })
    expect(parsePin({ registries: { "@frontend": url } })).toMatchObject({ tag: "v3.18.0" })
  })

  it("reads the old @design-system alias too", () => {
    const old = url.replace("frontend", "design-system")
    expect(parsePin({ registries: { "@design-system": { url: old } } })).toMatchObject({ tag: "v3.18.0" })
  })

  it("derives the git remote from a raw.githubusercontent.com URL", () => {
    expect(parsePin({ registries: { "@frontend": { url } } })?.remote).toBe("https://github.com/deanjstone/frontend.git")
  })

  it("has no pin when there is no alias, or the URL is a branch", () => {
    expect(parsePin({})).toBeNull()
    expect(parsePin({ registries: { "@other": { url } } })).toBeNull()
    expect(parsePin({ registries: { "@frontend": { url: url.replace("v3.18.0", "main") } } })).toBeNull()
  })
})

describe("uiFilesOf", () => {
  const listed = [
    "apps/web/components.json",
    "apps/web/src/components/ui/card.tsx",
    "apps/web/src/components/ui/nested/skip.tsx",
    "apps/web/src/components/card-list.tsx",
    "apps/web/src/pages/home.tsx",
    "apps/other/src/components/ui/badge.tsx",
  ]

  it("keeps the files under the app's ui and components directories", () => {
    const config = { aliases: { ui: "@/components/ui", components: "@/components" } }
    expect(uiFilesOf("apps/web/components.json", config, listed)).toEqual([
      "apps/web/src/components/card-list.tsx",
      "apps/web/src/components/ui/card.tsx",
    ])
  })

  it("derives the ui directory from the components alias when ui is unset", () => {
    expect(uiFilesOf("apps/web/components.json", { aliases: { components: "~/components" } }, listed)).toContain(
      "apps/web/src/components/ui/card.tsx",
    )
  })

  it("works for a components.json at the repo root, with no src/ prefix", () => {
    expect(
      uiFilesOf("components.json", { aliases: { ui: "@/components/ui" } }, ["components/ui/card.tsx", "src/x.tsx"]),
    ).toEqual(["components/ui/card.tsx"])
  })

  it("cannot map a workspace-package alias", () => {
    expect(uiFilesOf("apps/web/components.json", { aliases: { ui: "@acme/ui/components" } }, listed)).toEqual([])
  })
})

describe("findStale", () => {
  const find = (files: { path: string; text: string }[], pin = "v3.4.0") =>
    findStale({ files, pin, tags, loadIndex, loadItem })

  it("passes a copy identical to the pin", async () => {
    const result = await find([{ path: "ui/card.tsx", text: "export const Card = 'four'\n" }])
    expect(result.stale).toEqual([])
    expect(result.identical).toEqual(["ui/card.tsx"])
  })

  it("reads a copy through the transforms the CLI applies", async () => {
    const result = await find([
      { path: "ui/card.tsx", text: `"use client"\n\nexport   const Card   =   'four'  \n` },
    ])
    expect(result.identical).toEqual(["ui/card.tsx"])
  })

  it("names the release range a stale copy matches", async () => {
    const result = await find([
      { path: "ui/card.tsx", text: "export const Card = 'two'\n" },
      { path: "ui/badge.tsx", text: "export const Badge = 'one'\n" },
    ])
    expect(result.stale).toEqual([
      { path: "ui/card.tsx", first: "v3.1.0", last: "v3.2.0", pin: "v3.4.0" },
      { path: "ui/badge.tsx", first: "v3.0.0", last: "v3.1.0", pin: "v3.4.0" },
    ])
  })

  it("does not report a copy that matches no release (a local edit)", async () => {
    const result = await find([{ path: "ui/card.tsx", text: "export const Card = 'mine'\n" }])
    expect(result.stale).toEqual([])
    expect(result.identical).toEqual([])
  })

  it("ignores a file that is not in the registry at the pin", async () => {
    const result = await find([{ path: "ui/own.tsx", text: "export const Own = 1\n" }])
    expect(result).toMatchObject({ stale: [], identical: [] })
  })

  it("only looks at releases older than the pin", async () => {
    // 'four' is v3.4.0; checked against pin v3.3.0 it is newer than the pin, not stale.
    const result = await find([{ path: "ui/card.tsx", text: "export const Card = 'four'\n" }], "v3.3.0")
    expect(result.stale).toEqual([])
  })

  it("counts a release it could not read, and does not fail", async () => {
    const result = await findStale({
      files: [{ path: "ui/card.tsx", text: "export const Card = 'one'\n" }],
      pin: "v3.4.0",
      tags,
      loadIndex,
      loadItem: async (tag: string, name: string) => {
        if (tag === "v3.1.0") throw new Error("offline")
        return loadItem(tag, name)
      },
    })
    expect(result.stale).toEqual([{ path: "ui/card.tsx", first: "v3.0.0", last: "v3.0.0", pin: "v3.4.0" }])
    expect(result.unreadable).toBe(1)
  })
})

describe("formatReport", () => {
  it("prints, per stale file, the release it matches and the pin", () => {
    const text = formatReport({
      app: "apps/web",
      pin: "v3.4.0",
      checked: 3,
      identical: ["a"],
      stale: [
        { path: "apps/web/src/components/ui/card.tsx", first: "v3.1.0", last: "v3.2.0", pin: "v3.4.0" },
        { path: "apps/web/src/components/ui/badge.tsx", first: "v3.0.0", last: "v3.0.0", pin: "v3.4.0" },
      ],
      unreadable: 0,
    })
    expect(text).toContain("`apps/web/src/components/ui/card.tsx` | v3.1.0 to v3.2.0 | v3.4.0")
    expect(text).toContain("`apps/web/src/components/ui/badge.tsx` | v3.0.0 | v3.4.0")
    expect(text).toContain("2 of 3")
  })

  it("says so when nothing is stale", () => {
    expect(formatReport({ app: ".", pin: "v3.4.0", checked: 2, identical: ["a", "b"], stale: [], unreadable: 0 })).toContain(
      "No copy is older than v3.4.0",
    )
  })

  it("flags an incomplete scan", () => {
    expect(formatReport({ app: ".", pin: "v3.4.0", checked: 1, identical: [], stale: [], unreadable: 3 })).toContain(
      "3 release file(s) could not be read",
    )
  })
})

describe("registry-stale.mjs", () => {
  let work: string
  let consumer: string
  let remote: string
  let server: Server
  let port: number

  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim()
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(consumer, path)), { recursive: true })
    writeFileSync(join(consumer, path), content)
  }
  const commitConsumer = () => {
    git(consumer, "add", "-A")
    git(consumer, "commit", "-q", "-m", "x")
  }

  beforeEach(async () => {
    work = mkdtempSync(join(tmpdir(), "registry-stale-"))
    // A bare repository standing in for github.com/<owner>/frontend, one tag per release.
    const source = join(work, "source")
    remote = join(work, "remote.git")
    mkdirSync(source)
    git(source, "init", "-q", "-b", "main")
    git(source, "config", "user.name", "t")
    git(source, "config", "user.email", "t@t")
    for (const tag of tags) {
      git(source, "commit", "-q", "--allow-empty", "-m", tag)
      git(source, "tag", tag)
    }
    git(work, "clone", "-q", "--bare", source, remote)

    server = createServer((request, response) => {
      const match = /^\/(v[\d.]+)\/r\/([\w-]+)\.json$/.exec(request.url ?? "")
      const release = match ? releases[match[1]] : undefined
      if (!match || !release) return void response.writeHead(404).end()
      if (match[2] === "registry") {
        response.end(JSON.stringify({ items: release.items.map((entry) => ({ name: entry.name, files: entry.files.map((file) => ({ path: file.path })) })) }))
        return
      }
      const found = release.items.find((entry) => entry.name === match[2])
      if (!found) return void response.writeHead(404).end()
      response.end(JSON.stringify({ name: found.name, files: found.files }))
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    port = (server.address() as AddressInfo).port

    consumer = join(work, "consumer")
    mkdirSync(consumer)
    git(consumer, "init", "-q", "-b", "main")
    git(consumer, "config", "user.name", "t")
    git(consumer, "config", "user.email", "t@t")
    write(
      "apps/web/components.json",
      JSON.stringify({
        aliases: { ui: "@/components/ui", components: "@/components" },
        registries: { "@frontend": { url: `http://127.0.0.1:${port}/v3.4.0/r/{name}.json` } },
      }),
    )
    write("apps/web/src/components/ui/card.tsx", "export const Card = 'two'\n")
    write("apps/web/src/components/ui/badge.tsx", "export const Badge = 'two'\n")
    commitConsumer()
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
    rmSync(work, { recursive: true, force: true })
  })

  const check = async (args: string[] = [], env: Record<string, string> = {}) => {
    try {
      const { stdout } = await run("node", [scriptPath, "--remote", remote, ...args], {
        cwd: consumer,
        env: { ...process.env, ...env },
      })
      return { status: 0, stdout }
    } catch (error) {
      const failure = error as { code: number; stdout: string; stderr: string }
      return { status: failure.code, stdout: failure.stdout, stderr: failure.stderr }
    }
  }

  it("lists each stale copy with the release it matches and the pin, and exits 2", async () => {
    const result = await check()
    expect(result.status).toBe(2)
    expect(result.stdout).toContain("pin v3.4.0")
    expect(result.stdout).toContain("`apps/web/src/components/ui/card.tsx` | v3.1.0 to v3.2.0 | v3.4.0")
    // badge 'two' is v3.2.0 to v3.4.0, which is the pin: not stale.
    expect(result.stdout).not.toContain("badge.tsx")
  })

  it("exits 0 when every copy is at the pin", async () => {
    write("apps/web/src/components/ui/card.tsx", "export const Card = 'four'\n")
    commitConsumer()
    const result = await check()
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("No copy is older than v3.4.0")
  })

  it("writes the report to the job summary when one is set", async () => {
    const summary = join(work, "summary.md")
    await check([], { GITHUB_STEP_SUMMARY: summary })
    expect(readFileSync(summary, "utf8")).toContain("card.tsx")
  })

  it("reads each components.json with its own pin", async () => {
    write(
      "apps/other/components.json",
      JSON.stringify({
        aliases: { ui: "@/components/ui" },
        registries: { "@design-system": { url: `http://127.0.0.1:${port}/v3.2.0/r/{name}.json` } },
      }),
    )
    write("apps/other/src/components/ui/card.tsx", "export const Card = 'one'\n")
    commitConsumer()
    const result = await check()
    expect(result.stdout).toContain("`apps/other/src/components/ui/card.tsx` | v3.0.0 | v3.2.0")
    expect(result.stdout).toContain("`apps/web/src/components/ui/card.tsx` | v3.1.0 to v3.2.0 | v3.4.0")
  })

  it("lets --pin set the release for a components.json that has none", async () => {
    write("apps/web/components.json", JSON.stringify({ aliases: { ui: "@/components/ui" } }))
    commitConsumer()
    expect((await check()).stdout).toContain("no pin")
    const result = await check(["--pin", "v3.4.0", "--registry-url", `http://127.0.0.1:${port}/v3.4.0/r/{name}.json`])
    expect(result.stdout).toContain("card.tsx")
  })

  it("exits 1 when the pinned registry cannot be read", async () => {
    write(
      "apps/web/components.json",
      JSON.stringify({
        aliases: { ui: "@/components/ui" },
        registries: { "@frontend": { url: `http://127.0.0.1:${port}/v9.9.9/r/{name}.json` } },
      }),
    )
    commitConsumer()
    const result = await check()
    expect(result.status).toBe(1)
    expect(result.stdout + (result.stderr ?? "")).toContain("could not read")
  })
})
