import { config } from "../../package.json";
import { setReadingPriorityForItems, clampPriority } from "./extra";
import { getLevel } from "./prefs";
import { getString } from "../utils/locale";
import {
  scoreSelectedFolder,
  setSelectedFolderPrompt,
} from "./relevance-command";

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

const MENU_ID = `${config.addonRef}-itemmenu-priority`;

export function registerContextMenu(win: Window = Zotero.getMainWindow()) {
  // toolkit 5.1.4 removed `ztoolkit.Menu` (the MenuManager). Build the XUL
  // submenu with the UI tool instead and append it to the native item-menu
  // popup. Elements created via `ztoolkit.UI` are tracked and removed by
  // `ztoolkit.unregisterAll()` on shutdown/unload — see hooks.ts.
  const doc = win?.document;
  const itemmenu = doc?.getElementById("zotero-itemmenu");
  if (!itemmenu) return;

  const QUICK_LEVELS = [
    { which: "High", msgId: "menu-high", id: `${MENU_ID}-high` },
    { which: "Medium", msgId: "menu-medium", id: `${MENU_ID}-medium` },
    { which: "Low", msgId: "menu-low", id: `${MENU_ID}-low` },
  ] as const;

  const quickLabel = (q: (typeof QUICK_LEVELS)[number]) =>
    getString(q.msgId, { args: { value: getLevel(q.which) } });

  const quickLevel = (q: (typeof QUICK_LEVELS)[number]) => ({
    tag: "menuitem",
    id: q.id,
    attributes: { label: quickLabel(q) },
    listeners: [
      {
        type: "command",
        listener: () => void applyToSelection(getLevel(q.which)),
      },
    ],
  });

  ztoolkit.UI.appendElement(
    {
      tag: "menu",
      id: MENU_ID,
      namespace: "xul",
      classList: ["menu-iconic"],
      // `removeIfExists` guards against duplicate submenus on hot-reload.
      removeIfExists: true,
      attributes: {
        label: getString("menu-priority"),
        image: `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`,
      },
      children: [
        {
          tag: "menupopup",
          // Quick-level labels embed the pref value; refresh them each time the
          // submenu opens so edits in the pref pane show without a restart. The
          // command listeners already read the value live at click time.
          listeners: [
            {
              type: "popupshowing",
              listener: () => {
                for (const q of QUICK_LEVELS) {
                  doc
                    ?.getElementById(q.id)
                    ?.setAttribute("label", quickLabel(q));
                }
              },
            },
          ],
          children: [
            quickLevel(QUICK_LEVELS[0]),
            quickLevel(QUICK_LEVELS[1]),
            quickLevel(QUICK_LEVELS[2]),
            { tag: "menuseparator" },
            {
              tag: "menuitem",
              attributes: { label: getString("menu-custom") },
              listeners: [
                { type: "command", listener: () => void promptCustom() },
              ],
            },
            {
              tag: "menuitem",
              attributes: { label: getString("menu-clear") },
              listeners: [
                {
                  type: "command",
                  listener: () => void applyToSelection(null),
                },
              ],
            },
          ],
        },
      ],
    },
    itemmenu,
  );
}

const COLLECTION_MENU_ID = `${config.addonRef}-collectionmenu-relevance`;

/**
 * Phase 2 collection context-menu items: "Score this folder" and "Set relevance
 * prompt…", appended to the native collection menu (`zotero-collectionmenu`).
 * Like the item submenu, these are created via `ztoolkit.UI` so
 * `unregisterAll()` removes them on shutdown/unload.
 */
export function registerCollectionMenu(win: Window = Zotero.getMainWindow()) {
  const doc = win?.document;
  const collectionmenu = doc?.getElementById("zotero-collectionmenu");
  if (!collectionmenu) return;

  ztoolkit.UI.appendElement(
    {
      tag: "menuseparator",
      id: `${COLLECTION_MENU_ID}-sep`,
      namespace: "xul",
      removeIfExists: true,
    },
    collectionmenu,
  );

  ztoolkit.UI.appendElement(
    {
      tag: "menuitem",
      id: `${COLLECTION_MENU_ID}-score`,
      namespace: "xul",
      classList: ["menuitem-iconic"],
      removeIfExists: true,
      attributes: {
        label: getString("menu-relevance-score"),
        image: `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`,
      },
      listeners: [
        { type: "command", listener: () => void scoreSelectedFolder() },
      ],
    },
    collectionmenu,
  );

  ztoolkit.UI.appendElement(
    {
      tag: "menuitem",
      id: `${COLLECTION_MENU_ID}-prompt`,
      namespace: "xul",
      removeIfExists: true,
      attributes: { label: getString("menu-relevance-prompt") },
      listeners: [
        { type: "command", listener: () => setSelectedFolderPrompt() },
      ],
    },
    collectionmenu,
  );
}
