import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import {
  registerPriorityColumn,
  unregisterPriorityColumn,
} from "./modules/column";
import { registerContextMenu } from "./modules/menu";
import { registerCollectionMenu } from "./modules/classify";
import { registerManualMenu } from "./modules/manualClassify";
import { registerShortcuts } from "./modules/shortcuts";
import { registerPrefPane } from "./modules/prefs";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  try {
    await registerPriorityColumn();
  } catch (e) {
    (addon.data as any).priorityColumnError =
      `${e}\n${(e as any)?.stack ?? ""}`;
    ztoolkit.log("[ReadingPriority] column registration failed", e);
  }

  registerPrefPane();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // Signals load completion to the scaffold test harness.
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Recreate ztoolkit bound to this window (template pattern).
  addon.data.ztoolkit = createZToolkit();
  registerContextMenu(win);
  registerCollectionMenu(win);
  registerManualMenu(win);
  registerShortcuts();
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  // The column is registered directly via Zotero.ItemTreeManager (not ztoolkit),
  // so unregister it explicitly — otherwise hot-reload hits a duplicate dataKey.
  void unregisterPriorityColumn();
  // Remove addon object
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
};
