// @vitest-environment node

import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// offline-banner and use-online are listed in registry.json (frontend#219): the flag that publishes them. Each
// source file must exist, and the banner must pull in the alert and the hook it is built on, or a consumer's
// install breaks.

const root = fileURLToPath(new URL("..", import.meta.url))
const registry = JSON.parse(readFileSync(`${root}registry.json`, "utf8"))
const find = (name: string) => registry.items.find((entry: { name: string }) => entry.name === name)

describe("use-online registry entry", () => {
  const item = find("use-online")

  it("is listed as one hook item with no dependency of its own", () => {
    expect(item?.type).toBe("registry:hook")
    expect(item.files).toHaveLength(1)
    expect(item.registryDependencies ?? []).toEqual([])
    expect(item.dependencies ?? []).toEqual([])
  })

  it("points at a source file that exists and exports the hook", () => {
    expect(existsSync(`${root}${item.files[0].path}`)).toBe(true)
    expect(readFileSync(`${root}${item.files[0].path}`, "utf8")).toContain("export function useOnline")
  })
})

describe("offline-banner registry entry", () => {
  const item = find("offline-banner")

  it("is listed as a ui item", () => {
    expect(item?.type).toBe("registry:ui")
  })

  it("points at a source file that exists", () => {
    for (const file of item.files) expect(existsSync(`${root}${file.path}`)).toBe(true)
  })

  it("pulls in the alert, the hook and the icon's package", () => {
    expect(item.registryDependencies).toContain("deanjstone/frontend/alert")
    expect(item.registryDependencies).toContain("deanjstone/frontend/use-online")
    expect(item.dependencies).toContain("lucide-react")
  })

  it("exports the banner", () => {
    const source = readFileSync(`${root}${item.files[0].path}`, "utf8")
    expect(source).toMatch(/export \{[^}]*\bOfflineBanner\b[^}]*\}/)
  })
})
