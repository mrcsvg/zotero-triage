import { config } from "../../package.json";
import { getString } from "../utils/locale";
import {
  getCollectionContext,
  setCollectionContext,
} from "./collectionContext";
import { setReadingPrioritiesForItems } from "./extra";
import {
  buildItemContext,
  buildManualPrompt,
  parsePriorityResponse,
  type ItemContext,
} from "./ai/prompt";

/**
 * Manual (offline) classification — the no-API-key sibling of `classify.ts`.
 *
 * For users who don't have or don't want to configure an API key, this turns
 * the same LLM classification into copy/paste: one action builds the full
 * prompt (project context + item metadata) for the user to paste into ChatGPT /
 * Claude / any chat LLM; a second action takes the model's JSON reply and writes
 * the priorities back through `./extra.ts`. It reuses the exact prompt and
 * parser as the automated path (`./ai/prompt.ts`), so the round-trip format is
 * identical. Being pure copy/paste, it performs **no** network I/O at all.
 */

const PROMPT_MENU_ID = `${config.addonRef}-collectionmenu-manual-prompt`;
const IMPORT_MENU_ID = `${config.addonRef}-collectionmenu-manual-import`;
const PREVIEW_ID = `${config.addonRef}-manual-prompt-preview`;

function notify(text: string, type: "success" | "fail" = "success") {
  new ztoolkit.ProgressWindow(config.addonName, { closeTime: 3000 })
    .createLine({ text, type })
    .show();
}

/** The regular items of the currently selected collection, or null with a toast. */
function selectedCollectionItems(): {
  collectionKey: string;
  items: Zotero.Item[];
} | null {
  const pane = Zotero.getActiveZoteroPane();
  const collection = pane?.getSelectedCollection?.();
  if (!collection) {
    notify(getString("status-classify-nocollection"), "fail");
    return null;
  }
  const items = collection
    .getChildItems(false, false)
    .filter((it) => it.isRegularItem());
  if (!items.length) {
    notify(getString("status-classify-empty"), "fail");
    return null;
  }
  return { collectionKey: collection.key, items };
}

/**
 * "Copy prompt for offline LLM…": let the user review/edit the project context,
 * then copy the full ready-to-paste prompt to the clipboard.
 */
async function copyManualPrompt(): Promise<void> {
  const selection = selectedCollectionItems();
  if (!selection) return;
  const { collectionKey, items } = selection;
  const contexts: ItemContext[] = items.map(buildItemContext);

  const initialContext = getCollectionContext(collectionKey);
  const dialogData: { [k: string]: any } = { context: initialContext };

  const copyPrompt = () => {
    const context = String(dialogData.context ?? "");
    setCollectionContext(collectionKey, context);
    const text = buildManualPrompt(context, contexts);
    new ztoolkit.Clipboard().addText(text, "text/unicode").copy();
    const preview = dialog.window?.document?.getElementById(
      PREVIEW_ID,
    ) as HTMLTextAreaElement | null;
    if (preview) preview.value = text;
    notify(getString("status-manual-copied"));
  };

  const dialog = new ztoolkit.Dialog(5, 1)
    .addCell(0, 0, {
      tag: "label",
      namespace: "html",
      properties: { innerHTML: getString("dialog-context-label") },
      styles: { fontWeight: "600", marginBottom: "6px" },
    })
    .addCell(1, 0, {
      tag: "textarea",
      namespace: "html",
      attributes: {
        "data-bind": "context",
        "data-prop": "value",
        rows: "8",
        placeholder: getString("dialog-context-placeholder"),
      },
      properties: { value: initialContext },
      styles: {
        width: "52em",
        maxWidth: "80vw",
        resize: "vertical",
        fontFamily: "inherit",
      },
    })
    .addCell(2, 0, {
      tag: "label",
      namespace: "html",
      properties: { innerHTML: getString("dialog-manual-prompt-label") },
      styles: { fontWeight: "600", marginTop: "10px", marginBottom: "6px" },
    })
    .addCell(3, 0, {
      tag: "textarea",
      namespace: "html",
      id: PREVIEW_ID,
      attributes: { rows: "10", readonly: "true" },
      properties: { value: buildManualPrompt(initialContext, contexts) },
      styles: {
        width: "52em",
        maxWidth: "80vw",
        resize: "vertical",
        fontFamily: "monospace",
        fontSize: "0.85em",
        opacity: "0.9",
      },
    })
    .addCell(4, 0, {
      tag: "label",
      namespace: "html",
      properties: { innerHTML: getString("dialog-manual-prompt-note") },
      styles: { opacity: "0.7", marginTop: "8px", fontSize: "0.9em" },
    })
    .addButton(getString("dialog-manual-copy"), "copy", {
      noClose: true,
      callback: copyPrompt,
    })
    .addButton(getString("dialog-close"), "close")
    .setDialogData(dialogData)
    .open(getString("dialog-manual-prompt-title"));

  addon.data.dialog = dialog;
  await dialogData.unloadLock?.promise;
  addon.data.dialog = undefined;
}

