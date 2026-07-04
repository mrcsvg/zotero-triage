# LLM-assisted relevance ranking (opt-in) — Design

**Date:** 2026-06-30
**Status:** Approved (brainstorming)
**Supersedes:** the original Phase 2/3 "local auto-ranking" (TF-IDF + local classifier),
whose issues were deleted on 2026-06-29.

---

## Why the change

The original Phase 2/3 specified on-device TF-IDF + a lightweight classifier
(logistic / naive Bayes) trained on relevant/irrelevant labels. The *goal* —
"rank what's worth reading" — still holds, but the *mechanism* was the wrong
technical approach. This design keeps the goal and replaces the mechanism with an
**opt-in LLM** that the user powers with their own API key.

Privacy stance shifts from "no network, ever" to **"no network by default;
opt-in network if you bring your own key."** With no provider configured, the
plugin is byte-for-byte as local as v0.0.1.

---

## Locked decisions

| Decision | Choice |
|---|---|
| Mechanism | LLM via the user's own API key, **opt-in** |
| Privacy | No network by default; network only when the user configures a key |
| Reference frame | Relevance prompt **per folder (collection)** |
| Score scope | Per **(item, folder)**, stored in plugin-local storage (not Extra); column shows the open folder's score |
| Manual vs auto | **Manual always wins**; auto only fills items with no manual value |
| Trigger | **Manual command "Score this folder"**, with a cost estimate first |
| Batch size / concurrency | Configurable; defaults **15 / 3** |
| First providers | OpenAI + Anthropic |
| Prompt inheritance | Nested folders do **not** inherit the parent prompt (YAGNI for now) |

---

## Architecture

New modules under `src/relevance/`:

- `provider.ts` — `RelevanceProvider` interface. Contract:
  `scoreItems(items, folderPrompt) → {itemKey, score, reason}[]`. Concrete
  implementations: `OpenAIProvider`, `AnthropicProvider`. **The only place that
  touches the network.**
- `folder-prompts.ts` — CRUD for `collectionKey → prompt`, persisted in prefs.
- `score-store.ts` — persistence of `(itemKey, collectionKey) → {score, reason,
  model, scoredAt, stale}` in a per-folder JSON file in the profile (see the
  persistence note below). Source of truth for the auto-score.
- `scoring-command.ts` — orchestrates "Score this folder": collect unscored items →
  estimate cost → confirm → call provider in batches → write to `score-store`.

**Display layer.** The existing priority column calls
`resolvePriority(item, currentCollection)`:

```
manual = parseExtra(item).ReadingPriority
if (manual != null) return { value: manual, source: 'manual' }
auto = scoreStore.get(item.key, collection.key)
if (auto != null) return { value: auto.score, source: 'auto' }
return { value: null, source: 'none' }
```

A subtle visual indicator (icon / italic) distinguishes `auto` from `manual`.

**Import boundaries.** UI/column imports from `relevance/`;
`relevance/provider.ts` is the only module with `fetch`; `score-store` and
`folder-prompts` know nothing of network or UI.

---

## Data model & persistence

1. **Provider config** (API key, model, active provider) → `Zotero.Prefs`,
   namespace `extensions.zotero-triage.*`. Local-only, never in Extra, never
   synced. API key lives only in local prefs.
2. **Folder prompts** (`collectionKey → text`) → `Zotero.Prefs` as a namespaced
   JSON blob (`...folderPrompts`). Few folders carry prompts; no DB needed.
3. **Scores** (`(itemKey, collectionKey) → {...}`) → **a per-folder JSON file in
   the profile**, written via `IOUtils`/`Zotero.File` (e.g.
   `<profile>/zotero-triage/scores/<collectionKey>.json`). Records use the
   composite key `itemKey::collectionKey` and store `reason` (short LLM
   justification, used in tooltip) and `scoredAt`.

   > **Storage decision (2026-07-04, supersedes IndexedDB).** The original design
   > named IndexedDB. IndexedDB availability in the Zotero 7 (Gecko) plugin
   > sandbox is unconfirmed, whereas `IOUtils`/`Zotero.File` are guaranteed
   > present and trivial to test under the harness. A personal library's scores
   > fit comfortably in per-folder JSON files, and keying files by
   > `collectionKey` means "Score this folder" loads/saves only that folder's
   > map. Revisit IndexedDB only if scale ever demands indexed queries.

