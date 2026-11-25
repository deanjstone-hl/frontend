// @vitest-environment node

import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { VIEWS } from "../scripts/geometry-gate/session.mjs"

// stat-tile is listed in registry.json (frontend#216): the flag that publishes it. The source file it
// points at must exist, and what it imports must be declared, or a consumer's install breaks. The gate
// must also render it, so a change to the tile moves a baseline.

const root = fileURLToPath(new URL("..", import.meta.url))
const registry = JSON.parse(readFileSync(`${root}registry.json`, "utf8"))
const item = registry.items.find((entry: { name: string }) => entry.name === "stat-tile")

describe("stat-tile registry entry", () => {
  it("is listed as a ui item", () => {
    expect(item?.type).toBe("registry:ui")
  })

  it("points at a source file that exists", () => {
    for (const file of item.files) expect(existsSync(`${root}${file.path}`)).toBe(true)
  })

  it("declares every package its source imports", () => {
    const source = readFileSync(`${root}${item.files[0].path}`, "utf8")
    const imported = [...source.matchAll(/from "([^"./@][^"]*|@[^"/]+\/[^"]+)"/g)].map((match) => match[1])
    const declared = (item.dependencies as string[]).map((dependency) => dependency.replace(/@[^@/]+$/, "").replace(/^(@[^/]+\/[^/@]+).*$/, "$1"))
    for (const name of imported.filter((entry) => entry !== "react")) {
      expect(declared.some((dependency) => name === dependency || name.startsWith(`${dependency}/`))).toBe(true)
    }
  })

  it("is drawn by a geometry-gate view and has an aria baseline", () => {
    expect(VIEWS.some((view: { name: string; query: string }) => view.name === "stat-tile" && view.query === "v=stat-tile")).toBe(true)
    expect(existsSync(`${root}scripts/geometry-gate/aria/stat-tile.yml`)).toBe(true)
  })

  it("is drawn in the gate harness under the same view name", () => {
    const harness = readFileSync(`${root}scripts/geometry-gate/harness/main.tsx`, "utf8")
    expect(harness).toContain('view === "stat-tile"')
  })
})
