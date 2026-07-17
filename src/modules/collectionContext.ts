/**
 * Per-collection "project context" (the classification prompt). Stored as a
 * JSON map `{ [collectionKey]: promptText }` in the `collectionContexts` pref,
 * so each collection keeps its own context. Accessed only through the getPref /
 * setPref helpers, never raw Zotero.Prefs.
 */
import { getPref, setPref } from "../utils/prefs";

function readMap(): Record<string, string> {
  try {
    const parsed = JSON.parse(String(getPref("collectionContexts") ?? "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** The saved project context for a collection, or "" if none. */
export function getCollectionContext(collectionKey: string): string {
  const v = readMap()[collectionKey];
  return typeof v === "string" ? v : "";
}

/** Save (or clear, when blank) the project context for a collection. */
export function setCollectionContext(
  collectionKey: string,
  context: string,
): void {
  const map = readMap();
  const trimmed = context.trim();
  if (trimmed) map[collectionKey] = trimmed;
  else delete map[collectionKey];
  setPref("collectionContexts", JSON.stringify(map));
}

/** A context resolved by walking up the collection tree, and where it came from. */
export interface InheritedContext {
  context: string;
  /** The collection that actually holds the context (may be an ancestor). */
  sourceKey: string;
}

/**
 * Resolve a collection's effective context with opt-in inheritance: return the
 * collection's own context, else the nearest ancestor's, walking up via
 * `parentOf` until a non-blank context is found or the root is reached.
 * Blank/whitespace contexts are treated as unset. Cycle-guarded. Pure — the
 * caller supplies the lookups, so it's unit-testable without Zotero.
 */
export function resolveInheritedContext(
  startKey: string,
  contextOf: (key: string) => string,
  parentOf: (key: string) => string | null,
): InheritedContext | null {
  const seen = new Set<string>();
  let cur: string | null = startKey;
  while (cur !== null && !seen.has(cur)) {
    seen.add(cur);
    const c = contextOf(cur);
    if (c && c.trim() !== "") return { context: c, sourceKey: cur };
    cur = parentOf(cur);
  }
  return null;
}

/** The parent collection's key, or null for a top-level collection. */
function parentKeyOf(libraryID: number, key: string): string | null {
  const col = Zotero.Collections.getByLibraryAndKey(libraryID, key);
  const parentKey = col ? (col as Zotero.Collection).parentKey : false;
  return parentKey ? String(parentKey) : null;
}

/**
 * The context to actually classify a collection with: its own context, or —
 * when that's blank and the `inheritContexts` pref is on — the nearest
 * ancestor's. Zotero-backed wrapper over the pure `resolveInheritedContext`.
 */
export function getEffectiveContext(collection: Zotero.Collection): string {
  const own = getCollectionContext(collection.key);
  if (own.trim() !== "" || !getPref("inheritContexts")) return own;
  const inherited = resolveInheritedContext(
    collection.key,
    (k) => getCollectionContext(k),
    (k) => parentKeyOf(collection.libraryID, k),
  );
  return inherited ? inherited.context : "";
}
