import { config } from "../../package.json";
import { EXTRA_KEY, getReadingPriority } from "./extra";
import { formatPriorityDisplay, getFormat } from "./prefs";
import { getString } from "../utils/locale";

/**
 * Reading Priority column.
 *
 * Numeric sort: Zotero's item tree sorts a custom column by the *string* returned
 * from `dataProvider` (there is no numeric-sort flag — see the type signature
 * `dataProvider: (item, dataKey) => string`). A raw number string would sort
 * lexically, putting "100" before "20". So `dataProvider` returns a zero-padded
 * key for correct ordering, while `renderCell` shows the human-readable integer.
 */

let registeredDataKey: string | false = false;

// Priorities are 0..100; pad to a fixed width so lexical order == numeric order.
// Empty (no priority) stays "" and groups at one end.
function sortKey(p: number | null): string {
  if (p === null) return "";
  const clamped = Math.max(0, Math.min(999, p));
  return String(clamped).padStart(3, "0");
}

export async function registerPriorityColumn() {
  registeredDataKey = await Zotero.ItemTreeManager.registerColumn({
    pluginID: config.addonID,
    dataKey: "priority",
    label: getString("column-label"),
    // The tree SORTS on this return value -> zero-padded key for numeric order.
    dataProvider: (item: Zotero.Item, _dataKey: string) => {
      return sortKey(getReadingPriority(item));
    },
    // renderCell controls DISPLAY -> apply the chosen format (number/stars/bar).
    // `data` is the zero-padded sort key; recover the integer for display.
    renderCell(index, data, column, _isFirstColumn, doc) {
      const span = doc.createElement("span");
      span.className = `cell ${column.className}`;
      span.style.textAlign = getFormat() === "number" ? "right" : "left";
      const priority = data ? parseInt(data, 10) : null;
      span.innerText = formatPriorityDisplay(priority, getFormat());
      return span;
    },
    zoteroPersist: ["width", "hidden", "sortDirection"],
  });
  ztoolkit.log(`[${EXTRA_KEY}] registerColumns ->`, registeredDataKey);
  // Expose the real (Zotero-namespaced) key on the addon instance so callers
  // and tests don't have to guess Zotero's internal registry shape.
  (addon.data as any).priorityColumnKey = registeredDataKey;
  return registeredDataKey;
}

export async function unregisterPriorityColumn() {
  if (registeredDataKey) {
    Zotero.ItemTreeManager.unregisterColumn(registeredDataKey as string);
    registeredDataKey = false;
  }
}
