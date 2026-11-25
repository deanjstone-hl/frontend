# Diagrams

Diagrams for the frontend registry (the repo is `deanjstone-hl/frontend`, formerly design-system): how sources build into a registry, how a consumer pulls an item, and how a release is cut. Open the `.html` file in a browser. Each is self-contained static HTML/SVG in the house style of [argus-config/1432](https://github.com/deanjstone/argus-config/issues/1432): system fonts, no network request, theme-aware (host CSS variables, with a `prefers-color-scheme` dark fallback), and 360 px wide so a phone needs no sideways scroll. They are drawn from the repo's own code, README and docs, and checked with the diagram-design plugin's `self_check.py` (`OK`) and `verify-geometry.py` (`0 finding(s)`).

Every step node is `<g id="step-<flow>-<step>">`, the deep-link contract of [ops-hub/13](https://github.com/deanjstone-hl/ops-hub/issues/13); the targeted step is highlighted with `:target`. The flow slug starts with the repo name, so a step id is unique across repos.

| Diagram | Type | Step ids | Sources |
|---|---|---|---|
| [`architecture.html`](architecture.html) | Architecture | `step-frontend-arch-`: `themes` `registry` `build-theme` `shadcn-build` `tokens` `r` `github` `cli` `apps` | `README.md` (Structure, Consumers), `scripts/check.sh` |
| [`consume-flow.html`](consume-flow.html) | Sequence | `step-frontend-flow-`: `init` `add` `fetch` `resolve` `install` `copy` `css` `own` | `README.md` (Consuming this registry) |
| [`build-deploy.html`](build-deploy.html) | Pipeline | `step-frontend-deploy-`: `push` `checks` `approve` `ff` `pre` `test` `release` `tag` | `docs/deploy-branch.md`, `.github/workflows/`, `scripts/check.sh` |

## Not drawn

- Private values: ids, hostnames and addresses are never drawn. Services and roles are named, not located (public-safe, [argus-config/1433](https://github.com/deanjstone/argus-config/issues/1433)).
- Nothing is marked `[speculation]`.

## Redrawing

The diagrams are hand-checked against their sources, not generated from them. After the sources change, redraw in the same style and rerun the plugin's `self_check.py` (in the skill directory) and `verify-geometry.py` (in the plugin's `scripts/`).
