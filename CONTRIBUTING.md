# Contributing to Zotero Triage

Thanks for your interest in contributing! This is a Zotero 7+ plugin that adds a
sortable reading-priority column. Bug reports, fixes, and scoped features are all
welcome.

## Scope

Before proposing a feature, check it fits the project's intent (see the
[README](README.md)):

- ✅ A simple, sortable **numeric priority column**, plus the **opt-in** AI
  classification that scores a collection into that same column.
- ❌ **Not** a systematic-review tool (ASReview / Rayyan / Covidence cover that).
- ❌ **No telemetry, ever.** The only sanctioned network I/O is the opt-in AI
  classification (issue #38); it sends data only to the user's configured provider
  and only when invoked. Don't add any other network calls or phone-home behavior.

## Development setup

Prerequisites: a recent Node.js LTS and a local **Zotero 7** install.

```bash
git clone https://github.com/mrcsvg/zotero-triage.git
cd zotero-triage
npm install
cp .env.example .env     # then edit it (see below)
```

Edit `.env` to point at Zotero and a **dedicated dev profile** — never your real
library:

- `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` — path to the Zotero binary
  (`*/Zotero.app/Contents/MacOS/zotero` on macOS).
- `ZOTERO_PLUGIN_PROFILE_PATH` — a separate profile created via
  `/path/to/zotero -p`. See the
  [profile directory docs](https://www.zotero.org/support/kb/profile_directory).

Then:

```bash
npm start          # build + hot-reload into the dev Zotero
npm run build      # production build of the .xpi + tsc --noEmit
npm run lint:fix   # prettier --write + eslint --fix
npm run lint:check # prettier --check + eslint  (what CI runs)
npm test           # mocha unit tests — runs INSIDE Zotero, needs the .env above
```

> **Tests run inside Zotero.** `npm test` launches the dev Zotero and runs the
> mocha suite there; it will fail with "No Zotero Found" if `.env` isn't set.
> CI runs `build`, `lint`, and `test` on every push and PR.

## Project layout

```
src/
├── index.ts            # plugin entry
├── hooks.ts            # lifecycle (startup/shutdown)
└── modules/
    ├── column.ts       # registers the sortable Priority column
    ├── menu.ts         # context-menu actions
    ├── shortcuts.ts    # keyboard shortcuts
    ├── prefs.ts        # preferences + display formatting
    └── extra.ts        # namespaced read/write of the Extra field
addon/                  # bootstrap.js, manifest.json, locales (.ftl), content
test/                   # mocha unit tests
```

## Conventions

- **Language:** TypeScript. Keep type hints on public functions.
- **Style:** Prettier + ESLint (`@zotero-plugin/eslint-config`). Run
  `npm run lint:fix` before committing; CI fails on `lint:check`.
- **Data model:** priority and labels are persisted in the item's **Extra**
  field as namespaced key-value lines (`ReadingPriority: 85`,
  `ReadingPriorityMode`, `ReadingPriorityLabel`). Read/write them through the
  helpers in [`src/modules/extra.ts`](src/modules/extra.ts) — don't hand-edit the
  Extra text. This is what makes values sync via Zotero's native sync.
- **i18n:** user-facing strings live in `addon/locale/{en-US,pt-BR}/*.ftl` (Fluent)
  and are read via `getString(...)`. Add new strings to **all** locales.
- **No telemetry.** Network I/O is limited to the opt-in AI classification (only
  to the user's configured provider, only when invoked); don't add any other.
- **Pure, testable logic:** formatting/scoring helpers should be pure so they can
  be unit-tested outside Zotero (see `test/format.test.ts`).

## Pull requests

1. Branch off `main`.
2. Make the change; add or update tests where it makes sense.
3. Ensure `npm run build` and `npm run lint:check` pass locally; smoke-test in a
   dev Zotero (`npm start`).
4. Open a PR using the template. Link the issue it closes and include a
   screenshot/GIF for any UI change.

Keep PRs focused — one logical change per PR is much easier to review.

## Reporting bugs / requesting features

Use the issue templates (Bug report / Feature request). Include your Zotero
version, plugin version, and OS for bugs.

## License

By contributing, you agree that your contributions are licensed under the
project's [AGPL-3.0-or-later](LICENSE) license.
