/**
 * Pure prompt-building and response-parsing for AI classification.
 *
 * Everything here except `buildItemContext` (a thin Zotero-API extraction) is a
 * pure function so it can be unit-tested outside Zotero — see
 * `test/ai-prompt.test.ts`. The model is asked to return each item's reading
 * priority as a 0–100 integer, which is then written to the Extra field through
 * the helpers in `../extra.ts` — never hand-edited here.
 */
import { clampPriority } from "../extra";

/** Metadata we send to the model for one item. Plain object → unit-testable. */
export interface ItemContext {
  key: string;
  title: string;
  abstract: string;
  creators: string;
  year: string;
  itemType: string;
}

/** A provider-agnostic prompt: a system instruction and a user message. */
export interface ClassifyPrompt {
  system: string;
  user: string;
}

/**
 * Extract the metadata we send to the model from a Zotero item. Thin wrapper
 * over the Zotero API, kept out of the pure logic below (not unit-tested).
 */
export function buildItemContext(item: Zotero.Item): ItemContext {
  const creators = item
    .getCreators()
    .map((c) => [c.lastName, c.firstName].filter(Boolean).join(", "))
    .filter(Boolean)
    .join("; ");
  const date = String(item.getField("date") ?? "");
  const year = date.match(/\d{4}/)?.[0] ?? "";
  return {
    key: item.key,
    title: item.getDisplayTitle() || String(item.getField("title") ?? ""),
    abstract: String(item.getField("abstractNote") ?? ""),
    creators,
    year,
    itemType: Zotero.ItemTypes.getName(item.itemTypeID),
  };
}

const SYSTEM_INSTRUCTION = [
  "You are helping a researcher triage a reading backlog in Zotero.",
  "Given the researcher's project context and a list of library items, assign",
  "each item a reading priority: an integer from 0 to 100, where 100 means",
  "read first (most relevant to the project) and 0 means least relevant.",
  "",
  "Respond with ONLY a JSON array, no prose, no code fences. Each element must be",
  'an object {"key": "<item key>", "priority": <integer 0-100>}. Include every',
  "item exactly once, using the key given for it.",
].join("\n");

/** Build the system+user prompt for a batch of items. Pure. */
export function buildMessages(
  projectContext: string,
  items: ItemContext[],
): ClassifyPrompt {
  const context = projectContext.trim() || "(no additional context provided)";
  const payload = items.map((it) => ({
    key: it.key,
    title: it.title,
    abstract: it.abstract,
    creators: it.creators,
    year: it.year,
    itemType: it.itemType,
  }));
  const user = [
    "Project context:",
    context,
    "",
    "Items to prioritize (JSON):",
    JSON.stringify(payload, null, 2),
  ].join("\n");
  return { system: SYSTEM_INSTRUCTION, user };
}

/** Pull the first top-level JSON array out of a model response, or null. */
function extractJsonArray(text: string): string | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + 1);
}

/**
 * Parse a model response into a map of item key → clamped priority. Robust to
 * surrounding prose or code fences. When `validKeys` is given, keys outside it
 * are ignored so a hallucinated key can't touch an unrelated item. Pure.
 */
export function parsePriorityResponse(
  text: string,
  validKeys?: Iterable<string>,
): Map<string, number> {
  const result = new Map<string, number>();
  const json = extractJsonArray(text ?? "");
  if (!json) return result;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return result;
  }
  if (!Array.isArray(parsed)) return result;

  const allow = validKeys ? new Set(validKeys) : null;
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const key = (entry as { key?: unknown }).key;
    const priority = (entry as { priority?: unknown }).priority;
    if (typeof key !== "string" || key === "") continue;
    const n =
      typeof priority === "number"
        ? priority
        : typeof priority === "string"
          ? Number(priority)
          : NaN;
    if (!Number.isFinite(n)) continue;
    if (allow && !allow.has(key)) continue;
    result.set(key, clampPriority(n));
  }
  return result;
}
