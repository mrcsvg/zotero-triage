import { config } from "../../package.json";
import { setReadingPriorityForItems, clampPriority } from "./extra";
import { getLevel } from "./prefs";
import { getString } from "../utils/locale";

/**
 * Right-click "Reading Priority" submenu in the item tree (spec F1.2 / F1.4).
 * Quick levels + Custom… + Clear, applied to all selected items.
 * Level values come from prefs and are read at click time.
 */

export function getSelectedItems(): Zotero.Item[] {
  const pane = Zotero.getActiveZoteroPane();
  const items = pane?.getSelectedItems?.() ?? [];
  return items.filter((it) => it.isRegularItem());
}

function notify(text: string) {
  new ztoolkit.ProgressWindow(config.addonName, { closeTime: 2000 })
    .createLine({ text, type: "success" })
    .show();
}

async function applyToSelection(value: number | null) {
  const items = getSelectedItems();
  if (!items.length) return;
  await setReadingPriorityForItems(items, value);
  notify(
    value === null
      ? getString("status-cleared", { args: { count: items.length } })
      : getString("status-set", {
          args: { value: clampPriority(value), count: items.length },
        }),
  );
}

async function promptCustom() {
  if (!getSelectedItems().length) return;
  const win = Zotero.getMainWindow();
  // Services.prompt is reliable inside Zotero (window.prompt can be disabled).
  const input = { value: "" };
  const ok = (Services.prompt as any).prompt(
    win,
    config.addonName,
    getString("prompt-custom-text"),
    input,
    null,
    { value: false },
  );
  if (!ok) return;
  const n = parseInt(String(input.value).trim(), 10);
  if (Number.isNaN(n)) return;
  await applyToSelection(n);
}

export function registerContextMenu() {
  const quickLevel = (
    which: "High" | "Medium" | "Low",
    msgId: "menu-high" | "menu-medium" | "menu-low",
  ) => ({
    tag: "menuitem" as const,
    label: getString(msgId, { args: { value: getLevel(which) } }),
    commandListener: () => void applyToSelection(getLevel(which)),
  });

  ztoolkit.Menu.register("item", {
    tag: "menu",
    id: `${config.addonRef}-itemmenu-priority`,
    label: getString("menu-priority"),
    icon: `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`,
    children: [
      quickLevel("High", "menu-high"),
      quickLevel("Medium", "menu-medium"),
      quickLevel("Low", "menu-low"),
      { tag: "menuseparator" as const },
      {
        tag: "menuitem" as const,
        label: getString("menu-custom"),
        commandListener: () => void promptCustom(),
      },
      {
        tag: "menuitem" as const,
        label: getString("menu-clear"),
        commandListener: () => void applyToSelection(null),
      },
    ],
  });
}