**Unified scale 0–100**, matching manual priority, so sorting a folder mixes
manual and auto on one ruler.

**Invalidation.** Editing a folder's prompt marks that folder's scores `stale`
(not deleted); the command re-scores only the stale ones.

---

## Scoring flow ("Score this folder")

1. **Collect.** Items in the open folder that are `source: 'none'` or `stale`.
   Items with a manual priority are **skipped** (manual wins — no tokens spent).
2. **Cost estimate.** Before any network: a dialog —
   *"42 items will be scored (~18k tokens, ~US$0.03 on model X). Continue?"*
   Token count of `title + abstract` × item count + prompt overhead × model
   price. This is the **cost guard** — nothing runs without confirmation.
3. **Batched calls.** Group **N items per call** (default 15), requesting
   structured JSON `{itemKey, score 0–100, reason}` per item. Batches cut cost +
   latency and contain the blast radius of a failure. Limited concurrency
   (default 3) to respect rate limits.
4. **Progress & partial.** Per-batch progress bar; cancelable. Whatever returned
   is persisted — re-running resumes (only `none`/`stale`).
5. **Errors.** API/network/invalid-key → actionable message, existing scores
   untouched. A failed batch stays `none` and re-enters the next round.
6. **Output validation.** Structured JSON is validated; a missing item or
   out-of-range score is discarded (→ `none`), never fabricated.

---

## Providers, preferences & prompt UX

**Provider abstraction.** `RelevanceProvider` is the only network surface.
First cut: **OpenAI** and **Anthropic**. Adding another = one new class.
Responses normalized to `{itemKey, score, reason}` regardless of provider.

**Preferences panel** (plugin tab):
- Provider selector (None / OpenAI / Anthropic). **Default: None** → fully local.
- Masked API-key field + "Test key" button (minimal call).
- Model selector (per provider).
- Batch size & concurrency (advanced; defaults 15 / 3).
- Clear consent text: *"Enabling this sends each item's title and abstract to the
  chosen provider. With no provider, no data leaves your machine."*

**Per-folder prompt UX.** Collection context menu: **"Set relevance prompt…"**
opens a textarea dialog. A folder with a prompt gets a discreet indicator.
Without a prompt, "Score this folder" is disabled and explains why. Editing the
prompt marks the folder's scores `stale`.

**Column tooltip.** Shows the LLM `reason` when `source: 'auto'`; "Set manually"
when manual.

---

## Testing

- **Unit, no network**: `resolvePriority` (all manual/auto/none/stale combos),
  `folder-prompts` CRUD, `score-store` (composite key, stale, get/put), LLM
  JSON parser/validator (including garbage: missing item, out-of-range score).
- **Provider with fakes**: mocked `RelevanceProvider` returning fixed responses —
  exercises batching, partial failure, cancellation, resume. Zero real calls.
- **Cost estimator**: given N items and a model, validate against known numbers.
- Real-network coverage stays **out** of automated tests (manual, opt-in).

---

## Roadmap (replaces the three emptied milestones)

**M3 — LLM relevance: core (Phase 2)**
- `RelevanceProvider` interface + `src/relevance/` skeleton
- `score-store` in per-folder profile JSON files (composite key, stale)
- `folder-prompts` in prefs + "Set relevance prompt" UX
- `resolvePriority` + column integration (manual-wins, auto/manual indicator)
- OpenAI provider (structured JSON output)

**M4 — Command, cost & UX (Phase 2)**
- "Score this folder" command (collect → estimate → batches → progress/cancel)
- Cost guard (estimate dialog before running)
- Preferences panel (provider, key, test, model, advanced)
- Anthropic provider
- Tooltip with `reason`; invalidation on prompt edit

**M5 — Robustness & polish (Phase 3, backlog)**
- Rate-limit/retry with backoff
- Re-score stale in bulk; "clear folder scores"
- Prompt inheritance for nested folders (opt-in)
- Interop with Reading Flow / reading-list

**Release & Distribution** (#20, #21) unchanged.
