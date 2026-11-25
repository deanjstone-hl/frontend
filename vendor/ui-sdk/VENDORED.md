# Vendored @ui-sdk skill and docs

Copied from the installed packages, never edited by hand. Regenerate with `pnpm vendor:ui-sdk`
after a bump of the pin; `pnpm check` fails when these files or the pin move without it
(`stamps/ui-sdk-vendor.json`).

| From | To |
| --- | --- |
| `node_modules/@ui-sdk/core/skills/ui-sdk` | `vendor/ui-sdk/skill` |
| `node_modules/@ui-sdk/react/docs` | `vendor/ui-sdk/docs` |

Pinned: `@ui-sdk/core` 0.1.0-beta.17, `@ui-sdk/react` 0.1.0-beta.17.

Agents read `vendor/ui-sdk/skill/SKILL.md` and `vendor/ui-sdk/docs/llms.txt`. Do not run
`npx skills add vercel-labs/ui`: it reads GitHub with no version.
