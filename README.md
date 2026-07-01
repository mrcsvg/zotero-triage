# Zotero Triage

[![Zotero 7](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square)](LICENSE)

A sortable **reading-priority column** for Zotero 7+, with an optional
LLM-assisted relevance layer (planned, opt-in). Built to answer the one question
Zotero can't answer natively: **"what do I read first?"**

> **Status:** Phase 1 (manual priority MVP) is implemented and usable. The
> opt-in LLM relevance layer (Phase 2) is specified but **not yet built**.
> See [Roadmap](#roadmap).

---

## Why

If you accumulate a large reading backlog in Zotero, there's no native way to
order it by priority. The usual workarounds all fall short:

- **Tags** (`*`, `**`, `to-read`) clutter the tag pane and don't sort cleanly.
- **A "TO READ" collection** separates but doesn't order.
- **Reading-status plugins** (zotero-reading-list, Reading Flow) track _status_
  (read / unread / reading) but give no **sortable numeric priority** and no
  automatic ranking.

Zotero Triage fills that gap with a simple numeric column you can sort on — and,
later, an **opt-in** LLM that scores each item's relevance against a prompt you
set per collection. No provider configured means no network: the plugin stays
100% local.

## Features (Phase 1 — implemented)

- **Sortable `Priority` column** in the item tree, registered via
  `Zotero.ItemTreeManager`. Numeric sort is correct (100 sorts above 20, not
  lexically) — see [`src/modules/column.ts`](src/modules/column.ts).
- **Display formats:** number, stars (0–5), or mini-bar — switchable in preferences.
- **Context menu** → _Zotero Triage_: quick levels (High / Medium / Low),
  Custom… (type a 0–100 value), and Clear.
- **Keyboard shortcuts** (chosen to avoid the `Alt+NUM` collision with Zotero's
  native column-sort):
  - `Alt+↑` — raise priority by the configured step
  - `Alt+↓` — lower priority by the configured step
  - `Alt+Backspace` — clear priority
- **Multi-select:** apply a value to several items at once.
- **Persistence in the Extra field** as a namespaced key (`ReadingPriority: 85`),
  so values **sync via Zotero's native sync** and survive restarts —
  see [`src/modules/extra.ts`](src/modules/extra.ts).
- **Preferences panel:** level values, shortcut step, and column format.
- **i18n:** English (en-US) and Portuguese (pt-BR).

## Privacy

No telemetry, ever. **No network by default** — with no provider configured, the
plugin is fully local and nothing leaves your device.

The Phase 2 relevance layer is **opt-in**: only when you configure your own API
key does the plugin call a provider, and it sends only each item's **title and
abstract** to the provider you chose. Your API key stays in local preferences and
is never synced. Manual priorities and everything else remain on-device.

## Install

Requires **Zotero 7.0+**.

1. Download the latest `.xpi` from the [Releases](../../releases) page.
2. In Zotero: **Tools → Plugins → gear icon → Install Plugin From File…** and
   select the `.xpi`.
3. Right-click the item-tree column header to enable the **Priority** column.

## Development

Built on the [`windingwind/zotero-plugin-template`](https://github.com/windingwind/zotero-plugin-template)
scaffold (TypeScript + [`zotero-plugin-toolkit`](https://github.com/windingwind/zotero-plugin-toolkit)).

```bash
npm install
cp .env.example .env       # point ZOTERO_PLUGIN_ZOTERO_BIN_PATH / PROFILE_PATH at a dev profile
npm start                  # serve with hot reload into a dev Zotero
npm test                   # mocha unit tests
npm run build              # build the .xpi + tsc --noEmit
npm run lint:fix           # prettier + eslint
```

> Use a **separate Zotero profile and data directory** for development so you
> never risk your real library.

### Layout

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
addon/                  # bootstrap.js, manifest.json, locales, content
doc/                    # full spec + launch notes
test/                   # mocha unit tests (column, extra, format, startup)
```

The full design spec lives in [`doc/zotero-triage-spec.md`](doc/zotero-triage-spec.md).

## Roadmap

| Phase                       | Deliverable                                                                                                                                             | Status         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **1 — MVP**                 | Manual priority column + menu + shortcuts + Extra persistence                                                                                           | ✅ Implemented |
| **2 — LLM relevance**       | Opt-in LLM (your own API key) scores items against a **per-collection prompt**; manual priority always wins; scored on demand with a cost estimate first | 📋 Specified   |
| **3 — Robustness & polish** | Retry/backoff, bulk re-score, prompt inheritance for nested folders, Reading Flow interop                                                               | 🅿️ Backlog     |

Privacy: **no network by default.** Relevance scoring only reaches a provider
once you configure a key, and it sends only each item's title and abstract.

See [`docs/plans/2026-06-30-llm-relevance-design.md`](docs/plans/2026-06-30-llm-relevance-design.md)
for the full design, and [`doc/zotero-triage-spec.md`](doc/zotero-triage-spec.md) §4/§12 for the original spec.

## Data model

Priority is stored in the item's **Extra** field as namespaced key-value lines,
so it syncs and exports cleanly:

```
ReadingPriority: 85
```

Only the **manual** priority lives in Extra (item-global, syncs cleanly). Phase 2
auto-scores are **per (item, collection)** and live in the plugin's local storage
(IndexedDB), not in Extra — so they never sync and never collide across the
different collections an item may belong to. Manual always wins: an auto-score
only fills items you haven't prioritized by hand.

## License

[AGPL-3.0-or-later](LICENSE).

## Acknowledgements

Scaffolded from [`windingwind/zotero-plugin-template`](https://github.com/windingwind/zotero-plugin-template).
Prior art that informed the design: `Dominic-DallOsto/zotero-reading-list`,
Reading Flow, and `zotero/make-it-red`.
