// @vitest-environment node

import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { VIEWS } from "../scripts/geometry-gate/session.mjs"

// copy-button is listed in registry.json (frontend#220): the flag that publishes it. The source file it points
// at must exist, it must pull in the button it is built on and declare what it imports, or a consumer's install
// breaks. The gate must also draw it, so a change to it moves a baseline and the 44px floor is measured.

const root = fileURLToPath(new URL("..", import.meta.url))
const registry = JSON.parse(readFileSync(`${root}registry.json`, "utf8"))
const item = registry.items.find((entry: { name: string }) => entry.name === "copy-button")

describe("copy-button registry entry", () => {
  it("is listed as a ui item", () => {
    expect(item?.type).toBe("registry:ui")
  })

  it("points at a source file that exists", () => {
    for (const file of item.files) expect(existsSync(`${root}${file.path}`)).toBe(true)
  })

  it("pulls in the button it is built on, and the icon's package", () => {
    expect(item.registryDependencies).toContain("deanjstone/frontend/button")
    expect(item.dependencies).toContain("lucide-react")
  })

  it("exports the button", () => {
    const source = readFileSync(`${root}${item.files[0].path}`, "utf8")
    expect(source).toMatch(/export \{[^}]*\bCopyButton\b[^}]*\}/)
  })

  it("is drawn by a geometry-gate view and has an aria baseline", () => {
    expect(VIEWS.some((view: { name: string; query: string }) => view.name === "copy-button" && view.query === "v=copy-button")).toBe(true)
    expect(existsSync(`${root}scripts/geometry-gate/aria/copy-button.yml`)).toBe(true)
  })

  it("is drawn in the gate harness under the same view name", () => {
    const harness = readFileSync(`${root}scripts/geometry-gate/harness/main.tsx`, "utf8")
    expect(harness).toContain('view === "copy-button"')
  })
})
