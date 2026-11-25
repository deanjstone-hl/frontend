# Primitives usage audit: the scripts

The scripts behind [`docs/audits/2026-11-12-primitives-usage.md`](../2026-11-12-primitives-usage.md). Every number in that doc comes from `output/`.

## Part A: usage across every app

```bash
node docs/audits/primitives-usage/collect.mjs            # fetches each repo, then reads origin/main
node docs/audits/primitives-usage/collect.mjs --no-fetch # reuse what is already fetched
```

- Reads the apps listed in `apps.json` from `~/repos/<repo>` (`--repos <dir>` to change it). It runs `git fetch`, `git ls-tree` and `git cat-file` only: nothing is checked out or written in those repos. A repo marked `"remote": true` that is not cloned there is cloned bare into `~/.cache/primitives-usage/`.
- Writes `output/data.json` and `output/report.md`: the usage matrix, drift against all release tags, bypasses, token use against hardcoding, and the design-system#207 scale data.
- `measure.mjs` holds the parsers; `test/primitives-usage.test.ts` pins them.

## Part B: render and score an app

One app at a time, one browser page at a time. Nothing here starts in the background.

1. **Build the app** from a throwaway worktree of its `origin/main` and copy its `dist` to `~/.cache/primitives-usage/dist/<app>/`:

   ```bash
   git -C ~/repos/<repo> worktree add ~/.t3/worktrees/<repo>/audit-render origin/main --detach
   cd ~/.t3/worktrees/<repo>/audit-render/<app dir>
   pnpm install --frozen-lockfile        # behind gate.sh
   # an app that reads VITE_ variables: write .env.production.local with dummy 127.0.0.1 values
   pnpm exec vite build
   cp -r dist/. ~/.cache/primitives-usage/dist/<app>/
   git -C ~/repos/<repo> worktree remove --force ~/.t3/worktrees/<repo>/audit-render
   ```

2. **Describe its screens** in `screens/<app>/config.json` (see the header of `render.mjs`), with fixtures in `mocks.json` and, for a signed-in session, `init.js`. A mock URL must match what the built app requests (check `blocked` and `unmockedLocal` in `scorecard.json`, and that the list is not empty). An app that filters by today's date pins the page clock in `init.js` (`screens/jobs/init.js`), so the screenshots do not change as the days pass.

3. **Render it:**

   ```bash
   docs/audits/primitives-usage/render-app.sh <app>                  # every screen
   docs/audits/primitives-usage/render-app.sh <app> --only <screen>  # one, while writing fixtures
   ```

   It waits at `gate.sh` (2500 MB available, memory pressure under 10), serves the cached build with `serve.mjs`, runs `render.mjs`, stops the server and compresses the screenshots. Every request that leaves localhost is answered from `mocks.json` or aborted and listed, so a run cannot reach a live system.

4. **Summarise:** `node docs/audits/primitives-usage/scores.mjs` writes `output/scorecard.md`.

To change a threshold or a screen's `primaryAction` without rendering again: edit `scorecard.mjs` or the config, then `node docs/audits/primitives-usage/render.mjs screens/<app>/config.json --rescore`.

### budget/web: a session in a cookie and an API on another origin

`screens/budget` renders `/home`, `/activity` and `/budget` of [budget](https://github.com/deanjstone-hl/budget)'s SPA (`web/`, pnpm workspace: `pnpm install --frozen-lockfile --filter web`, then `pnpm --dir web exec vite build`). Three things differ from the other apps:

- **Build env.** `web/.env.production.local` takes dummy values: `VITE_SUPABASE_URL=http://127.0.0.1:59004`, `VITE_API_BASE_URL=http://127.0.0.1:59003`, `VITE_COOKIE_DOMAIN=` (empty, so the session cookie is host-only; the production default is `.myargus.cc`, which a 127.0.0.1 page cannot set), `VITE_DEMO_MODE=false`.
- **Session.** `@supabase/ssr` keeps the session in the `sb-127-auth-token` cookie, not localStorage. `init.js` writes it (`base64-` plus base64url JSON) and pins the page clock to 10 Nov 2026.
- **Data.** Both origins are cross-origin to the page, so `mocks.json` matches full URLs. Auth: `/auth/v1/user` and `/auth/v1/passkeys` (the route guard sends a user with no passkey to `/passkey-setup`). API: `/api/bootstrap`, `/api/dashboard`, `/api/transactions`, `/api/notifications`, `/api/tags`, `/api/budget/list-summary`, `/api/budget/approvals` and the `POST /api/actions/<module>/<fn>` calls for accounts, categories, category mappings and budgets. Money is in cents. The fixtures are invented (Owner, a Spending and a Savings account, two budgets).

`/budget` is the budgets list; a single budget's page (`/budget?id=<id>`) needs `/api/budget/summary` and the layout, column and sharing endpoints, and is not captured. The activity totals are a counting animation, so the screenshot catches them part-way (`$148,286.33` for a mock of `$148,300.00`).

### WebKit on this host

`npx playwright-core install webkit` downloads the browser, but Ubuntu 24.04 lacks four libraries it needs (`libavif16`, `libflite1`, `libwoff1`, `libgstreamer-plugins-bad1.0-0`). Without root: `apt-get download` them and their dependencies, unpack with `dpkg -x` into `~/.cache/pw-webkit-libs/root`, and link the `.so` files into `~/.cache/ms-playwright/webkit-<build>/minibrowser-wpe/sys/lib/`. With root, `sudo npx playwright-core install-deps webkit` does the same.

### What the harness cannot show

- Real safe-area insets or an installed PWA: headless WebKit reports zero for `env(safe-area-inset-*)`. `*-iphone-insets-light.png` sets the registry's `--safe-*` tokens to an iPhone's values instead, which only moves apps that read those tokens.
- Anything behind an interaction. Screens are captured as they load.

## The samples

`screens/layout-demo` is the geometry gate's AppShell harness page, rendered before and after the opt-in phone title ([frontend#208](https://github.com/deanjstone-hl/frontend/issues/208)): `hidden` is `PageHeader hideOnPhone` with no `pageTitle`, `titled` passes it. It is a baseline like the others (`scores.mjs` leaves it out of the app counts). Build it with `GATE_OUT=~/.cache/primitives-usage/dist/layout-demo npx vite build -c scripts/geometry-gate/harness/vite.config.mjs`, then `render-app.sh layout-demo`.

`proposed/` is five sample screens in the style of `docs/audits/hierarchy-density/proposed.tsx`. `screens/ds-sample` and `screens/proposed` hold their build commands in `config.json`.
