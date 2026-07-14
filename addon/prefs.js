// Default preferences for Zotero Triage. The build prefixes these with
// `extensions.zotero.zoterotriage.` and generates the typed PluginPrefsMap.
pref("format", "number"); // column display: "number" | "stars" | "bar"
pref("step", 10); // keyboard raise/lower increment
pref("levelHigh", 80); // quick-level "High"
pref("levelMedium", 50); // quick-level "Medium"
pref("levelLow", 20); // quick-level "Low"

// AI classification (opt-in; performs network I/O only when invoked).
pref("aiProvider", "anthropic"); // "anthropic" | "openai"
pref("aiModel", ""); // empty = provider default
pref("aiApiKey", ""); // stored locally in the profile; not synced; never logged
pref("collectionContexts", "{}"); // JSON map: collectionKey -> project-context prompt
