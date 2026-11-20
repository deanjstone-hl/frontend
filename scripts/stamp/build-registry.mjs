// Regenerates r/ with the pinned shadcn build, then stamps it (frontend#234).
//   pnpm build:registry
// Run it after any change to registry.json or a source file registry.json points at. A bare
// `npx shadcn build` rewrites r/ but not its stamp, so `pnpm check` fails until this runs.
import { spawnSync } from "node:child_process"

import { REGISTRY_OUTPUT } from "./artefacts.mjs"
import { SHADCN_VERSION } from "./pins.mjs"
import { repoRoot, writeStamp } from "./stamp.mjs"

const build = spawnSync("npx", ["--yes", `shadcn@${SHADCN_VERSION}`, "build", "--output", "./r"], {
  cwd: repoRoot,
  stdio: "inherit",
})
if (build.status !== 0) {
  console.error(`build-registry: shadcn build failed (${build.status ?? build.signal}); r/ is not stamped`)
  process.exit(build.status ?? 1)
}
writeStamp(REGISTRY_OUTPUT)
console.log("build-registry: wrote r/ and stamps/registry-output.json")
