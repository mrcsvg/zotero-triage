/**
 * M3 foundation — the per-(item, folder) auto-score store.
 *
 * An item can carry a different LLM relevance score in each folder it belongs
 * to, so scores are keyed by the **pair** (itemKey, collectionKey) — never in
 * the Extra field (which is item-global and would collide across folders and
 * pollute sync). Manual priority always wins; an auto-score only fills items the
 * user hasn't prioritized by hand (see {@link ./resolve}).
 *
 * This module holds the storage-agnostic core: the record shape, the composite
 * key codec, and the freshness rule. The async persistence layer (get/put/
 * markFolderStale/…) is intentionally not implemented yet — the storage
 * mechanism (IndexedDB availability in the Zotero plugin sandbox is unconfirmed;
 * a profile JSON file via IOUtils is the likely fallback) is still an open
 * decision. See docs/plans/2026-06-30-llm-relevance-design.md.
 */

/** A single auto-score for one item within one folder. */
export interface ScoreRecord {
  itemKey: string;
  collectionKey: string;
  /** Relevance on the same 0–100 ruler as manual priority. */
  score: number;
  /** Short LLM justification, shown in the column tooltip. */
  reason: string;
  /** Provider/model that produced the score, e.g. "gpt-4o-mini". */
  model: string;
  /** Epoch milliseconds when the score was written. */
  scoredAt: number;
  /** True when the folder's prompt changed since this score was computed. */
  stale: boolean;
}

/** Separator for the composite key. Zotero keys are 8 alphanumerics — never "::". */
const KEY_SEP = "::";

/** Compose the composite store key for an (item, folder) pair. */
export function scoreKey(itemKey: string, collectionKey: string): string {
  return `${itemKey}${KEY_SEP}${collectionKey}`;
}

/** Split a composite key back into its item and collection parts. */
export function parseScoreKey(key: string): {
  itemKey: string;
  collectionKey: string;
} {
  const i = key.indexOf(KEY_SEP);
  return {
    itemKey: key.slice(0, i),
    collectionKey: key.slice(i + KEY_SEP.length),
  };
}

/**
 * Whether an item still needs an LLM score in a folder: true when it has no
 * record yet, or when its record was marked stale by a prompt edit. This is the
 * filter the "Score this folder" command uses to avoid re-spending tokens.
 */
export function needsScoring(record: ScoreRecord | undefined): boolean {
  return !record || record.stale;
}
