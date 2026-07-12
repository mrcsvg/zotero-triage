# CLAUDE.md

Guidelines for agentic development (Claude Code and other AI coding agents) on
**Zotero Triage**. Read this before making changes. Human contributors should
also read [`CONTRIBUTING.md`](CONTRIBUTING.md); everything there applies here
too.

## What this project is (and is not)

Zotero Triage is a **Zotero 7+ plugin** that adds one thing done well: a
sortable, **fully local** reading-priority column. That focus is the product.

- ✅ In scope: the priority column, its display formats, the context menu,
  keyboard shortcuts, preferences, and Extra-field persistence.
- ❌ Out of scope: systematic-review workflows (ASReview / Rayyan / Covidence).
- 🚫 **No network, no telemetry.** The plugin must stay 100% local. Do not add
  `fetch`, analytics, remote calls, or any dependency that phones home.

> An LLM-assisted relevance layer was explored and **deliberately removed** for
> the V1 release. Do **not** reintroduce it — or any other cloud/LLM feature —
> without an explicit decision from the maintainer recorded in an issue first.
> If asked to add network behavior, stop and confirm scope before writing code.

## Commands

```bash
npm install
npm start          # build + hot-reload into the dev Zotero (needs .env)
npm run build      # production build of the .xpi + tsc --noEmit
npm run lint:check # prettier --check + eslint  (what CI runs)
npm run lint:fix   # prettier --write + eslint --fix
npm test           # mocha unit tests — runs INSIDE Zotero, needs .env
```

`npm test` launches the dev Zotero and runs mocha there; it fails with "No
Zotero Found" if `.env` isn't configured. CI runs `build`, `lint:check`, and
`test` on every push and PR — a change isn't done until those pass.

Set up `.env` from `.env.example` pointing at a **dedicated dev profile and data
directory**, never a real library.

## Architecture

```
src/
├── index.ts            # plugin entry
├── hooks.ts            # lifecycle (startup / shutdown)
├── addon.ts            # addon singleton + shared data
├── modules/
│   ├── column.ts       # registers the sortable Priority column
│   ├── menu.ts         # context-menu actions
│   ├── shortcuts.ts    # keyboard shortcuts
│   ├── prefs.ts        # preferences + display formatting (pure helpers)
│   └── extra.ts        # namespaced read/write of the Extra field
└── utils/              # ztoolkit, prefs, window, locale helpers
addon/                  # bootstrap.js, manifest.json, prefs.js, locales, content
test/                   # mocha unit tests
```

## Conventions (hard rules)

- **Language:** TypeScript. Keep type hints on public functions.
- **Data model:** priority lives in the item's **Extra** field as namespaced
  key-value lines (`ReadingPriority: 85`). Read/write it **only** through the
  helpers in [`src/modules/extra.ts`](src/modules/extra.ts) — never hand-edit
  the Extra text elsewhere. This is what makes values sync via Zotero's native
  sync and export cleanly.
- **Preferences:** defaults go in [`addon/prefs.js`](addon/prefs.js); the build
  prefixes them and generates the typed `PluginPrefsMap`. Access via the
  `getPref` / `setPref` helpers, not raw `Zotero.Prefs`.
- **i18n:** every user-facing string lives in
  `addon/locale/{en-US,pt-BR}/*.ftl` (Fluent) and is read via `getString(...)`.
  When you add a string, add it to **all** locales — don't hardcode UI text.
- **Pure, testable logic:** formatting/scoring helpers must be pure so they can
  be unit-tested outside Zotero. See [`src/modules/prefs.ts`](src/modules/prefs.ts)
  and [`test/format.test.ts`](test/format.test.ts) for the pattern (import the
  helper directly, no Zotero runtime needed). Prefer extracting pure logic over
  testing through the Zotero API.
- **Style:** Prettier + ESLint (`@zotero-plugin/eslint-config`). Run
  `npm run lint:fix` before committing; CI fails on `lint:check`.

## Working style for agents

- **Stay scoped.** One logical change at a time. Match the surrounding code's
  naming, comment density, and idiom — read a neighboring module before writing.
- **Test what you change.** Add or update a test for behavior changes; put the
  logic in a pure helper so it's testable without launching Zotero.
- **Verify before claiming done.** Run `npm run build` and `npm run lint:check`.
  If you can't run `npm test` (no dev Zotero in the environment), say so plainly
  rather than implying the suite passed.
- **Don't touch the scaffold blindly.** `bootstrap.js`, `zotero-plugin.config.ts`,
  and the build wiring come from the upstream template — change them only with a
  clear reason.
- **Ask before expanding scope.** New dependencies, network behavior, new
  permissions, or anything that changes the "fully local" guarantee needs an
  explicit go-ahead. When in doubt, propose in an issue first.

## Pull requests

Branch off `main`, keep the PR focused (one logical change), ensure `build` and
`lint:check` pass, and fill in the PR template. Link the issue it closes and
include a screenshot/GIF for any UI change.
