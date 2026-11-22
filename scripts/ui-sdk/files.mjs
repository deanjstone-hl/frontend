// Where the @ui-sdk skill and docs come from and where they are vendored to (frontend#245).
// `npx skills add vercel-labs/ui --skill ui-sdk` reads GitHub with no version, so frontend
// vendors the same files from the pinned packages instead: no runtime GitHub pull, and a bump of
// the pin is the only thing that changes them (stamps/ui-sdk-vendor.json).
import { readdirSync } from "node:fs"
import { join } from "node:path"

// [source under node_modules, destination under the repo root]
export const VENDORED = [
  ["node_modules/@ui-sdk/core/skills/ui-sdk", "vendor/ui-sdk/skill"],
  ["node_modules/@ui-sdk/react/docs", "vendor/ui-sdk/docs"],
]

// The note written beside the vendored files.
export const NOTE_PATH = "vendor/ui-sdk/VENDORED.md"

const walk = (root, directory) =>
  readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    return entry.isDirectory() ? walk(root, path) : [path]
  })

// Every file under a vendored source, as a repo-relative path, sorted.
export const sourceFiles = (root) =>
  VENDORED.flatMap(([source]) => walk(root, source)).sort()

// The destination of a source file.
export const destinationOf = (sourcePath) => {
  const [source, destination] = VENDORED.find(([prefix]) => sourcePath.startsWith(`${prefix}/`))
  return `${destination}${sourcePath.slice(source.length)}`
}

export const vendoredFiles = (root) => [...sourceFiles(root).map(destinationOf), NOTE_PATH].sort()

export const note = (versions) => `# Vendored @ui-sdk skill and docs

Copied from the installed packages, never edited by hand. Regenerate with \`pnpm vendor:ui-sdk\`
after a bump of the pin; \`pnpm check\` fails when these files or the pin move without it
(\`stamps/ui-sdk-vendor.json\`).

| From | To |
| --- | --- |
${VENDORED.map(([source, destination]) => `| \`${source}\` | \`${destination}\` |`).join("\n")}

Pinned: \`@ui-sdk/core\` ${versions.core}, \`@ui-sdk/react\` ${versions.react}.

Agents read \`vendor/ui-sdk/skill/SKILL.md\` and \`vendor/ui-sdk/docs/llms.txt\`. Do not run
\`npx skills add vercel-labs/ui\`: it reads GitHub with no version.
`
