import { config } from "../../package.json";
import { EXTRA_KEY, getReadingPriority } from "./extra";
import { formatPriorityDisplay, getFormat } from "./prefs";
import { getString } from "../utils/locale";
import { resolvePriority } from "../relevance/resolve";
import {
  ensureCacheFor,
  reloadFolderCache,
  scoreCache,
} from "../relevance/score-cache";

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

/** The open collection's key, or null when the view isn't a collection. */
function currentCollectionKey(): string | null {
  return Zotero.getActiveZoteroPane()?.getSelectedCollection?.()?.key ?? null;
}

/** Repaint the item tree in place (used after the score cache loads/changes). */
function redrawItemTree(): void {
  try {
    const view = Zotero.getActiveZoteroPane()?.itemsView as any;
    if (view?.tree?.invalidate) view.tree.invalidate();
    else view?.refreshAndMaintainSelection?.();
  } catch {
    /* best-effort repaint */
  }
}

/** The item at a tree row, or null (renderCell only gets the row index). */
function itemAtRow(index: number): Zotero.Item | null {
  try {
    const view = Zotero.getActiveZoteroPane()?.itemsView as any;
    return view?.getRow?.(index)?.ref ?? null;
  } catch {
    return null;
  }
}

/** The auto score for an item, but only when the cache holds the open folder. */
function cachedAuto(
  itemKey: string,
  collectionKey: string | null,
): number | null {
  if (collectionKey === null || scoreCache.collectionKey !== collectionKey) {
    return null;
  }
  return scoreCache.get(itemKey)?.score ?? null;
}

/**
 * Reload a folder's scores into the cache and repaint — called after the
 * "Score this folder" command persists new records so they appear immediately.
 */
export async function refreshScoresForFolder(
  collectionKey: string,
): Promise<void> {
  await reloadFolderCache(collectionKey);
  redrawItemTree();
}

export async function registerPriorityColumn() {
  registeredDataKey = await Zotero.ItemTreeManager.registerColumn({
    pluginID: config.addonID,
    dataKey: "priority",
    label: getString("column-label"),
    // The tree SORTS on this return value -> zero-padded key for numeric order.
    // Manual priority (Extra) always wins; the open folder's LLM auto-score
    // fills items with no manual value (resolvePriority). The cache is kept in
    // sync for the open folder via ensureCacheFor, which repaints when it loads.
    dataProvider: (item: Zotero.Item, _dataKey: string) => {
      const collectionKey = currentCollectionKey();
      void ensureCacheFor(collectionKey, redrawItemTree);
      const { value } = resolvePriority(
        getReadingPriority(item),
        cachedAuto(item.key, collectionKey),
      );
      return sortKey(value);
    },
    // renderCell controls DISPLAY -> apply the chosen format (number/stars/bar).
    // `data` is the zero-padded sort key; recover the integer for display. An
    // auto-score is shown in italic with the LLM's reason as a tooltip so it's
    // visually distinct from a hand-set priority; manual values render plain.
    renderCell(index, data, column, _isFirstColumn, doc) {
      const span = doc.createElement("span");
      span.className = `cell ${column.className}`;
      span.style.textAlign = getFormat() === "number" ? "right" : "left";
      const priority = data ? parseInt(data, 10) : null;
      span.innerText = formatPriorityDisplay(priority, getFormat());

      // Distinguish an auto score from a manual one (best-effort: needs the
      // item, which renderCell only exposes via the row index).
      const item = itemAtRow(index);
      if (item) {
        const collectionKey = currentCollectionKey();
        const record =
          collectionKey !== null && scoreCache.collectionKey === collectionKey
            ? scoreCache.get(item.key)
            : undefined;
        const { source } = resolvePriority(
          getReadingPriority(item),
          record?.score ?? null,
        );
        if (source === "auto") {
          span.classList.add("zoterotriage-auto");
          span.style.fontStyle = "italic";
          span.style.opacity = "0.85";
          if (record?.reason) span.setAttribute("title", record.reason);
        }
      }
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
