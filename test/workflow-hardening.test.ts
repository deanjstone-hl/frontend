// @vitest-environment node

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// frontend#236 (autorepo 5): the workflows run third-party code with a token, so every
// action is pinned to a commit, every token starts with no permissions, and the push gate
// fetches nothing but its install. These tests read the files as text: a YAML parser is
// not a dependency of this repo.

const root = fileURLToPath(new URL("..", import.meta.url))
const read = (path: string) => readFileSync(join(root, path), "utf8")

const workflowFiles = readdirSync(join(root, ".github/workflows"))
  .filter((file) => file.endsWith(".yml"))
  .sort()
const workflows = workflowFiles.map((file) => ({ file, text: read(`.github/workflows/${file}`) }))
const actionFiles = readdirSync(join(root, ".github/actions")).map((dir) => `.github/actions/${dir}/action.yml`)

// A comment line carries no `uses:` of its own.
const codeLines = (text: string) => text.split("\n").filter((line) => !/^\s*#/.test(line))

// The text of each job under `jobs:`, keyed by job id. Jobs sit at two spaces of indent.
const jobsOf = (text: string) => {
  const lines = text.split("\n")
  const start = lines.findIndex((line) => /^jobs:\s*$/.test(line))
  const jobs: Record<string, string> = {}
  let current: string | undefined
  for (const line of lines.slice(start + 1)) {
    const header = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/)
    if (header) {
      current = header[1]
      jobs[current] = ""
    } else if (current) {
      jobs[current] += `${line}\n`
    }
  }
  return jobs
}

describe("every third-party action is pinned to a full commit SHA", () => {
  const files = [...workflows.map(({ file }) => `.github/workflows/${file}`), ...actionFiles]

  it("finds the workflows and the composite action it checks", () => {
    expect(workflowFiles).toEqual(["design.yml", "readme-guard.yml", "release.yml", "test.yml"])
    expect(actionFiles).toEqual([".github/actions/host-pnpm/action.yml"])
  })

  for (const file of files) {
    it(`${file}: owner/repo@<40 hex> # <version tag>`, () => {
      const uses = codeLines(read(file)).filter((line) => /\buses:/.test(line))
      for (const line of uses) {
        const ref = line.match(/uses:\s*(\S+)(.*)$/)
        expect(ref, line).not.toBeNull()
        const [, target, rest] = ref as RegExpMatchArray
        if (target.startsWith("./")) continue
        expect(target, line).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/)
        expect(rest, line).toMatch(/^\s+# v\d+(\.\d+)*\s*$/)
      }
    })
  }

  it("uses each action at one SHA across all files, so a bump is one change", () => {
    const shaByAction = new Map<string, Set<string>>()
    for (const file of files) {
      for (const line of codeLines(read(file))) {
        const match = line.match(/uses:\s*([\w.-]+\/[\w.-]+)@([0-9a-f]{40})/)
        if (!match) continue
        shaByAction.set(match[1], (shaByAction.get(match[1]) ?? new Set()).add(match[2]))
      }
    }
    expect(shaByAction.size).toBeGreaterThanOrEqual(5)
    for (const [action, shas] of shaByAction) expect([...shas], action).toHaveLength(1)
  })
})

describe("least permissions", () => {
  for (const { file, text } of workflows) {
    it(`${file}: top-level permissions are empty`, () => {
      expect(text).toMatch(/^permissions: \{\}\s*$/m)
      expect(text).not.toMatch(/^permissions:\s*\n\s+\w/m)
    })

    it(`${file}: every job states its own permissions`, () => {
      const jobs = jobsOf(text)
      expect(Object.keys(jobs).length).toBeGreaterThan(0)
      for (const [id, body] of Object.entries(jobs)) {
        expect(body, `${file} job ${id}`).toMatch(/^ {4}permissions:\s*\n {6}[a-z-]+: (read|write)/m)
      }
    })
  }

  it("only the Release job writes, and only what semantic-release needs", () => {
    const writers = workflows.flatMap(({ file, text }) =>
      Object.entries(jobsOf(text)).flatMap(([id, body]) =>
        [...body.matchAll(/^ {6}([a-z-]+): write\s*$/gm)].map((match) => `${file}:${id}:${match[1]}`),
      ),
    )
    expect(writers.sort()).toEqual([
      "release.yml:release:contents",
      "release.yml:release:issues",
      "release.yml:release:pull-requests",
    ])
  })
})

describe("checkout keeps no credentials: nothing here pushes with the checkout's token", () => {
  for (const { file, text } of workflows) {
    it(`${file}: every actions/checkout sets persist-credentials: false`, () => {
      const lines = text.split("\n")
      const checkouts = lines.flatMap((line, index) => (/uses: actions\/checkout@/.test(line) ? [index] : []))
      expect(checkouts.length).toBeGreaterThan(0)
      for (const index of checkouts) {
        const step = []
        for (let next = index + 1; next < lines.length && !/^\s*- /.test(lines[next]); next += 1) step.push(lines[next])
        expect(step.join("\n"), `${file}:${index + 1}`).toMatch(/^\s+persist-credentials: false\s*$/m)
      }
    })

    it(`${file}: runs no git push`, () => {
      expect(codeLines(text).join("\n")).not.toMatch(/git push/)
    })
  }
})

describe("the push gate (test.yml) is hermetic", () => {
  const test = read(".github/workflows/test.yml")
  const code = codeLines(test).join("\n")

  it("has no schedule and no fetch of its own: no curl, wget, gh api or npx download", () => {
    expect(code).not.toMatch(/^\s+schedule:/m)
    expect(code).not.toMatch(/\b(curl|wget)\b/)
    expect(code).not.toMatch(/\bgh (api|release|run)\b/)
    expect(code).not.toMatch(/\bnpx\b/)
  })

  it("reaches the network only to install: pnpm install and the pinned Chromium download", () => {
    const runs = [...code.matchAll(/^\s+run: (.+)$/gm)].map((match) => match[1])
    const fetching = runs.filter((run) => /\b(install|add|dlx|update)\b/.test(run))
    expect(new Set(fetching)).toEqual(
      new Set(["pnpm install --frozen-lockfile", "pnpm exec playwright-core install chromium"]),
    )
  })

  it("compares nothing against a live upstream: no test or gate script reaches a remote host", () => {
    for (const dir of ["scripts/geometry-gate", "scripts/ci"]) {
      for (const file of readdirSync(join(root, dir)).filter((name) => /\.(mjs|sh)$/.test(name))) {
        const body = read(`${dir}/${file}`)
        expect(body, `${dir}/${file}`).not.toMatch(/https?:\/\/(?!127\.0\.0\.1|localhost|www\.w3\.org|x["'/])/)
      }
    }
  })
})

describe("the pins stay current and the gate files stay owned", () => {
  it("Dependabot watches github-actions weekly from the repo root", () => {
    const dependabot = read(".github/dependabot.yml")
    expect(dependabot).toMatch(/^version: 2$/m)
    expect(dependabot).toMatch(/package-ecosystem: "github-actions"/)
    expect(dependabot).toMatch(/directories:\s*\n\s+- "\/"\s*\n\s+- "\/\.github\/actions\/\*"/)
    expect(dependabot).toMatch(/interval: "weekly"/)
  })

  it("CODEOWNERS gives .github/ and scripts/ an owner", () => {
    expect(existsSync(join(root, ".github/CODEOWNERS"))).toBe(true)
    const owners = read(".github/CODEOWNERS")
    expect(owners).toMatch(/^\/\.github\/\s+@\S+/m)
    expect(owners).toMatch(/^\/scripts\/\s+@\S+/m)
  })
})
