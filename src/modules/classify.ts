import { config } from "../../package.json";
import { getString } from "../utils/locale";
import {
  getCollectionContext,
  getEffectiveContext,
  setCollectionContext,
} from "./collectionContext";
import { setReadingPrioritiesForItems } from "./extra";
import {
  buildItemContext,
  buildMessages,
  parsePriorityResponse,
  type ItemContext,
} from "./ai/prompt";
import { getProvider, MissingApiKeyError } from "./ai/provider";

/**
 * Collection-level AI classification (see issue #38). Right-click a collection →
 * "Classify with AI…" opens a dialog with a large text box for the project
 * context (the prompt, saved per collection). The configured provider then
 * assigns each item a 0–100 reading priority, written to the Extra field via the
 * helpers in `./extra.ts`. This is the only feature that performs network I/O,
 * and only when the user invokes it.
 */

const BATCH_SIZE = 20;
const MENU_ID = `${config.addonRef}-collectionmenu-classify`;

function notify(text: string, type: "success" | "fail" = "success") {
  new ztoolkit.ProgressWindow(config.addonName, { closeTime: 3000 })
    .createLine({ text, type })
    .show();
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type ContextAction = "save" | "classify";

/**
 * Open the project-context dialog. Resolves to the chosen action and the edited
 * text — `"save"` just persists the prompt, `"classify"` persists and runs it —
 * or null if the dialog was cancelled/closed.
 */
async function openContextDialog(
  initial: string,
): Promise<{ action: ContextAction; context: string } | null> {
  const dialogData: { [k: string]: any } = { context: initial };
  const dialog = new ztoolkit.Dialog(3, 1)
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
        rows: "14",
        placeholder: getString("dialog-context-placeholder"),
      },
      properties: { value: initial },
      styles: {
        // The `rows` attribute alone isn't honored inside the dialog's XUL
        // flex layout (the cell collapses the textarea to a single line), so
        // pin an explicit height. Inline styles beat the platform stylesheet.
        boxSizing: "border-box",
        width: "48em",
        maxWidth: "80vw",
        height: "18em",
        minHeight: "9em",
        resize: "vertical",
        fontFamily: "inherit",
      },
    })
    .addCell(2, 0, {
      tag: "label",
      namespace: "html",
      properties: { innerHTML: getString("dialog-network-note") },
      styles: { opacity: "0.7", marginTop: "8px", fontSize: "0.9em" },
    })
    .addButton(getString("dialog-classify-confirm"), "classify")
    .addButton(getString("dialog-save"), "save")
    .addButton(getString("dialog-cancel"), "cancel")
    .setDialogData(dialogData)
    .open(getString("dialog-classify-title"));

  addon.data.dialog = dialog;
  await dialogData.unloadLock?.promise;
  addon.data.dialog = undefined;

  const button = dialogData._lastButtonId;
  if (button !== "classify" && button !== "save") return null;
  return { action: button, context: String(dialogData.context ?? "") };
}

/** Send the items to the provider in batches and write back the priorities. */
async function runClassification(
  context: string,
  items: Zotero.Item[],
): Promise<void> {
  let provider;
  try {
    provider = getProvider();
  } catch (e) {
    if (e instanceof MissingApiKeyError) {
      notify(getString("status-classify-nokey"), "fail");
      return;
    }
    throw e;
  }

  const progress = new ztoolkit.ProgressWindow(config.addonName, {
    closeOnClick: true,
    closeTime: -1,
  })
    .createLine({
      text: getString("status-classify-running", {
        args: { count: items.length },
      }),
      type: "default",
      progress: 0,
    })
    .show(-1);

  try {
    const byKey = new Map(items.map((it) => [it.key, it]));
    const contexts: ItemContext[] = items.map(buildItemContext);
    const results = new Map<string, number>();

    const batches = chunk(contexts, BATCH_SIZE);
    let processed = 0;
    for (const batch of batches) {
      const prompt = buildMessages(context, batch);
      const text = await provider.classify(prompt);
      const parsed = parsePriorityResponse(
        text,
        batch.map((b) => b.key),
      );
      for (const [k, v] of parsed) results.set(k, v);
      processed += batch.length;
      progress.changeLine({
        progress: Math.round((processed / contexts.length) * 100),
      });
    }

    const entries: Array<{ item: Zotero.Item; value: number }> = [];
    for (const [key, value] of results) {
      const item = byKey.get(key);
      if (item) entries.push({ item, value });
    }
    await setReadingPrioritiesForItems(entries);

    progress.changeLine({
      text: getString("status-classify-done", {
        args: { count: entries.length },
      }),
      type: "success",
      progress: 100,
    });
    progress.startCloseTimer(3000);
  } catch (e) {
    ztoolkit.log("[ReadingPriority] classify error", e);
    progress.changeLine({
      text: getString("status-classify-error"),
      type: "fail",
    });
    progress.startCloseTimer(5000);
  }
}

async function classifyCollection(): Promise<void> {
  const pane = Zotero.getActiveZoteroPane();
  const collection = pane?.getSelectedCollection?.();
  if (!collection) {
    notify(getString("status-classify-nocollection"), "fail");
    return;
  }

  const items = collection
    .getChildItems(false, false)
    .filter((it) => it.isRegularItem());

  const result = await openContextDialog(getCollectionContext(collection.key));
  if (result === null) return; // cancelled
  setCollectionContext(collection.key, result.context);

  // "Save prompt" persists the context without any network call; the empty
  // guard only blocks classification, so a prompt can be set up ahead of time.
  if (result.action === "save") {
    notify(getString("status-context-saved"));
    return;
  }

  if (!items.length) {
    notify(getString("status-classify-empty"), "fail");
    return;
  }

  // Own context, or the nearest ancestor's when this collection has none and
  // inheritance is enabled (see getEffectiveContext).
  await runClassification(getEffectiveContext(collection), items);
}

export function registerCollectionMenu(
  win: Window = Zotero.getMainWindow(),
): void {
  // Append a single item to the native collection context-menu popup. Built via
  // ztoolkit.UI so it's tracked and removed by `ztoolkit.unregisterAll()` on
  // shutdown/unload (see hooks.ts). Mirrors the item-menu pattern in menu.ts.
  const doc = win?.document;
  const collectionmenu = doc?.getElementById("zotero-collectionmenu");
  if (!collectionmenu) return;

  ztoolkit.UI.appendElement(
    {
      tag: "menuitem",
      id: MENU_ID,
      namespace: "xul",
      classList: ["menuitem-iconic"],
      // Guard against a duplicate item on hot-reload.
      removeIfExists: true,
      attributes: {
        label: getString("menu-classify"),
        image: `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`,
      },
      listeners: [
        { type: "command", listener: () => void classifyCollection() },
      ],
    },
    collectionmenu,
  );
}
