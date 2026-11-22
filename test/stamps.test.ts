// @vitest-environment node

import { execFileSync, spawnSync } from "node:child_process"
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
// @ts-expect-error - plain ESM script
import { ARTEFACTS } from "../scripts/stamp/artefacts.mjs"
// @ts-expect-error - plain ESM script
import { SHADCN_VERSION } from "../scripts/stamp/pins.mjs"
// @ts-expect-error - plain ESM script
import { verifyStamp } from "../scripts/stamp/stamp.mjs"

// frontend#234: `pnpm check` fails when a generated artefact or a golden has no stamp, its bytes
// no longer match the stamp, or the generator or a pin moved without a regenerate. This file
// holds the repo's real artefacts; test/stamp-core.test.ts holds the mechanism.

const root = fileURLToPath(new URL("../", import.meta.url))
const read = (path: string, at = root) => readFileSync(join(at, path), "utf8")

type Artefact = { name: string; regenerate: string; writer: string; generator: string[] }
const artefacts = ARTEFACTS as Artefact[]

describe("every generated artefact and golden is stamped", () => {
  it("covers r/, the theme output, the links module, the link-pill snapshot, the aria baselines and the vendored @ui-sdk files", () => {
    expect(artefacts.map((artefact) => artefact.name).sort()).toEqual([
      "geometry-aria",
      "link-pill-snapshot",
      "links-module",
      "registry-output",
      "theme",
      "ui-sdk-vendor",
    ])
  })

  for (const artefact of artefacts) {
    it(`${artefact.name}: the stamp is current (run: ${artefact.regenerate})`, () => {
      expect(verifyStamp(artefact, root)).toEqual([])
    })

    it(`${artefact.name}: the generator's hash covers the script that writes the stamp`, () => {
      expect(artefact.generator).toContain(artefact.writer)
    })

    it(`${artefact.name}: the regenerate command is in the README`, () => {
      expect(read("README.md")).toContain(artefact.regenerate)
    })
  }
})

describe("a stamp is written only by a generator", () => {
  const sourceFiles = (directory: string): string[] =>
    readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path)
      return /\.(mjs|ts|tsx|js)$/.test(entry.name) ? [path] : []
    })

  it("imports writeStamp only in the generator scripts", () => {
    const callers = [...sourceFiles("scripts"), ...sourceFiles("registry"), ...sourceFiles("tools")]
      .filter((path) => read(path).includes("writeStamp"))
      .sort()
    const writers = artefacts.map((artefact) => artefact.writer)
    expect(callers).toEqual([...new Set([...writers, "scripts/stamp/stamp.mjs"])].sort())
  })

  it("has no command that stamps whatever is on disk", () => {
    const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>
    expect(Object.values(scripts).filter((command) => /stamp\.mjs/.test(command))).toEqual([])
    expect(read("scripts/stamp/stamp.mjs")).not.toContain("process.argv")
  })
})

