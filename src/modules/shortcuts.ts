import { bumpReadingPriorityForItems, setReadingPriorityForItems } from "./extra";
import { getSelectedItems } from "./menu";
import { getStep } from "./prefs";

/**
 * Keyboard shortcuts (spec F1.3). Defaults chosen to avoid the Alt+NUM
 * collision with Zotero's native column-sort shortcut (spec §7):
 *   Alt+ArrowUp   -> raise priority by the configured step
 *   Alt+ArrowDown -> lower priority by the configured step
 *   Alt+Backspace -> clear priority
 * The step is read from prefs at keypress time.
 */

export function registerShortcuts() {
  ztoolkit.Keyboard.register((ev) => {
    if (!ev.altKey || ev.ctrlKey || ev.metaKey) return;

    let action: "up" | "down" | "clear" | null = null;
    if (ev.key === "ArrowUp" && !ev.shiftKey) action = "up";
    else if (ev.key === "ArrowDown" && !ev.shiftKey) action = "down";
    else if (ev.key === "Backspace") action = "clear";
    if (!action) return;

    const items = getSelectedItems();
    if (!items.length) return;
    ev.preventDefault();

    const step = getStep();
    if (action === "up") void bumpReadingPriorityForItems(items, step);
    else if (action === "down") void bumpReadingPriorityForItems(items, -step);
    else void setReadingPriorityForItems(items, null);
  });
}