/**
 * "Import LLM priorities…": paste the model's JSON reply and write the parsed
 * priorities back, ignoring any key that isn't in this collection.
 */
async function importManualPriorities(): Promise<void> {
  const selection = selectedCollectionItems();
  if (!selection) return;
  const { items } = selection;

  const dialogData: { [k: string]: any } = { response: "" };
  const dialog = new ztoolkit.Dialog(3, 1)
    .addCell(0, 0, {
      tag: "label",
      namespace: "html",
      properties: { innerHTML: getString("dialog-manual-import-label") },
      styles: { fontWeight: "600", marginBottom: "6px" },
    })
    .addCell(1, 0, {
      tag: "textarea",
      namespace: "html",
      attributes: {
        "data-bind": "response",
        "data-prop": "value",
        rows: "14",
        placeholder: getString("dialog-manual-import-placeholder"),
      },
      styles: {
        width: "52em",
        maxWidth: "80vw",
        resize: "vertical",
        fontFamily: "monospace",
        fontSize: "0.85em",
      },
    })
    .addCell(2, 0, {
      tag: "label",
      namespace: "html",
      properties: { innerHTML: getString("dialog-manual-import-note") },
      styles: { opacity: "0.7", marginTop: "8px", fontSize: "0.9em" },
    })
    .addButton(getString("dialog-manual-import-confirm"), "import")
    .addButton(getString("dialog-cancel"), "cancel")
    .setDialogData(dialogData)
    .open(getString("dialog-manual-import-title"));

  addon.data.dialog = dialog;
  await dialogData.unloadLock?.promise;
  addon.data.dialog = undefined;

  if (dialogData._lastButtonId !== "import") return; // cancelled

  const byKey = new Map(items.map((it) => [it.key, it]));
  const parsed = parsePriorityResponse(
    String(dialogData.response ?? ""),
    byKey.keys(),
  );
  if (!parsed.size) {
    notify(getString("status-manual-import-none"), "fail");
    return;
  }

  const entries: Array<{ item: Zotero.Item; value: number }> = [];
  for (const [key, value] of parsed) {
    const item = byKey.get(key);
    if (item) entries.push({ item, value });
  }
  await setReadingPrioritiesForItems(entries);
  notify(
    getString("status-manual-import-done", {
      args: { count: entries.length },
    }),
  );
}

export function registerManualMenu(win: Window = Zotero.getMainWindow()): void {
  // Two more items on the native collection context-menu popup, alongside the
  // AI action registered in classify.ts. Built via ztoolkit.UI so they're
  // tracked and removed by `ztoolkit.unregisterAll()` on shutdown/unload.
  const doc = win?.document;
  const collectionmenu = doc?.getElementById("zotero-collectionmenu");
  if (!collectionmenu) return;

  const items: Array<{ id: string; label: string; run: () => void }> = [
    {
      id: PROMPT_MENU_ID,
      label: getString("menu-manual-prompt"),
      run: () => void copyManualPrompt(),
    },
    {
      id: IMPORT_MENU_ID,
      label: getString("menu-manual-import"),
      run: () => void importManualPriorities(),
    },
  ];

  for (const { id, label, run } of items) {
    ztoolkit.UI.appendElement(
      {
        tag: "menuitem",
        id,
        namespace: "xul",
        classList: ["menuitem-iconic"],
        // Guard against a duplicate item on hot-reload.
        removeIfExists: true,
        attributes: {
          label,
          image: `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`,
        },
        listeners: [{ type: "command", listener: run }],
      },
      collectionmenu,
    );
  }
}
