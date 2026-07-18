import { config } from "../../package.json";
import { getString } from "../utils/locale";
import {
  getCollectionContext,
  setCollectionContext,
} from "./collectionContext";
import { setReadingPrioritiesForItems } from "./extra";
import {
  buildItemContext,
  buildMessages,
  buildManualPrompt,
  parsePriorityResponse,
  type ItemContext,
} from "./ai/prompt";
import { getProvider, MissingApiKeyError } from "./ai/provider";

/**
 * Collection-level reading-priority tooling (see issue #38). Right-click a
 * collection → "Zotero Triage…" opens a single window whose tabs gather every
 * collection action:
 *
 *   • "Classify with AI" — the provider scores each item 0–100 over the network
 *     (the only feature that performs network I/O, and only when invoked).
 *   • "Offline" — the no-API-key path: copy a ready-to-paste prompt for any chat
 *     LLM, then paste its JSON reply back to import the priorities. No network.
 *
 * The project context (the classification prompt) is shared by both tabs and
 * saved per collection. Every score is written to the Extra field through the
 * helpers in `./extra.ts`.
 *
 * The dialog renders in a plain HTML document (ztoolkit opens `about:blank`),
 * so the tabs are built from HTML buttons + panels toggled by `switchTab` —
 * XUL `<tabbox>` has no behavior outside a chrome/XUL document.
 */

const BATCH_SIZE = 20;
const MENU_ID = `${config.addonRef}-collectionmenu-open`;
const PREVIEW_ID = `${config.addonRef}-triage-prompt-preview`;
const TAB_AI = `${config.addonRef}-triage-tab-ai`;
const TAB_OFFLINE = `${config.addonRef}-triage-tab-offline`;
const PANEL_AI = `${config.addonRef}-triage-panel-ai`;
const PANEL_OFFLINE = `${config.addonRef}-triage-panel-offline`;

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