describe("the generators write their stamp", () => {
  let tree: string

  beforeEach(() => {
    tree = mkdtempSync(join(tmpdir(), "stamps-tree-"))
  })
  afterEach(() => rmSync(tree, { recursive: true, force: true }))

  const copy = (...paths: string[]) => {
    for (const path of paths) {
      mkdirSync(dirname(join(tree, path)), { recursive: true })
      cpSync(join(root, path), join(tree, path), { recursive: true })
    }
  }
  const spec = (name: string) => artefacts.find((artefact) => artefact.name === name) as Artefact
  const stubBin = () => mkdtempSync(join(tmpdir(), "stamps-bin-"))
  const stub = (bin: string, name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`)
    chmodSync(join(bin, name), 0o755)
  }

  it("scripts/theme/build.mjs stamps theme/tokens.css and the theme items of registry.json", () => {
    copy("scripts/theme", "scripts/stamp", "theme", "registry.json", "package.json")
    execFileSync("node", ["scripts/theme/build.mjs"], { cwd: tree, stdio: "pipe" })
    expect(existsSync(join(tree, "stamps/theme.json"))).toBe(true)
    expect(verifyStamp(spec("theme"), tree)).toEqual([])
  })

  it("scripts/links/generate.mjs stamps registry/lib/links.ts", () => {
    copy("scripts/links", "scripts/stamp", "registry/links/links.json", "registry/lib/links.ts", "package.json")
    execFileSync("node", ["scripts/links/generate.mjs"], { cwd: tree, stdio: "pipe" })
    expect(verifyStamp(spec("links-module"), tree)).toEqual([])
  })

  it("scripts/stamp/build-registry.mjs runs the pinned shadcn build, then stamps r/", () => {
    copy("scripts/stamp", "registry.json", "package.json")
    for (const path of JSON.parse(read("registry.json")).items.flatMap((item: { files?: { path: string }[] }) =>
      (item.files ?? []).map((file) => file.path),
    )) {
      mkdirSync(dirname(join(tree, path)), { recursive: true })
      writeFileSync(join(tree, path), `// ${path}\n`)
    }
    const bin = stubBin()
    stub(bin, "npx", `echo "$*" >> "${tree}/npx-calls.txt"\nmkdir -p r && echo '{"built":true}' > r/item.json`)
    try {
      const result = spawnSync("node", ["scripts/stamp/build-registry.mjs"], {
        cwd: tree,
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      })
      expect(result.status, result.stderr).toBe(0)
      expect(read("npx-calls.txt", tree).trim()).toBe(`--yes shadcn@${SHADCN_VERSION} build --output ./r`)
      expect(verifyStamp(spec("registry-output"), tree)).toEqual([])
    } finally {
      rmSync(bin, { recursive: true, force: true })
    }
  })

  it("build-registry does not stamp when the build fails", () => {
    copy("scripts/stamp", "registry.json", "package.json")
    const bin = stubBin()
    stub(bin, "npx", "exit 1")
    try {
      const result = spawnSync("node", ["scripts/stamp/build-registry.mjs"], {
        cwd: tree,
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      })
      expect(result.status).not.toBe(0)
      expect(existsSync(join(tree, "stamps/registry-output.json"))).toBe(false)
    } finally {
      rmSync(bin, { recursive: true, force: true })
    }
  })

  it("scripts/stamp/update-snapshots.mjs regenerates the link-pill snapshot, then stamps it", () => {
    copy(
      "scripts/stamp",
      "test/link-pill-html.test.ts",
      "test/__snapshots__/link-pill-html.test.ts.snap",
      "package.json",
    )
    symlinkSync(join(root, "node_modules"), join(tree, "node_modules"))
    const bin = stubBin()
    stub(bin, "pnpm", `echo "$*" >> "${tree}/pnpm-calls.txt"`)
    try {
      const result = spawnSync("node", ["scripts/stamp/update-snapshots.mjs"], {
        cwd: tree,
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      })
      expect(result.status, result.stderr).toBe(0)
      expect(read("pnpm-calls.txt", tree).trim()).toBe("exec vitest run test/link-pill-html.test.ts -u")
      expect(verifyStamp(spec("link-pill-snapshot"), tree)).toEqual([])
    } finally {
      rmSync(bin, { recursive: true, force: true })
    }
  })

  it("the geometry gate stamps the aria baselines only on a full --update-aria run", () => {
    const run = read("scripts/geometry-gate/run.mjs")
    expect(run).toMatch(/if \(args\.updateAria && !args\.url && args\.view\.length === 0 [^\n]*\) stampAria\(browser\)/)
    expect(run).toContain("writeStamp(GEOMETRY_ARIA)")
  })
})

describe("pins", () => {
  it("scripts/stamp/pins.mjs carries the shadcn version check.sh and design.yml run", () => {
    expect(read("scripts/check.sh")).toMatch(new RegExp(`^SHADCN_VERSION=${SHADCN_VERSION.replace(/\./g, "\\.")}$`, "m"))
    expect(read(".github/workflows/design.yml")).toContain(`shadcn@${SHADCN_VERSION} build --output ./r`)
  })

  it("package.json builds r/ through the stamping wrapper, never a bare shadcn build", () => {
    const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>
    expect(scripts["build:registry"]).toBe("node scripts/stamp/build-registry.mjs")
    expect(scripts["build:theme"]).toBe("node scripts/theme/build.mjs && node scripts/stamp/build-registry.mjs")
    expect(scripts["update:snapshots"]).toBe("node scripts/stamp/update-snapshots.mjs")
    expect(Object.values(scripts).filter((command) => command.includes("shadcn"))).toEqual([])
  })

  it("holds a stamp file for every known artefact and no other", () => {
    const stamped = readdirSync(join(root, "stamps")).map((file) => file.replace(/\.json$/, "")).sort()
    expect(stamped).toEqual(artefacts.map((artefact) => artefact.name).sort())
  })
})
