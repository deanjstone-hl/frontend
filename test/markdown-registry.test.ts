// @vitest-environment node

import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// markdown is listed in registry.json (frontend#221): the flag that publishes it. The source file it points at
// must exist, and it must declare what it imports, or a consumer's install breaks. The three parsing packages
// are pinned to a minor so a re-run `shadcn add` cannot pull a breaking release, and the item pulls in
// link-pill-core because the pending placeholder and the two pill schemes come from there.

const root = fileURLToPath(new URL("..", import.meta.url))
const registry = JSON.parse(readFileSync(`${root}registry.json`, "utf8"))
const packageJson = JSON.parse(readFileSync(`${root}package.json`, "utf8"))
const item = registry.items.find((entry: { name: string }) => entry.name === "markdown")
const source = readFileSync(`${root}registry/base-nova/ui/markdown.tsx`, "utf8")

describe("markdown registry entry", () => {
  it("is listed as a ui item", () => {
    expect(item?.type).toBe("registry:ui")
  })

  it("points at a source file that exists", () => {
    for (const file of item.files) expect(existsSync(`${root}${file.path}`)).toBe(true)
  })

  it("declares the three packages and the class helper it imports, each pinned to a minor", () => {
    expect(item.dependencies).toEqual(expect.arrayContaining(["react-markdown@^10.1.0", "remark-gfm@^4.0.1", "remend@^1.5.1", "cn@^0.5.0"]))
    for (const name of ["react-markdown", "remark-gfm", "remend", "cn"]) expect(source).toContain(`from "${name}"`)
  })

  it("pulls in link-pill-core by its full address, not LinkPill itself", () => {
    expect(item.registryDependencies).toEqual(["deanjstone/frontend/link-pill-core"])
    expect(source).toContain('from "@/lib/link-pill-core"')
    expect(source).not.toContain("link-pill\"")
  })

  it("keeps the packages the tests resolve at the version the entry names", () => {
    for (const name of ["react-markdown", "remark-gfm", "remend"]) {
      const declared = item.dependencies.find((entry: string) => entry.startsWith(`${name}@`)).split("@")[1]
      expect(packageJson.devDependencies[name]).toBe(declared)
    }
  })

  it("never turns Markdown into an HTML string: no dangerouslySetInnerHTML, no rehype-raw", () => {
    expect(source).not.toContain("dangerouslySetInnerHTML")
    expect(source).not.toMatch(/from "rehype|allowDangerousHtml/)
    expect(source).toContain("skipHtml")
  })

  it("exports the component and the splitter", () => {
    expect(source).toMatch(/export \{[^}]*\bMarkdown\b[^}]*\}/)
    expect(source).toMatch(/export \{[^}]*\bsplitMarkdownBlocks\b[^}]*\}/)
  })
})
