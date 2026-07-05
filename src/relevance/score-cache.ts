/**
 * M4 — the synchronous score cache backing the Priority column.
 *
 * Zotero's item-tree `dataProvider`/`renderCell` are synchronous, but per-folder
 * scores live on disk and load asynchronously (see {@link ./score-store}). So the
 * column reads scores from this in-memory cache, which holds exactly one folder's
 * scores at a time — the currently open collection's.
 *
 * The cache is kept fresh without any collection-selection event: the column asks
 * {@link ensureCacheFor} for the current folder on every paint; when that differs
 * from what's cached, a single async load runs and repaints the tree when it
 * lands (the paint before the load simply shows manual-only values). This is
 * self-healing and works across windows.
 *
 * The cache container ({@link ScoreCache}) and the reload decision
 * ({@link shouldRefresh}) are pure and unit-tested; the async loader and repaint
 * are Zotero-runtime.
 */

import {
  loadFolderScores,
  type FolderScores,
  type ScoreRecord,
} from "./score-store";

/** Holds one folder's scores for synchronous, per-item lookup. */
export class ScoreCache {
  private scores: FolderScores = {};
  private key: string | null = null;

  /** The collection whose scores are currently cached, or null if none. */
  get collectionKey(): string | null {
    return this.key;
  }

  /** Load a folder's scores, replacing whatever was cached. */
  setFolder(collectionKey: string, scores: FolderScores): void {
    this.key = collectionKey;
    this.scores = scores;
  }

  /** Drop all cached scores (e.g. when leaving a collection view). */
  clear(): void {
    this.key = null;
    this.scores = {};
  }

  /** The cached score record for an item, or undefined. */
  get(itemKey: string): ScoreRecord | undefined {
    return this.scores[itemKey];
  }
}

/** The process-wide cache the column reads. */
export const scoreCache = new ScoreCache();

/**
 * Whether the cache should be (re)loaded for `currentKey`: only when a real
 * collection is open, it isn't already cached, and no load for it is in flight.
 */
export function shouldRefresh(
  cacheKey: string | null,
  currentKey: string | null,
  inFlightKey: string | null,
): boolean {
  if (currentKey === null) return false;
  if (cacheKey === currentKey) return false;
  if (inFlightKey === currentKey) return false;
  return true;
}

let inFlightKey: string | null = null;

/**
 * Make the cache reflect the currently open collection. Fire-and-forget from the
 * column's synchronous data path: when `currentKey` is a collection not yet
 * cached, load it and call `onLoaded` (which repaints the tree) once it's ready.
 * A null `currentKey` (non-collection view) clears the cache.
 */
export async function ensureCacheFor(
  currentKey: string | null,
  onLoaded: () => void,
): Promise<void> {
  if (currentKey === null) {
    if (scoreCache.collectionKey !== null) {
      scoreCache.clear();
      onLoaded();
    }
    return;
  }
  if (!shouldRefresh(scoreCache.collectionKey, currentKey, inFlightKey)) return;

  inFlightKey = currentKey;
  try {
    const scores = await loadFolderScores(currentKey);
    scoreCache.setFolder(currentKey, scores);
    onLoaded();
  } finally {
    inFlightKey = null;
  }
}

/**
 * Force-reload a folder's scores into the cache (after scoring has written new
 * records for it), regardless of what's currently cached.
 */
export async function reloadFolderCache(collectionKey: string): Promise<void> {
  scoreCache.setFolder(collectionKey, await loadFolderScores(collectionKey));
}
