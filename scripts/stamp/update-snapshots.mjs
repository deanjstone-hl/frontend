// Rewrites the link-pill snapshot with vitest -u, then stamps it (frontend#234).
//   pnpm update:snapshots
// Only for a change to the oracle itself (the test's fixtures or the vitest pin). A code change
// that disagrees with the snapshot is a test failure: fix the code, never run this.
import { spawnSync } from "node:child_process"

import { LINK_PILL_SNAPSHOT } from "./artefacts.mjs"
import { repoRoot, writeStamp } from "./stamp.mjs"

const update = spawnSync("pnpm", ["exec", "vitest", "run", "test/link-pill-html.test.ts", "-u"], {
  cwd: repoRoot,
  stdio: "inherit",
})
if (update.status !== 0) {
  console.error(`update-snapshots: vitest failed (${update.status ?? update.signal}); the snapshot is not stamped`)
  process.exit(update.status ?? 1)
}
writeStamp(LINK_PILL_SNAPSHOT)
console.log("update-snapshots: wrote the link-pill snapshot and stamps/link-pill-snapshot.json")
