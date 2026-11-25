#!/usr/bin/env node
// The upstream-follow job (frontend#238, autorepo 4).
//
// When the drift canary (scripts/drift-canary/canary.mjs) sees a pinned upstream move, this
// puts the new pin in a throwaway tree, regenerates r/ and its stamp, runs `pnpm check`, and
// files an issue with the outcome:
//
//   green   an issue that names the bump and attaches the check output, with the command
//           that lands it
//   red     a Repair brief (frontend#235) with the failing step and its output
//
// Issues only. Nothing here commits or pushes: an automatic push to main would put this
// repo's own trunk-health rule (3 reds in a day pause the repo) in the hands of someone
// else's release, so auto-push stays the owner's later decision.
//
//   node scripts/upstream-follow/follow.mjs apply shadcn 4.23.0   bump the pin and regenerate, here
//   node scripts/upstream-follow/follow.mjs trial --followups f.json --out o.json
//                                                                  CI only: try each bump
//   node scripts/upstream-follow/follow.mjs file --outcomes o.json --state s.json --repo owner/name
//                                                                  file what the trial found
//
// The workflow runs `trial` in a step with no token and `file` in a later step with one, so a
// new upstream release never executes beside a token that can write issues.
// The idea comes from rauchg/xeet's sync.yml (Apache-2.0); this code is written for this
// repo and copies none of it.
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// ── The pin sites ────────────────────────────────────────────────────────────────────────

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// A version with nothing version-like after it, so 4.19.1 never matches inside 4.19.10.
const versionPattern = (version) => `${escapeRegExp(version)}(?![0-9A-Za-z.-])`

// What each pin looks like in each file that writes it. `required` sites must hold the pin:
// a file that lost it means the pins are no longer where this job thinks, and a half bump
// would fail `pnpm check` for a reason that has nothing to do with the new version.
export const PIN_SITES = Object.freeze({
  shadcn: [
    { file: "scripts/check.sh", required: true, text: (v) => `SHADCN_VERSION=${v}` },
    {
      file: "scripts/stamp/pins.mjs",
      required: true,
      text: (v) => `SHADCN_VERSION = "${v}"`,
    },
    { file: ".github/workflows/design.yml", required: true, text: (v) => `shadcn@${v}` },
    { file: ".github/workflows/release.yml", required: true, text: (v) => `shadcn@${v}` },
    {
      file: "README.md",
      required: false,
      text: (v) => `shadcn@${v} build --output ./r`,
    },
  ],
  impeccable: [
    {
      file: "scripts/check.sh",
      required: true,
      text: (v) => `IMPECCABLE_VERSION=${v}`,
    },
    { file: ".github/workflows/design.yml", required: true, text: (v) => `impeccable@${v}` },
    { file: ".github/workflows/release.yml", required: true, text: (v) => `impeccable@${v}` },
  ],
})

// The version is written into files and run by npx, and it came off the network.
export const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z][0-9A-Za-z.-]*)?$/

const assertVersion = (label, version) => {
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
    throw new Error(`upstream-follow: ${label} "${version}" is not a plain version (1.2.3)`)
  }
}

// Moves one pin from `from` to `to` in every file that writes it. Returns the files it
// changed. Nothing is written unless every required site holds the pin.
export const bumpPin = ({ root, pkg, from, to }) => {
  const sites = PIN_SITES[pkg]
  if (!sites) throw new Error(`upstream-follow: no pin sites known for "${pkg}" (known: ${Object.keys(PIN_SITES).join(", ")})`)
  assertVersion("the target version", to)
  assertVersion("the current pin", from)

  const pending = []
  for (const site of sites) {
    let before
    try {
      before = readFileSync(join(root, site.file), "utf8")
    } catch (error) {
      if (!site.required && error.code === "ENOENT") continue
      throw new Error(`upstream-follow: cannot read ${site.file}: ${error.message}`)
    }
    const matcher = new RegExp(versionedPattern(site, from), "g")
    if (!matcher.test(before)) {
      if (site.required) throw new Error(`upstream-follow: ${site.file} does not pin ${pkg} at ${from}`)
      continue
    }
    pending.push({ file: site.file, after: before.replace(new RegExp(versionedPattern(site, from), "g"), () => site.text(to)) })
  }
  for (const { file, after } of pending) writeFileSync(join(root, file), after)
  return pending.map(({ file }) => file)
}

// The site's pattern with `from` as a whole version: the pattern escapes the surrounding text
// and puts the version through versionPattern.
const versionedPattern = (site, version) => {
  const marker = "\u0000"
  const template = site.text(marker)
  return template
    .split(marker)
    .map(escapeRegExp)
    .join(versionPattern(version))
}
