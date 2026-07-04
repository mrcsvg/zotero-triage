/**
 * M3 foundation — the per-(item, folder) auto-score store.
 *
 * An item can carry a different LLM relevance score in each folder it belongs
 * to, so scores are keyed by the **pair** (itemKey, collectionKey) — never in
 * the Extra field (which is item-global and would collide across folders and
 * pollute sync). Manual priority always wins; an auto-score only fills items the
 * user hasn't prioritized by hand (see {@link ./resolve}).
 *
 * **Persistence:** one JSON file per folder in the profile,
 * `<profile>/zotero-triage/scores/<collectionKey>.json`, written via `IOUtils`.
 * The file holds an `itemKey → {score, reason, model, scoredAt, stale}` map
 * (the item/collection keys are implicit in the map key and filename, so they
 * are not duplicated inside each value). This supersedes the design's original
 * IndexedDB plan, whose availability in the Zotero sandbox is unconfirmed; see
 * docs/plans/2026-06-30-llm-relevance-design.md.
 *
 * The pure core (key codec, freshness, folder-file serialize/parse, stale
 * transform) is unit-tested in isolation; the IOUtils layer runs under Zotero.
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

/** A folder's scores, keyed by itemKey. */
export type FolderScores = Record<string, ScoreRecord>;

/** The stored value shape (a ScoreRecord without its redundant keys). */
type StoredScore = Omit<ScoreRecord, "itemKey" | "collectionKey">;

const KEY_SEP = "::";
const MIN_SCORE = 0;
const MAX_SCORE = 100;

// ---------------------------------------------------------------------------
// Pure core (no I/O)
// ---------------------------------------------------------------------------

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

/** Serialize a folder's records into the stored file body. */
export function serializeFolderScores(records: ScoreRecord[]): string {
  const map: Record<string, StoredScore> = {};
  for (const r of records) {
    map[r.itemKey] = {
      score: r.score,
      reason: r.reason,
      model: r.model,
      scoredAt: r.scoredAt,
      stale: r.stale,
    };
  }
  return JSON.stringify(map);
}

/**
 * Parse a folder's stored file body back into records, tolerating malformed
 * content. Entries whose `score` is missing, non-numeric, or out of 0–100 are
 * dropped; other metadata is defaulted rather than rejected.
 */
export function parseFolderScores(
  raw: string | undefined,
  collectionKey: string,
): FolderScores {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const out: FolderScores = {};
  for (const [itemKey, value] of Object.entries(parsed)) {
    if (typeof value !== "object" || value === null) continue;
    const v = value as Record<string, unknown>;
    const score = v.score;
    if (
      typeof score !== "number" ||
      !Number.isFinite(score) ||
      score < MIN_SCORE ||
      score > MAX_SCORE
    ) {
      continue;
    }
    out[itemKey] = {
      itemKey,
      collectionKey,
      score: Math.round(score),
      reason: typeof v.reason === "string" ? v.reason : "",
      model: typeof v.model === "string" ? v.model : "",
      scoredAt:
        typeof v.scoredAt === "number" && Number.isFinite(v.scoredAt)
          ? v.scoredAt
          : 0,
      stale: Boolean(v.stale),
    };
  }
  return out;
}

/** Return a new map with every record marked stale (input not mutated). */
export function markAllStale(scores: FolderScores): FolderScores {
  const out: FolderScores = {};
  for (const [itemKey, record] of Object.entries(scores)) {
    out[itemKey] = { ...record, stale: true };
  }
  return out;
}

// ---------------------------------------------------------------------------
// File layer (Zotero / IOUtils)
// ---------------------------------------------------------------------------

function scoresDir(): string {
  return PathUtils.join(PathUtils.profileDir, "zotero-triage", "scores");
}

function folderScoresPath(collectionKey: string): string {
  return PathUtils.join(scoresDir(), `${collectionKey}.json`);
}

/** Load a folder's scores, or an empty map if it has never been scored. */
export async function loadFolderScores(
  collectionKey: string,
): Promise<FolderScores> {
  const path = folderScoresPath(collectionKey);
  if (!(await IOUtils.exists(path))) return {};
  const raw = await IOUtils.readUTF8(path);
  return parseFolderScores(raw, collectionKey);
}

/** Overwrite a folder's score file with exactly these records. */
export async function saveFolderScores(
  collectionKey: string,
  records: ScoreRecord[],
): Promise<void> {
  await IOUtils.makeDirectory(scoresDir(), {
    ignoreExisting: true,
    createAncestors: true,
  });
  await IOUtils.writeUTF8(
    folderScoresPath(collectionKey),
    serializeFolderScores(records),
  );
}

/** The score for one item in one folder, or undefined if not scored. */
export async function getScore(
  itemKey: string,
  collectionKey: string,
): Promise<ScoreRecord | undefined> {
  const all = await loadFolderScores(collectionKey);
  return all[itemKey];
}

/** Merge records into a folder's existing scores (upsert by itemKey). */
export async function putScores(
  collectionKey: string,
  records: ScoreRecord[],
): Promise<void> {
  const all = await loadFolderScores(collectionKey);
  for (const r of records) all[r.itemKey] = r;
  await saveFolderScores(collectionKey, Object.values(all));
}

/** Mark all of a folder's scores stale (after its prompt was edited). */
export async function markFolderStale(collectionKey: string): Promise<void> {
  const all = await loadFolderScores(collectionKey);
  await saveFolderScores(collectionKey, Object.values(markAllStale(all)));
}

/** Delete a folder's score file entirely. */
export async function deleteFolderScores(collectionKey: string): Promise<void> {
  await IOUtils.remove(folderScoresPath(collectionKey), { ignoreAbsent: true });
}
