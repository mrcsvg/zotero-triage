// Default preferences for Zotero Triage. The build prefixes these with
// `extensions.zotero.zoterotriage.` and generates the typed PluginPrefsMap.
pref("format", "number"); // column display: "number" | "stars" | "bar"
pref("step", 10); // keyboard raise/lower increment
pref("levelHigh", 80); // quick-level "High"
pref("levelMedium", 50); // quick-level "Medium"
pref("levelLow", 20); // quick-level "Low"
pref("folderPrompts", "{}"); // JSON blob: collectionKey -> relevance prompt (Phase 2)

// Phase 2 relevance provider config (local-only; never synced, never in Extra).
pref("provider", "none"); // "none" | "openai" | "anthropic" — default: fully local
pref("apiKey", ""); // the active provider's API key (local prefs only)
pref("model", ""); // model override; empty = the provider's default
pref("batchSize", 15); // items per provider call
pref("concurrency", 3); // max provider calls in flight
