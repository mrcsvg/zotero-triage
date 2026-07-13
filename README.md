# Zotero Triage

[![Zotero 7](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square)](LICENSE)

A sortable **reading-priority column** for Zotero 7+. Built to answer the one
question Zotero can't answer natively: **"what do I read first?"**

---

## Why

If you accumulate a large reading backlog in Zotero, there's no native way to
order it by priority. The usual workarounds all fall short:

- **Tags** (`*`, `**`, `to-read`) clutter the tag pane and don't sort cleanly.
- **A "TO READ" collection** separates but doesn't order.
- **Reading-status plugins** (zotero-reading-list, Reading Flow) track _status_
  (read / unread / reading) but give no **sortable numeric priority**.

Zotero Triage fills that gap with a simple numeric column you can sort on. It's
local by default and has **no telemetry**. An **optional** AI classifier
(bring-your-own API key) can score a whole collection for you — but only when you
explicitly ask it to; see [Privacy](#privacy) and
[AI classification](#ai-classification-optional).

## Features

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
- **AI classification (optional):** right-click a collection → _Classify with AI…_,
  describe your project context, and let your configured provider score every item
  0–100. Off unless you set an API key. See below.
- **Preferences panel:** level values, shortcut step, column format, and AI provider/key.
- **i18n:** English (en-US) and Portuguese (pt-BR).

## Privacy

**No telemetry, ever.** The core priority column is fully local — set, sort, and
sync your priorities without anything leaving your device.

The only feature that uses the network is the **optional AI classification**, and
only when you invoke it. See below for exactly what is sent.

## AI classification (optional)

This feature is **off by default** and requires your own API key. When — and only
when — you run _Classify with AI…_ on a collection:

- Each item's metadata (title, abstract, creators, year, item type) **and** the
  project context you type are sent to the **provider you configured**
  (**Anthropic** or **OpenAI**; Vertex/Google planned).
- The model returns a 0–100 reading priority per item, saved to the same
  `ReadingPriority` Extra field as manual values.

Your **API key is stored locally** in the plugin's Zotero preferences (in your
profile), is **not** part of Zotero's data sync, and is never logged. If you never
set a key and never run the action, the plugin makes **no network calls**.

Configure it in **Preferences → Zotero Triage → AI classification**.

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
    ├── extra.ts        # namespaced read/write of the Extra field
    ├── collectionContext.ts  # per-collection AI prompt storage
    ├── classify.ts     # collection "Classify with AI…" menu + dialog
    └── ai/             # provider abstraction (prompt, Anthropic, OpenAI)
addon/                  # bootstrap.js, manifest.json, locales, content
test/                   # mocha unit tests (column, extra, format, ai-prompt, startup)
```

Contributing guidelines and agentic-development conventions live in
[`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CLAUDE.md`](CLAUDE.md).

## Data model

Priority is stored in the item's **Extra** field as namespaced key-value lines,
so it syncs and exports cleanly:

```
ReadingPriority: 85
```

Storing the value in Extra means it rides Zotero's native sync and survives
export — no separate database, nothing that can drift out of sync with your
library.

## License

[AGPL-3.0-or-later](LICENSE).

## Acknowledgements

Scaffolded from [`windingwind/zotero-plugin-template`](https://github.com/windingwind/zotero-plugin-template).
Prior art that informed the design: `Dominic-DallOsto/zotero-reading-list`,
Reading Flow, and `zotero/make-it-red`.
