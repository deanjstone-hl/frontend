// @vitest-environment node
import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// Host-wide heavy lock (argus-config#1506): two overlapping full checks made systemd-oomd kill
// agent scopes, so the gate (scripts/check.sh) takes the lock itself, from a copy of
// argus-config's scripts/heavy-lock.sh.

const root = realpathSync(fileURLToPath(new URL("..", import.meta.url)))
const gate = join(root, "scripts/check.sh")
const lockDir = dirname(gate)
const read = (path: string) => readFileSync(path, "utf8")

describe("heavy lock", () => {
  it("has the vendored copy byte-identical to the sha256 in its lock file", () => {
    const sha = createHash("sha256").update(readFileSync(join(lockDir, "heavy-lock.sh"))).digest("hex")
    expect(read(join(lockDir, "heavy-lock.lock"))).toContain(`${sha}  heavy-lock.sh`)
  })

  it("the gate re-runs itself under the lock", () => {
    const script = read(gate)
    expect(script).toContain("heavy-lock.sh")
    expect(script).toContain("HEAVY_LOCK_HELD")
  })

  it("waits while another process holds the lock, and gives up with 75 without running a step", async () => {
    const dir = mkdtempSync(join(tmpdir(), "heavy-lock-"))
    const lockFile = join(dir, "heavy.lock")
    const holder = spawn("bash", ["-c", 'exec 9>>"$LOCK_FILE"; flock 9; echo held; sleep 30'], {
      env: { ...process.env, LOCK_FILE: lockFile },
    })
    try {
      await new Promise<void>((resolve, reject) => {
        holder.stdout.once("data", () => resolve())
        holder.once("error", reject)
        holder.once("exit", () => reject(new Error("lock holder exited early")))
      })
      // The gate itself runs under the lock with HEAVY_LOCK_HELD=1: a nested call must not inherit it.
      const { HEAVY_LOCK_HELD: _held, ...env } = process.env
      const result = spawnSync("bash", [gate], {
        encoding: "utf8",
        env: { ...env, HEAVY_LOCK_FILE: lockFile, HEAVY_LOCK_TIMEOUT: "1", HEAVY_LOCK_PSI_FILE: join(dir, "none") },
        timeout: 30_000,
      })
      expect(result.status).toBe(75)
      expect(result.stderr).toContain("waiting for the host lock")
      expect(result.stderr).not.toContain("check: step")
    } finally {
      holder.kill()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
