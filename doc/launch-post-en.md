# Zotero Triage — reading priority for Zotero

*One sortable numeric column to answer the question Zotero never could: "what do I read first?"*

---

## The problem

Anyone with a growing Zotero library knows the feeling: hundreds of items in the queue and
no native way to order them by **what matters to read first**. Today's options are all
workarounds:

- **Tags** (`*`, `**`, `to-read`) — they work, but clutter the tag pane, don't sort cleanly,
  and need constant manual upkeep.
- **A "TO READ" collection** — separates, but neither orders nor prioritizes.
- **Reading-status plugins** (zotero-reading-list, Reading Flow) — solve *status*
  (read / unread), but give no **sortable numeric priority value**.

The request has shown up on the Zotero forums since ~2007 and never became a native feature
or a single-purpose plugin. **Zotero Triage** fills exactly that gap.

## The solution

One simple thing, done well:

- A sortable **`Priority` column** in the item tree, showing a 0–100 integer.
- A **context menu** (right-click → *Zotero Triage*): quick levels (High / Medium / Low),
  a custom value, and "clear" — applied to **many items at once**.
- **Keyboard shortcuts**: `Alt+↑` / `Alt+↓` raise/lower priority; `Alt+Backspace` clears.
- Configurable **display formats**: number, **stars** (★★★☆☆), or a **mini-bar** (███░░).
- **Persistence in the Extra field** — stored as `ReadingPriority: 85`, so it **rides
  Zotero's native sync** and **needs no external database**.
- **PT/EN** and **zero telemetry, zero network**: nothing leaves your device.

## The technical part that almost got us

The plan was a "weekend" plugin for Zotero 7. In practice the target machine was already
**Zotero 9.0.4** (built on Firefox 140 ESR), and three traps only surfaced when running
against the real version:

1. **Dev install changed.** Firefox 140 removed silent sideloading from the profile's
   extensions folder. The old "pointer file" trick and a dropped-in `.xpi` **simply don't
   load** on Zotero 9. The fix was letting the scaffold install the plugin as a **temporary
   add-on** over the debugging bridge — the only path that works.

2. **The template's column API is broken on 9.** The (deprecated, plural) `registerColumns`
   throws silently; only `registerColumn` (singular) actually registers the column.

3. **Numeric sorting isn't free.** The item tree sorts the column by the *string* returned.
   A raw number sorts lexically — putting **"100" before "20"**. The fix: the data provider
   returns a **zero-padded key** (`020`, `100`) for sorting, while the cell renders the clean
   integer. Result: order **3, 9, 20, 100** — not the wrong 100, 20, 3, 9.

Those three findings were worth more than the code itself: each would have been a silent
launch bug.

## Benchmark (honest numbers)

What is **measurable today**, on real Zotero 9:

| Metric | Value |
|---|---|
| `.xpi` size | **38 KB** (no runtime dependencies) |
| Automated tests | **14/14 green**, running *inside* a real Zotero 9 |
| Sort correctness | numeric `[3, 9, 20, 100]` vs. naive lexical `[100, 20, 3, 9]` |
| Plugin's own compute | **~1.8 ms** to build sort keys + 3 formats for **5,000 items** |

In other words: the plugin's own work is negligible — the bottleneck on a large library is
Zotero's own I/O, not the column.

> **Not measured yet (full honesty):** the *relevance benchmark* for the auto-ranking layer
> (below) doesn't exist yet, because that layer hasn't been built. Planned methodology: label
> ~100 items, measure the **% of relevant items found in the top 20%** of the ranked list,
> and compare against simple date ordering as a baseline — before claiming any value.

## What's next (roadmap)

The long-term differentiator is **local automatic prioritization**: mark a few items as
relevant / not relevant, train a lightweight classifier (TF-IDF + logistic regression or
naive Bayes) **in memory, no network**, and rank the rest of the library — designed for
**continuous triage** of a growing library, not systematic review of a fixed corpus.
All behind a *provider* interface, so embeddings/LLMs (opt-in) become just a pluggable
alternative later.

## Why it matters

It's not just another plugin: it's the "simple" piece that was missing — a sortable priority
column that syncs, doesn't lock you into an external database, and sends nothing anywhere.
And the foundation is ready for the part nobody offers: automatic ranking that learns from
what **you** find relevant.

*No telemetry. No network. Your device, your data.*
