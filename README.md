# frontend

Formerly `design-system` (the repo was renamed to `frontend`, then moved to the `deanjstone-hl`
organisation: it is `deanjstone-hl/frontend` now. GitHub redirects the old `deanjstone/design-system` and
`deanjstone/frontend` URLs, and issue and release links keep working). Shared shadcn/ui component registry and design tokens, consumed by `myargus`,
`atto1`, `argus`, `homelab` and `quick-capture` via the shadcn CLI (`slate-reader`
vendors LinkPill; `budget` is migrating — see [Consumers](#consumers)). This
repo is not a
buildable package — it's a plain GitHub-hosted registry: a `registry.json`
manifest plus the source files it points to. The shadcn CLI reads
`registry.json` directly from GitHub, resolves the referenced files, and
copies them into the consuming project. There's no publish step.

## Quick start

For working **in** this repo. To use the registry from an app, skip to
[Consuming this registry](#consuming-this-registry-from-another-project).

**Prerequisites**

- Node 22 or later (CI runs 22) and pnpm 12.13.0, the `packageManager` pin
  (`corepack enable` picks it up). npm is not used here.
- `git`, `bash` and `jq` (the links and design-check scripts use them).
- Network: `npx` fetches the pinned `shadcn` and `impeccable` on first use.
- Chromium, only for `pnpm gate:geometry` and the `docs/*` demo checks:
  `pnpm exec playwright-core install chromium`. The gate can use another
  browser through `GATE_CHROMIUM`; the demo scripts read the headless shell from
  `~/.cache/ms-playwright/` (Linux), so they need Playwright's own install.

**Setup**

```bash
git clone https://github.com/deanjstone/frontend.git && cd frontend
pnpm install --frozen-lockfile
```

**Commands**

| Command | Does |
|---|---|
| `pnpm test` | Vitest: renders registry sources in jsdom (`test/`) |
| `pnpm lint` | oxlint, type-aware |
| `pnpm check` | `test`, impeccable detector, `r/` drift, `lint`: what CI runs, in one command; run before every push |
| `pnpm build:theme` | Regenerates `theme/tokens.css`, `registry.json` and `r/` from `theme/themes.json`, and their stamps |
| `pnpm build:registry` | Regenerates `r/` alone (the pinned `shadcn build`) and its stamp, after a source or `registry.json` edit |
| `node scripts/links/generate.mjs` | Regenerates `registry/lib/links.ts` and its stamp from `links.json` |
| `pnpm update:snapshots` | Rewrites the link-pill snapshot and its stamp; see [Stamps](#stamps-generated-output-and-goldens) |
| `node scripts/drift-canary/canary.mjs --dry-run` | Reads npm and shadcn's published items now and prints any upstream drift; files nothing. See [Drift canary](#drift-canary-upstream-changes-filed-as-repair-briefs) |
| `node scripts/upstream-follow/follow.mjs apply <shadcn\|impeccable> <version>` | Moves a pin in every file that writes it and regenerates `r/` and its stamp; what an upstream-follow issue tells a worker to run. See [Upstream follow](#upstream-follow-trying-a-moved-pin-before-anyone-lands-it) |
| `pnpm gate:geometry` | Browser check of safe areas and curves; see [Curve-geometry gate](#curve-geometry-gate) |
| `node docs/<demo>/smoke-check.mjs` | Builds a demo and checks it in headless Chromium: `data`, `form-inputs`, `layout`, `page-transition`; `docs/card-list/screenshots.mjs`, `docs/issue-row/screenshots.mjs`, `docs/filter-builder/screenshots.mjs`, `docs/grouped-list/screenshots.mjs` and `docs/ds-theme/screenshots.mjs` do the same in headless WebKit; `docs/menus/keyboard-check.mjs` and `docs/graph-3d/{measure,inspect}.mjs` likewise |

There is nothing to run as a server: the registry is files. A demo script builds
and serves its page for the length of its run and then stops.

**Deploy.** Nothing is deployed to a host. A new version is published when the
owner promotes a `main` commit to the `deploy` branch (`scripts/promote.sh <sha>`,
or Approve on the ops hub card), which runs the `Release` workflow: tests first, then a
`vX.Y.Z` tag on the promoted commit and a GitHub release (nothing at all when the
promotion carries no `feat`, `fix`, `perf` or breaking commit). A push to `main` publishes
nothing. Full flow, rollback and first-time setup: [docs/deploy-branch.md](docs/deploy-branch.md);
see [Versioning](#versioning).

**Configuration.** The registry itself reads no environment. These are optional
overrides for the scripts (names only; no value is stored in the repo):

| Variable | Read by | Meaning |
|---|---|---|
| `GATE_CHROMIUM` | `pnpm gate:geometry` | Path to a Chromium when Playwright's is not installed |
| `GATE_REGISTRY`, `GATE_THEME` | `pnpm gate:geometry` | Check another checkout's `registry/` or `theme/` |
| `GATE_OUT` | `pnpm gate:geometry` | Where the harness page is built (default `node_modules/.cache/geometry-gate/dist`); screenshots always go to `geometry-gate-out/` |
| `PROMOTE_REMOTE` | `scripts/promote.sh` | Remote to push `deploy` to (default `origin`) |
| `LINK_CHECK_MODE` | `scripts/link-check.sh` | `report` (default) or `block` |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | `scripts/links/cf-drift.mjs` | Required; read-only token. `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_TUNNEL_ID` are optional |

**Where to read next:** [DESIGN.md](DESIGN.md) (tokens, themes, blocks),
[GLOSSARY.md](GLOSSARY.md), [CONTRIBUTING.md](CONTRIBUTING.md) (commit types),
[docs/adr/](docs/adr/), [docs/diagrams/](docs/diagrams/) (architecture, consume flow, build and release),
[docs/deploy-branch.md](docs/deploy-branch.md),
[docs/graph-3d/README.md](docs/graph-3d/README.md), and `AGENTS.md` for agents.

## Consumers

This list is how a registry change is checked for downstream breakage, so keep
it true. Pins are the `@frontend` alias version in each repo's
`components.json` on `main`, read on 2026-11-12 by
`node docs/audits/primitives-usage/collect.mjs`, which re-reads all of them
([the audit](docs/audits/2026-11-12-primitives-usage.md)). The alias is where the
next `add` will pull from; the code already in the repo is whatever was last
pulled, and in ten of these apps some of it is older than the pin (the audit's
drift table).

| Consumer | Path | Pin | Status |
|---|---|---|---|
| `argus` | `apps/watchtower` | v3.18.0 | consuming ([argus#674](https://github.com/deanjstone/argus/issues/674)) |
| `argus` | `apps/email` | v3.18.0 | consuming; the same app as `email` `apps/email`, still present in both repos |
| `email` | `apps/email` | v3.18.0 | consuming (split out of `argus` on 9 Nov 2026) |
| `ops-hub` | `apps/ops-hub-web` | v3.22.0 | consuming (moved out of `argus` on 10 Nov 2026; [argus#728](https://github.com/deanjstone/argus/issues/728)) |
| `myargus` | `apps/briefings`, `apps/jobs`, `apps/knowledge`, `apps/reader`, `apps/shell`, `apps/stockade` | v3.22.0 | consuming ([myargus#295](https://github.com/deanjstone/myargus/issues/295), [myargus#296](https://github.com/deanjstone/myargus/issues/296)) |
| `homelab` | `services/scan-app/web` | v3.1.0 | consuming ([homelab#181](https://github.com/deanjstone/homelab/issues/181)) |
| `quick-capture` | `web` | v3.1.0 | consuming (split out of `homelab` `services/quick-capture/web` in [homelab#228](https://github.com/deanjstone/homelab/issues/228)) |
| `atto1` | repo root | v3.1.0 | consuming |
| `sparky` | repo root | none | **tokens only**: `src/design-system/tokens.css` is a copy of `theme/tokens.css` (identical to v3.24.0); no registry components, no `components.json` |
| `slate-reader` | `apps/server` | none (vendored) | **LinkPill only**: `link-pill-core` (identical to v3.24.0) and `link-pill-html` are copied in; its `components.json` has no `@frontend` alias. The web UI is `apps/client` (Preact, no registry). The repo is archived ([slate-reader#17](https://github.com/deanjstone/slate-reader/issues/17)) |
| `budget` | `web` | none yet | **pending**: forked `components/ui` (Radix, from v1), no `components.json` ([budget#271](https://github.com/deanjstone/budget/issues/271)) |

Move a pending row to consuming only once a `components.json` with the alias
is on that repo's `main`.

### Items on UI SDK

[`@ui-sdk`](https://github.com/vercel-labs/ui) (Vercel Labs, Apache-2.0, beta) is the behaviour layer
under a growing set of items, replacing Base UI one item at a time
([frontend#245](https://github.com/deanjstone/frontend/issues/245); the fit check is
[frontend#244](https://github.com/deanjstone/frontend/issues/244)). A consumer keeps the same exported
names and props. The SDK is not a shadcn registry: it ships as npm packages, so each migrated item's
`.tsx` is rewritten over SDK parts and lists the SDK as an exact-pinned dependency.

| Item | On UI SDK since | Pin |
|---|---|---|
| `switch` | the first registry release after [frontend#245](https://github.com/deanjstone/frontend/issues/245) slice 1 |
| `popover` | the registry release after slice 2; also the base of `date-picker`, `app-switcher`, `filter-builder` and `grouped-list`, which pull it | `@ui-sdk/core` and `@ui-sdk/react` `0.1.0-beta.17` |
| `combobox` | the registry release after slice 3 | `@ui-sdk/core` and `@ui-sdk/react` `0.1.0-beta.17` |
| `checkbox`, `radio-group`, `toggle`, `collapsible` | the registry release after slice 4; `toggle` is also pulled by `toggle-group` (for `toggleVariants`), and `checkbox` and `collapsible` by `filter-builder`, `grouped-list`, `file-diff` and `trace` | `@ui-sdk/core` and `@ui-sdk/react` `0.1.0-beta.17` |
| `tabs`, `accordion`, `slider` | the registry release after slice 5 | `@ui-sdk/core` and `@ui-sdk/react` `0.1.0-beta.17` |
| `tooltip`, `hover-card` | the registry release after slice 6; `tooltip` is also pulled by `sidebar` | `@ui-sdk/core` and `@ui-sdk/react` `0.1.0-beta.17` |
| `dialog`, `alert-dialog`, `sheet` | the registry release after slice 7; `dialog` is also the base of `command` (for `CommandDialog`), `sheet` of `sidebar` (mobile), `app-shell`, `app-switcher` and `filter-builder` | `@ui-sdk/core` and `@ui-sdk/react` `0.1.0-beta.17` |
| `dropdown-menu`, `context-menu`, `menubar`, `navigation-menu`, `select` | the registry release after [frontend#247](https://github.com/deanjstone/frontend/issues/247); `dropdown-menu` is also the base of `menubar`, and `dropdown-menu` with `context-menu` of `issue-row` | `@ui-sdk/core` and `@ui-sdk/react` `0.1.0-beta.17` |
| `drawer` | the registry release after [frontend#248](https://github.com/deanjstone/frontend/issues/248); with a workaround for [ui#1010](https://github.com/vercel-labs/ui/issues/1010) | `@ui-sdk/core` and `@ui-sdk/react` `0.1.0-beta.17` |

`drawer` is the last item of [frontend#245](https://github.com/deanjstone/frontend/issues/245)'s order. Items with no behaviour layer
(`card`, `table`, `badge` and the like) never move.

The pin moved from `0.1.0-beta.14` to `0.1.0-beta.16` on 24 Nov 2026 ([frontend#247](https://github.com/deanjstone/frontend/issues/247)),
for every item above at once. Re-pulling an older item now carries beta.16, which changes no exported name or prop; it
fixes a menu click lost while the thread was busy ([ui#1005](https://github.com/vercel-labs/ui/issues/1005)), Escape in a
hover-opened submenu closing the whole menu ([ui#1006](https://github.com/vercel-labs/ui/issues/1006)) and a `Field`
label losing its `Select` ([ui#1012](https://github.com/vercel-labs/ui/issues/1012)).

The pin moved again, from `0.1.0-beta.16` to `0.1.0-beta.17`, on 25 Nov 2026 ([frontend#248](https://github.com/deanjstone/frontend/issues/248)),
for every item above at once. It changes no exported name or prop. Among its fixes: a sheet swiped away closes once it
has left the screen, and a popup lets go of its content when it unmounts.

**What re-pulling a migrated item changes** (`npx shadcn add deanjstone/frontend/<item>`; consumers
move only when they choose to re-add):

1. **Two new dependencies.** The consumer gets `@ui-sdk/core` and `@ui-sdk/react` at the exact pinned
   version (no caret) and a lockfile change. Both need React 19 or newer (`react >=19`, `@types/react >=19.2.10`);
   every consumer already has it. `@base-ui/react` stays until every item the consumer uses has moved, so
   it carries both for a while.
2. **Same API, same look.** Exported names, props (`size`), `className` merging, `data-slot` values and the
   `data-checked` / `data-unchecked` / `data-disabled` state attributes the classes key off are unchanged for
   `switch`. Two things differ: the root is a `<button role="switch">` (Base UI rendered a `<span>`), and
   `onCheckedChange(checked, details)` now carries `details.reason` (`press`, `reset`, `restore`, `imperative`)
   in place of Base UI's event details. The props type is the SDK's, not `Switch.Root.Props`.
3. **Your own CSS and tests.** Anything of yours that targets a Base UI element, attribute or class on that
   component (a `span` selector, the Base UI event shape) needs a look.
4. **Possibly a CSP change.** The SDK can inject a style sheet; without `'unsafe-inline'` in `style-src` it needs
   a `csp-nonce` meta tag. Not confirmed for `switch` (frontend tests run in jsdom, which has no CSP), so a consumer
   that sets a CSP should load a page with a switch once after re-pulling. The popup items settle it.
5. **Local edits to the file are overwritten.** As with any re-add.

**Popups (`popover`, and what pulls it).** The SDK renders a popup in the browser's top layer, so `Portal` and
`Positioner` are gone: `PopoverContent` takes `side`, `align`, `sideOffset` and `alignOffset` itself, with the
same defaults. `PopoverTrigger` still takes `render`. `onOpenChange(open, details)` carries `details.reason`
(`trigger-press`, `escape-key`, `outside-press`, `focus-out`, `close-press`, and more) in place of Base UI's
event details. Three more things for a consumer:

- **Tests that render a popup in jsdom need stubs.** jsdom has no top layer: without
  `HTMLElement.prototype.showPopover`, `hidePopover` and `Element.prototype.getAnimations` stubbed, and
  `[popover] { display: block !important }` added, the popup never shows. The registry's own copy is
  `installUiSdkStubs()` in `test/setup/ui-sdk.ts`; it is not an item, so a consumer copies it and calls it at the top
  of each test file that renders a popup (not as a global setup: the `getAnimations` stub changes how the Base UI items left, such as `toggle-group`, close). It also stubs `Element.prototype.scrollIntoView`, which a menu or a select calls for the highlighted item, and `ResizeObserver`, which a drawer measures its sheet with. It does not
  test native popup behaviour, so check placement in a real browser.
- **`z-50` and `isolate` no longer matter** for stacking: the top layer sits above every `z-index`.
- **On a small touch screen it stays a popover.** `presentation` is not set; the SDK's `"auto"` (a bottom sheet)
  is opt-in per use.

**`combobox`.** A popup like `popover`, so the same three popup notes apply (jsdom stubs, no `z-50`, popover on a small
touch screen). Exported names, `data-slot` values, `className` merging and the look are unchanged; `data-highlighted`,
`data-selected`, `data-disabled`, `data-open` and `data-closed` are what the classes key off. What a consumer may notice:

- **`Portal` and `Positioner` are gone.** `ComboboxContent` takes `side`, `align`, `sideOffset`, `alignOffset` and `anchor`
  itself, with the same defaults. `anchor` still takes the ref from `useComboboxAnchor()`.
- **Same list shapes.** `items` is still an array of strings, `{ value, label }` objects or Base UI groups
  (`{ value, items }`, rendered with `ComboboxGroup items`, `ComboboxLabel` and `ComboboxCollection`), and
  `ComboboxList` and `ComboboxValue` still take a render function (`(item, index)` and `(value)`).
- **Renamed root props still work.** `inputValue`, `defaultInputValue`, `onInputValueChange`, `itemToStringLabel` and
  `itemToStringValue` are passed on as the SDK's `query`, `defaultQuery`, `onQueryChange`, `itemToLabel` and
  `itemToValue`. Other Base UI root props are the SDK's now (`onValueChange(value, details)` and
  `onOpenChange(open, details)` carry the SDK's `details.reason`; `autoHighlight` takes `"always"`, `"selected"` or a
  boolean). The props type is the SDK's, not `Combobox.Root.Props`.
- **`ComboboxChip` needs a `value`** (`<ComboboxChip value={fruit}>`): the SDK removes a chip by its value, where Base UI
  removed it by position. `ComboboxChipRemove` is named "Remove" and the trigger "Show options" unless you pass
  `aria-label`.
- **`disabled` on the root now disables the input and its trigger.** Base UI left the input enabled because the wrapper
  passed `disabled={false}` to it.
- **The empty message is a plain block**, shown by the SDK only while nothing matches (Base UI hid it with a CSS
  group variant), and the list's `max-h` reads `--list-height`, copied from `--available-height` on the content, because
  the SDK does not inherit `--available-height`.

**Leaf items (`checkbox`, `radio-group`, `toggle`, `collapsible`).** Exported names, props, `className` merging and the look
are unchanged; these have no popup, so there is no portal and no top-layer note. What a consumer may notice:

- **Part slots are the SDK's, and a `data-slot` prop is ignored.** The SDK sets `data-slot` itself on every part. `checkbox`
  (`checkbox`, `checkbox-indicator`) and `toggle` (`toggle`) keep their values. `radio-group-item` is now `radio` and
  `radio-group-indicator` is `radio-indicator` (`radio-group` is unchanged). The `collapsible` panel was `collapsible-content`
  and is `collapsible-panel`. To give a part your own slot, pass a `render` element:
  `<Collapsible render={<div data-slot="mine" />}>`, as `file-diff`, `grouped-list` and `trace` now do. Update any CSS or
  test selector of yours on the renamed slots.
- **`collapsible` marks the open state `data-open`** on the root, trigger and panel, where Base UI used `data-panel-open`.
  A class of yours such as `group-data-panel-open/header:` or `[&[data-panel-open]]` needs `data-open`. `aria-expanded` on the
  trigger is unchanged. The panel's `--collapsible-panel-height` variable, `data-starting-style` and `data-ending-style`
  work as before.
- **`checkbox`** is a `<button role="checkbox">` (Base UI rendered a `<span>`). `onCheckedChange(checked, details)` still gets a
  boolean and now carries the SDK's `details.reason` (`press`, `reset`, `restore`, `imperative`). `indeterminate` still works
  (it sets the SDK's `checked="indeterminate"`, so control `checked` yourself) and is now drawn as a minus, not a check.
  The props type is the SDK's `Checkbox` props, not `Checkbox.Root.Props`.
- **`radio-group`** is generic over the value type; `onValueChange(value, details)` carries `details.reason`. The group keeps one
  tab stop and moves the choice with the arrow keys, skipping a disabled radio.
- **`toggle`**: `onPressedChange(pressed, details)` carries `details.reason`; `toggleVariants` is unchanged, so `toggle-group`
  (still Base UI) looks the same.
- **Tests in jsdom** that close a `collapsible` or toggle a `checkbox` hit the SDK's exit animation, which reads
  `Element.prototype.getAnimations`. Call `installUiSdkStubs()` at the top of the test file, as for the popups.

**`tabs`, `accordion`, `slider`.** No popup, so no portal and no top-layer note. Exported names, props, `className` merging, the
look and the `data-slot` values consumers and the theme already target are unchanged: `tabs-trigger`, `tabs-content`,
`accordion-content` and `slider-range` are kept through a `render` element, because the SDK names those parts `tabs-tab`,
`tabs-panel`, `accordion-panel` and `slider-indicator` and ignores a `data-slot` prop. What a consumer may notice:

- **`tabs` marks the selected tab and its panel `data-selected`** where Base UI used `data-active` on the tab. A class of yours such
  as `data-active:` or `group-data-active/tab:` needs `data-selected`. A disabled tab stays focusable with the arrow keys (as the tabs pattern asks) and carries `data-disabled`, which the classes now key off.
  `onValueChange(value, details)` carries the SDK's `details.reason` (`item-press`, `list-navigation`, `find-in-page`,
  `item-removed`, `imperative`); the props type is the SDK's, not `Tabs.Root.Props`. `activation="manual"`, `loop` and
  `hiddenUntilFound` are new options.
- **`accordion`** keeps one item open at a time unless you pass `multiple`, and the open item can close. `value` is still an array
  and `onValueChange(value, details)` carries `details.reason` (`trigger-press`, `find-in-page`, `imperative`). Arrow keys do not
  move focus between triggers, as before: Tab does. The trigger sits in an `h3` and carries `aria-controls` once its panel has
  mounted, one microtask after the first render (tests that check it right after `render` need `await act(async () => {})`).
  `data-open` / `data-closed` and `--accordion-panel-height` work as before.
- **`slider`** is a number or an array. A plain number now draws one thumb (the Base UI wrapper drew two); an array draws one per
  value; no value draws a range over `min` and `max`. Each thumb holds a hidden `<input type="range">` that takes focus, so draw focus
  with `has-[:focus-visible]` (the item does) and name it: a single slider uses the root's `aria-label` or `aria-labelledby`, a range
  takes the new `thumbLabels={["Minimum price", "Maximum price"]}`. Thumbs sit centred on the track and are placed by the SDK, so
  the control carries 6px of padding to keep them inside it where `thumbAlignment="edge"` did that; the track no longer clips
  (`overflow-hidden` is gone). `onValueChange(value, details)` and the new `onValueCommit` carry `details.reason` (`track-press`,
  `drag`, `step-key`, `accessibility-adjust`, `reset`, `restore`, `imperative`). `name` submits the number, or a range as `"start/end"`.
- **Tests in jsdom** need `installUiSdkStubs()` at the top of the file, as for the other items (the exit animation reads
  `Element.prototype.getAnimations`).

**`tooltip`, `hover-card`.** Popups like `popover`, so the same three popup notes apply (jsdom stubs, no `z-50`, no `Portal` or `Positioner`).
Exported names, `data-slot` values, `className` merging, the default `side`, `sideOffset`, `align` and `alignOffset`, the arrow and the look
are unchanged; `data-open`, `data-closed` and `data-side` are what the classes key off. What a consumer may notice:

- **`TooltipProvider` is a context, not Base UI's provider.** The SDK needs none (a tooltip opens at once while another is open or was a
  moment ago). The wrapper hands the provider's `delay` (0 unless you set it) and `closeDelay` to the tooltips under it, and a tooltip's
  own `delay` wins. A `Tooltip` outside any provider waits the SDK's 600 ms, the same as Base UI's default.
- **`onOpenChange(open, details)`** carries the SDK's `details.reason` (`trigger-hover`, `trigger-focus`, `trigger-press`, `escape-key`,
  `focus-out` and more) in place of Base UI's event details. The props types are the SDK's.
- **Hide a tooltip with `disabled`, not `hidden`.** The sidebar's menu button used `hidden` on the content while the sidebar was expanded; it
  now sets `disabled` on the `Tooltip`. A tooltip of yours that does the same should too.
- **A tooltip opens on keyboard focus only for keyboard focus**, not after a click; the trigger of a `disabled` tooltip stays a working button.
- **Tests in jsdom** that hover or focus a trigger: press Tab first (the SDK reads the input modality) and fire `pointerEnter` with
  `pointerType: "mouse"`; a tooltip opens at once while another was open a moment ago, so a test of the delay waits that out first.

**`dialog`, `alert-dialog`, `sheet`.** Modal popups, so the popup notes apply (jsdom stubs, no `z-50`, no `Portal`). Exported names, props
(`showCloseButton`, `size`, `side`), `className` merging, the safe-area classes and the look are unchanged. What a consumer may notice:

- **The SDK renders a dialog in the top layer.** `DialogPortal` and `AlertDialogPortal` are kept as passthroughs, and `SheetPortal` was never
  exported. The page behind is made modal with `aria-modal` and a focus trap, not hidden with `aria-hidden`, so an axe run over the whole
  page with a dialog open reports the page-level `region` rule: skip that one rule in such a test.
- **A sheet's content slot is `dialog-content`, not `sheet-content`.** The SDK finds a dialog's own content for focus and nesting by that
  slot, so renaming it would let Tab leave the sheet. Tell sheets apart with `data-side`. `sheet-overlay`, `sheet-header`, `sheet-footer`,
  `sheet-title`, `sheet-description` and `sheet-close` are unchanged; a `data-slot` prop on any SDK part is ignored, so
  `Sidebar` mobile's `data-slot="sidebar"` is gone from its sheet (`data-sidebar` and `data-mobile` stay), and your own trigger slot goes
  through `render`: `<SheetTrigger render={<button data-slot="mine" />}>`, as `app-shell` and `app-switcher` do.
- **`onOpenChange(open, details)`** carries the SDK's `details.reason` (`trigger-press`, `escape-key`, `outside-press`, `close-press`, `action`
  and more) and `details.returnValue`, the `value` of the close part that closed it, in place of Base UI's event details.
  A close part can also take an `action` that returns a promise and keeps the dialog open while it runs.
- **`alert-dialog`** never closes on a backdrop press (the SDK's rule, as Base UI's was). `AlertDialogAction` is still a plain `Button`
  that closes nothing; wrap it in `AlertDialogClose` (from `@ui-sdk/react/alert-dialog`) or close from your own handler.
- **The dialog shows one microtask after it renders.** Tests that look for the dialog by role right after `render` need `findByRole`, and a
  focus-trap check in jsdom (`checkPattern(dialog, "dialog")`) needs `Element.prototype.checkVisibility` stubbed to return true, because
  jsdom has no layout.
- **`CommandDialog`**'s screen-reader title and description now sit inside the dialog content, where the SDK reads them.

**`dropdown-menu`, `context-menu`, `menubar`.** Popups like `popover`, so the same three popup notes apply (jsdom stubs, no `z-50`, no
`Portal` or `Positioner`: `DropdownMenuPortal`, `ContextMenuPortal` and `MenubarPortal` stay as passthroughs). Exported names, `variant`,
`inset`, `className` merging, the `side`, `align` and offset defaults on the content and the look are unchanged. What a consumer may notice:

- **Highlight and open state are SDK attributes.** An item or trigger of yours styled with `focus:` or `data-popup-open:` needs
  `data-highlighted:` and `data-open:`; the classes in the items use those now, and `issue-row` moved with them. A disabled item stays
  focusable (the menu pattern) and carries `aria-disabled` and `data-disabled`.
- **`data-slot` and `render`.** The SDK ignores a `data-slot` prop, so each part puts its slot (`dropdown-menu-item`, `menubar-trigger`, and
  the rest, as before) on the element it renders and takes a `data-slot` or a `render` element from you:
  `<DropdownMenuTrigger data-slot="mine" render={<a href="/more" />}>`, as `issue-row` does. `render` as a function keeps the SDK's slot.
- **`onClick` on an item** still runs for a press and for Enter or Space (the item maps the SDK's selection event, which Base UI turned
  into a click); it runs once for a press. On a checkbox or radio item it runs for a press only: use `onCheckedChange(checked, details)` and
  `onValueChange(value, details)`, which carry the SDK's `details.reason` (`item-press`, `imperative`) in place of Base UI's event details.
  A checkbox item without a `value` still works; the SDK names it by one it generates.
- **`onOpenChange(open, details)`** carries `details.reason` (`trigger-press`, `escape-key`, `outside-press`, `focus-out`,
  `submenu-switch` and more). Escape in a submenu a hover opened closes that submenu first (beta.16).
- **`ContextMenuTrigger`** opens on a right-click, on a 500 ms long press (the SDK swallows the click that follows a held press, so a
  link inside is not followed) and on the context-menu key or Shift+F10 when the trigger can take focus (give it `tabIndex={0}`);
  `disabled` leaves the browser's own menu. It takes `render`, as `issue-row` does with `<li />`.
- **`menubar`** is one tab stop on its first trigger, moves between menus with the arrow keys and switches an open menu when the pointer rests
  on another trigger. Its triggers are `menuitem`s that open menus. It takes the SDK's `orientation`, `loop`, `disabled` and `modal`, and its
  menus are always popovers. Name the bar with `aria-label`.
- **Tests in jsdom** open a menu with a click (or `contextmenu` for the context menu) and find it with `findByRole("menu")`, because it shows one
  microtask later; a long-press test sends `pointerdown` with `pointerType: "touch"`, `isPrimary: true` and `button: 0`, then `pointerup` and the
  click that follows it.

**`navigation-menu`.** Popups like `popover` (jsdom stubs, no `z-50`, no `Portal`). Exported names (including `navigationMenuTriggerStyle`
and `NavigationMenuPositioner`), the `align` prop, the chevron in each trigger, `data-slot` values and `className` merging are unchanged.
What a consumer may notice:

- **One viewport, not a positioner and a popup.** `NavigationMenuPositioner` is now the SDK's viewport (it takes `side`, `sideOffset`,
  `align` and `alignOffset`), and `NavigationMenu` still renders it for you. An open panel moves into it; a panel is at the viewport's
  corner with its own width and slides between panels on `data-motion`. A closed panel is not in the page unless you pass `keepMounted`.
- **`active` is `current`.** A `NavigationMenuLink` still takes `active`, and now also `current`; either sets `aria-current="page"` and
  `data-current`, which the classes key off in place of `data-active`. A trigger is styled with `data-open` in place of `data-popup-open`.
- **`value` names an item.** `value` and `onValueChange(value, details)` use the `value` of a `NavigationMenuItem`: give each item one when you
  control the menu. `details.reason` is `trigger-press`, `trigger-hover`, `escape-key` and more. `delay`, `closeDelay` and `openOnHover`
  are the SDK's.
- **It is a `nav`.** Give it an `aria-label`. The list is a `ul` and each item an `li`.
- **Tests in jsdom**: Enter on a trigger needs the click a browser sends with it (`fireEvent.keyDown` then `fireEvent.click(trigger, { detail: 0 })`),
  ArrowDown opens a panel and moves into it, and a test that checks focus in a panel stubs `Element.prototype.checkVisibility` to return true.

**`select`.** A popup like `popover` (jsdom stubs, no `z-50`, no `Portal` or `Positioner`). Exported names, `size`, the chevron, the
selected check, `alignItemWithTrigger` (on by default), the placeholder, `className` merging and the look are unchanged. What a consumer
may notice:

- **Base UI's props still work.** `items` is an array of strings or `{ value, label }`, a record of value to label, or groups shaped
  `{ value, items }`; `itemToStringLabel` and `itemToStringValue` are passed on as the SDK's `itemToLabel` and `itemToValue`. A `disabled`
  on a `SelectItem` is reported to the root, because the SDK reads an option's disabled flag from `items`. The props type is the SDK's, not
  `Select.Root.Props`; `onValueChange(value, details)` and `onOpenChange(open, details)` carry `details.reason` (`item-press`,
  `trigger-press`, `escape-key`, `outside-press` and more). `isItemEqualToValue`, `multiple`, `name`, `required` and `disabled` are the SDK's.
- **The content places itself.** `SelectContent` takes `side`, `align`, `sideOffset`, `alignOffset` and `alignItemWithTrigger`. With
  `alignItemWithTrigger` it falls back to opening below the trigger by touch or when there is no room, as Base UI did.
- **The list scrolls natively.** `SelectScrollUpButton` and `SelectScrollDownButton` are still exported and draw nothing.
- **`SelectLabel` is the group label** (slot `select-label`), as before: name a group with it inside `SelectGroup`. Name the trigger with
  `aria-label`, or with a `label` whose `htmlFor` is the trigger's `id`.
- **State attributes**: `data-highlighted` and `data-selected` on an option, `data-placeholder` on the trigger and the value, `data-open`
  and `data-closed` on the trigger and the content, in place of Base UI's. Typing on the closed trigger selects the next option that starts
  with the text, like a native select.
- **Tests in jsdom** need `installUiSdkStubs()` (it includes `scrollIntoView`), a click and `findByRole("listbox")` to open it.

**`drawer`.** A modal popup like `dialog` (jsdom stubs, no `z-50`, no `Portal`: `DrawerPortal` stays as a passthrough). Exported names
(`Drawer`, `DrawerTrigger`, `DrawerContent`, `DrawerHeader`, `DrawerFooter`, `DrawerTitle`, `DrawerDescription`, `DrawerClose`, `DrawerOverlay`,
`DrawerSwipeHandle`, `DrawerPortal`), `modal`, `showSwipeHandle`, `swipeDirection`, `snapPoints`, `showCloseButton`, the safe-area insets,
`className` merging and the look are unchanged. What a consumer may notice:

- **The SDK moves the sheet.** It places the sheet in a full-screen viewport and moves it with its own spring: on a phone a bottom drawer
  moves by native scrolling with CSS snap points, elsewhere by pointer dragging. The classes in `DrawerContent` only size it, give it a surface and
  corners and clear the screen edges; the slide, the swipe, the nesting scale (`--drawer-stack`) and the fade under reduced motion are the SDK's.
  `data-swipe-direction`, `data-swipe-axis` and `data-snap-points` are still on the sheet, so classes that key off them keep working.
- **Slots changed.** The sheet is the SDK's `drawer-content` slot (it was the inner `drawer-popup`); `drawer-viewport` is the SDK's and the content
  wrapper is `drawer-body` (it was `drawer-content`). `drawer-popup` is gone. `drawer-overlay`, `drawer-header`, `drawer-footer`, `drawer-title`,
  `drawer-description`, `drawer-close` and `drawer-swipe-handle` are unchanged. The SDK ignores a `data-slot` prop on its parts.
- **`swipeDirection` picks the edge.** `down` is a bottom drawer, `up` a top one, `left` and `right` as named; the `side` prop is not passed on.
  `onOpenChange(open, details)` carries the SDK's `details.reason` (`trigger-press`, `escape-key`, `outside-press`, `close-press`, `swipe` and more)
  and `snapPoints` takes the SDK's values (a fraction of the screen, pixels, `"20rem"`, `"50%"`, `"content"`). The props type is the SDK's, not
  `Drawer.Root.Props`.
- **`DrawerSwipeHandle` stays a decorative bar** (`aria-hidden`). The SDK's own `DrawerHandle` is a button that steps through the snap points; import
  it from `@ui-sdk/react/drawer` when a drawer with several snap points should offer that to a keyboard.
- **Keep the content out of scroll containers.** Under the scroll-snap driver a swipe moves the sheet by scrolling its host, and the SDK writes
  `overscroll-behavior: contain` on the sheet, so a sheet or a wrapper inside it with `overflow: hidden`, `auto` or `scroll` swallows a swipe that starts
  in it ([ui#1010](https://github.com/vercel-labs/ui/issues/1010), still open upstream; the handle half is fixed in beta.16). The registry's wrapper
  clips its rounded corners with `overflow-clip`, which is not a scroll container, and `overscroll-contain` is gone from it. Do the same in your own
  `className`s; a region that must scroll goes in an element of your own, and the SDK hands a downward swipe to the sheet once it reaches the top.
  Checked in Chromium with real touch events: a swipe down from the title closes the sheet with `overflow-clip`, and does not with the old wrapper's
  `overflow-hidden overscroll-contain` or with `overflow-hidden` on the sheet. Drop the workaround when ui#1010 closes and a pinned release carries it.
- **Tests in jsdom** need `installUiSdkStubs()` (it includes `ResizeObserver`), a click on the trigger and `findByRole("dialog")`, because the drawer
  shows one microtask after it renders; a focus-trap check in jsdom (`checkPattern(dialog, "dialog")`) needs `Element.prototype.checkVisibility`
  stubbed to return true.

**Pinning.** Both packages are exact-pinned in `package.json` `devDependencies` and as `name@version` in
every migrated item's `dependencies` in `registry.json`; `test/ui-sdk-pin.test.ts` fails when an item and
`package.json` disagree, or when the two packages differ. Every beta is a semver "patch" and may break, so
a bump is one change here: edit both pins, `pnpm install`, `pnpm vendor:ui-sdk`, `pnpm build:registry`, run
`pnpm check`, and promote a registry release. Consumers see nothing until they re-pull. Never use a tag or
range: the npm `latest` tag is behind `beta`.

**The skill and docs** are vendored from the pinned packages into `vendor/ui-sdk/` (`skill/SKILL.md`,
`docs/llms.txt`, and the rest), never pulled from GitHub: `npx skills add vercel-labs/ui` reads an
unversioned branch, so do not run it. `pnpm vendor:ui-sdk` rewrites them and `stamps/ui-sdk-vendor.json`; drift fails
`pnpm check`. `AGENTS.md` points agents at them.

**WebMCP.** The SDK's `registerTools` is opt-in per app and no registry item calls it. A consumer that wants it
decides that on its own.


## Structure

```
registry.json              root manifest — one entry per distributable item
registry/
  lib/utils.ts              re-exports cn() from the cn package
  lib/theme-preference.ts   theme + Light/Dark/System choice: cookie, localStorage, no-flash script
  lib/font-preference.ts    the font choice (default or Aspekta), kept apart from the theme: data-font, its own cookie, no-flash script
  fonts/                    the font-aspekta item: ds-fonts.css, install-ds-fonts.sh, and the original OFL font files and notices (fonts.json lists them)
  lib/nav-link.tsx          renderAnchor and the renderLink type the layout blocks share
  lib/link-pill-*.ts, .css  LinkPill core, HTML shell and styles
  lib/highlighter.tsx       Shiki loader behind use-highlighted-code
  lib/graph-3d-*.ts         graph-3d prop mapping and three.js engine (lazy-loaded)
  lib/filter-core.ts, url-state.ts  filter model and one-search-param URL state (filter-builder)
  lib/relative-time.ts      formatRelativeTime ("5m ago", "in 2h") and the useNow clock-tick hook
  lib/list-group-core.ts    grouping and display-settings model (grouped-list)
  lib/page-transition-core.ts  theme tokens to glimm band colours (page-transition)
  base-nova/ui/               73 listed base-nova components (Base UI, plus link-pill, graph-3d, chart, data-table, page-transition)
  base-nova/hooks/            use-mobile (pulled by sidebar), use-online (pulled by offline-banner), use-highlighted-code (pulled by code-block), use-theme-preference, use-font-preference, use-filter-state, use-display-settings
  base-nova/blocks/           v3 layout blocks: app-shell, app-switcher, page-header, empty-page, settings-page, login, card-list, issue-row, filter-builder, grouped-list, file-diff
  design-check/             scripts and workflow of the design-check item (CI, not UI)
  app-html-head/            iPhone <head> tags snippet (app-html-head item)
  links/                    links.json, its schema, links.sh and the link-check script and workflow (ADR-0004)
  lib/links-core.ts, links.ts  URL builders, and the module generated from links.json
r/                         generated per-item output — what the r/ alias resolves
theme/tokens.css            same tokens as the "theme" item, as plain CSS
theme/themes.json           the six T3 themes (light + dark) behind both; see DESIGN.md Themes
test/                      Vitest suites, one per item, plus ones that pin the scripts and workflows
docs/                      ADRs, deploy-branch.md, and one demo plus browser check per feature area
scripts/geometry-gate/     the curve-geometry gate behind pnpm gate:geometry
scripts/stamp/             the stamp mechanism, what it stamps (artefacts.mjs) and the r/ and snapshot generators
stamps/                    one stamp per generated artefact or golden; only its generator writes it
vendor/ui-sdk/             the @ui-sdk skill and docs, vendored from the pinned packages (pnpm vendor:ui-sdk); not shipped to consumers
scripts/ui-sdk/            vendor.mjs copies them and stamps; scripts/stamp/ui-sdk-files.mjs says from where
scripts/release/           release-needed.sh (anything to release?) and tested-head.sh (tag only the promoted SHA); scripts/promote.sh pushes deploy
scripts/theme/              extract-t3.mjs reads T3's sheet; build.mjs writes tokens.css and registry.json
scripts/links/              registry.mjs validates links.json, generate.mjs writes lib/links.ts, cf-drift.mjs diffs Cloudflare
```

## Consuming this registry from another project

A consumer needs a `components.json` first, then pulls items straight from
GitHub by address:

```bash
npx shadcn init            # once per project, if there is no components.json
npx shadcn add deanjstone/frontend/theme
npx shadcn add deanjstone/frontend/button
```

This uses shadcn's native GitHub-registry support: any public repo with a
root `registry.json` is installable directly via `<owner>/<repo>/<item>`.
No `registries` entry in `components.json` is needed — see the warning
below for why you should not add one.

**`shadcn init` is a prerequisite, not an optional step.** `shadcn add`
cannot write anything without a `components.json`; run without one it stops
and prompts to create the file. `init` is also interactive by default — it
asks for a component library and a preset with arrow-key menus that cannot
be driven non-interactively — so scripted setups need both flags:

```bash
npx shadcn init -b base -p nova -y --css-variables
```

`-b base` is the CLI's own default and is what this registry expects: its
components are Base UI (`@base-ui/react`), per
[ADR-0001](docs/adr/0001-switch-component-library-to-base-ui.md). Passing
`-b radix` or `-b aria` installs a component library the registry's
components do not import.

**Add the font import.** The `theme` item owns the typeface
([ADR-0002](docs/adr/0002-registry-owns-the-font-token.md)) and declares
`@fontsource-variable/ibm-plex-sans` as a dependency, so the package
installs — but an `@import` has to precede every other rule in a stylesheet
and cannot be injected from a registry `css` block. Add it yourself, once,
at the top of your CSS entry:

```css
@import "@fontsource-variable/ibm-plex-sans";
```

Note the preset (`-p nova` above) also brings its own typeface and base
stylesheet. Pulling the `theme` item overrides `--font-sans`, so Plex wins,
but the preset's font package stays installed unless you remove it.

Components import `cn` from the `cn` package (`import { cn } from "cn"`),
which replaced `clsx` and `tailwind-merge` upstream in September 2026, and
declare it as a dependency (`cn@^0.5.0`, pinned to its minor because the
package is pre-1.0). Nothing in the registry depends on `clsx` or
`tailwind-merge` any more. The `utils` item stays and writes
`lib/utils.ts` as `export { cn } from "cn"`, so your own code that imports
`@/lib/utils` keeps working. Components no longer pull `utils` in, so adding
one leaves your `lib/utils.ts` alone.

**Moving a consumer that pinned an earlier tag:** pull items from this release,
then run upstream's migration, which moves the project from `clsx` and
`tailwind-merge` to `cn`:

```bash
npx shadcn@latest migrate cn
```

If your `lib/utils.ts` carries a custom `extendTailwindMerge` config, do not
re-pull `utils` over it; port the config to `cn/config` first (see the
[cn README](https://github.com/shadcn-ui/cn#custom-themes)).

(Do **not** add this repo under `components.json`'s `registries` field with
a bare `registry.json` URL — that field requires a `{name}`-templated
per-item endpoint, e.g. `.../{name}.json`, which this repo doesn't publish.
A bare-URL entry fails the CLI's config validation and breaks every shadcn
command in the consumer, not just registry pulls. If a stable alias is ever
needed, it belongs under `registries` as `"@frontend": {"url":
"https://raw.githubusercontent.com/deanjstone/frontend/main/r/{name}.json"}`
pointing at real per-item output from `shadcn build` — not the root
`registry.json`.)

The CLI writes files into the consumer's own `aliases.ui` / `aliases.lib`
paths — components become that project's code, editable locally like any
other shadcn component. Updates are pulled explicitly, not auto-synced.

**Gotcha for Vite consumers with a TS solution-style `tsconfig.json`**
(references-only, with the real `@/*` alias living in a referenced
`tsconfig.app.json`): the shadcn CLI only reads the root `tsconfig.json`
for alias resolution, not files it references. If the root config has no
`paths`, the CLI won't error — it silently writes files into a literal
`./@/` directory instead of `./src/`. Fix is adding `baseUrl`/`paths`
directly to the root `tsconfig.json` (redundant with the referenced
config, but required for the CLI to find it).

**Gotcha for Vite consumers using the default React ESLint config:**
`button` exports `buttonVariants` alongside the component, which
`react-refresh/only-export-components` rejects. That is upstream shadcn's
convention across the whole ecosystem, so the fix belongs in the consumer's
lint config rather than in the component — editing the vendored file would
be overwritten by the next `shadcn add`:

```js
{
  files: ['src/components/ui/**/*.{ts,tsx}'],
  rules: { 'react-refresh/only-export-components': 'off' },
}
```

## Versioning

Releases are cut automatically by semantic-release from Conventional
Commits, but only when the owner promotes a `main` commit to the `deploy` branch
([docs/deploy-branch.md](docs/deploy-branch.md)). A push to `main` runs checks
and releases nothing; there is no manual tagging step. The `Release` workflow
(`.github/workflows/release.yml`) runs on the push to `deploy`: a
`Test before release (component tests, design detector, registry drift, curve geometry gate, lint)` job first
(it asks `scripts/release/release-needed.sh` whether anything would ship and ends green with no test and no version
when nothing would; otherwise every step of `scripts/check.sh` plus the geometry gate, so nothing is tagged that
`pnpm check` would reject), then `Release`, which needs it, so a red test publishes no version. A `fix:` bumps the
patch, a `feat:` the minor, and a `BREAKING CHANGE:` footer the major. The
analyzer here (`conventional-changelog-angular` 8.3.1) does not read a `!` in
the subject, so a `feat!:` with no footer releases nothing; write both. Every release gets a `vX.Y.Z` tag on the promoted commit and a GitHub release whose notes
carry the history. The release commits and pushes nothing, so `main` gains no bot commit and the tag is always
in `deploy`'s history (design-system#203). `CHANGELOG.md` is frozen at 3.24.0, the last entry the old release wrote;
read the GitHub releases for anything newer.

An unpinned `shadcn add deanjstone/frontend/<item>` pulls whatever
`main` holds at that moment, so an `add` re-run can pull a breaking change
without warning. It has happened twice: `v2.0.0` replaced Radix with Base UI
([ADR-0001](docs/adr/0001-switch-component-library-to-base-ui.md)) and
changed the component API from `asChild` to a `render` prop; `v2.1.0` took
ownership of the typeface
([ADR-0002](docs/adr/0002-registry-owns-the-font-token.md)), which changes
how every consumer looks.

### Pinning to a release

**A tag is the promoted commit on `deploy`.** The release stamps nothing and commits
nothing (design-system#203, the owner's decision of 9 Nov 2026 on argus-config#1259), so the
tag's `registry.json` and `r/*.json` are exactly what `main` held at that SHA, and the tag is
reachable from `deploy`. Pin to it: `git merge-base --is-ancestor <tag> origin/deploy` holds
for every release made from this one on.

**The named item comes from the tag; its in-repo dependencies still float.** An item's
`registryDependencies` entries are written without a ref (`deanjstone/frontend/utils`), and
shadcn does not carry a ref across dependencies ("Refs are not inherited across
dependencies. If a dependency should be pinned, include its own ref." [GitHub
Registries](https://ui.shadcn.com/docs/registry/github), read 2026-10-08). So
`add deanjstone/frontend/sidebar#v3.25.0` fetches `sidebar` from the tag and its
dependencies from `main` (the table below measured this on a tag with unversioned
dependencies). Releases from `v3.1.0` to `v3.24.0` stamped `#<tag>` into each entry and
did pin them (design-system#65); that stamp-and-restore commit pair is retired, and a tag
no longer does that. Entries from other registries are never rewritten. Only `theme`,
`utils`, `use-mobile`, `highlighter`, `link-pill-core` and `link-pill-css` have no
registry dependencies; almost every other item depends on at least `utils`.

**For a reproducible install, pin the tag and review what the CLI writes.** `shadcn add`
copies source into the consumer's repo, so the committed code is the real pin. After an `add`
from a tag, read the diff of the dependency files (`utils`, `button`, ...) as you would any
dependency upgrade, or add only the leaf items listed above. Do not rely on `#ref` for a
dependency: the dependency's `main` copy wins (see the table below).

**What a release does.** `Release` runs `semantic-release` on a checkout of the tip of
`deploy`. It picks the version from the commits since the last tag, creates the `vX.Y.Z` tag on that
commit, which the gate proved is the promoted SHA, and publishes the GitHub release.
It pushes no branch (`.releaserc.json` has no plugin that commits), so a promotion's
tag is the only thing it adds, plus semantic-release's own
`refs/notes/semantic-release-*` ref, which is not a branch. Two promotions in quick
succession release in order (the `release` concurrency group queues, never cancels); a run whose
tested SHA is no longer the tip of `deploy` releases nothing, and the newer promotion's run
covers every commit since the last tag.
The `Registry output current` check runs on `main` and pull requests only.

**Option 1: a `#ref` on the item address (preferred).** shadcn 4.x accepts
a branch, tag or commit SHA after `#`:

```bash
npx shadcn add deanjstone/frontend/button#v3.0.0
npx shadcn add deanjstone/frontend/button#645db462137cf60b416d8ee4fc753146c5e0b51d
```

A tag works for every release. A full 40-character SHA is the most
reproducible ref and skips the CLI's `git ls-remote` lookup. Both work
without a `components.json` `registries` entry.

**Option 2: the `r/` alias.** `r/` holds per-item output from
`shadcn build`, one self-contained JSON per item with the source inlined.
A tag includes `r/`, so a tagged raw URL serves the item exactly as it
shipped. Register the alias once in the consumer's `components.json`:

```json
{
  "registries": {
    "@frontend": {
      "url": "https://raw.githubusercontent.com/deanjstone/frontend/v3.0.0/r/{name}.json"
    }
  }
}
```

then add by alias:

```bash
npx shadcn add @frontend/theme @frontend/button
```

This is the `{name}`-templated endpoint the warning above refers to, the
thing a bare `registry.json` URL cannot be. `r/` exists from `v2.2.0`
onward.

**Renamed from `design-system`.** The alias is a name you choose in your own
`components.json`, so an existing `@design-system` entry keeps working: its
`raw.githubusercontent.com/deanjstone/design-system/<tag>/r/...` URL redirects to
this repo, and the tags are unchanged. Rename the key to `@frontend` and the URL to
`deanjstone/frontend` the next time you edit it, and write `deanjstone/frontend/<item>`
for direct adds. Items already vendored list `deanjstone/design-system/<item>` in their
`registryDependencies`; the CLI resolves those through the same redirect.

**The GitHub address and the version it needs.** `npx shadcn add <owner>/<repo>/<item>#<tag>` reads this
repo's root `registry.json` as a source registry, so it needs no `r/` output and no alias. Two floors apply:

| `shadcn` version | What it adds |
|---|---|
| `4.10.0` | GitHub registries: `owner/repo/item` from a public repository |
| `4.19.0` | Private repositories: the CLI tries anonymous access, then reads through `gh` with your stored login, or with `GH_TOKEN` / `GITHUB_TOKEN` where `gh` is not installed |

Checked on 25 Nov 2026 in a scratch app against this repo: `shadcn add deanjstone-hl/frontend/use-mobile#v3.28.0`
installs `src/hooks/use-mobile.ts` on `4.10.0`, `4.19.0` and `4.23.0`; `deanjstone/frontend/use-mobile#v3.28.0`
(the old owner, through the redirect) installs the same file; `use-theme-preference#v3.28.0` pulls its
`registryDependencies` entry (`deanjstone/frontend/theme-preference`) through the redirect too; and
`shadcn registry validate deanjstone-hl/frontend` reports `Registry is valid` for the root `registry.json` (107 items).
The consumers pin `^4.19.1`, above both floors. This repo is public, so those checks read it anonymously. The private
path was checked on a private scratch registry the same day: on `4.19.0` and `4.23.0` with `gh` logged in the CLI printed
`Using gh credentials.` and created the file; with no `gh` and no `GH_TOKEN`, or on `4.18.0`, it refused. A token for CI
needs Contents read-only on the repository.

**Which to use.** The two forms pin the same thing: the named item, at the
tag. Their dependency behaviour is identical. Use `#ref` by default. It is
the form shadcn documents, it needs no config, and it can name a commit
SHA. Use the alias when a project wants one place to set the version: it
upgrades every later `add` by bumping a single URL. Use the unpinned
shorthand only to track `main` on purpose.

**What this means in practice.** `shadcn add` copies source into the
consumer's repo, so the code you commit is the real pin. A later `add`
changes nothing until it runs. Review its diff the way you would review any
dependency upgrade. On a tag from `v3.1.0` to `v3.24.0`, files pulled in as
dependencies come from the same tag, because those releases stamped it in. On any
other tag, including every release from design-system#203 on, dependencies come from
`main`, and passing each one with its own `#ref` in the same command does **not** work
around that: the dependency's `main` copy wins (see below). For a fully reproducible
install, pin and add only leaf items (`theme`, `utils`, `use-mobile`), or inspect
the dependency files the CLI writes.

Verified 2026-10-08 with `shadcn@4.21.4` against a tag whose dependencies were
unversioned (the form every tag has again from design-system#203), in a fresh Vite app with `init -b base -p nova`. Every `fetch` and `git` call the CLI made was logged
(design-system#59):

| Command | Named item from | Dependencies from |
|---|---|---|
| `add deanjstone/frontend/sidebar#v2.5.1` | `645db46` (the `v2.5.1` tag) | `main` HEAD, all 8 |
| `add deanjstone/frontend/button#645db46…` (full SHA) | that commit, no `ls-remote` for it | `utils` from `main` HEAD |
| `add @frontend/sidebar` (alias at `v2.5.1`) | `v2.5.1/r/sidebar.json` | `main` HEAD, all 8 |
| `add …/separator#v2.3.0` | `v2.3.0` | — |
| `add …/sidebar#v2.5.1 …/separator#v2.3.0` (either order) | — | `separator` from `main` |

Tags before `v2.5.0` behave worse. Their dependencies are bare names such
as `utils`, which resolve to **upstream shadcn's** items, not this
registry's (design-system#57).

`r/` is generated. Rebuild it with `npx shadcn build --output ./r` whenever
`registry.json` or a source file changes. CI rebuilds it and fails on any
difference, because a stale `r/` would serve a tag's consumers older code
than the tag claims.

## LinkPill

Renders a Markdown link as a pill that shows what it points at. Four items,
no npm dependencies (see `GLOSSARY.md` for the terms and
[ADR-0003](docs/adr/0003-scheme-first-link-kind-detection.md) for how the
kind is detected):

| Item | Use it for |
|---|---|
| `link-pill-core` | `classify(href)`, per-kind attributes and the `Enricher` type. Pure and ES5-safe. |
| `link-pill-html` | `renderLinkPill(link, options) → string` for server-side renderers. Depends on the core only. |
| `link-pill` | The React shell: `LinkPill`, plus `LinkPillEnricherProvider`. |
| `link-pill-css` | The one stylesheet both shells use. Installs to `link-pill.css` at the project root (move it where you like) — import it once. |

```bash
npx shadcn add deanjstone/frontend/link-pill        # React
npx shadcn add deanjstone/frontend/link-pill-html   # HTML strings
```

```tsx
// React: use it as the Markdown renderer's anchor component.
<LinkPillEnricherProvider enrich={enrich}>
  <Markdown components={{ a: (props) => <LinkPill variant="chip" {...props} /> }} />
</LinkPillEnricherProvider>
```

```ts
// HTML, e.g. a marked renderer; `legacy: true` for Safari 9.
renderLinkPill({ href, label: text }, { variant: "inline", legacy: false })
```

- `variant` is `"inline"` (prose: glyph plus tinted underline, wraps) or
  `"chip"` (chat: tinted chip, label cut at about 24ch by CSS; the full label
  stays in the DOM as the accessible name and `title`).
- A pill renders at once from the href and link text. The optional
  **Enricher** (`(link) => Promise<{ label?, avatarUrl?, title? } | null>`)
  upgrades Mentions and URL Links afterwards; results are cached per href, and
  a `null` or a failure leaves the pill as rendered (a failure is logged with
  `console.error`). The HTML shell is synchronous, so it takes an
  already-resolved `enrichment` option instead.
- A chip is followed by a word joiner (U+2060) so the punctuation after it
  cannot be stranded on its own line.
- Hrefs of kind None render as an ordinary `<a>`. A `javascript:`, `data:` or
  `vbscript:` href, and the streaming placeholder `streamdown:incomplete-link`,
  render the label as text. The HTML shell escapes every label and attribute,
  but still sanitise its output after rendering.
- Link kinds that need allowlisting in a sanitiser: schemes `geo:` and
  `mention:`, plus the `link-pill*` classes, the `svg`, `path`, `img` and `span`
  elements and their `viewBox`, `d`, `aria-hidden` and `focusable` attributes.

## Agent-interface items

`trace`, `code-block` and `questionnaire` are shadcn's October 2026 agent-interface
components (see the [shadcn changelog](https://ui.shadcn.com/docs/changelog)),
in `base-nova` style with the upstream API unchanged. They complete the
Conversation set for an agent turn:

| Item | Use it for | Pulls in |
|---|---|---|
| `trace` | One line per agent step (reasoning, tool call, source, plan, subagent run), with `running`, `error` and `pending` states and nested, expandable detail | `collapsible`, `code-block` |
| `code-block` | Code, terminal output, logs and diffs: line numbers, wrap, highlighted lines, and `size="sm"` for tool output inside a `trace` | `button`, `use-highlighted-code` → `highlighter` (`shiki`) |
| `questionnaire` | Asks the person to clarify before the agent continues: single and multiple choice, freeform, skippable | `button`, `@shadcn/react@^0.3.1` |

```bash
npx shadcn add deanjstone/frontend/trace#v3.0.0
npx shadcn add deanjstone/frontend/code-block#v3.0.0
npx shadcn add deanjstone/frontend/questionnaire#v3.0.0
```

Syntax highlighting is optional and lives in `use-highlighted-code`; add
languages to the `languages` map in the copied `highlighter.tsx`. `trace`
declares `code-block` because a tool step's output belongs in one; it does not
import it. `shimmer` (the running title) and `scroll-fade-*` come from
`shadcn/tailwind.css`, which `shadcn init` already imports, as for
`attachment` and `message-scroller`.

**Consumers that should adopt them:** `argus` `apps/ops-hub-web`. Adoption is a follow-up issue per consumer, not part of
adding the items.

## Adding a new component

1. Add the source file(s) under `registry/base-nova/ui/` (or `registry/lib/`
   for non-UI code).
2. Add a matching entry to `registry.json` — `name`, `type`
   (`registry:ui` / `registry:lib` / `registry:hook`), `files`, and any
   `registryDependencies` / `dependencies`.

   A `registryDependencies` entry naming another item in this repo must use
   its full address, `deanjstone/frontend/<name>`. A bare name such as
   `button` means shadcn's built-in item, not ours, so the consumer silently
   gets upstream's copy (design-system#57). Write it without a ref: no release
   stamps one in any more (design-system#203).

   Pin a pre-1.0 npm dependency to its minor, e.g. `@shadcn/react@^0.3.1`,
   so a re-run `shadcn add` cannot pull a breaking release.
3. Add its test under `test/`, run `pnpm check` once before marking the PR ready, and push small
   Conventional Commits on a branch off `origin/main` with a draft PR from the first push; merge with
   `gh pr merge --rebase --delete-branch` once every check on the head SHA is green (no direct push to
   `main`). `main` is not a release: the owner promotes it to `deploy`
   ([docs/deploy-branch.md](docs/deploy-branch.md)).

## Themes

The `theme` item carries six themes (`default`, `t3-chat`, `grove`, `ocean`,
`ember`, `iris`), each in light and dark, selected by `data-theme` plus the
`dark` class; no attribute means Ocean. The `theme-preference` lib stores the
visitor's choice. Token map, selection rules and the pinned T3 source are in
[DESIGN.md](DESIGN.md#themes). After editing `theme/themes.json`, run
`pnpm build:theme` to regenerate `theme/tokens.css`, `registry.json` and `r/`.

### Optional DS theme and font

Two opt-ins sit beside the six themes. Neither changes anything for an app that does
not install them: the default theme, the default font and the default theme list are
as they were.

| Option | Item | Switch | Stored (per device) |
|---|---|---|---|
| DS look: tinted-neutral scale, hairline edges, sheen on raised surfaces, squircle corners (where the browser has `corner-shape`), recessed wells; light and dark | `theme-ds` | `data-theme="ds"` | `ds-theme` cookie and `localStorage`, with the other themes |
| Aspekta (UI) and Azeret Mono (code) | `font-aspekta` | `data-font="aspekta"` (no attribute for the default) | `ds-font` cookie and `localStorage`, separate from the theme |

To offer them in an app:

```bash
npx shadcn add deanjstone/frontend/theme-ds deanjstone/frontend/font-aspekta
npx shadcn add deanjstone/frontend/use-font-preference
bash scripts/install-ds-fonts.sh        # downloads the original font files into public/fonts/ds
```

then import the stylesheet once (`@import "./ds-fonts.css";`, from `src/` as `font-aspekta`
installs it), put `fontInitScript()` next to `themeInitScript()` in `<head>`, and pass the
choices to the settings page:

```tsx
const { preference, setTheme, setMode } = useThemePreference()
const { font, setFont } = useFontPreference()
<AppearanceSection preference={preference} onThemeChange={setTheme} onModeChange={setMode}
  themes={ALL_THEMES} font={font} onFontChange={setFont} />
```

Leave `themes` and `font` out and the section lists the six themes and no Font group.

**Fonts.** The files are SIL OFL 1.1 and are the unmodified originals from each font's own
repository (`ivodolenc/aspekta` at `@aspekta/fonts@2.100`, `displaay/Azeret` at a pinned
commit), listed with their sha256 in `registry/fonts/fonts.json`. Aspekta has a Reserved
Font Name, so they are never renamed, subsetted or converted. They are not in
`registry.json`: the shadcn CLI reads files as UTF-8 text and would corrupt a binary, so
`install-ds-fonts.sh` downloads them and checks each sha256 first (`DS_FONTS_SOURCE_DIR` copies
them from a checkout offline). The licence notices ship with the item, into `public/fonts/ds`.
The stylesheet's `src` urls assume `public/` is served from the site root.

Proof: `node docs/ds-theme/screenshots.mjs` (WebKit, 390 and 320 px, every theme, mode and
font, plus the settings flow and its persistence). Rationale:
[ADR-0005](docs/adr/0005-optional-ds-theme-and-font.md).

## Migrating from v2 to v3

v3.0.0 changes how every app looks once its `theme` item is re-added, so it is
a major. The registry shipped most of it in v2.12.0 by accident (a `feat:`
merge subject); v3.0.0 adds the layout blocks and marks the break. Nothing
changes in an app until it re-runs `shadcn add` against `#v3.0.0`.

```bash
npx shadcn add deanjstone/frontend/theme#v3.0.0 -o
npx shadcn add deanjstone/frontend/app-shell#v3.0.0
```

| Area | v2 | v3 | What to do |
|---|---|---|---|
| Themes | One chroma-zero palette | Six themes (`default`, `t3-chat`, `grove`, `ocean`, `ember`, `iris`), each light and dark; no `data-theme` means **Ocean** | Set `data-theme` on `<html>` to keep another palette; `-o` overwrites files the CLI wrote earlier, so diff any hand edits first |
| Type scale | Tailwind's sizes | T3's scale: `text-xs` is 13px/17px (was 12px/16px), `text-xl` 21px, `text-2xl` 26px; `text-2xs` and `text-3xs` are new | Swap `text-xs` for `text-2xs` where the old 12px is wanted |
| Glass tokens | none | `--glass-surface`, `--glass-fallback`, `--glass-blur`, `--glass-opacity`, `--glass-saturation`; `surface-glass`, `dialog-glass`, `dropdown-glass` utilities | Nothing, unless you want the glass recipe |
| Theme preference | Per-app | `theme-preference` lib (cookie `ds-theme` on a configurable parent domain, `localStorage` fallback, no-flash `themeInitScript()`) and the `use-theme-preference` hook | Put `themeInitScript()` in `<head>` |
| Layout blocks | none | `app-shell`, `app-switcher`, `page-header`, `empty-page`, `settings-page`, `login`, `card-list`, `issue-row`, `filter-builder`, `grouped-list`, `file-diff`, plus the `nav-link` lib | Optional; add the ones you want |
| Radius | `0.625rem` | `0.625rem`, unchanged | Nothing |

Rules for the blocks and the full token map are in
[DESIGN.md](DESIGN.md#layout-blocks). A pin on a consumer's `@frontend`
alias stays where it is until its owner moves it.

## Tests

`pnpm install && pnpm test` renders registry sources in jsdom with Vitest
(`test/`); the `Test` workflow runs it, `pnpm lint` and the conditional geometry gate on every PR
and every push to `main`, and the `Release` workflow's `Test before release` job runs all three on every
promotion. The dev dependencies exist only for the checks and demos — nothing here is built or published.

**Before a push: `pnpm check`.** It runs the four CI checks locally, in order:
`pnpm test`, the pinned impeccable detector over `registry/` and `theme/`, a
`shadcn build` that fails if `r/` changed (or gained an untracked file), and
`pnpm lint` (oxlint).
Commit first, so `r/` is judged as it will be pushed. A pass prints one line,
`check: pass <short sha>`; paste it into the issue. A failure names the step
(`FAIL at step 3/4 ...`) and exits non-zero. A stale `r/` is fixed by
regenerating it (`pnpm build:registry`, which runs `npx shadcn@4.19.1 build --output ./r`
and writes the stamp) and committing the result, never by hand-merging. No git hook runs it: it is a step you run, and CI
is the backstop. Its pins live in `scripts/check.sh`; `test/check-script.test.ts`
fails if they drift from `.github/workflows/design.yml` or `package.json`.
The script resolves the repo root from its own path, so `bash /path/to/frontend/scripts/check.sh`
checks this tree from any directory (another repo's pre-push gate calls it that way). The gate takes the host-wide heavy lock ([argus-config/1506](https://github.com/deanjstone/argus-config/issues/1506)): `scripts/check.sh` re-runs itself through `scripts/heavy-lock.sh`, so only one full check runs at a time on a host, whichever thread or CI job starts it, and it also waits while memory `some avg60` is 10 or more. A queued run prints `waiting for the host lock` and starts when the holder ends; it exits 75 without running once `HEAVY_LOCK_TIMEOUT` (3600 s) passes. `scripts/heavy-lock.sh` and `scripts/heavy-lock.lock` are vendored byte-for-byte from argus-config (its `scripts/sync-heavy-lock.sh` rewrites both; never edit them here), and `test/heavy-lock.test.ts` fails on a copy that no longer matches its lock.

**Workflows are hardened** ([frontend#236](https://github.com/deanjstone-hl/frontend/issues/236)):
- **Pinned actions.** Every third-party action is `owner/repo@<40-char commit SHA> # <version tag>`.
  `.github/dependabot.yml` opens one weekly pull request that moves the SHAs and the tag comments together.
  To bump by hand, resolve the tag to its commit (`gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`; dereference an annotated tag) and change every file that uses it.
- **Least permissions.** Each workflow starts with `permissions: {}` and each job names what it needs: `contents: read`
  everywhere, except the `Release` job, which also writes `contents`, `issues` and `pull-requests` for semantic-release, and the drift canary, which writes `issues` to file a Repair brief.
  A checkout sets `persist-credentials: false`, since nothing here pushes with its token.
- **A hermetic push gate.** `test.yml` fetches nothing but its install (`pnpm install` and the pinned Chromium download) and compares against no
  live upstream; it has no `curl`, `gh api` or `npx` step. A comparison against a live upstream or a remote page belongs in a scheduled workflow, as the `Drift canary` does (`drift-canary.yml`: schedule and manual only, never a push or pull request).
- **CODEOWNERS** (`.github/CODEOWNERS`) names the owner for `.github/` and `scripts/`.

`test/workflow-hardening.test.ts` fails on an unpinned action, a missing `permissions`, a checkout that keeps its credentials, a push gate that
fetches, or a missing Dependabot or CODEOWNERS entry. `readme-guard.yml` carries these changes ahead of argus-config's copy, which has to adopt them.

The browser-side geometry check is separate: `pnpm gate:geometry` (see
[Curve-geometry gate](#curve-geometry-gate)).

### Stamps: generated output and goldens

Generated output and goldens carry a stamp ([frontend#234](https://github.com/deanjstone/frontend/issues/234)),
so a check fails when they change without the generator that produced them. A stamp is
`stamps/<name>.json`: the hash of the generator's files, the hash of its inputs, the tool pins
and the hash of the output. It lists only the files the generator imports, never a whole
directory. `pnpm check` verifies every stamp in its first step (`test/stamps.test.ts`) and fails
when a stamp is missing, the output bytes differ from it, or the generator, an input or a
pin moved without a regenerate. The message names the file and the regenerate command.

| Stamp | Covers | Regenerate with | Pins |
|---|---|---|---|
| `registry-output` | `r/`, from `registry.json` and the sources it lists | `pnpm build:registry` | shadcn |
| `theme` | the generated region of `theme/tokens.css` and the `theme` and `theme-ds` items of `registry.json`, from `theme/themes.json` | `pnpm build:theme` | none |
| `links-module` | `registry/lib/links.ts`, from `registry/links/links.json` | `node scripts/links/generate.mjs` | none |
| `link-pill-snapshot` | `test/__snapshots__/link-pill-html.test.ts.snap` | `pnpm update:snapshots` | vitest |
| `geometry-aria` | the aria baselines in `scripts/geometry-gate/aria/` | `pnpm gate:geometry --update-aria` | playwright-core, Chromium |
| `ui-sdk-vendor` | `vendor/ui-sdk/`, copied from the installed `@ui-sdk` packages | `pnpm vendor:ui-sdk` | `@ui-sdk/core`, `@ui-sdk/react` |

Rules:

- **Only a generator writes a stamp.** The stamp writer is imported by the generator scripts and
  nothing else (the tests fail on any other caller), and no command stamps what is already on
  disk. A stamp's hashes must also match its own file lists, so editing a hash by hand fails the
  check. Hand edits to `r/` or a baseline fail it too.
- **A code change that disagrees with a golden is a test failure, never a reason to re-stamp.** The
  code under test is not an input to a golden's stamp. Run `pnpm update:snapshots` or
  `pnpm gate:geometry --update-aria` only when the oracle itself changed (its fixtures, the
  harness or a tool pin), and review the diff it makes.
- A partial `pnpm gate:geometry --update-aria` (with `--view` or `--url`) does not stamp, and the
  gate refuses to stamp under a Chromium other than the one `playwright-core` pins.
- After a rebase that conflicts in `stamps/` or `r/`, run the generator again; never hand-merge.
- `docs/assets/` screenshots are evidence, not baselines, and are not stamped.

The idea comes from [rauchg/xeet](https://github.com/rauchg/xeet)'s `golden-stamp.mjs`, a
reference only: no code is copied (GitHub detects no licence there).

**Gotcha: Base UI parts with default children.** `Select.Icon`,
`Combobox.Icon` and `NavigationMenu.Icon` default their children to `▼`
(also `Combobox.ItemIndicator` `✔️`, `Combobox.Clear` `x`). `render` swaps
only the element, so the glyph lands inside whatever you render — a lucide
svg appends it as a stray text node. Give these parts an explicit child,
`{null}` if the rendered element supplies its own (design-system#50).

### Repair briefs: the issue shape for automated failures

Every automated failure this repo files (the [drift canary](#drift-canary-upstream-changes-filed-as-repair-briefs),
[#237](https://github.com/deanjstone/frontend/issues/237), and the [upstream-follow job](#upstream-follow-trying-a-moved-pin-before-anyone-lands-it),
[#238](https://github.com/deanjstone/frontend/issues/238)) goes through one helper, so a worker
gets everything from the issue alone. It also backs `.github/ISSUE_TEMPLATE/repair-brief.md`
for a brief filed by hand.

```sh
node scripts/repair-brief/repair-brief.mjs --key "shadcn pin drift" \
  --run-url "$RUN_URL" --changed "shadcn 4.19.1 -> 4.20.0" \
  --failing-check "pnpm check, step 3/4" --output-file check.log \
  --repro "pnpm install" --repro "pnpm check"
```

- **Shape.** Sections `Run`, `What changed`, `Failing check`, `Output` (fenced; the tail is
  kept if it runs past 50,000 characters) and `Repro` (the commands, one per line). The same
  headings are in the issue template, and a test fails if they drift.
- **Dedupe.** The title is `Repair brief: <key>`. The helper searches open issues for that exact
  title: it comments on the one it finds, or creates one. Keep the key stable (no run id,
  timestamp or moving version in it), or each run files a new issue. `--repo owner/name` sets the
  repo; in Actions the `GITHUB_TOKEN` needs `issues: write`, and `GH_TOKEN` must be set for `gh`.
- **Labels.** Always `mode:afk` and `type:bug`, and never a `wave:` label. The orchestrator's wave
  check places the wave (owner, 16 Nov 2026 20:00 AEDT). The CLI has no flag to add a label, and
  `test/repair-brief.test.ts` asserts that no `wave:*` label is applied.

The shape and dedupe come from [rauchg/xeet](https://github.com/rauchg/xeet)'s
`upstream-watch.yml` and `sync.yml`. It is Apache-2.0; the helper is written for this repo and
copies no code.

### Drift canary: upstream changes, filed as Repair briefs

A scheduled workflow ([`drift-canary.yml`](.github/workflows/drift-canary.yml), daily at 08:17
AEDT) notices when something this registry copies from moves, and files one Repair brief
([frontend#237](https://github.com/deanjstone/frontend/issues/237)). Three probes, all in
`scripts/drift-canary/canary.mjs`:

| Probe | Compares | Brief key |
|---|---|---|
| `shadcn-pin` | the pinned `shadcn` CLI with npm's `latest` | `shadcn pin drift` |
| `impeccable-pin` | the pinned `impeccable` detector with npm's `latest` | `impeccable pin drift` |
| `upstream-sources` | shadcn's published `base-nova` items (`ui.shadcn.com/r/styles/base-nova/<name>.json`) with the hashes in `scripts/drift-canary/upstream-baseline.json` | `upstream shadcn source drift` |

```sh
node scripts/drift-canary/canary.mjs --dry-run   # what each probe sees now; files nothing, writes nothing
node scripts/drift-canary/canary.mjs record      # re-baseline the upstream hashes, then commit the file
```

- **Threshold.** The same drift must show on 2 consecutive runs (`--threshold`) before a brief is
  filed, and a probe that goes clean in between starts over, so a flapping upstream files nothing.
  Once filed, the same drift is not filed again; a drift that moves to a new value (a newer
  `shadcn`, another item changing) comments on the open brief, because the key holds no version.
  The streak is a small JSON file the workflow keeps in the Actions cache; a lost cache delays a
  filing by one threshold and never files twice (the helper dedupes on the title).
- **Pins go to the follow job.** A `shadcn-pin` or `impeccable-pin` drift that reaches the
  threshold is not filed as a plain brief: `--followups <file>` hands it to the
  [upstream-follow job](#upstream-follow-trying-a-moved-pin-before-anyone-lands-it), which tries
  the bump first. Without `--followups` (a local run) a pin drift is filed as before.
- **Broken probe.** A probe that cannot reach its upstream (an `error`, not a drift) files its own
  brief, `<probe> probe broken`, after the same threshold, so a silent canary is noticed.
- **Baseline.** `upstream-baseline.json` is "upstream as last reviewed", a sha256 over each item's
  files and dependencies. It covers the 62 items in `registry/base-nova/ui/` that shadcn publishes;
  the registry's own (`chart-lazy`, `data-table`, `date-picker`, `graph-3d`, `link-pill`,
  `page-transition`) have no upstream and are left out. Many of the 62 are rewritten here (the
  UI SDK ones, for a start), so a drift means "read upstream's change", not "ours is wrong".
  Run `record` only after a worker has read what moved.
- **Where it runs.** GitHub Actions cron, not a homelab timer: the repo is public, so a
  GitHub-hosted runner costs no minutes (the billing note in argus-config's `lint.yml` is about
  private repos), the run is a few seconds of Node with no install, and a timer would tie the
  canary to one host being up. It runs on `schedule` and `workflow_dispatch` only, with
  `contents: read` and `issues: write`. A quiet day is a few seconds of Node; the install and the
  check below run only on a day a pin moved.
- **Tests.** `test/drift-canary.test.ts` runs the probes, the threshold and the brief offline,
  against npm and upstream responses recorded on 25 Nov 2026 in `test/fixtures/drift-canary/`.
  Nothing in `pnpm check` touches the network for this.

### Upstream follow: trying a moved pin before anyone lands it

When the [drift canary](#drift-canary-upstream-changes-filed-as-repair-briefs) sees `shadcn` or
`impeccable` move past its pin, a job in the same workflow
([frontend#238](https://github.com/deanjstone-hl/frontend/issues/238),
`scripts/upstream-follow/follow.mjs`) tries the bump in the runner's throwaway checkout and files
what it found. It pushes nothing.

1. **Bump.** The new version replaces the pin in every file that writes it: `scripts/check.sh`,
   `.github/workflows/design.yml` and `release.yml`, and for shadcn `scripts/stamp/pins.mjs` and
   the README's regenerate line. It is all or nothing, and it fails if a file no longer holds the
   pin, so a half bump never reaches the check. The target must be a plain version.
2. **Regenerate.** A new shadcn runs `pnpm build:registry` (`r/` and `stamps/registry-output.json`);
   a new impeccable writes no output, so nothing is regenerated.
3. **Check.** `pnpm check` runs against the result.
4. **File.**
   - **Green:** an issue `Upstream follow: bump <pkg> <from> -> <to>`, labelled `mode:afk` and
     `type:build`, with the run link, what the bump changes (`git status`), the check output and
     the command that lands it. A newer version of the same package files its own issue; the same
     bump again comments on the open one.
   - **Red:** a [Repair brief](#repair-briefs-the-issue-shape-for-automated-failures) under the
     probe's key (`shadcn pin drift`, `impeccable pin drift`), with the failing step and its
     output. A regenerate or bump that fails is red too; a failed `pnpm install` is the runner's
     fault, so it fails the run and the canary hands the bump over again next time.

Neither issue has a `wave:` label; the orchestrator's wave check places it.

```sh
node scripts/upstream-follow/follow.mjs apply shadcn 4.23.0   # what a worker runs to land a green issue
pnpm check
```

- **No auto-push.** 3 reds on `main` in a day pause the repo (`trunk-health.sh`), and an
  upstream release that broke the check would put that risk on the repo it came from. Landing a
  bump is a worker's commit with `pnpm check` and `Refs`; auto-push stays a later decision for the owner.
- **No token near the new release.** The workflow runs three steps: the canary (with the token),
  the trial (no `GH_TOKEN`, and the script strips every token from the environment it passes on), then
  the filing (with the token). The new upstream's code runs only in the middle one.
- **The trial rewrites the tree, then discards it** (`git checkout`, `git clean` of `r/` and `stamps/`),
  so `trial` refuses outside CI unless you pass `--in-place`. Use `apply` locally, never `trial`.
- **Tests.** `test/upstream-follow.test.ts` runs everything offline: a fake `exec`, a fake `gh`, and
  the npm answers from `test/fixtures/drift-canary/`. `test/fixtures/upstream-follow/` holds the
  outcomes of two real local trials on 25 Nov 2026 (shadcn 4.19.1 -> 4.23.0 and impeccable 3.6.1 ->
  4.11.0, both green). Its pin tests use versions no real pin can reach: the first real trial failed
  step 1 because they hard-coded the live targets.
- The idea is from [rauchg/xeet](https://github.com/rauchg/xeet)'s `sync.yml`, a reference and not a
  dependency. Nothing is copied from it; the job is written for this repo.

## Text size

The registry follows iOS Larger Text ([#150](https://github.com/deanjstone/design-system/issues/150)):
the root font derives from `-apple-system-body`, so rem text and spacing scale. A
consumer can rely on **200% at a 320px viewport with no sideways scroll and no
clipped control**; past that, up to the top of iOS Larger Text (310%), text keeps scaling and
the page scrolls vertically, never sideways.
The AppShell's chrome stops growing at about 150%, then its tabs go icon-only
(labels stay `sr-only`), and text fields stay at 16px at every size. The rules and
the checks that hold them are in `DESIGN.md` § Text size and the curve-geometry
gate below.

**How it is switched on** ([#163](https://github.com/deanjstone/design-system/issues/163)).
Two parts, and a consumer needs both:

- the `theme` item carries one rule, guarded to iOS,
  `html { font-size: calc(100% * var(--dt-scale, 1)) }`;
- the `app-html-head` snippet's script measures the system body font and sets
  `--dt-scale` on `<html>`: 1 at the default Larger Text size (a 17px body), so
  nothing changes there, and about 1.5 at the 150% step.

**Consumers pick this up when they re-add the block**: `npx shadcn add
deanjstone/frontend/theme` for the rule, and copy the new `<script>` from
`app-html-head.html` into `<head>`. A consumer that re-adds only the theme keeps
today's text size (an unset scale is 100%); one that adds only the script does
nothing either. Nothing changes off iOS: macOS Safari also has `-apple-system-body`
(at 13px), so the rule and the script both test for the iOS-only `-webkit-touch-callout`.

Chromium cannot render Dynamic Type, so the gate and the unit tests prove the
default (root 16px, scale unset off iOS; scale 1 gives 100%) and the maths of the
scale, not WebKit. The device check is [#141](https://github.com/deanjstone/design-system/issues/141).
**If it fails, revert the one commit that enabled this** (`feat: follow iOS Larger
Text through a guarded root font and a measured scale`).

## Wrap by default

[design-system#205](https://github.com/deanjstone/design-system/issues/205). Text in a card, a row or a diff wraps: nothing is
cut off with an ellipsis and nothing scrolls sideways. The rule is `wrap-anywhere` (`overflow-wrap: anywhere`), which lets
a long token with no spaces (a path, a branch, a hash) break so it cannot widen its container. `truncate` and `line-clamp`
are for one-line navigation and chrome only: the app bar, tab labels, the app switcher, select triggers and fixed-height
buttons.

What changed for a consumer who updates, with no opt-in:

- `ItemTitle` and `ItemDescription` no longer clamp to one and two lines.
- `card-list`: the group heading, the card title and the branch wrap. The card still clips what it holds and stays
  `min-h-11`, and the `title` tooltip on the title is gone because nothing is cut.
- `issue-row`: the title wraps (the row is `min-h-11`, not `h-11`, so it grows), and so do the id and the project chip.
  The `title` tooltip on the title is gone.
- `grouped-list`: the group header's label wraps and the header is `min-h-11`; the display menu's property labels wrap.
- `filter-builder`'s checklist labels and `attachment`'s name and description wrap.
- New `file-diff` block, below.

To cut one component's text again, pass `truncate` or `line-clamp-N` in its `className` (or in the slot's selector, for
example `[&_[data-slot=card-list-item-title]]:truncate`): the defaults changed, what you can do did not.

Every `truncate` and `line-clamp` still in `registry/base-nova`, with its reason. `test/wrap-default.test.ts` is this list:
a new one anywhere else fails the test.

| File | Kept | Why |
|---|---|---|
| `blocks/app-shell.tsx` | 2 | Tab bar labels and the More tab: one-line navigation, icon-only past 200% |
| `blocks/app-switcher.tsx` | 4 | The app name in the header and the trigger, and each app's name and description in the switcher menu |
| `blocks/filter-builder.tsx` | 2 | The value button's summary (a select trigger) and an active-filter chip's label (a fixed-height button) |
| `ui/code-block.tsx` | 1 | The header title: the one-line chrome bar above the code, beside its action buttons |
| `ui/select.tsx` | 1 | The select trigger's value |
| `ui/sidebar.tsx` | 2 | Sidebar menu button labels: navigation |
| `ui/trace.tsx` | 1 | The trace line's title: a one-line collapsible trigger |

## AppShell: the page title on a phone

A phone header shows the app name, and `PageHeader hideOnPhone` hides the page's
own title visually, so a screen can say nothing about which view it is
([frontend#208](https://github.com/deanjstone-hl/frontend/issues/208): 7 of the 26 audited screens).
`AppShell` takes one opt-in prop, `pageTitle`:

```tsx
<AppShell appName="Reader" apps={apps} currentAppId="reader" sections={sections} pageTitle="Library">
  <PageHeader title="Library" hideOnPhone actions={<Button>Add</Button>} />
  ...
</AppShell>
```

- **Use it** when a screen's title would be hidden on a phone, or the app name is
  all the header says. Leave it off, and the header is exactly as before, where
  the page's own `h1` already shows on a phone.
- **On a phone (below 640px)** the header shows the title as the page's `h1`, and
  the app name moves into the switcher, which collapses to an apps icon ("Switch
  app, now in Reader" to a screen reader). **From 640px** nothing changes.
- **One `h1`.** Pair it with `PageHeader hideOnPhone`: that `h1` then leaves the
  accessibility tree on a phone, so the page has one. Keep both `title`s the same.
- Details and the rules around it: [DESIGN.md](DESIGN.md#layout-blocks), "Page
  title on a phone". The geometry gate checks it as the `shell-titled` view; the
  usage audit renders it before and after in
  `docs/audits/primitives-usage/screens/layout-demo/`.

## Safe areas (iPhone)

The theme carries the safe-area foundation, so an app never hand-rolls an inset
([design-system#137](https://github.com/deanjstone/design-system/issues/137),
map [#136](https://github.com/deanjstone/design-system/issues/136)).

**The curve rule: backgrounds bleed, content never does.** A background, scrim
or image may run into the display's rounded corners, the Dynamic Island and the
home-indicator zone. Text and controls may not. Edge padding is
`max(<minimum>, env(safe-area-inset-*))`, and a control that hugs a corner gets
the extra `--corner-clear`.

| Token | Value | Use |
|---|---|---|
| `--safe-t` `--safe-r` `--safe-b` `--safe-l` | `env(safe-area-inset-*, 0px)` | The four device insets |
| `--gutter` | `1rem` | Edge padding every page wants |
| `--corner-clear` | `1.3rem` | Clearance for a control in a rounded corner |
| `--edge-x` / `--edge-x-end` | `max(var(--gutter), var(--safe-l \| --safe-r))` | Left and right edge padding |
| `--edge-b` | `max(0.5rem, calc(var(--safe-b) - 12px))` | Bottom edge: the home indicator sits about 12px below where content looks right |
| `--scroll-pad-top` `--scroll-pad-bottom` | `0px` | Set to the sticky header and fixed tab-bar heights; `html` uses them as `scroll-padding` so a focused control is not hidden (WCAG 2.4.11) |

| Utility | Does |
|---|---|
| `px-edge` | Left and right padding from `--edge-x` / `--edge-x-end`, so content clears the curves in landscape |
| `pb-edge` | Bottom padding clear of the home indicator |
| `inset-corner-br` | `right` and `bottom` for a fixed bottom-right control (a FAB): `max(--corner-clear, safe-r)` and `--edge-b`. Add `fixed` yourself |
| `min-h-app` | `min-height: 100dvh`, with `100vh` under `@supports not (min-height: 100dvh)`. Use it instead of `min-h-screen`, which is taller than the visible area on iOS Safari |
| `pt-safe` `pb-safe` | Unchanged. Right for a bar that must clear the status bar or home indicator |
| `pl-safe` `pr-safe` | Unchanged, but **not enough for content**: they resolve to `0` in Safari and in landscape on a device with no side inset, which is exactly where a display curve still clips text. Use `px-edge`. `design-check` fails them |

```tsx
<main className="min-h-app px-edge pb-edge">...</main>
<button className="fixed inset-corner-br size-14 rounded-full">+</button>
```

**`app-html-head`** puts the iPhone `<head>` tags in one place so apps stop
copying them by hand and drifting:

```bash
npx shadcn add deanjstone/frontend/app-html-head
```

It lands `app-html-head.html` at the project root; copy its tags into your
`index.html`. It sets `viewport-fit=cover` (without it every `env(safe-area-inset-*)`
is `0`), no zoom limit, the `apple-mobile-web-app-*` set with the `default` status
bar, a light and a dark `theme-color` matching Ocean, and the Dynamic Type script
(see § Text size: it sets `--dt-scale` on iOS and does nothing elsewhere), plus a second
script that keeps the status-bar band in step with light and dark.

**Gotcha: the band stayed dark after the system appearance changed.** An installed iOS
web app may not re-read its two media-scoped `theme-color` tags when it resumes after the
system switches light/dark; only a relaunch cleared it
([#167](https://github.com/deanjstone/design-system/issues/167)). The second script
replaces the two tags with one unscoped `theme-color` (a fresh element each time) and
sets `color-scheme` on `<html>`, on `pageshow`, `visibilitychange`, a system mode change
and a change of the `dark` class. jsdom tests pin what the page asks for; that iOS then
repaints the band is a device check ([#168](https://github.com/deanjstone/design-system/issues/168)).
If the band is still wrong on a device, iOS owns it and the page cannot fix it.

**Decisions recorded here:**
- `apple-mobile-web-app-capable` is included. iOS 26 opens every Home Screen site
  as a web app, so it matters only on older iOS; the status-bar style decides the
  top inset either way, and `default` keeps the bar opaque.
- The tap highlight (`-webkit-tap-highlight-color`) keeps the browser default.
  Components have no uniform `:active` style, so removing the highlight would
  leave a tap with no feedback; it is a check on the owner's iPhone
  ([#141](https://github.com/deanjstone/design-system/issues/141)).
- The shell keeps `overscroll-behavior: auto`, so the iOS rubber-band and
  pull-to-refresh still work in every consumer ([#148](https://github.com/deanjstone/design-system/issues/148),
  owner decision 1 Nov 2026). Only inner scrollers opt out with `overscroll-contain`
  (drawer, message-scroller). A consumer that wants a native-app feel sets
  `overscroll-behavior` on its own `html`.

### Overlays

Every overlay edge carries its own inset, so a consumer never adds `pb-safe` to a
sheet by hand ([design-system#140](https://github.com/deanjstone/design-system/issues/140)).

| Item | Edge | Inset |
|---|---|---|
| `sheet` | top; left and right | Top: `--safe-t`, `--safe-l`, `--safe-r`. Left and right: `--safe-t`, `--safe-b` and the outer-edge `--safe-l` or `--safe-r` |
| `sheet` | bottom | `max(var(--safe-b), 1rem)`, plus `--safe-l` / `--safe-r` |
| `sheet` close button | top, right | Offset by `--safe-t` / `--safe-r` as well, because an absolutely positioned control ignores the popup's padding |
| `dialog`, `alert-dialog` | all | Height capped at `100dvh - 2rem - 2 * max(safe-t, safe-b)` and scrolls; side margin is `max(1rem, safe-l, safe-r)`. The cap is symmetric because the dialog is centred |
| `dialog` header | right | `pr-10` when the close button shows, so a long title clears it |
| `drawer` | by swipe direction | `--safe-b` (down), `--safe-t` (up and any snap-point drawer), `--safe-l` / `--safe-r` on the sides |
| `sonner` | top, bottom | Default `offset` and `mobileOffset` of `calc(var(--safe-t) + 8px)` and `calc(var(--safe-b) + 8px)`. A consumer's own `offset` replaces them |

`DrawerContent` takes an opt-in `showCloseButton` (default `false`, so existing
drawers render as before). A swipe alone fails WCAG 2.5.7 and is unreachable for
VoiceOver, so turn it on for any drawer without another close control.

**Decisions recorded here:**
- Toast lifetime stays at sonner's 4s default. sonner has no per-type duration, so
  a longer error toast needs a wrapper around `toast.error`; pass `duration` on the
  `Toaster` for a longer default.
- The drawer takes the top inset whenever it has snap points, because the popup
  cannot tell its full-height snap from the half one. A half-snap drawer therefore
  has extra top padding on a notched device.
- A scrolled dialog scrolls its close button away with the content; Escape and the
  footer actions still close it.
- Sheet and drawer slides becoming fades under Reduce Motion is
  [#147](https://github.com/deanjstone/design-system/issues/147). Keyboard overlap
  for overlays is a device check in [#141](https://github.com/deanjstone/design-system/issues/141).

### Curve-geometry gate

`pnpm gate:geometry` proves, without an iPhone, that a UI change keeps text and
controls clear of the display curves, the Dynamic Island and the home-indicator
band ([design-system#143](https://github.com/deanjstone/design-system/issues/143)).
It builds a harness page of the registry blocks (AppShell, login, sheet on four
sides, dialog, alert dialog, drawer, toast, stat tile, copy button), opens each in Playwright Chromium and
sets the insets with the CDP method `Emulation.setSafeAreaInsetsOverride`, so
`env(safe-area-inset-*)` resolves to the device values. Chromium draws no curves;
the gate measures instead.

| Scenario | Viewport | Insets T/B/L/R |
|---|---|---|
| all insets 0 (Safari tab) | 402×874 | 0/0/0/0 |
| iPhone 17 portrait | 402×874 | 62/34/0/0 |
| iPhone 17 portrait, status bar default | 402×812 | 0/34/0/0 (top curves out of view) |
| iPhone 17 landscape | 874×402 | 0/20/62/62 and 20/20/62/62 |
| iPhone Air portrait / landscape | 420×912 / 912×420 | 68/34/0/0 / 20/29/68/68 |

**What fails the gate.** Every control's rect and every text line's rect
(`Range.getClientRects`) must lie inside the display's rounded rect (radius 62,
which also satisfies the 55 of older phones), clear of the island box (125×37pt,
14pt from the top; both short edges in landscape) and above the home-indicator
band, and must not spill sideways. Backgrounds, borders and shadows are exempt, as
are text hidden for screen readers and anything a fixed bar covers. A page that
scrolls is measured at its top and at its end; each position holds the half of the
page at rest at that edge, and fixed or sticky chrome at both. The band starts
12px below the bottom inset line, because `--edge-b` is the inset less 12px by
design (the indicator sits about 12px below where content looks right).

**Also checked, in the same contexts.** Token contrast (the two vitest files, run
first); WCAG 2.5.8 target size (24px, hit area counted) at 402×874 and 874×402;
inputs at 16px or more; reduced motion (a `reducedMotion: "reduce"` context, then
`document.getAnimations()` for movement; a scroll-linked animation, such as the `@ui-sdk` drawer's sheet and backdrop under its scroll-snap driver, follows the reader's finger and is neither waited for while the page settles nor counted as movement); glass-bar contrast (every theme and mode: each label on the AppShell header and tab bar is measured against the bar as painted, with the labels hidden and the pixels under them sampled, 4.5:1 for text and 3:1 for icons); an aria snapshot per block against
`scripts/geometry-gate/aria/`; a Tab loop whose focused control must not be under
something else; a 320px / 200% text context (sideways scroll, clipped tab labels and controls,
header plus tab bar under 25% of the viewport, the published `--shell-*`
heights, counting any strip above the tab bar); the `shell-action` view, where
AppShell's `primaryAction` must be drawn above the tab bar with each control's centre in
the bottom 40% of the screen, at least 44×44, clear of the tab bar, and the end of the page clear of
it ([frontend#213](https://github.com/deanjstone-hl/frontend/issues/213)); a 320px / 310% context (sideways scroll, and any element reaching past the right edge);
a 75% root context for the 16px input minimum; and axe `target-size` and
`scrollable-region-focusable`. A finding the #144 audit already filed sits in
`KNOWN` in `scripts/geometry-gate/checks.mjs`: it is reported with its issue and
does not fail the gate, and a `KNOWN` entry that stops firing fails it until the
entry is deleted, so the list only shrinks.

**Screenshot flake.** Every capture goes through `captureScreenshot`
(`scripts/geometry-gate/capture.mjs`): it waits for fonts and two frames, then
retries once, with a logged line, when headless Chromium answers
`Page.captureScreenshot` with a `Protocol error`
([design-system#202](https://github.com/deanjstone/design-system/issues/202)).
Any other error, or a second protocol error, still fails the gate.

**Running it.**

```bash
pnpm gate:geometry                          # everything; exit 1 on a new finding
pnpm gate:geometry --scenario iphone-17-landscape-top-0 --view shell
pnpm gate:geometry --url http://localhost:5173/some/page   # a consumer's dev URL
pnpm gate:geometry --update-aria            # after an intended markup change
```

`--url` runs the geometry, target-size, font-size, axe and Tab checks on that one
page. It needs Chromium (`GATE_CHROMIUM=/path/to/chrome` if Playwright's is not
installed). Screenshots with the curve mask (red), island (black), band (amber) and
each offender outlined (magenta) are written to `geometry-gate-out/curves/`; a
failing run's files end in `__FAIL`. Attach them to the PR.

**What a pass does not prove.** Geometry only: no WebKit layout or rendering, no
real standalone status-bar style, no keyboard overlap and no dynamic viewport. The
corner radius is a circle standing in for the real curve, from community data. Those
are owner checks on the iPhone ([#141](https://github.com/deanjstone/design-system/issues/141)).
It is not part of `pnpm check` (no browser there), but CI runs it when a file it reads
changed, and always on a push to `deploy`: the `Curve geometry gate` job in
`.github/workflows/test.yml`, gated by `scripts/ci/geometry-inputs-changed.sh`
([#184](https://github.com/deanjstone/design-system/issues/184)). The inputs are
`registry/`, `theme/`, `scripts/geometry-gate/`, `package.json`, the lockfile, the
workflow itself and the runner actions; a docs-only or test-only push skips the job
(the run shows it as skipped, which counts as passed) and the last verdict stands.
Add a new input to the script's list and its test. A red run uploads the curve screenshots as the
`geometry-gate-curves` artifact. Run it locally before a change to a block's edges,
and `GATE_REGISTRY=<other checkout>/registry` points it at another tree.

**Chromium in CI is downloaded once.** The job sets `PLAYWRIGHT_BROWSERS_PATH` to
`$HOME/.cache/ms-playwright`, outside the workspace, then runs
`pnpm exec playwright-core install chromium`, which only downloads when the
`playwright-core` revision in `package.json` is missing. A self-hosted runner keeps
that directory on its host; a GitHub-hosted one restores it with `actions/cache`
keyed on the `playwright-core` version. Only a version bump downloads again. The job
never installs OS packages (no `--with-deps`, no sudo): a runner missing Chromium's
system libraries is an owner change.

## Links registry

Every myargus.cc and tailnet URL comes from one registry
([ADR-0004](docs/adr/0004-cross-repo-myargus-url-taxonomy.md),
[map #151](https://github.com/deanjstone/design-system/issues/151)). Five items:

| Item | Lands at | Is |
|---|---|---|
| `links-data` | `links.json` | Every host and app: bucket, status, host, path, routes, expected anonymous probe status, hosting, Access gating, the shared cookie domain. Edit it **here only**; bump `revision` on every change |
| `links` (+ `links-core`) | `@/lib/links.ts`, `@/lib/links-core.ts` | `appUrl(id)`, `routeUrl(id, path, params?)`, `apiUrl(id)`, `mcpUrl(id)`, `tailnetUrl(id)`, `switcherApps(currentId)`, `COOKIE_DOMAIN`. `links.ts` is **generated** from `links.json` |
| `links-sh` | `scripts/links.sh` | The same builders in bash with `jq`, for deploy scripts and hooks |
| `link-check` | `scripts/link-check.sh`, `scripts/link-check-config.mjs`, `.github/workflows/link-check.yml` | The literal ban, the config check and the drift check |

```bash
npx shadcn add deanjstone/frontend/links#v3.7.0
```

```ts
import { appUrl, routeUrl, apiUrl, COOKIE_DOMAIN } from "@/lib/links"

appUrl("reader")                                   // https://myargus.cc/reader/
routeUrl("shell", "/plans/:slug", { slug: "x" })   // https://myargus.cc/plans/x
apiUrl("watchtower-api")                           // https://api.myargus.cc/watchtower
appUrl("ops", { origin: process.env.OPS_ORIGIN })  // only the origin is overridable
```

```bash
bash scripts/links.sh url ops                      # https://ops.myargus.cc/
bash scripts/links.sh route shell /plans/:slug x   # https://myargus.cc/plans/x
bash scripts/links.sh --origin http://localhost:8787 api watchtower-api
```

Canonical forms: https only; app roots end in `/`; in-app routes and API/MCP
bases have none; builders join with one `/`. A retired entry throws, a redirect
entry builds its target, a planned entry builds. `routeUrl` throws for a route
`links.json` does not list: list a route there when another app links to it.
An MCP entry on a legacy host holds its live location and names the target in
`moveTo`, so one registry edit moves every consumer.

**link-check** runs from `scripts/link-check.sh [--mode report|block]` (default
`report`, or `LINK_CHECK_MODE`). Report mode prints each finding and one
`link-check: summary <repo> literals=N retired=M config=K drift=D` line and
exits 0: the baseline. Block mode exits 1 on any count above 0; flip the
workflow's `LINK_CHECK_MODE` to `block` when a repo reads 0. Counts are lines.

| Finding | Meaning |
|---|---|
| `literal` | A tracked line names the domain or the tailnet host. Exempt: markdown, test files and fixtures, lockfiles, changelogs, wrangler config, `_redirects`/`_headers`, files carrying the `link-check:vendored` marker in their first 10 lines, and globs in `.link-check-ignore` |
| `retired` | A literal that names a retired host (a subset of `literal`) |
| `config` | Vite `base`, router `basename`, manifest `start_url`/`scope`, a wrangler route or `_redirects` target that `links.json` does not hold. Textual, so it catches the common slips only |
| `drift` | The vendored `links.json` is behind frontend's, or differs at the same revision. An unreachable upstream is reported and passes |

**Cloudflare drift** (`scripts/links/cf-drift.mjs`, not a registry item) diffs
live DNS, tunnel ingress and Access apps against `links.json`. It makes GET
requests only:

```bash
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/links/cf-drift.mjs
```

The token needs Zone > DNS > Read, Zone > Zone > Read, Cloudflare Tunnel > Read
and Access: Apps and Policies > Read. Exit 0: no drift; 1: drift printed; 2:
could not run.

Access is read the way Cloudflare applies it. A wildcard app (`*.myargus.cc`)
walls every host under it that has no app of its own, so a host `links.json`
marks `access: false` needs a bypass app (an app whose every policy bypasses
Access), and a host marked `access: true` is satisfied by the wildcard. Bypass
apps are never reported on their own. A gated entry is probed for the Access
login, so give it `probe: { "status": 302 }`: the watchtower collector reads a
302 probe as a redirect to `cloudflareaccess.com`.

To change the registry: edit `registry/links/links.json`, bump `revision`, run
`node scripts/links/generate.mjs`, then `pnpm check`.

## Design check item

`design-check` puts [Impeccable's](https://impeccable.style) detector in a
consumer's CI as a non-blocking check, so every web interface gets the same
design-drift report. It is the check trialled in
[myargus#348](https://github.com/deanjstone/myargus/issues/348), shipped as a
`registry:file` item:

```bash
npx shadcn add deanjstone/frontend/design-check#v3.0.0
```

| Lands at | Does |
|---|---|
| `scripts/design-detect.sh` | Runs `impeccable@4.7.0 detect` on the UI files a PR changed (`.tsx`, `.jsx`, `.css`, `.html`, `.vue`, `.svelte`) and writes counts by rule and severity to the job summary |
| `scripts/design-rules.mjs` | The iPhone safe-area and touch rules below, on the same changed files. **A finding fails the job** |
| `scripts/registry-stale.mjs` | Lists the registry files copied into the app that match an **older release than the app's pin**, with the release each matches. Warn-only: see below |
| `.github/workflows/design-detect.yml` | Runs all three on PRs that touch those files, `DESIGN.md`, `components.json` or `.impeccable/`. The detector and stale-copy steps are `continue-on-error: true`, so a finding or a failed scan never blocks a merge; the rules step has no such flag |

**The design rules** (`design-rules.mjs`, [design-system#137](https://github.com/deanjstone/design-system/issues/137)):

| Rule | Fails |
|---|---|
| `viewport-height-unit` | `min-h-screen`, `h-screen`, `100vh` (the `100vh` fallback inside `@supports not (min-height: 100dvh)` passes) |
| `viewport-fit-cover` | a `<meta name="viewport">` without `viewport-fit=cover` |
| `fixed-without-safe-edge` | `fixed` / `position: fixed` with no `max(…env…)` edge, `inset-corner-*`, `*-edge` or `*-safe` utility. A full-bleed `inset-0` passes |
| `side-inset-without-floor` | `env(safe-area-inset-left\|right)` with no non-zero `max()` floor, and the `pl-safe`, `pr-safe` and `px-safe` utilities. A custom property that defines a token (`--safe-l: env(…)`) passes |
| `form-text-under-16` | an `input`, `textarea`, `select` (or the registry components of those names) with `text-sm`, `text-xs` or a pixel size under 16 at any breakpoint, such as `md:text-sm`: iOS zooms the page on focus |
| `focus-ring-alpha-only` | a focus indicator that is only `ring-ring/50` (under 3:1, WCAG 1.4.11); add a solid `outline` or `border-ring` |

The checks are textual (class strings and CSS declarations), so they catch the
common slips, not every case. A line that is right for a reason a rule cannot see
takes a `design-rules-ignore` comment on that line or the line above. Only files
the PR changed are scanned, so an old finding in an untouched file never fails a
PR.

**Stale copies** (`registry-stale.mjs`, [frontend#211](https://github.com/deanjstone-hl/frontend/issues/211)).
Moving the `@frontend` pin in `components.json` does not move the code `shadcn add` already copied into
the app, and the README pin table shows only the alias. The script, for each `components.json` in the
repo:

1. reads the pin from `registries["@frontend"]` (or the old `@design-system`);
2. takes the files directly in the app's `aliases.ui` and `aliases.components` directories that carry
   a registry file's name;
3. fingerprints each against the item at the pin (`r/<item>.json`), reading a copy through what the
   shadcn CLI rewrites: the `"use client"` line, the `cn-*` marker classes, `font-heading`, whitespace;
4. compares each copy that differs from the pin with every older release, and lists the ones that
   equal one.

```text
### Registry copies older than the pin (`apps/email`, pin v3.18.0, not blocking)

2 of 21 registry copies match an older release than v3.18.0:

| File | Matches | Pin |
|---|---|---|
| `apps/email/src/components/ui/card.tsx` | v2.10.0 to v3.9.1 | v3.18.0 |
| `apps/email/src/components/ui/input.tsx` | v3.6.1 to v3.8.0 | v3.18.0 |
```

A copy that equals no release is a local edit or a fork and is not listed. Exit status: `0` nothing
stale, `2` stale copies found, `1` the registry could not be read; the workflow step is
`continue-on-error: true`, so none of them blocks a merge (drop that line to make it block). It needs
`git` and Node 20 or later, lists releases with `git ls-remote` and reads each `r/<item>.json` over HTTP
from the URL the pin names. A `components.json` with no tagged pin (no alias, or a branch such as `main`)
is reported as having none; `--pin <tag> --registry-url <template> --remote <git url>` supply what it
lacks. Run it locally with `node scripts/registry-stale.mjs` from the consumer's checkout. To bring a
copy to the pin, look at the diff and then `npx shadcn add @frontend/<item> --overwrite`. The
[primitives usage audit](docs/audits/2026-11-12-primitives-usage.md) measures the same thing across every
app, with the same `fingerprint` (it imports it from this script).

- **Pinned, telemetry off.** The version is one variable in the script
  (`IMPECCABLE_VERSION`); a bump is a deliberate edit. `DO_NOT_TRACK=1` and
  `IMPECCABLE_NO_TELEMETRY=1` are exported. Nothing installs hooks or touches
  `~/.claude`; the detector runs from `npx`.
- **The registry-owned `ui` directory is skipped.** The script reads
  `aliases.ui` from every `components.json` in the repo (`@/components/ui`,
  `~/components/ui` or a bare path) and leaves that directory out, because
  `shadcn add` put those files there. A workspace-package alias
  (`@workspace/ui/components`) cannot be mapped to a directory; the summary says
  so, and the directory goes under `detector.ignoreFiles` in
  `.impeccable/config.json`, which the detector reads itself.
- **`DESIGN.md` is not shipped.** The detector's `design-system-color` and
  `design-system-font-size` rules read the `DESIGN.md` at the repo root (checked
  with 4.7.0: a copy in a subdirectory or beside the file turns them off).
  This repo's `DESIGN.md` describes the achromatic base that each app tints, so
  installing it would hold an app's own palette against ours and flag every
  tint as drift. A consumer without a root `DESIGN.md` gets the generic rules
  only; one with its own keeps it, and `shadcn add -o` cannot replace it. To
  start one, copy this repo's `DESIGN.md` and edit it to the app's identity.
- **Nor is `.impeccable/config.json`.** A consumer's detector ignores are its own.
- **`shadcn add` does not set the executable bit**, so the workflow runs
  `bash scripts/design-detect.sh`.

Needs `jq`, `npx` and `node`, all on GitHub-hosted runners. The workflow's
`runs-on` is plain `ubuntu-latest` ([design-system#186](https://github.com/deanjstone/design-system/issues/186)):
a consumer, private ones included, keeps it on a hosted runner and does not move
the check to a self-hosted slot. Re-pulling the item restores that line, so a
consumer that pins the workflow's shape in a test updates the test when it re-pulls.
Rolling it out is a follow-up issue per consumer.

## Design tooling

This repo enables the [impeccable](https://impeccable.style) plugin
(Apache-2.0 — one skill, 23 design commands, 61 anti-pattern rules) at
project scope via `.claude/settings.json`, and runs its detector over
`registry/` and `theme/` on every PR. The detector version is pinned
deliberately: its rule set *is* the pass/fail criterion, so an unpinned
range would let an upstream release redden a green PR with no change here.

**Gotcha: `enabledPlugins` does not install the plugin.** Enable and
install are separate steps, and the gap is silent. A fresh clone will read
`extraKnownMarketplaces`, fetch the marketplace, cache the plugin — and
then never load it, no matter how many times Claude Code restarts.
`claude plugin enable` reports `already enabled at project scope` while
`~/.claude/plugins/installed_plugins.json` has no entry and the cache gets
garbage-collected as orphaned. Run the install once per machine:

```bash
claude plugin install impeccable@impeccable --scope project
```

Then restart the session — plugins are read at startup. Verify with
`claude plugin list`, which should report `Scope: project` and
`Status: ✔ enabled` for it, rather than assuming a restart was enough.

`/impeccable document`, `extract`, `audit` and `critique` are the commands
that earn their place here. `/impeccable live` does not apply — it
iterates against a running app, and this repo has none.

## Data primitives

`chart` and `data-table` ([#175](https://github.com/deanjstone/design-system/issues/175)).
`docs/data/smoke-check.mjs` builds a demo that renders both in a light and a dark
panel and runs 13 checks in one headless tab (screenshot: `docs/assets/data-demo.png`).

**chart** is the base-nova recharts wrapper (`ChartContainer`, `ChartTooltipContent`,
`ChartLegendContent`) restyled to theme tokens. Colour a series with a token in its
config, `color: "var(--chart-1)"` to `var(--chart-5)`, and draw it with
`fill="var(--color-<key>)"`; the bars follow light and dark with the token, and the
tooltip is a popover surface. `recharts` is a dependency of the item.

**Load it lazily.** `chart.tsx` imports recharts statically, so a page that imports it
pays for recharts up front. The item also ships `chart-lazy.tsx`, which imports neither:
put the recharts composition in its own module that default-exports a component, and
wrap it once at module scope.

```tsx
const RevenueChart = createLazyChart(() => import("./revenue-chart"))
<RevenueChart className="h-64" />
```

The chunk is fetched when the chart first renders. A 16:9 skeleton holds the box while it
loads, and a failed fetch shows a `role="alert"` message and logs the cause.

**Bundle cost**, measured on the demo build (`vite build`, gzip):

| Chunk | Raw | Gzip | Loads |
| --- | --- | --- | --- |
| recharts + chart + the demo chart | 366.3 kB | 104.7 kB | on demand, with the first chart |
| `@tanstack/react-table` (`data-table`) | 56.4 kB | 15.3 kB | with the page that imports `data-table` |
| first bundle (React, demo shell, `data-table`, no recharts) | 260.1 kB | 84.2 kB | first paint |

A page without a chart never downloads the recharts chunk. The item asks for
`recharts@^3.8.0`; `budget` already depends on `recharts` directly, so check its range
against that when it adopts the item.

**data-table** is the shadcn recipe as a component: the `table` item driven by
`@tanstack/react-table` v8, with sortable column headers (`DataTableColumnHeader`, and
`aria-sort` on the header cell), one column filter (`filterColumn`) and a pager that
announces the page. `caption` is required and names the table for assistive tech. v8
is pinned because that is the API the shadcn recipe and its examples use; v9 is a
different, feature-composed API. For row selection, column visibility or server-side
paging, call `useReactTable` yourself with the `table` item.

## Page transition

`page-transition` wraps [glimm](https://glimm.dev) 0.4.1 (MIT): a WebGL band in the theme's colours
crosses the screen and the new view appears behind it. Evaluation and verdict (adapt):
[design-system#198](https://github.com/deanjstone/design-system/issues/198). **Listed** in `registry.json`
([frontend#229](https://github.com/deanjstone-hl/frontend/issues/229)) after the owner approved the look
([frontend#199](https://github.com/deanjstone-hl/frontend/issues/199), 13 Nov 2026):
`npx shadcn add deanjstone/frontend/page-transition` installs it with `page-transition-core`.
`docs/page-transition/registry-entries.json` keeps the two entries as the reference copy;
`test/page-transition-registry.test.ts` fails when `registry.json` differs from them.

```tsx
<PageTransitionProvider>{children}</PageTransitionProvider>

const { transition } = usePageTransition()
await transition(() => navigate("/billing"))        // navigate runs behind the band
await transition(() => setView("billing"), { direction: "rtl", sweepMs: 700 })
```

- **Opt in per app.** Nothing changes until an app renders `PageTransitionProvider` and wraps a
  navigation or state change in `transition()`. `glimm/react` is used, not `glimm/next`.
- **Colours come from the theme**, read when the transition starts: `--primary`, `--chart-5`, `--chart-4`
  by default (`tokens` prop to change), so a theme or light/dark change between navigations shows. The band
  is dimmed to 0.8 on `.dark`. glimm's own presets are not used.
- **Plain cut, never a stuck page**, for each of: `prefers-reduced-motion: reduce`; no WebGL; a lost WebGL
  context (glimm's provider path has no handler for it, so the item adds one and stays on cuts for the
  rest of the page's life); theme tokens missing. An error thrown by `navigate` reaches the caller on a cut.
- **Cost:** `glimm` is pinned exactly (`glimm@0.4.1`). Its source is not public and 0.x changes defaults
  between minors. Tree-shaken it adds about 13 kB gzip (`GlimmProvider`, `useGlimm`, `accentChain`);
  measured by `docs/page-transition/smoke-check.mjs`. `glimm@0.4.1` has aged past pnpm's release-age gate, so
  `pnpm-workspace.yaml` no longer excludes it.
- **Try it:** `node docs/page-transition/serve.mjs [--port 4173]` builds the demo and serves it on
  `127.0.0.1`; add `tailscale serve --bg 4173` to open it from a phone (never `funnel`).
  `node docs/page-transition/smoke-check.mjs` drives it in one headless tab (sweep, reduced motion, no
  WebGL, context loss, click timing) and writes `docs/assets/page-transition-*.png`.

## Card list

`card-list` is the grouped two-row card pattern from [design-system#188](https://github.com/deanjstone/design-system/issues/188)
(map [argus#1084](https://github.com/deanjstone/argus/issues/1084)): a heading per group (a repo, say), and under it
cards of two rows, the title, then status, branch, check and relative time. The selected card is raised.
`npx shadcn add deanjstone/frontend/card-list`.

```tsx
<CardList>
  <CardListGroup heading="argus" count={2}>
    <CardListItem
      title="Four-bucket dashboard for ops-hub"
      status={<Badge variant="critical">Active</Badge>}
      branch="feat/189-dashboard"
      check="CI red"
      time="14m"
      active
      render={<a href="/items/189" />}
    />
  </CardListGroup>
  <CardListGroup heading="quick-capture" count={0} />   {/* keeps its heading, says "Nothing here" */}
</CardList>
```

- **Semantics.** Each group is a `section` labelled by its heading (`h2`; `headingLevel={3}` or `4` to nest).
  Cards are `li` in a `ul`. A group with no cards renders its `empty` message (default "Nothing here") and no list.
- **A card is a `div` until `render` says otherwise.** `render={<a href />}` or `render={<button />}` makes the
  whole card the tap target (the app's router `Link` works too). `active` sets `aria-current="true"`,
  `data-active` and a raised look (`bg-card`, `shadow-md`, a hairline ring); the others sit flat on `bg-muted/50`.
- **Touch and width.** Every card is `min-h-11` (44px) and `w-full`, and clips what it holds. The title wraps in
  full ([wrap by default](#wrap-by-default)), and so do the heading and the branch. The branch is the only second-row item that shrinks, so
  status, check and time stay readable at 320px. Never widens the page: a `<button>` sizes to its content, which
  `w-full` prevents (the WebKit check found this; jsdom cannot).
- **Proof.** `node docs/card-list/screenshots.mjs` builds the demo and opens it in one headless WebKit page at a
  time at 390×844, 320×844 and 1280×800, light and dark. It checks no sideways scroll, cards inside the viewport and
  at least 44px tall, the long title and branch wrapping in full, the active card raised, the empty group present, and writes
  `docs/assets/card-list-<width>-<theme>.png` and `card-list-before-<width>-light.png` (the single-row list the
  cards replace). Screenshots: ![390 light](docs/assets/card-list-390-light.png)
  ![390 dark](docs/assets/card-list-390-dark.png) ![320 dark](docs/assets/card-list-320-dark.png)

## Stat tile

`stat-tile` ([frontend#216](https://github.com/deanjstone-hl/frontend/issues/216)) is a label over one big number, with an
optional unit and delta. It replaces the four hand-built copies the
[primitives usage audit](docs/audits/2026-11-12-primitives-usage.md) found: ops-hub `Tiles`, atto1 `Stat`, sparky `Tile`
and budget `MetricCard` / `NumberStat`. It declares `cn` and `lucide-react` and pulls in no other item.
`npx shadcn add deanjstone/frontend/stat-tile`.

```tsx
<div className="grid grid-cols-2 gap-3">
  <StatTile className="col-span-2" size="lead" label="Left to spend" value="$1,204" unit="AUD" delta="+2.1%" trend="up" tone="success" />
  <StatTile label="Open PRs" value="12" />
  <StatTile label="Range" value="342" unit="km" delta="-18 km" trend="down" tone="critical" />
</div>
```

| Prop | What it does |
|---|---|
| `label`, `value` | The tile. Pass `value` already formatted; it is set in tabular figures |
| `unit` | Smaller and muted beside the number |
| `delta` | The change, under the number. `trend` (`up`, `down`, `flat`) adds an arrow and a word for a screen reader, so a change never rests on colour alone. `tone` (`neutral`, `success`, `critical`) colours it from the status tokens: whether up is good news is the caller's call |
| `size` | `default` sets the number at `text-xl` (21px); `lead` at `text-3xl` (30px). Give `lead` to one tile per screen |
| `variant` | `tile` (default) draws the card surface; `plain` drops it, for a tile inside a card already |

It is a `<dl>` of one (label `dt`, number and delta `dd`), so a screen reader hears "label, value". The grid of tiles is
the caller's layout. `className` and other props reach the `<dl>`.

**Why `size`.** The audit's `hierarchy.oneLargest` wants the largest text on a screen at least 1.2 times the next size
down, and at most two elements at it. Sparky's home draws four 26px numbers and the bills list six 21px ones, so
neither has a largest. `lead` is 1.43 times the default (`test/stat-tile.test.tsx` holds it against the audit's own
`RULES.largestRatio`). When to use it: [DESIGN.md](DESIGN.md#stat-tile).

The geometry gate draws it as the `stat-tile` view: a lead tile over a grid in the AppShell, in every scenario, with an
aria baseline in `scripts/geometry-gate/aria/stat-tile.yml`. App adoption is filed per app, not done here.

## Notice

`notice` ([frontend#218](https://github.com/deanjstone-hl/frontend/issues/218)) is the loading and error notice pair, built on
`alert` and on its `critical` variant ([frontend#210](https://github.com/deanjstone-hl/frontend/issues/210)). It replaces the
pair each app hand-builds, per the [primitives usage audit](docs/audits/2026-11-12-primitives-usage.md): briefings and jobs
`components/Notice.tsx`, shell `plans/PlansNotice.tsx` and ops-hub `Loading` / `LoadError`. It declares `lucide-react` and
pulls in `alert` (and `cn` through it). `npx shadcn add deanjstone/frontend/notice`.

```tsx
<LoadingNotice title="Loading briefings" description="This can take a few seconds." />

<ErrorNotice
  title="Couldn't load jobs"
  description={error.message}
  action={<Button variant="outline" onClick={retry}>Try again</Button>}
/>
```

| Component | What it draws |
|---|---|
| `LoadingNotice` | The default `alert` with a spinning icon (`motion-reduce` stops it), `title` and an optional `description`. A polite `role="status"` with `aria-live="polite"`, so it never interrupts a screen reader. `icon` replaces the spinner |
| `ErrorNotice` | The `critical` `alert` with its own icon (`icon` replaces it, `icon={null}` drops it), `title` and an optional `description`. A `role="alert"`. `action` is a row of buttons that wraps under the words; `children` is a hint or a link after the description |

Both take the `alert`'s other props (`className`, `data-*`, `id`), and neither takes `variant`. A notice about the app's
own state (offline, session expired) is a plain `alert`, not these. When to use it: [DESIGN.md](DESIGN.md#notice).

`test/notice.test.tsx` holds both states, and `test/theme-tokens.test.ts` holds each at 4.5:1 on every theme, light and
dark: the loading notice's title and description on the card surface, the error notice on the `critical` wash. App
adoption is filed per app, not done here.

## Issue row

`issue-row` is the dense list row for issues and PRs from [design-system#192](https://github.com/deanjstone/design-system/issues/192):
one 44px row with the priority, id, status, title, labels, project or wave, due date and assignee. It follows
`components/common/issues/issue-line.tsx` in [circle](https://github.com/ln-dev7/circle) (MIT, Copyright (c) 2025 lndev-ui |
Circle Template; credited in the source header), rebuilt on Base UI and this registry's tokens with none of circle's
dependencies. It pulls in `context-menu` and `dropdown-menu`.
`npx shadcn add deanjstone/frontend/issue-row`.

```tsx
<IssueRowList aria-label="Open issues">
  <IssueRow
    title="Dense issue and PR list row"
    href="/issues/192"                      // or onOpen={...}, or render={<Link to="..." />}
    priority={<SignalHighIcon aria-label="Priority: high" />}
    identifier="DS-192"
    status={<CircleDotIcon aria-label="Status: working" />}
    labels={<Badge variant="outline">design</Badge>}
    project="Wave 1"
    dueDate="Due Nov 12"
    assignee={<Avatar size="sm">...</Avatar>}
    actions={[
      { id: "assign", label: "Assign to me", onSelect: assign },
      { id: "close", label: "Close", onSelect: close, destructive: true },
    ]}
  />
</IssueRowList>
```

- **Columns drop away, the title never squeezes.** Below `sm` (640px) a row is the priority, the status, the title and
  the more button. At `sm` the id, due date and assignee join; at `lg` (1024px) the labels and the project or wave.
  The title takes what is left and wraps in full, so the row grows past 44px ([wrap by default](#wrap-by-default)); every other column keeps
  its width. Leave out a column and no empty slot is rendered, so give the rows of one list the same columns if you
  want their titles to line up.
- **Tap anywhere opens the item.** The title is the link (`href`), a button (`onOpen`) or your router's `Link`
  (`render`), and its hit area is stretched over the whole row. Anything of yours inside a column that must take its own
  tap (a button in `labels`, say) needs `relative z-10`; the more button already has it.
- **The actions behind circle's right-click have three touch-friendly doors.** `actions` opens from the trailing 44px
  more button (named "More actions for <title>", or `moreLabel`), from a right-click, and from a long-press of half a
  second (Base UI's context-menu trigger; a scroll or a lifted finger cancels it). All three open the same list. Menu
  items grow to 44px under a coarse pointer. A row with no `actions` has no more button and no menu.
- **iOS.** The row sets `-webkit-touch-callout: none` and `user-select: none` so the press reaches the menu, and its side
  padding has a floor over `env(safe-area-inset-left|right)`.
- **Accessible names are yours to give.** Priority, status and assignee are usually icons or avatars: pass an
  `aria-label` or `sr-only` text with each. The row itself is a list item named by its title.
- **Proof.** `node docs/issue-row/screenshots.mjs` builds the demo and opens it in one headless WebKit page at a time at
  390, 320, 768 and 1280px, light and dark. It checks no sideways scroll, rows of at least 44px, the column tiers, the title wrapping in full
  (at 320px it keeps at least 120px), the 44px more button, hit tests (a hit on the avatar lands on the title link: the
  check found the avatar swallowing the tap), tap, the menu actions, long-press and right-click, and writes
  `docs/assets/issue-row-<width>-<theme>.png` and `issue-row-<width>-menu-light.png`. The long-press is a dispatched
  `touchstart` held for 650ms, since Playwright has no touch-hold; it is not a physical finger. Screenshots:
  ![390 light](docs/assets/issue-row-390-light.png) ![390 menu](docs/assets/issue-row-390-menu-light.png)
  ![320 dark](docs/assets/issue-row-320-dark.png) ![1280 dark](docs/assets/issue-row-1280-dark.png)

## Filter builder

`filter-builder` is the filter row editor with shareable URL state from [design-system#193](https://github.com/deanjstone/design-system/issues/193):
subject, operator and value rows ("label is", "label is not", "wave is any of", "mode has all of"), exclusion included, with
the whole list in one URL search param so a filtered view can be bookmarked and shared. It follows circle's
`components/data-table-filter/` and `store/filter-store.ts` ([circle](https://github.com/ln-dev7/circle), MIT, Copyright (c)
2025 lndev-ui | Circle Template; credited in each source header), rebuilt on Base UI and this registry's tokens with none of
circle's dependencies and no nuqs. Four items: `filter-core` (the model), `url-state` (the URL helper), `use-filter-state`
(the two joined as a hook) and the `filter-builder` block, which pulls in `badge`, `button`, `checkbox`, `input`,
`native-select`, `popover`, `sheet` and `use-mobile`.
`npx shadcn add deanjstone/frontend/filter-builder deanjstone/frontend/use-filter-state`.

```tsx
const FIELDS: FilterField<Issue>[] = [
  { id: "label", label: "Label", type: "option", options: [{ value: "bug", label: "Bug" }], accessor: (i) => i.label },
  { id: "wave", label: "Wave", type: "option", options: WAVES, accessor: (i) => i.wave },
  { id: "mode", label: "Mode", type: "multiOption", options: MODES, accessor: (i) => i.modes },
  { id: "title", label: "Title", type: "text", accessor: (i) => i.title },
  { id: "points", label: "Points", type: "number", accessor: (i) => i.points },
]

const [filters, setFilters] = useFilterState(FIELDS)          // ?filter=label:is-not:bug;wave:is-any-of:w1,w2
const shown = applyFilters(issues, filters, FIELDS)
<FilterBuilder fields={FIELDS} value={filters} onValueChange={setFilters} />
```

- **Types and operators.** `option` (is, is not, is any of, is none of), `multiOption` (has any of, has all of, has none of),
  `text` (contains, does not contain, case-insensitive) and `number` (equals, does not equal, greater than, less than).
  Filters are ANDed. A field appears in one row; "Add filter" starts the next unused field. Dates are not in this first cut.
- **One param, plain text.** `serializeFilters` writes `field:operator:value,value;...`, each piece percent-encoded, so `:`, `,`
  and `;` never appear inside a piece. `parseFilters(raw, fields)` checks every segment against `fields` and drops what it cannot
  trust (unknown field, an operator the type lacks, the wrong shape, a broken escape, a non-number in a number field), never
  throws, and reads at most 50 segments. A row with no value yet serialises as `label:is:` and filters nothing.
- **Your router, or none.** `useFilterState(fields, { param, history })` reads and writes the param through the History API
  (`replace` by default, so typing does not fill the back button; `push` adds an entry per change), follows back and forward,
  and keeps other params and the hash. With a router that owns the search params, call `parseFilters` and `serializeFilters`
  yourself and pass `value` and `onValueChange`. Filtering on the server: leave `accessor` out and use the builder to edit the list.
- **Phone: rows in a bottom sheet.** `layout="auto"` (default) uses `useIsMobile()`: below 768px, and a short coarse-pointer
  landscape phone, a Filters button with the count opens the rows in a bottom `sheet` (safe areas from the sheet), and the
  complete filters show as removable chips under the button. Closing the sheet drops rows still empty. `layout="inline"` or
  `"sheet"` forces one.
- **Touch.** Field, operator and a single value are native selects, so a phone shows its own picker; several values are a
  checklist of full-row labels (inline, behind a popover button; in the sheet, listed in place, so no popup opens over a
  sheet). Under a coarse pointer selects and inputs are 44px tall with 16px text (iOS does not zoom into them), the remove
  button, chips and checklist rows are 44px. Nothing depends on hover or right-click.
- **Words are yours.** `labels` takes every visible and spoken string. Each row is a `group` named by its sentence ("Wave is any of
  Wave 1, Later"); remove buttons say "Remove filter: <sentence>".
- **Proof.** `node docs/filter-builder/screenshots.mjs` builds the demo and opens it in one headless WebKit page at a time at
  390, 320, 768 and 1280px, light and dark. It checks no sideways scroll, the seeded URL, the sheet (flush with the bottom, full
  width), a tap on a checklist row, the count and URL following, a chip removing its filter, and that a reload and a second page
  opened on the copied URL show the same filters. WebKit headless does not report `pointer: coarse`, so the 44px and 16px checks
  run in a Chromium page with touch emulation at 390px. Writes `docs/assets/filter-builder-<width>-<theme>.png`,
  `-sheet-light.png` and `-checklist-light.png`. Screenshots: ![390 sheet](docs/assets/filter-builder-390-sheet-light.png)
  ![390 dark](docs/assets/filter-builder-390-dark.png) ![1280 checklist](docs/assets/filter-builder-1280-checklist-light.png)

## Grouped list

`grouped-list` is the collapsible grouped list with a display menu from [design-system#194](https://github.com/deanjstone/design-system/issues/194):
items under group headers that show a count and collapse, and a Display button that picks what to group by (status, wave,
repo, label, whatever the view offers) and which row properties show. The choices are kept per view in localStorage. It follows
circle's `group-issues.tsx`, `grouped-issues-view.tsx` and `store/display-settings-store.ts` ([circle](https://github.com/ln-dev7/circle),
MIT, Copyright (c) 2025 lndev-ui | Circle Template; credited in each source header), rebuilt on Base UI and this registry's tokens
with none of circle's dependencies (no zustand, motion or react-dnd). Three items: `list-group-core` (the model), `use-display-settings`
(the persisted settings as a hook) and the `grouped-list` block (`GroupedList` and `DisplayMenu`), which pulls in `button`, `checkbox`,
`collapsible`, `native-select` and `popover`. It takes any row, so `issue-row` is one choice and not a dependency.
`npx shadcn add deanjstone/frontend/grouped-list deanjstone/frontend/use-display-settings`.

```tsx
const GROUPINGS: ListGrouping<Issue>[] = [
  { id: "status", label: "Status", keys: (i) => i.status, groupLabel: (k) => STATUS_NAMES[k], order: ["working", "todo", "done"] },
  { id: "label", label: "Label", keys: (i) => i.labels },            // a list: an issue with two labels is in both groups
]
const CONFIG: DisplayConfig = {
  groupings: ["status", "label"],
  properties: [{ id: "labels", label: "Labels" }, { id: "assignee", label: "Assignee", defaultVisible: false }],
  defaultGroupBy: "status",
}

const display = useDisplaySettings("pr-queue", CONFIG)       // localStorage key display-settings:pr-queue
const grouping = GROUPINGS.find((g) => g.id === display.settings.groupBy) ?? null
<DisplayMenu groupings={GROUPINGS} properties={CONFIG.properties} settings={display.settings}
  onGroupByChange={display.setGroupBy} onPropertyChange={display.setPropertyVisible} onReset={display.reset} />
<GroupedList groups={groupItems(issues, grouping)} collapsed={grouping ? (display.settings.collapsed[grouping.id] ?? []) : []}
  onToggleGroup={display.toggleCollapsed} getItemKey={(i) => i.id}
  renderItem={(i) => <IssueRow title={i.title} {...pickVisible({ labels: i.labels, assignee: i.assignee }, display.settings)} />} />
```

- **Grouping.** `groupItems(items, grouping, { noneLabel })` keeps each group's items in their given order. `order` lists the keys that
  go first; others follow as first seen. A key can be a list, so an item with two labels is drawn in both groups and counted in both
  (the headers' counts can then add up to more than the items). An item with no key goes in a last "none" group; a group nobody is in
  is not returned. `groupItems(items, null)` is one group of everything, drawn as a plain list with no header, so grouping off needs no
  second code path.
- **Collapse.** A header is a full-width 44px button inside a heading (`headingLevel`, default 3) with `aria-expanded`; the count stays
  on a collapsed header. `GroupedList` holds no state: pass `collapsed` and `onToggleGroup`. Collapsed groups are kept per grouping,
  so switching grouping does not carry them over.
- **Display settings.** `useDisplaySettings(viewId, config)` returns `settings`, `setGroupBy`, `setPropertyVisible`, `toggleCollapsed`,
  `reset` and `persisted`. Every list on the same view id, and its other tabs, stay in step. Storage access is wrapped in try/catch: where
  it throws (a private window, blocked site data) the settings still work for the page and `persisted` turns false. Stored text is parsed
  defensively and never throws: a bad field falls back to its default, a grouping, property or group the config no longer has is dropped,
  and a property added since takes its default. The server render uses the defaults and the client reads storage on hydration.
- **Properties.** `pickVisible({ priority, labels, ... }, settings)` returns the cells whose property is on; spread it into `IssueRow`.
  A cell the settings do not list is dropped. `IssueRow` still hides columns by screen width (`sm`, `lg`); a property switched on shows at
  the widths its column does.
- **Touch.** The Display button, a header and a property row are 44px tall under a coarse pointer; the Group by control is a native select
  (the phone's own picker) with 16px text so iOS does not zoom. The menu is a popover held inside the screen (`max-w-[calc(100vw-1rem)]`).
  Headers keep clear of the left and right safe areas. Nothing depends on hover or right-click.
- **Words are yours.** `labels` on `DisplayMenu` takes every visible and spoken string (`display`, `groupBy`, `noGrouping`, `properties`,
  `reset`); group names come from `groupLabel` and `noneLabel`.
- **Proof.** `node docs/grouped-list/screenshots.mjs` builds the demo and opens it in one headless WebKit page at a time at 390, 320, 768
  and 1280px, light and dark. It checks no sideways scroll, 44px headers and rows, a tap collapsing a group and a reload keeping it, the
  menu opening inside the screen, Repo and Label regrouping, collapsed groups kept per grouping, No grouping, Labels off surviving a reload
  and Reset. WebKit headless does not report `pointer: coarse`, so the 44px and 16px checks on the menu run in a Chromium page with touch
  emulation at 390px. Writes `docs/assets/grouped-list-<width>-<theme>.png` and `-menu-light.png`. Screenshots:
  ![390 menu](docs/assets/grouped-list-390-menu-light.png) ![320 dark](docs/assets/grouped-list-320-dark.png)
  ![1280 light](docs/assets/grouped-list-1280-light.png)

## File diff

`file-diff` is one changed file with its diff, moved from ops-hub's `file-diff.tsx`
([design-system#205](https://github.com/deanjstone/design-system/issues/205)). It pulls in `button`, `collapsible` and the
`diff-core` lib (the unified-diff parser, `parsePatch`). `npx shadcn add deanjstone/frontend/file-diff`.

```tsx
// `file` is GitHub's "list pull request files" shape; ops-hub's PullFile fits as it is.
<Card>
  <CardHeader><CardTitle>Files changed</CardTitle></CardHeader>
  <CardContent className="flex flex-col gap-2">
    {files.map((file) => (
      <FileDiff key={file.filename} file={file} bleed className="max-md:-mx-4" />
    ))}
  </CardContent>
</Card>
```

- **Everything wraps.** The file path, the hunk headers and every code line wrap (`whitespace-pre-wrap` keeps the
  indentation, `wrap-anywhere` breaks a token with no spaces). There is no sideways scroll at any width.
- **The sign has its own column.** The `+` or `−` sits in a narrow column apart from the code, so a wrapped line stays
  indented under its code.
- **One line-number column on phones.** From `md` up there are two (old, new). Below `md` there is one: the new line
  number, or the old one on a deleted line, which has no new one.
- **Edge to edge on phones.** `bleed` drops the block's side borders and rounded corners below `md` and keeps its body
  clear of the safe areas (`max-md:pl-safe max-md:pr-safe`). The block cannot know the padding of the card around it, so
  pair `bleed` with a negative margin that matches: `className="max-md:-mx-4"` inside a `p-4` card.
- **Collapsed past 400 lines**, or when the file has no patch (binary, too large, or a pure rename), which says why once
  opened. `defaultOpen` overrides it either way. Other props of `Collapsible` pass through.
- **Data attributes.** `data-slot="file-diff"` and `data-file` on the root; each line is `data-slot="file-diff-line"` with
  `data-line` of `hunk`, `add`, `del`, `context` or `note`.
- **Proof.** `node docs/file-diff/screenshots.mjs` builds the demo and opens it in one headless WebKit page at a time at
  390 (light and dark), 320 and 1280px. It checks no sideways scroll, nothing in a diff clipped or outside the viewport,
  the long code line and the long path wrapping in full, one line-number column below `md` and two above, and the diff
  running edge to edge in its card on phones. Writes `docs/assets/file-diff-<width>-<theme>.png`. Screenshots:
  ![390 light](docs/assets/file-diff-390-light.png) ![390 dark](docs/assets/file-diff-390-dark.png)
  ![320 light](docs/assets/file-diff-320-light.png)

## Relative time

`relative-time` is a lib item with one formatter and one clock-tick hook ([frontend#217](https://github.com/deanjstone-hl/frontend/issues/217)),
the single copy of what watchtower (`units.ts`), ops-hub (`format.ts`), knowledge (`live-notes-status.ts`) and budget (two files) each
wrote for themselves. It needs no other item and no package beyond your React. `npx shadcn add deanjstone/frontend/relative-time`.

```tsx
const now = useNow()                                  // epoch ms, refreshed every 30 s
formatRelativeTime(run.finishedAt, now)               // "5m ago"
formatRelativeTime(job.dueAt, now)                    // "in 2h"
formatRelativeTime(note.syncedAt, now, "never")       // "never" when there is no timestamp
```

- **`formatRelativeTime(value, now?, fallback?)`** takes an ISO string, epoch milliseconds or a `Date`. One unit, rounded
  down, so `5m ago` is five minutes and some seconds, never six. Under 5 s either side of now it reads `just now`, which
  also absorbs a little clock skew. Then `5s`, `5m`, `3h`, `2d`, as `5m ago` for the past and `in 5m` for the future.
- **Nothing past days.** 400 days back reads `400d ago`. A screen that wants a date there should switch to one.
- **No timestamp is not an error.** `null`, `undefined` and an unparseable value return `fallback` (empty by default).
- **`now` is yours.** It defaults to the clock. Pass the value from `useNow` to keep a label true, or a fixed one in a test.
- **`useNow(intervalMs = 30_000)`** returns the current time and re-renders on that interval; the timer stops on unmount.
  Each caller runs its own timer, so call it once in a list's parent and pass `now` down.

## Offline banner

`offline-banner` and the `use-online` hook it reads ([frontend#219](https://github.com/deanjstone-hl/frontend/issues/219)) are the
one copy of what knowledge and reader (`OfflineBanner.tsx`) and sparky (`useOnline`) each wrote for themselves, per the
[primitives usage audit](docs/audits/2026-11-12-primitives-usage.md). The banner is built on `alert` and its `warning`
variant ([frontend#210](https://github.com/deanjstone-hl/frontend/issues/210)). It declares `lucide-react` and pulls in `alert`
and `use-online`. `npx shadcn add deanjstone/frontend/offline-banner`, or `deanjstone/frontend/use-online` for the hook alone.

```tsx
<OfflineBanner />                                                 // "You're offline"
<OfflineBanner title="Offline" description="Reading from cache" />
const online = useOnline()                                        // false while the browser reports no network
```

| Export | What it does |
|---|---|
| `OfflineBanner` | Draws nothing while online. Offline it draws the `warning` `alert` with a wifi-off icon (`icon` replaces it, `icon={null}` drops it), a `title` (default "You're offline") and an optional `description`. A polite `role="status"` with `aria-live="polite"`, so it never interrupts a screen reader. It is a block: where it sits (top of the page, above a list) is yours, and it takes the `alert`'s other props (`className`, `data-*`, `id`) but not `variant` |
| `useOnline()` | `true` while the browser reports a network. It follows the window's `online` and `offline` events and stops on unmount. Several callers stay in step. On the server it reads `true`, so a hydrating page matches |

`navigator.onLine` is a hint: `true` means a network interface is up, not that your server answers, so a failed request is still
an `ErrorNotice`. When to use it: [DESIGN.md](DESIGN.md#offline-banner).

`test/use-online.test.tsx` and `test/offline-banner.test.tsx` fire the `online` and `offline` events, and
`test/offline-banner-registry.test.ts` holds the two entries. App adoption is filed per app, not done here.

## Copy button

`copy-button` ([frontend#220](https://github.com/deanjstone-hl/frontend/issues/220)) is the one copy of what ops-hub
(`promotion-parts.tsx`, the SHA button) and email (`CopyField.tsx`) each wrote for themselves, per the
[primitives usage audit](docs/audits/2026-11-12-primitives-usage.md). It is built on `button`, declares `lucide-react` and pulls
in `button`. `npx shadcn add deanjstone/frontend/copy-button`.

```tsx
<CopyButton value={sha} label={`Copy full SHA ${sha.slice(0, 7)}`} />              // icon only
<CopyButton value={url} onCopyError={(error) => toast.error(String(error))}>Copy</CopyButton>   // with a word
```

| Prop | What it does |
|---|---|
| `value` | The text that goes on the clipboard |
| `children` | The visible label while idle. With none it is an icon button, `icon-sm`; with some it is `sm`. The label swaps to `copiedLabel` or `failedLabel` after a click |
| `label` | The accessible name of an icon-only button (default "Copy"). It stays put after a click |
| `copiedLabel`, `failedLabel` | What the status region says, and what a labelled button shows (default "Copied", "Couldn't copy") |
| `resetAfter` | Milliseconds before copied or failed goes back to idle (default 2000). A second click restarts it |
| `onCopy(value)`, `onCopyError(error)` | After a copy, and when the clipboard rejects or the page has none (not https) |
| `variant`, `size`, `className`, `onClick`, other `Button` props | Passed to the `button`. `variant` defaults to `ghost`. `onClick` runs first, and `event.preventDefault()` in it skips the copy |

The state is `data-state` (`idle`, `copied`, `failed`) on the button. A polite `role="status"` sibling (`data-slot="copy-button-status"`)
is in the page from the first render and says the result, so a screen reader hears it. The button renders as `Button`
(`data-slot="button"`), so the 44px coarse-pointer floor applies. It returns the button and the status as a fragment: put it in a
flex row, not in a fixed-height one. `code-block` keeps its own `CodeBlockCopyButton`. When to use it: [DESIGN.md](DESIGN.md#copy-button).

`test/copy-button.test.tsx` stubs the clipboard (success, a rejection, none at all) and the timers, and
`test/copy-button-registry.test.ts` holds the entry. The geometry gate draws it as the `copy-button` view (an icon button beside a SHA and a
labelled button at the end of a wrapping value, in the AppShell), measures both against the 44×44 touch floor in every scenario, and keeps an aria baseline in
`scripts/geometry-gate/aria/copy-button.yml`. App adoption is filed per app, not done here.

## Markdown

`markdown` ([frontend#221](https://github.com/deanjstone-hl/frontend/issues/221)) is the one copy of what ops-hub
(`components/markdown.tsx`, react-markdown) and briefings (`lib/markdown.tsx`, a hand-rolled parser) each wrote for themselves,
per the [primitives usage audit](docs/audits/2026-11-12-primitives-usage.md). slate-reader's server keeps `marked`: its notes are
rendered to HTML on the server, so the iPad never parses Markdown ([frontend#73](https://github.com/deanjstone-hl/frontend/issues/73)).
It declares `react-markdown`, `remark-gfm`, `remend` and `cn`, each pinned to its minor, and pulls in `link-pill-core`.
`npx shadcn add deanjstone/frontend/markdown`.

```tsx
<Markdown>{issue.body}</Markdown>
<Markdown streaming link={LinkPill}>{message.text}</Markdown>   // an agent reply that is still arriving, links as pills
```

| Prop | What it does |
|---|---|
| `children` | The Markdown source, a string |
| `streaming` | The reply is still arriving. remend finishes half-written syntax (`**bold`, a code span) in the last block, a link whose URL has not closed is drawn as its text, an image whose URL has not closed is left out, and only the block being written is parsed again per chunk |
| `link` | The component every link is drawn with, `LinkPill` for pills. It gets `href`, the children and the anchor props, never `node`, and never a URL that failed the safe-scheme check. With a `link`, `mention:` and `geo:` links (the two schemes a pill reads) reach it; the default link never sees them |
| `headingOffset` | How many levels a heading moves down (default 2, because the page owns `h1` and `h2`; it stops at `h6`) |
| `components` | Overrides for single elements, merged over the defaults: `pre` or `code` for a highlighter, `table` for a different table. Keep the object stable between renders |
| `remarkPlugins` | Plugins that run after `remark-gfm`: ops-hub keeps its `#N` reference plugin here. Keep the array stable between renders |
| `urlTransform` | Rewrites a URL that has already passed the safe-scheme check: ops-hub maps a GitHub issue URL to its hub page here. Never called with a rejected URL or the pending placeholder |
| `className`, other `div` props | On the root `div[data-slot="markdown"]`, a flex column that wraps long words |

The default link opens an absolute URL in a new tab with `noreferrer noopener` and leaves a relative or in-page one in the tab.
It does not use `LinkPill` itself, so an app that wants no pills pays for none: pass `link={LinkPill}`.

**Why react-markdown.** Measured on 26 Nov 2026 (esbuild, minified, React external; the probe is 26 GFM and safety cases):

| | react-markdown + remark-gfm + remend | zero-dependency parser (briefings) | T3 Code's Words (`@pierre/words` 0.3.0) |
|---|---|---|---|
| gzip | 58.9 kB (49.6 kB without remend) | 1.1 kB | 49.5 kB the core with its WebAssembly, 84.8 kB with its React component |
| GFM and safety probe | 26 of 26 | 8 of 26: no tables, task lists, autolinks, footnotes, nested lists, blockquotes or images | 24 of 26: the core keeps `javascript:` and `data:` hrefs |
| render of 20 kB | 121 ms, so a stream cuts it into blocks (about 1.3 ms for the live one) | 6 ms | 0.5 ms |
| link hook | `components.a`, a React element: LinkPill drops in | none | hooks take and return HTML strings, so LinkPill's React shell, with its enricher context, cannot mount in one |
| unfinished link | remend's `streamdown:incomplete-link`, kept by this item's URL transform | none | an `a` with no `href` and a `data-markdown-incomplete` attribute |
| raw HTML | dropped by `skipHtml` | text | kept unless `skipHtml` or `allowedHtml` |

Words is the fastest by far, but T3 does not ship it as a package: its chat renders Words' HTML through 1,342 lines of its own
(`wordsHast.ts`, plus `@t3tools/shared` sanitising) into hast and then React, and it pins a patched tarball of an older release.
Words also takes no remark plugin, so ops-hub's `#N` plugin would have to be rewritten. The briefings parser is small and
safe, but it draws 8 of the 26 cases an issue body or an agent reply needs. The full comparison is on
[frontend#221](https://github.com/deanjstone-hl/frontend/issues/221).

**Things to know.**

- The item pins to the minor of three packages. A bump is `package.json` and `registry.json` together
  (`test/markdown-registry.test.ts` fails when they differ), then `pnpm build:registry`.
- There is no syntax highlighting in it. Pass a `pre` or `code` in `components`, built on `code-block` or `use-highlighted-code`.
- Footnote ids are fixed (`footnote-label`, `user-content-fn-1`), so two messages with footnotes on one page share them.
- A `streaming` text that holds a link reference definition, a footnote or raw HTML is parsed whole every chunk, because those tie
  blocks together. That is the same speed as no cut, not a wrong answer.
- `remark-gfm` uses a regex lookbehind, which Safari 9 cannot parse (checked by emulation in frontend#73, not on a device). That is why slate-reader's iPad build stays server-side.

When to use it: [DESIGN.md](DESIGN.md#markdown). `test/markdown.test.tsx` holds GFM, the safe-scheme and raw-HTML cases, the link hook
with `LinkPill`, the pending placeholder, the block cut (a streamed message renders the same as the finished one, and only the live
block is parsed again) and the consumer hooks, and `test/markdown-registry.test.ts` holds the entry. The geometry gate does not draw it:
it holds no control of its own, and a link in prose is not a touch target. App adoption is filed per app, not done here.

## Style

- `base-nova` shadcn style, OKLCH color tokens, Tailwind v4 (`@theme inline`,
  no `tailwind.config.js`).
- Base UI (`@base-ui/react`) primitives under the hood; components are copied,
  not installed as a dependency — once pulled into a consumer, edit them there.
  Composition uses Base UI's `render` prop, not Radix's `asChild`.
  Switched from `new-york`/Radix in [ADR-0001](docs/adr/0001-switch-component-library-to-base-ui.md).
- The `theme` item ships the full token set: core colors (background,
  foreground, primary/secondary/accent/muted, destructive, border/input/
  ring), plus `--radius`, `--card`, `--popover`, `--chart-1..5`, the status
  tokens `--success`/`--warning`/`--unreachable`/`--critical` (each with a
  `-foreground`; `badge` has a variant per role, and `alert` has `success`, `warning`
  and `critical`, each with a default icon you replace with `icon` or drop with `icon={null}`), and
  `--font-sans` (IBM Plex Sans — typeface is mechanics here, not identity;
  see [ADR-0002](docs/adr/0002-registry-owns-the-font-token.md)).
- Opt-in additions to the `theme` item (no effect unless a consumer uses
  the utilities): a 6-step `surface-0..5` dark-elevation ramp plus
  `surface-border`/`surface-border-light`, `pulse-slow`/`fade-in`/
  `slide-up` animations, `.card`/`.card-hover`/`.btn-primary`/`.btn-ghost`/
  `.badge`/`.input` plain-CSS component recipes, `.dark`-scoped
  selection/calendar-picker-icon styling for always-dark apps, a tokenized
  scrollbar thumb (both modes), `radius-2xl`/`radius-3xl`, `surface-glass`/
  `dialog-glass`/`dropdown-glass`/`surface-grain` opt-in chrome textures, and
  PWA/Electron app-shell mechanics (`pt-safe`/`pb-safe`/`pl-safe`/`pr-safe`,
  `--app-titlebar-*` topbar geometry, the `.wco` variant, `.drag-region`) —
  see [DESIGN.md](DESIGN.md#app-shell).
- **66 UI items**, three hooks and the `highlighter` lib, all `base-nova` style and Base UI-based, pulled the same
  way as `theme`/`button` above:
  - *Controls* — `button`, `input`, `textarea`, `select`, `native-select`,
    `combobox`, `checkbox`, `radio-group`, `switch`, `slider`, `input-otp`,
    `calendar`, `date-picker`, `label`, `kbd`. `native-select` is 44px tall with 16px text under a coarse
    pointer (also at `size="sm"`), so a phone neither misses it nor zooms into it; a mouse keeps 32px and 14px.
  - *Surfaces and overlays* — `card`, `dialog`, `alert-dialog`, `sheet`,
    `drawer`, `popover`, `hover-card`, `dropdown-menu`, `context-menu`,
    `collapsible`, `accordion`, `scroll-area`, `resizable`
  - *Display and feedback* — `badge`, `alert`, `avatar`, `progress`, `skeleton`,
    `separator`, `tabs`, `table`, `sonner`, `spinner`, `empty`, `tooltip`,
    `aspect-ratio`, `carousel`, `link-pill` (see [LinkPill](#linkpill)),
    `graph-3d` (a 3D force-graph orb; see [docs/graph-3d](docs/graph-3d/README.md))
  - *Conversation* — `message`, `bubble`, `message-scroller`, `marker`,
    `attachment`
  - *Agent turns* — `trace`, `code-block`, `questionnaire` (see
    [Agent-interface items](#agent-interface-items))
  - *Navigation and lists* — `sidebar` (with the `use-mobile` hook), `item`,
    `breadcrumb`, `command`, `menubar`, `navigation-menu`, `pagination`
  - *Forms and grouping* — `field`, `input-group`, `toggle`, `toggle-group`,
    `button-group`
  - *Data* — `chart` (recharts, loaded lazily) and `data-table`; see
    [Data primitives](#data-primitives)

  `tooltip` and `sidebar` need a `TooltipProvider` at the app root.
  `message-scroller` and `questionnaire` add the `@shadcn/react` package;
  `code-block` adds `shiki` (through `use-highlighted-code`); `command` adds `cmdk`;
  `calendar` adds `react-day-picker` and `date-fns`; `carousel` adds `embla-carousel-react`;
  `input-otp` adds `input-otp`; `resizable` adds `react-resizable-panels`;
  `graph-3d` adds `three` and `d3-force-3d` (through `graph-3d-engine`, loaded lazily).

  The set grows when a consuming app needs an item, not by shipping the whole
  shadcn catalogue. Adding another is mechanical, so ask rather than vendoring a
  copy locally. `registry.json` is the list of record; an item missing from it is not
  published.
