// @vitest-environment node

import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// @ui-sdk is in beta and every beta is a "patch" bump that can break (frontend#245, the fit check
// in frontend#244). Both packages are pinned to one exact version, no caret and no tag, in
// package.json and in every registry item that imports them, so a bump is one change here and
// consumers see nothing until they re-pull.

type RegistryItem = { name: string; dependencies?: string[]; files?: { path: string }[] }

const root = new URL("../", import.meta.url)
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, root)), "utf8")
const packageJson: { devDependencies: Record<string, string> } = JSON.parse(read("package.json"))
const registry: { items: RegistryItem[] } = JSON.parse(read("registry.json"))

const SDK_PACKAGES = ["@ui-sdk/core", "@ui-sdk/react"]
const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/

const importsSdk = (item: RegistryItem) =>
  (item.files ?? []).some((file) => /from\s+["']@ui-sdk\//.test(read(file.path)))

const itemsOnSdk = registry.items.filter(importsSdk)

describe("@ui-sdk pin", () => {
  it.each(SDK_PACKAGES)("pins %s to an exact version in devDependencies", (name) => {
    expect(packageJson.devDependencies[name]).toMatch(EXACT_VERSION)
  })

  it("pins core and react to the same version", () => {
    expect(packageJson.devDependencies["@ui-sdk/react"]).toBe(packageJson.devDependencies["@ui-sdk/core"])
  })

  it("has at least one migrated item", () => {
    expect(itemsOnSdk.map((item) => item.name)).toContain("switch")
  })

  it.each(itemsOnSdk.map((item) => [item.name, item] as const))(
    "%s declares both packages at exactly the package.json version",
    (_name, item) => {
      for (const name of SDK_PACKAGES) {
        expect(item.dependencies).toContain(`${name}@${packageJson.devDependencies[name]}`)
      }
    },
  )

  it("lets no registry item declare an @ui-sdk package unpinned or at another version", () => {
    const declared = registry.items.flatMap((item) =>
      (item.dependencies ?? []).filter((dependency) => dependency.startsWith("@ui-sdk/")),
    )
    const expected = SDK_PACKAGES.map((name) => `${name}@${packageJson.devDependencies[name]}`)
    expect(declared.filter((dependency) => !expected.includes(dependency))).toEqual([])
  })

  it("installs the version it pins", () => {
    for (const name of SDK_PACKAGES) {
      const installed = JSON.parse(read(`node_modules/${name}/package.json`)).version
      expect(installed).toBe(packageJson.devDependencies[name])
    }
  })
})

describe("@ui-sdk skill and docs, vendored from the pinned package", () => {
  it("ships the skill and the llms.txt agents read", () => {
    expect(existsSync(fileURLToPath(new URL("vendor/ui-sdk/skill/SKILL.md", root)))).toBe(true)
    expect(existsSync(fileURLToPath(new URL("vendor/ui-sdk/docs/llms.txt", root)))).toBe(true)
  })
})
