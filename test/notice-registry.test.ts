// @vitest-environment node

import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// notice is listed in registry.json (frontend#218): the flag that publishes it. The source file it
// points at must exist, and it must pull in the alert it is built on, or a consumer's install breaks.

const root = fileURLToPath(new URL("..", import.meta.url))
const registry = JSON.parse(readFileSync(`${root}registry.json`, "utf8"))
const item = registry.items.find((entry: { name: string }) => entry.name === "notice")

describe("notice registry entry", () => {
  it("is listed as a ui item", () => {
    expect(item?.type).toBe("registry:ui")
  })

  it("points at a source file that exists", () => {
    for (const file of item.files) expect(existsSync(`${root}${file.path}`)).toBe(true)
  })

  it("pulls in the alert it is built on, and the spinner glyph's package", () => {
    expect(item.registryDependencies).toContain("deanjstone/frontend/alert")
    expect(item.dependencies).toContain("lucide-react")
  })

  it("exports the loading and error pair", () => {
    const source = readFileSync(`${root}${item.files[0].path}`, "utf8")
    expect(source).toMatch(/export \{[^}]*\bLoadingNotice\b[^}]*\}/)
    expect(source).toMatch(/export \{[^}]*\bErrorNotice\b[^}]*\}/)
  })
})
