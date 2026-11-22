// Every generated artefact and golden that carries a stamp (frontend#234), and what its
// stamp covers. A generator imports its own spec from here and writes its stamp after
// it wrote the output; `pnpm check` (test/stamps.test.ts) verifies each one.
//
//   name        the stamp is stamps/<name>.json
//   regenerate  the one command that rewrites the output and its stamp
//   writer      the script that writes the stamp; its own bytes are part of the generator hash
//   generator   the files the generator imports, never a whole directory
//   inputs      what the generator reads
//   outputs     the bytes it produced
//   pins        the tools it ran under
//
// A golden's code under test is deliberately not an input: a change that disagrees with a
// golden is a test failure, never a reason to re-stamp.
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { SHADCN_VERSION, chromiumPin, installedVersion } from "./pins.mjs"
import { fileEntries } from "./stamp.mjs"
import { sourceFiles, vendoredFiles } from "./ui-sdk-files.mjs"

const readText = (root, path) => readFileSync(join(root, path), "utf8")

// r/ is `shadcn build` over registry.json and every file it points at.
export const REGISTRY_OUTPUT = {
  name: "registry-output",
  regenerate: "pnpm build:registry",
  writer: "scripts/stamp/build-registry.mjs",
  generator: ["scripts/stamp/build-registry.mjs"],
  inputs: (root) => {
    const { items } = JSON.parse(readText(root, "registry.json"))
    const sources = items.flatMap((item) => (item.files ?? []).map((file) => file.path))
    return ["registry.json", ...new Set(sources)].sort()
  },
  outputs: (root) =>
    fileEntries(
      root,
      readdirSync(join(root, "r"), { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => `r/${entry.name}`)
        .sort(),
    ),
  pins: () => ({ shadcn: SHADCN_VERSION }),
}

const THEME_BEGIN = "/* theme:begin"
const THEME_END = "/* theme:end */"

// Only the generated part of two hand-kept files: the theme region of tokens.css and the
// `theme` and `theme-ds` items of registry.json.
export const THEME = {
  name: "theme",
  regenerate: "pnpm build:theme",
  writer: "scripts/theme/build.mjs",
  generator: ["scripts/theme/build.mjs", "scripts/theme/ds-theme.mjs", "scripts/theme/extract-t3.mjs", "scripts/theme/status.mjs"],
  inputs: () => ["theme/themes.json"],
  outputs: (root) => {
    const css = readText(root, "theme/tokens.css")
    const start = css.indexOf(THEME_BEGIN)
    const end = css.indexOf(THEME_END)
    if (start === -1 || end === -1) throw new Error("stamp: tokens.css has no theme:begin / theme:end markers")
    const { items } = JSON.parse(readText(root, "registry.json"))
    const themeItems = ["theme", "theme-ds"].map((name) => items.find((item) => item.name === name) ?? null)
    return [
      { path: "theme/tokens.css (theme:begin to theme:end)", bytes: Buffer.from(css.slice(start, end + THEME_END.length)) },
      { path: "registry.json (items theme, theme-ds)", bytes: Buffer.from(JSON.stringify(themeItems)) },
    ]
  },
  pins: () => ({}),
}

export const LINKS_MODULE = {
  name: "links-module",
  regenerate: "node scripts/links/generate.mjs",
  writer: "scripts/links/generate.mjs",
  generator: ["scripts/links/generate.mjs", "scripts/links/registry.mjs"],
  inputs: () => ["registry/links/links.json"],
  outputs: (root) => fileEntries(root, ["registry/lib/links.ts"]),
  pins: () => ({}),
}

// A vitest snapshot. The oracle is the test file: its fixtures decide what is rendered. The
// renderer under test is not an input.
export const LINK_PILL_SNAPSHOT = {
  name: "link-pill-snapshot",
  regenerate: "pnpm update:snapshots",
  writer: "scripts/stamp/update-snapshots.mjs",
  generator: ["scripts/stamp/update-snapshots.mjs", "test/link-pill-html.test.ts"],
  inputs: () => [],
  outputs: (root) => fileEntries(root, ["test/__snapshots__/link-pill-html.test.ts.snap"]),
  pins: (root) => ({ vitest: installedVersion(root, "vitest") }),
}

// The aria baselines the geometry gate compares against. The harness decides what is
// rendered; the registry blocks it renders are the code under test.
export const GEOMETRY_ARIA = {
  name: "geometry-aria",
  regenerate: "pnpm gate:geometry --update-aria",
  writer: "scripts/geometry-gate/run.mjs",
  generator: [
    "scripts/geometry-gate/run.mjs",
    "scripts/geometry-gate/checks.mjs",
    "scripts/geometry-gate/session.mjs",
    "scripts/geometry-gate/collect.mjs",
    "scripts/geometry-gate/geometry.mjs",
    "scripts/geometry-gate/harness/index.html",
    "scripts/geometry-gate/harness/index.css",
    "scripts/geometry-gate/harness/main.tsx",
    "scripts/geometry-gate/harness/vite.config.mjs",
  ],
  inputs: () => [],
  outputs: (root) =>
    fileEntries(
      root,
      readdirSync(join(root, "scripts/geometry-gate/aria"))
        .filter((file) => file.endsWith(".yml"))
        .sort()
        .map((file) => `scripts/geometry-gate/aria/${file}`),
    ),
  pins: (root) => ({ "playwright-core": installedVersion(root, "playwright-core"), chromium: chromiumPin(root) }),
}

// The @ui-sdk skill and docs, copied from the pinned packages (frontend#245). The input is the
// installed package's own files, so a changed package without a regenerate fails too.
export const UI_SDK_VENDOR = {
  name: "ui-sdk-vendor",
  regenerate: "pnpm vendor:ui-sdk",
  writer: "scripts/ui-sdk/vendor.mjs",
  generator: ["scripts/ui-sdk/vendor.mjs", "scripts/stamp/ui-sdk-files.mjs"],
  inputs: (root) => sourceFiles(root),
  outputs: (root) => fileEntries(root, vendoredFiles(root)),
  pins: (root) => ({ "@ui-sdk/core": installedVersion(root, "@ui-sdk/core"), "@ui-sdk/react": installedVersion(root, "@ui-sdk/react") }),
}

export const ARTEFACTS = [REGISTRY_OUTPUT, THEME, LINKS_MODULE, LINK_PILL_SNAPSHOT, GEOMETRY_ARIA, UI_SDK_VENDOR]
