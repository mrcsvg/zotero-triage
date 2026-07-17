prefs-title = Zotero Triage
column-label = Priority

menu-priority = Zotero Triage
menu-high = High ({ $value })
menu-medium = Medium ({ $value })
menu-low = Low ({ $value })
menu-custom = Custom…
menu-clear = Clear
menu-classify = Classify with AI…
menu-manual-prompt = Copy prompt for offline LLM…
menu-manual-import = Import LLM priorities…

prompt-custom-text = Set reading priority (0–100):

dialog-classify-title = Classify collection with AI
dialog-context-label = Project context (used as the classification prompt)
dialog-context-placeholder = Describe what makes an item high-priority for this project — topics, questions, methods, inclusion/exclusion criteria…
dialog-network-note = Running this sends each item's metadata and this context to the provider configured in Preferences.
dialog-classify-confirm = Save & Classify
dialog-save = Save prompt
dialog-cancel = Cancel
dialog-close = Close

dialog-manual-prompt-title = Copy prompt for an offline LLM
dialog-manual-prompt-label = Full prompt (paste this into ChatGPT, Claude, or any chat LLM)
dialog-manual-prompt-note = Copy this prompt, paste it into your LLM, then bring its JSON reply back through “Import LLM priorities…”. No API key and no network needed.
dialog-manual-copy = Copy prompt

dialog-manual-import-title = Import LLM priorities
dialog-manual-import-label = Paste the LLM's reply
dialog-manual-import-placeholder = Paste the JSON array the model returned, e.g. [{ "{" }"key":"ABCD1234","priority":85 { "}" }, …]
dialog-manual-import-note = Only keys belonging to this collection are applied; anything else is ignored.
dialog-manual-import-confirm = Import

status-context-saved = Prompt saved
status-set = Set priority { $value } on { $count } item(s)
status-cleared = Cleared priority on { $count } item(s)
status-classify-running = Classifying { $count } item(s)…
status-classify-done = Classified { $count } item(s)
status-classify-error = Classification failed — see the Zotero error console
status-classify-nokey = Set an API key in Preferences → Zotero Triage first
status-classify-nocollection = Select a collection first
status-classify-empty = This collection has no items to classify
status-manual-copied = Prompt copied — paste it into your LLM
status-manual-import-none = No priorities recognized — check that you pasted the full JSON reply
status-manual-import-done = Imported priorities for { $count } item(s)
