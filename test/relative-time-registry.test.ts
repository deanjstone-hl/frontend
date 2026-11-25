// @vitest-environment node

import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// relative-time is listed in registry.json (frontend#217): the flag that publishes it. Its source file must
// exist, and it must be one lib item that needs nothing beyond the consumer's React.

const root = fileURLToPath(new URL("..", import.meta.url))
const registry = JSON.parse(readFileSync(`${root}registry.json`, "utf8"))
const item = registry.items.find((entry: { name: string }) => entry.name === "relative-time")

describe("relative-time registry entry", () => {
  it("is listed as one lib item", () => {
    expect(item?.type).toBe("registry:lib")
    expect(item.files).toHaveLength(1)
    expect(item.files[0].type).toBe("registry:lib")
  })

  it("points at a source file that exists", () => {
    expect(existsSync(`${root}${item.files[0].path}`)).toBe(true)
  })

  it("has no registry or package dependency of its own", () => {
    expect(item.registryDependencies ?? []).toEqual([])
    expect(item.dependencies ?? []).toEqual([])
  })

  it("exports the formatter and the hook", () => {
    const source = readFileSync(`${root}${item.files[0].path}`, "utf8")
    expect(source).toContain("export function formatRelativeTime")
    expect(source).toContain("export function useNow")
  })
})
