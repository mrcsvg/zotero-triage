/**
 * M3 foundation — per-folder relevance prompts.
 *
 * The opt-in LLM layer scores each item against a prompt set **per folder
 * (collection)**. Few folders carry a prompt, so the whole `collectionKey →
 * prompt` map is persisted as a single JSON blob in `Zotero.Prefs`
 * (`...folderPrompts`) rather than a table.
 *
 * The parse / serialize / CRUD core is pure and tolerant of malformed stored
 * data (hand edits, older versions, corruption) so it never throws into the UI;
 * the thin Prefs-backed wrapper is the only part that touches Zotero.
 */

import { getPref, setPref } from "../utils/prefs";

/** A collectionKey → prompt map. */
export type FolderPromptMap = Record<string, string>;

// ---------------------------------------------------------------------------
// Pure map core (no I/O)
// ---------------------------------------------------------------------------

/** Parse the stored blob into a map, tolerating any malformed input. */
export function parseFolderPrompts(raw: string | undefined): FolderPromptMap {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    return {};
  }
  const out: FolderPromptMap = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/** Serialize a map back to the stored blob form. */
export function serializeFolderPrompts(map: FolderPromptMap): string {
  return JSON.stringify(map);
}

/**
 * Return a new map with `collectionKey` set to `prompt`. The prompt is trimmed;
 * an empty/whitespace-only prompt removes the key. The input map is not mutated.
 */
export function setPromptInMap(
  map: FolderPromptMap,
  collectionKey: string,
  prompt: string,
): FolderPromptMap {
  const next = { ...map };
  const trimmed = prompt.trim();
  if (trimmed === "") {
    delete next[collectionKey];
  } else {
    next[collectionKey] = trimmed;
  }
  return next;
}

/** Look up a prompt in the map, or undefined if the folder has none. */
export function getPromptFromMap(
  map: FolderPromptMap,
  collectionKey: string,
): string | undefined {
  return map[collectionKey];
}

// ---------------------------------------------------------------------------
// Prefs-backed wrapper (Zotero only)
// ---------------------------------------------------------------------------

function readMap(): FolderPromptMap {
  return parseFolderPrompts(getPref("folderPrompts"));
}

function writeMap(map: FolderPromptMap): void {
  setPref("folderPrompts", serializeFolderPrompts(map));
}

/** The relevance prompt for a folder, or undefined if none is set. */
export function getFolderPrompt(collectionKey: string): string | undefined {
  return getPromptFromMap(readMap(), collectionKey);
}

/** Set (or, with an empty prompt, clear) a folder's relevance prompt. */
export function setFolderPrompt(collectionKey: string, prompt: string): void {
  writeMap(setPromptInMap(readMap(), collectionKey, prompt));
}

/** Remove a folder's relevance prompt. */
export function clearFolderPrompt(collectionKey: string): void {
  setFolderPrompt(collectionKey, "");
}

/** Whether a folder has a (non-empty) relevance prompt set. */
export function hasFolderPrompt(collectionKey: string): boolean {
  return getFolderPrompt(collectionKey) !== undefined;
}
