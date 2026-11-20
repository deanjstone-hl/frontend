// The tool pins a stamp records (frontend#234). The shadcn pin must equal check.sh's and
// design.yml's (test/stamps.test.ts); Chromium and the other tools are read from what the
// lockfile installed, so a bump moves the stamp without anyone editing a version here.
import { readFileSync } from "node:fs"
import { join } from "node:path"

export const SHADCN_VERSION = "4.19.1"

const readJson = (root, path) => {
  try {
    return JSON.parse(readFileSync(join(root, path), "utf8"))
  } catch (error) {
    throw new Error(`stamp: cannot read ${path} under ${root} (is pnpm install done?): ${error.code ?? error.message}`)
  }
}

export const installedVersion = (root, packageName) =>
  readJson(root, `node_modules/${packageName}/package.json`).version

// The Chromium build playwright-core 1.x downloads, from its own browsers.json.
export const chromiumPin = (root) => {
  const chromium = readJson(root, "node_modules/playwright-core/browsers.json").browsers.find(
    (browser) => browser.name === "chromium",
  )
  if (!chromium) throw new Error("stamp: playwright-core/browsers.json lists no chromium")
  return `${chromium.browserVersion} (revision ${chromium.revision})`
}
