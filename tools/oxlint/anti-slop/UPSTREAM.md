# Vendored anti-slop (9-rule subset)

Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), commit `63dbb09f73438e550a6991dc6d778f979ffbf183` (plugin 0.1.2). Upstream has no npm package and says to vendor.

Licence: MIT, Copyright (c) 2026 Dillon Mulroy. `LICENSE` is retained verbatim.

Copied files (from `src/`, byte-identical to upstream):

- `rules/no-chained-type-assertions.ts`
- `rules/no-conditional-empty-object-spread.ts`
- `rules/no-module-mocking.ts`
- `rules/no-object-parameters.ts`
- `rules/no-reduce-accumulator-copy.ts`
- `rules/no-reflect-apply.ts`
- `rules/no-reflect-get.ts`
- `rules/no-unknown-type-aliases.ts`
- `rules/no-widen-then-assert.ts`
- `shared/array-method.ts`, `shared/function-parameters.ts`, `shared/lexical-type-parameters.ts`, `shared/reflect-method.ts`, `shared/scope.ts`, `shared/type-alias-resolution.ts`

## Local adaptations

- `index.ts` is trimmed to register only these nine rules; upstream registers 18. The other nine rules and `effect/`, `vendor/eslint-stylistic/` are not vendored.

## Runtime dependency

`@oxlint/plugins`, root devDependency, pinned to the same version as `oxlint`.

## Updating

Do not edit these files here. The canonical copy is `tools/anti-slop/` in argus-config; run its `scripts/anti-slop-sync.sh <this-worktree>` to bring this directory up to date. argus-config's CI (Anti-slop drift) fails when this copy differs from the canonical one. How to bump: argus-config `docs/reference/anti-slop.md`.

## Wiring

`oxlint.config.ts` at the repo root: `no-chained-type-assertions`, `no-widen-then-assert`, `no-conditional-empty-object-spread`, `no-reflect-apply`, `no-reflect-get`, `no-unknown-type-aliases` and `no-reduce-accumulator-copy` at `error`, `no-object-parameters` at `warn`, and `no-module-mocking` at `warn` for test files via `overrides`. This directory is in `ignorePatterns`.
