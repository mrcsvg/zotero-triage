prefs-title = Zotero Triage
column-label = Prioridade

menu-priority = Zotero Triage
menu-high = Alta ({ $value })
menu-medium = Média ({ $value })
menu-low = Baixa ({ $value })
menu-custom = Personalizar…
menu-clear = Limpar
menu-collection = Zotero Triage…

prompt-custom-text = Definir prioridade de leitura (0–100):

dialog-collection-title = Zotero Triage
tab-ai = Classificar com IA
tab-offline = Offline (copiar/colar)
dialog-context-label = Contexto do projeto (usado como prompt de classificação)
dialog-context-placeholder = Descreva o que torna um item prioritário neste projeto — temas, perguntas, métodos, critérios de inclusão/exclusão…
dialog-network-note = Ao executar, os metadados de cada item e este contexto são enviados ao provedor configurado nas Preferências.
dialog-classify-confirm = Salvar e Classificar
dialog-cancel = Cancelar
dialog-close = Fechar

dialog-manual-prompt-label = Prompt completo (cole no ChatGPT, Claude ou qualquer LLM de chat)
dialog-manual-prompt-note = Copie este prompt, cole na sua LLM e traga a resposta em JSON de volta por “Importar prioridades da LLM…”. Sem chave de API e sem rede.
dialog-manual-copy = Copiar prompt

dialog-manual-import-label = Cole a resposta da LLM
dialog-manual-import-placeholder = Cole o array JSON que o modelo retornou, ex.: [{ "{" }"key":"ABCD1234","priority":85 { "}" }, …]
dialog-manual-import-note = Só chaves desta coleção são aplicadas; o resto é ignorado.
dialog-manual-import-confirm = Importar

status-set = Prioridade { $value } definida em { $count } item(ns)
status-cleared = Prioridade removida de { $count } item(ns)
status-classify-running = Classificando { $count } item(ns)…
status-classify-done = { $count } item(ns) classificado(s)
status-classify-error = Falha na classificação — veja o console de erros do Zotero
status-classify-nokey = Defina uma chave de API em Preferências → Zotero Triage primeiro
status-classify-nocollection = Selecione uma coleção primeiro
status-classify-empty = Esta coleção não tem itens para classificar
status-manual-copied = Prompt copiado — cole na sua LLM
status-manual-import-none = Nenhuma prioridade reconhecida — confira se colou a resposta JSON completa
status-manual-import-done = Prioridades importadas para { $count } item(ns)
