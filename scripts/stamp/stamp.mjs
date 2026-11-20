// Stamps for generated output and goldens (frontend#234).
//
// A stamp is stamps/<name>.json. It records the hash of the generator's files, the hash of
// the inputs, the tool pins and the hash of the output the generator produced. `verifyStamp`
// fails when the stamp is missing, the output bytes no longer match it, or the generator,
// the inputs or a pin moved without a regenerate. Only a generator writes one: `writeStamp`
// is imported by the generator scripts and nothing else (test/stamps.test.ts fails on any
// other caller), so a stamp cannot be typed in to turn a red check green. A stamp's recorded
// hashes must also match its own file lists, so editing a hash alone fails too.
//
// Hash only what the generator imports, never a whole directory: noise stays low.
// The idea is from rauchg/xeet's tools/ship/golden-stamp.mjs, a reference and not a
// dependency; nothing is copied from it.
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const repoRoot = fileURLToPath(new URL("../../", import.meta.url))

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")

const sorted = (files) => Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))

// One hash for a {path: sha256} map: independent of the order the paths were listed in.
export const digest = (files) =>
  sha256(
    Object.entries(sorted(files))
      .map(([path, hash]) => `${path}\0${hash}\n`)
      .join(""),
  )

export const stampPath = (root, name) => join(root, "stamps", `${name}.json`)

const missing = (root, path, error) => {
  throw new Error(`stamp: cannot read ${path} under ${root}: ${error.code ?? error.message}`)
}

export const fileEntries = (root, paths) =>
  paths.map((path) => {
    try {
      return { path, bytes: readFileSync(join(root, path)) }
    } catch (error) {
      return missing(root, path, error)
    }
  })

const hashed = (entries) => sorted(Object.fromEntries(entries.map(({ path, bytes }) => [path, sha256(bytes)])))

const section = (entries) => {
  const files = hashed(entries)
  return { hash: digest(files), files }
}

// What the stamp would say right now, for this spec: the generator's files, the inputs,
// the output and the pins as they stand on disk.
const measure = (spec, root) => ({
  generator: section(fileEntries(root, spec.generator)),
  input: section(fileEntries(root, spec.inputs(root))),
  output: section(spec.outputs(root)),
  pins: sorted(spec.pins(root)),
})

// Only a generator calls this, right after it wrote the output.
export const writeStamp = (spec, root = repoRoot) => {
  const stamp = { name: spec.name, ...measure(spec, root) }
  const path = stampPath(root, spec.name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(stamp, null, 2)}\n`)
  return stamp
}

const sectionsConsistent = (stamp) =>
  ["generator", "input", "output"].every(
    (key) => stamp[key]?.files && typeof stamp[key].files === "object" && stamp[key].hash === digest(stamp[key].files),
  )

const changed = (recorded, current) => {
  const names = new Set([...Object.keys(recorded), ...Object.keys(current)])
  return [...names].filter((name) => recorded[name] !== current[name]).sort()
}

// An array of problems, empty when the stamp is current.
export const verifyStamp = (spec, root = repoRoot) => {
  const regenerate = `regenerate with: ${spec.regenerate}`
  let stamp
  try {
    stamp = JSON.parse(readFileSync(stampPath(root, spec.name), "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return [`${spec.name} has no stamp (stamps/${spec.name}.json); ${regenerate}`]
    return [`stamps/${spec.name}.json was edited by hand (${error.message}); ${regenerate}`]
  }
  if (!sectionsConsistent(stamp) || typeof stamp.pins !== "object" || stamp.pins === null) {
    return [`stamps/${spec.name}.json was edited by hand: its hashes do not match its own file lists; ${regenerate}`]
  }

  const now = measure(spec, root)
  const problems = []
  const outputMoved = changed(stamp.output.files, now.output.files)
  if (outputMoved.length > 0) {
    problems.push(
      `${spec.name}: ${outputMoved.join(", ")} no longer match the stamp. Output is changed only by its generator; ` +
        `${regenerate}. A code change that disagrees with a golden is a test failure: fix the code, never re-stamp.`,
    )
  }
  const generatorMoved = changed(stamp.generator.files, now.generator.files)
  if (generatorMoved.length > 0) {
    problems.push(`${spec.name}: generator moved without a regenerate (${generatorMoved.join(", ")}); ${regenerate}`)
  }
  const inputsMoved = changed(stamp.input.files, now.input.files)
  if (inputsMoved.length > 0) {
    problems.push(`${spec.name}: inputs moved without a regenerate (${inputsMoved.join(", ")}); ${regenerate}`)
  }
  for (const pinName of [...new Set([...Object.keys(stamp.pins), ...Object.keys(now.pins)])].sort()) {
    if (stamp.pins[pinName] !== now.pins[pinName]) {
      problems.push(
        `${spec.name}: pin ${pinName} moved without a regenerate (stamped ${stamp.pins[pinName] ?? "none"}, now ${now.pins[pinName] ?? "none"}); ${regenerate}`,
      )
    }
  }
  return problems
}
