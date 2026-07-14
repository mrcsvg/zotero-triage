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
