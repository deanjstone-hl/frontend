// @vitest-environment node

import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// The page-transition entries were held back from registry.json until the owner approved the look
// (frontend#199), then listed (frontend#229). They stay in docs/page-transition/registry-entries.json
// as the reference copy. This pins that the staged entries are complete and that registry.json lists
// exactly those.

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8")
type Entry = { name: string; files: { path: string }[]; registryDependencies?: string[]; dependencies?: string[] }
const staged: Entry[] = JSON.parse(read("docs/page-transition/registry-entries.json"))
const listed: Entry[] = JSON.parse(read("registry.json")).items

describe("staged page-transition registry entries", () => {
  it("names the two items", () => {
    expect(staged.map((entry) => entry.name)).toEqual(["page-transition-core", "page-transition"])
  })

  it("points every file at a source that exists", () => {
    for (const entry of staged) {
      for (const file of entry.files) expect(existsSync(fileURLToPath(new URL(`../${file.path}`, import.meta.url)))).toBe(true)
    }
  })

  it("declares a registry dependency for every @/lib import in the ui file", () => {
    const ui = staged.find((entry) => entry.name === "page-transition")
    const source = read("registry/base-nova/ui/page-transition.tsx")
    const imported = [...source.matchAll(/from "@\/lib\/([a-z0-9-]+)"/g)].map((match) => match[1])
    expect(imported.length).toBeGreaterThan(0)
    for (const name of imported) expect(ui?.registryDependencies).toContain(`deanjstone/frontend/${name}`)
  })

  it("pins glimm to the exact version the tests run against", () => {
    const devVersion: string = JSON.parse(read("package.json")).devDependencies.glimm
    expect(devVersion).toMatch(/^\d+\.\d+\.\d+$/)
    const ui = staged.find((entry) => entry.name === "page-transition")
    expect(ui?.dependencies).toEqual([`glimm@${devVersion}`])
  })

  it("is listed in registry.json exactly as staged", () => {
    for (const entry of staged) {
      const inRegistry = listed.find((item) => item.name === entry.name)
      expect(inRegistry, `${entry.name} is not listed in registry.json`).toBeDefined()
      expect(inRegistry).toMatchObject(entry)
    }
  })
})
