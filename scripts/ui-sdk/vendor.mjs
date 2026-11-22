// Copies the @ui-sdk skill and docs from the pinned packages into vendor/ui-sdk/, then stamps
// them (frontend#245, frontend#234).
//   pnpm vendor:ui-sdk
// Run it after a bump of the @ui-sdk pin in package.json and `pnpm install`.
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { UI_SDK_VENDOR } from "../stamp/artefacts.mjs"
import { installedVersion } from "../stamp/pins.mjs"
import { repoRoot, writeStamp } from "../stamp/stamp.mjs"
import { NOTE_PATH, VENDORED, note } from "../stamp/ui-sdk-files.mjs"

rmSync(join(repoRoot, "vendor/ui-sdk"), { recursive: true, force: true })
for (const [source, destination] of VENDORED) {
  mkdirSync(dirname(join(repoRoot, destination)), { recursive: true })
  cpSync(join(repoRoot, source), join(repoRoot, destination), { recursive: true })
}
writeFileSync(
  join(repoRoot, NOTE_PATH),
  note({ core: installedVersion(repoRoot, "@ui-sdk/core"), react: installedVersion(repoRoot, "@ui-sdk/react") }),
)
writeStamp(UI_SDK_VENDOR)
console.log("vendor-ui-sdk: wrote vendor/ui-sdk/ and stamps/ui-sdk-vendor.json")