/** Show one tab's panel and highlight its header; hide the other. */
function switchTab(doc: Document, active: "ai" | "offline"): void {
  const tabs = [
    { tab: TAB_AI, panel: PANEL_AI, key: "ai" },
    { tab: TAB_OFFLINE, panel: PANEL_OFFLINE, key: "offline" },
  ] as const;
  for (const t of tabs) {
    const isActive = t.key === active;
    const panel = doc.getElementById(t.panel) as HTMLElement | null;
    if (panel) panel.style.display = isActive ? "block" : "none";
    const tab = doc.getElementById(t.tab) as HTMLElement | null;
    if (tab) {
      tab.style.borderBottom = isActive
        ? "2px solid AccentColor"
        : "2px solid transparent";
      tab.style.fontWeight = isActive ? "600" : "400";
      tab.style.opacity = isActive ? "1" : "0.65";
    }
  }
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

/** Parse a pasted LLM reply and write the recognized priorities back. */
async function importResponse(
  response: string,
  items: Zotero.Item[],
): Promise<void> {
  const byKey = new Map(items.map((it) => [it.key, it]));
  const parsed = parsePriorityResponse(response, byKey.keys());
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

/**
 * The unified collection window: a shared project-context box plus two tabs
 * ("Classify with AI" / "Offline"). Resolves when the window is closed; if the
 * user clicked "Save & Classify", returns the context to classify with,
 * otherwise null. Copy/import happen inline and keep the window open.
 */
async function openTriageDialog(
  collectionKey: string,
  items: Zotero.Item[],
): Promise<string | null> {
  const initialContext = getCollectionContext(collectionKey);
  const contexts: ItemContext[] = items.map(buildItemContext);
  const dialogData: { [k: string]: any } = {
    context: initialContext,
    response: "",
    action: null as null | "classify",
  };

  // Persist the current context and copy the ready-to-paste prompt.
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

  // Import the pasted reply without closing the window.
  const importNow = () => {
    void importResponse(String(dialogData.response ?? ""), items);
  };

  // Flag the classify intent and close; the caller runs it after unload so the
  // progress window isn't hidden behind this dialog.
  const classifyNow = () => {
    setCollectionContext(collectionKey, String(dialogData.context ?? ""));
    dialogData.action = "classify";
    dialog.window?.close();
  };

  // Shared styles for the two HTML tab headers.
  const tabHeaderStyle = {
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    padding: "6px 12px",
    margin: "0",
    cursor: "pointer",
    fontSize: "inherit",
    fontFamily: "inherit",
    color: "inherit",
  };
  const actionButtonStyle = { marginTop: "4px", padding: "5px 14px" };

  const dialog = new ztoolkit.Dialog(1, 1)
    .addCell(0, 0, {
      tag: "div",
      namespace: "html",
      styles: { width: "54em", maxWidth: "82vw" },
      children: [
        {
          tag: "label",
          namespace: "html",
          properties: { innerHTML: getString("dialog-context-label") },
          styles: {
            display: "block",
            fontWeight: "600",
            marginBottom: "6px",
          },
        },
        {
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
            width: "100%",
            boxSizing: "border-box",
            resize: "vertical",
            fontFamily: "inherit",
            marginBottom: "12px",
          },
        },
        // Tab bar (HTML buttons).
        {
          tag: "div",
          namespace: "html",
          styles: {
            display: "flex",
            gap: "4px",
            borderBottom: "1px solid rgba(128,128,128,0.35)",
            marginBottom: "12px",
          },
          children: [
            {
              tag: "button",
              namespace: "html",
              id: TAB_AI,
              attributes: { type: "button" },
              properties: { textContent: getString("tab-ai") },
              styles: {
                ...tabHeaderStyle,
                borderBottom: "2px solid AccentColor",
                fontWeight: "600",
              },
              listeners: [
                {
                  type: "click",
                  listener: (ev: Event) =>
                    switchTab(
                      (ev.currentTarget as Node).ownerDocument as Document,
                      "ai",
                    ),
                },
              ],
            },
            {
              tag: "button",
              namespace: "html",
              id: TAB_OFFLINE,
              attributes: { type: "button" },
              properties: { textContent: getString("tab-offline") },
              styles: { ...tabHeaderStyle, opacity: "0.65" },
              listeners: [
                {
                  type: "click",
                  listener: (ev: Event) =>
                    switchTab(
                      (ev.currentTarget as Node).ownerDocument as Document,
                      "offline",
                    ),
                },
              ],
            },
          ],
        },
        // Panel 1 — Classify with AI.
        {
          tag: "div",
          namespace: "html",
          id: PANEL_AI,
          styles: { display: "block" },
          children: [
            {
              tag: "label",
              namespace: "html",
              properties: { innerHTML: getString("dialog-network-note") },
              styles: {
                display: "block",
                opacity: "0.7",
                marginBottom: "10px",
                fontSize: "0.9em",
              },
            },
            {
              tag: "button",
              namespace: "html",
              attributes: { type: "button" },
              properties: { textContent: getString("dialog-classify-confirm") },
              styles: actionButtonStyle,
              listeners: [{ type: "click", listener: classifyNow }],
            },
          ],
        },
        // Panel 2 — Offline copy/paste round-trip (hidden until selected).
        {
          tag: "div",
          namespace: "html",
          id: PANEL_OFFLINE,
          styles: { display: "none" },
          children: [
            {
              tag: "label",
              namespace: "html",
              properties: {
                innerHTML: getString("dialog-manual-prompt-label"),
              },
              styles: {
                display: "block",
                fontWeight: "600",
                marginBottom: "6px",
              },
            },
            {
              tag: "textarea",
              namespace: "html",
              id: PREVIEW_ID,
              attributes: { rows: "7", readonly: "true" },
              properties: {
                value: buildManualPrompt(initialContext, contexts),
              },
              styles: {
                width: "100%",
                boxSizing: "border-box",
                resize: "vertical",
                fontFamily: "monospace",
                fontSize: "0.85em",
                opacity: "0.9",
              },
            },
            {
              tag: "label",
              namespace: "html",
              properties: { innerHTML: getString("dialog-manual-prompt-note") },
              styles: {
                display: "block",
                opacity: "0.7",
                margin: "8px 0",
                fontSize: "0.9em",
              },
            },
            {
              tag: "button",
              namespace: "html",
              attributes: { type: "button" },
              properties: { textContent: getString("dialog-manual-copy") },
              styles: actionButtonStyle,
              listeners: [{ type: "click", listener: copyPrompt }],
            },
            {
              tag: "hr",
              namespace: "html",
              styles: {
                border: "none",
                borderTop: "1px solid rgba(128,128,128,0.25)",
                margin: "16px 0",
              },
            },
            {
              tag: "label",
              namespace: "html",
              properties: {
                innerHTML: getString("dialog-manual-import-label"),
              },
              styles: {
                display: "block",
                fontWeight: "600",
                marginBottom: "6px",
              },
            },
            {
              tag: "textarea",
              namespace: "html",
              attributes: {
                "data-bind": "response",
                "data-prop": "value",
                rows: "7",
                placeholder: getString("dialog-manual-import-placeholder"),
              },
              styles: {
                width: "100%",
                boxSizing: "border-box",
                resize: "vertical",
                fontFamily: "monospace",
                fontSize: "0.85em",
              },
            },
            {
              tag: "label",
              namespace: "html",
              properties: { innerHTML: getString("dialog-manual-import-note") },
              styles: {
                display: "block",
                opacity: "0.7",
                margin: "8px 0",
                fontSize: "0.9em",
              },
            },
            {
              tag: "button",
              namespace: "html",
              attributes: { type: "button" },
              properties: {
                textContent: getString("dialog-manual-import-confirm"),
              },
              styles: actionButtonStyle,
              listeners: [{ type: "click", listener: importNow }],
            },
          ],
        },
      ],
    })
    .addButton(getString("dialog-close"), "close")
    .setDialogData(dialogData)
    .open(getString("dialog-collection-title"));

  addon.data.dialog = dialog;
  await dialogData.unloadLock?.promise;
  addon.data.dialog = undefined;

  return dialogData.action === "classify"
    ? String(dialogData.context ?? "")
    : null;
}

async function openCollection(): Promise<void> {
  const pane = Zotero.getActiveZoteroPane();
  const collection = pane?.getSelectedCollection?.();
  if (!collection) {
    notify(getString("status-classify-nocollection"), "fail");
    return;
  }

  const items = collection
    .getChildItems(false, false)
    .filter((it) => it.isRegularItem());
  if (!items.length) {
    notify(getString("status-classify-empty"), "fail");
    return;
  }

  const context = await openTriageDialog(collection.key, items);
  if (context === null) return; // closed without classifying
  await runClassification(context, items);
}

export function registerCollectionMenu(
  win: Window = Zotero.getMainWindow(),
): void {
  // A single item on the native collection context-menu popup, opening the
  // tabbed window above. Built via ztoolkit.UI so it's tracked and removed by
  // `ztoolkit.unregisterAll()` on shutdown/unload (see hooks.ts). Mirrors the
  // item-menu pattern in menu.ts.
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
        label: getString("menu-collection"),
        image: `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`,
      },
      listeners: [{ type: "command", listener: () => void openCollection() }],
    },
    collectionmenu,
  );
}
