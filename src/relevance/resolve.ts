/**
 * M3 foundation — the manual-wins priority decision.
 *
 * The Priority column shows one number per item. When the opt-in LLM layer is
 * active an item may have *both* a manual priority (from the Extra field) and an
 * auto score (from the per-folder score store). This function encodes the single
 * rule that governs which one wins: **manual always wins**, auto only fills items
 * with no manual value, and the absence of both is reported explicitly.
 *
 * It is deliberately pure — callers read the manual value and look up the auto
 * score, then pass both in. Keeping all I/O (Extra, IndexedDB) at the call site
 * makes this decision unit-testable in isolation and keeps the column's data
 * path trivial.
 */

/** Where the value the column shows came from. */
export type PrioritySource = "manual" | "auto" | "none";

export interface ResolvedPriority {
  /** The 0–100 value to display and sort on, or null when nothing is set. */
  value: number | null;
  source: PrioritySource;
}

/**
 * Decide the effective priority for an item in a given folder.
 *
 * @param manual The manual priority from the Extra field, or null if unset.
 *   Note that 0 is a valid manual value and must win over any auto score.
 * @param auto The auto score for this (item, folder), or null if not scored.
 */
export function resolvePriority(
  manual: number | null,
  auto: number | null,
): ResolvedPriority {
  if (manual !== null) return { value: manual, source: "manual" };
  if (auto !== null) return { value: auto, source: "auto" };
  return { value: null, source: "none" };
}
