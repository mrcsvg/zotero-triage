/**
 * Read/write the reading priority on an item's Extra field.
 *
 * Persistence (spec §6): a namespaced line `ReadingPriority: <int 0-100>` in the
 * item's Extra field, so it syncs natively and survives export. All Extra access
 * goes through zotero-plugin-toolkit's ExtraFieldTool, which preserves the other
 * (non-namespaced) Extra lines and handles the parsing.
 */

export const EXTRA_KEY = "ReadingPriority";
export const MIN_PRIORITY = 0;
export const MAX_PRIORITY = 100;

export function clampPriority(n: number): number {
  return Math.max(MIN_PRIORITY, Math.min(MAX_PRIORITY, Math.round(n)));
}

/** Current priority for an item, or null if unset/unparseable. */
export function getReadingPriority(item: Zotero.Item): number | null {
  try {
    const raw = ztoolkit.ExtraField.getExtraField(item, EXTRA_KEY);
    if (raw === undefined || raw === "") return null;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
  } catch (e) {
    ztoolkit.log(`[${EXTRA_KEY}] getReadingPriority error`, e);
    return null;
  }
}

/** Encode a priority (or null to clear) as the Extra value ExtraFieldTool expects. */
function encode(value: number | null): string {
  return value === null ? "" : String(clampPriority(value));
}

/** Set or clear the priority on a single item (own transaction). */
export async function setReadingPriority(
  item: Zotero.Item,
  value: number | null,
): Promise<void> {
  await ztoolkit.ExtraField.setExtraField(item, EXTRA_KEY, encode(value));
}

/** Set or clear the same priority on many items in one transaction (multi-select). */
export async function setReadingPriorityForItems(
  items: Zotero.Item[],
  value: number | null,
): Promise<void> {
  if (!items?.length) return;
  const v = encode(value);
  await Zotero.DB.executeTransaction(async () => {
    for (const item of items) {
      await ztoolkit.ExtraField.setExtraField(item, EXTRA_KEY, v, {
        save: false,
      });
      await item.save();
    }
  });
}

/** Set per-item priorities (possibly different values) in one transaction. */
export async function setReadingPrioritiesForItems(
  entries: Array<{ item: Zotero.Item; value: number | null }>,
): Promise<void> {
  if (!entries?.length) return;
  await Zotero.DB.executeTransaction(async () => {
    for (const { item, value } of entries) {
      await ztoolkit.ExtraField.setExtraField(item, EXTRA_KEY, encode(value), {
        save: false,
      });
      await item.save();
    }
  });
}

/** Bump each item's priority by delta, clamped; unset is treated as 0. */
export async function bumpReadingPriorityForItems(
  items: Zotero.Item[],
  delta: number,
): Promise<void> {
  if (!items?.length) return;
  await Zotero.DB.executeTransaction(async () => {
    for (const item of items) {
      const next = clampPriority((getReadingPriority(item) ?? 0) + delta);
      await ztoolkit.ExtraField.setExtraField(item, EXTRA_KEY, String(next), {
        save: false,
      });
      await item.save();
    }
  });
}
