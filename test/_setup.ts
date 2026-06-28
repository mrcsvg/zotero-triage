import { ZoteroToolkit } from "zotero-plugin-toolkit";

// The plugin exposes `ztoolkit` on its own sandbox, not the test scope.
// Provide one here so modules that use `ztoolkit.ExtraField` work under test.
if (typeof (globalThis as any).ztoolkit === "undefined") {
  (globalThis as any).ztoolkit = new ZoteroToolkit();
}
