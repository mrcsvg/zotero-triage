# Especificação — Plugin Zotero de Prioridade de Leitura

> Documento de especificação para desenvolvimento de um plugin open-source para Zotero 7+
> que adiciona uma coluna de **prioridade de leitura**, com opção de **relevância automática
> assistida por LLM (opt-in)** avaliada contra um prompt definido por coleção. Nome de
> trabalho: **Reading Priority** (substituível).
>
> **Nota de revisão (2026-06-30):** a abordagem da Fase 2 mudou. O desenho original
> (TF-IDF + classificador local treinado em rótulos relevante/irrelevante) foi substituído
> por um provider de LLM opt-in que pontua relevância contra um prompt por coleção. A fonte
> da verdade para o desenho atual é
> [`docs/plans/2026-06-30-llm-relevance-design.md`](../docs/plans/2026-06-30-llm-relevance-design.md);
> as seções §4, §5, §6, §8, §10, §12 e §13 abaixo já refletem essa mudança.

---

## 1. Motivação e problema

Quem acumula um volume grande de leitura no Zotero não tem hoje uma forma nativa de responder
à pergunta "o que eu leio primeiro?". As opções atuais são:

- **Tags** (`*`, `**`, `***`, `to-read`, etc.) — funcionam, mas poluem o painel de tags,
  não ordenam de forma limpa e exigem manutenção manual constante.
- **Coleção "TO READ"** — separa, mas não ordena nem prioriza.
- **Plugins de status de leitura** (zotero-reading-list, Reading Flow) — resolvem _status_
  (lido / não lido / lendo), mas não dão um **valor numérico de prioridade ordenável** nem
  qualquer **ranqueamento automático** por relevância.

Não existe plugin dedicado que entregue uma coluna simples de prioridade/ordem. A demanda é
recorrente nos fóruns desde ~2007, mas nunca virou feature nativa nem plugin de propósito único.
Esta especificação cobre esse buraco.

### O que diferencia este plugin

1. Uma **coluna numérica de prioridade** ordenável no item tree (o "simples" que falta).
2. Uma camada **opcional de relevância automática (opt-in)** que usa um LLM — com a sua
   própria chave de API — para pontuar itens contra um **prompt definido por coleção**, e
   ranquear o que ainda não tem prioridade manual. Pensada para **biblioteca crescente**
   (triagem contínua), e não para corpus fixo de revisão sistemática (caso já bem servido por
   ASReview). Sem provider configurado, o plugin é 100% local.

---

## 2. Objetivos e não-objetivos

### Objetivos

- Adicionar uma coluna `Priority` ordenável ao item tree do Zotero.
- Permitir definir prioridade manualmente via menu de contexto e atalhos de teclado.
- Persistir o dado de forma que **sincronize** e **não quebre** exportação/citação.
- (Fase 2) Pontuar relevância automaticamente a partir de título + resumo, usando um **LLM
  opt-in** (chave do próprio usuário) avaliado contra um **prompt por coleção**. Desligado por
  padrão: sem chave configurada, nenhum dado sai do dispositivo.
- Ser leve, sem dependências pesadas e sem telemetria.

### Não-objetivos

- **Não** substituir ferramentas de revisão sistemática (ASReview, Rayyan, Covidence).
- **Não** criar tipos de item customizados (inviável fora do core do Zotero).
- **Não** implementar ordenação manual por arrastar-e-soltar (limitação estrutural do Zotero;
  a coluna numérica é o substituto pragmático).
- **Não** enviar nada à rede por padrão. A relevância por LLM (Fase 2) é **opt-in**: só chama
  um provider quando o usuário configura a própria chave, e envia apenas título + resumo.
- **Não** treinar modelos localmente nem embarcar pesos de ML (a abordagem de classificador
  local foi descartada — ver nota de revisão no topo).

---

## 3. Usuários-alvo e casos de uso

| Persona                                 | Caso de uso                                                                |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Pesquisador com pilha grande            | "Quero ler primeiro o que é mais relevante para o meu tema atual."         |
| Estudante de pós                        | "Quero ordenar a fila de leitura sem encher de tags."                      |
| Revisor de literatura (não-sistemática) | "Quero que os itens de uma pasta entrem já ranqueados conforme o tema dela." |

**Fluxo central (Fase 2):** o usuário define um **prompt de relevância na coleção** (ex.:
"métodos de inferência causal aplicados a marketing") → abre a pasta e roda **"Pontuar esta
pasta"** → o comando estima o custo, confirma, e o LLM pontua os itens sem prioridade manual →
os scores aparecem na coluna `Priority` (0–100) e o usuário ordena e lê de cima para baixo.
Prioridade manual sempre vence; o auto só preenche o que está em branco.

---

## 4. Requisitos funcionais (faseados)

### Fase 1 — MVP (coluna manual) — _meta: utilizável em um fim de semana_

- **F1.1** Registrar uma coluna `Priority` no item tree, ordenável, exibindo um inteiro (ex.: 0–100)
  ou vazio.
- **F1.2** Menu de contexto (clique direito) → submenu "Set Priority" com níveis rápidos
  (ex.: Alta=80 / Média=50 / Baixa=20 / Limpar) **e** opção "Custom…" para digitar um número.
- **F1.3** Atalhos de teclado configuráveis para subir/descer prioridade do(s) item(ns)
  selecionado(s) (ex.: `Alt+↑` / `Alt+↓`, passo de 10) e para limpar (`Alt+0`).
- **F1.4** Suporte a seleção múltipla (aplicar o mesmo valor a vários itens de uma vez).
- **F1.5** Persistência no campo **Extra** como par chave-valor namespaced (ver §6).
- **F1.6** Painel de preferências mínimo: nome dos níveis, passo dos atalhos, formato da coluna
  (número / estrelas / barra).

### Fase 2 — Relevância assistida por LLM (opt-in) — _o diferencial_

- **F2.1** Interface `RelevanceProvider` (`scoreItems(items, folderPrompt) → {itemKey, score,
  reason}[]`) e esqueleto `src/relevance/`. O provider é a **única** superfície que faz rede.
- **F2.2** `score-store` em **IndexedDB**: persiste `(itemKey, collectionKey) → {score, reason,
  model, scoredAt, stale}`, chave composta `itemKey::collectionKey`. É a fonte da verdade do
  auto-score (não vai para o Extra — ver §6).
- **F2.3** Prompt de relevância **por coleção** (`folder-prompts`, em prefs) + ação de menu
  "Definir prompt de relevância…". Editar o prompt marca os scores daquela pasta como `stale`.
- **F2.4** `resolvePriority(item, collection)`: prioridade **manual (Extra) sempre vence**;
  senão o auto-score da pasta aberta; senão vazio. A coluna consulta essa função e distingue
  visualmente `auto` de `manual`. Escala unificada 0–100.
- **F2.5** Comando **"Pontuar esta pasta"**: coleta itens sem prioridade (`none`/`stale`) →
  estima custo (nº de itens, ~tokens, ~preço) e pede confirmação → chama o provider em **lotes**
  (default 15, concorrência 3), com barra de progresso, cancelável e resumível.
- **F2.6** Providers concretos: **OpenAI** e **Anthropic**. Saída JSON estruturada e validada
  (`{itemKey, score 0–100, reason}`); item ausente ou score fora de faixa é descartado, nunca
  inventado.
- **F2.7** Painel de preferências: seletor de provider (**default Nenhum → 100% local**), campo
  de chave mascarado + "Testar chave", seletor de modelo, opções avançadas (lote/concorrência),
  e texto de consentimento claro sobre o que é enviado à rede.

### Fase 3 — Robustez e polish (backlog)

- **F3.1** Rate-limit / retry com backoff exponencial dentro da camada de provider.
- **F3.2** Re-pontuar `stale` em lote e "limpar scores da pasta".
- **F3.3** Herança de prompt entre pastas aninhadas (opt-in; adiada do MVP por YAGNI).
- **F3.4** Interop explícita com zotero-reading-list / Reading Flow (interação de ordenação,
  evitar conflito de colunas).

---

## 5. Requisitos não-funcionais

- **Privacidade:** **sem rede por padrão** — sem provider configurado, nada sai do dispositivo.
  Sem telemetria. Quando o usuário ativa a Fase 2, só título + resumo dos itens pontuados vão ao
  provider escolhido; a chave de API fica em prefs locais e nunca sincroniza.
- **Custo controlável:** nenhuma chamada de rede acontece sem uma estimativa de custo confirmada
  pelo usuário (cost guard). Prioridade manual nunca gasta tokens.
- **Sem dependências externas em runtime na base:** as Fases 1 continua puramente local; a Fase 2
  só depende do endpoint HTTP do provider quando ativada.
- **Performance:** pontuar uma coleção grande é I/O-bound (rede); usar lotes + concorrência
  limitada e progresso cancelável para não travar a UI. A resolução da coluna
  (`resolvePriority`) deve ser síncrona e barata (lookup em memória/IndexedDB).
- **Sincronização:** só a prioridade **manual** (campo Extra) sincroniza pelo sync nativo do
  Zotero. Os auto-scores são por (item, coleção) e vivem em IndexedDB local — não sincronizam
  e não colidem entre as várias coleções de um item (ver §6).
- **Compatibilidade:** Zotero 7.0+ (testar na minor estável corrente; ver §8).
- **Robustez:** itens sem resumo não podem quebrar o pipeline (degradar para só título); falha
  de rede/chave/rate-limit não corrompe scores existentes.
- **Reversibilidade:** ação para limpar todos os dados do plugin — linhas no Extra **e** a store
  de scores no IndexedDB (uninstall limpo).

---

## 6. Modelo de dados

Há **dois** tipos de dado, guardados em lugares diferentes de propósito.

### Prioridade manual → campo Extra (item-global, sincroniza)

O Zotero **não** suporta campos customizados de primeira classe. O padrão é gravar no campo
**Extra**, um par chave-valor por linha, namespaced para evitar colisão com outros plugins.

Formato no Extra do item:

```
ReadingPriority: 85
```

- `ReadingPriority` — inteiro 0–100; a prioridade **manual** definida à mão. É o que a coluna
  ordena quando presente. Pode ser vazio/ausente.
- É item-global e sincroniza pelo sync nativo do Zotero.
- Ler/escrever via `ExtraFieldTool` do **zotero-plugin-toolkit** (lida com o parsing das linhas),
  evitando manipular o texto do Extra na mão.

> **Cuidado de exportação:** lembre o usuário (nas docs) que essa linha aparece no campo Extra
> e pode vazar para algumas exportações/estilos. Manter o prefixo `ReadingPriority` reduz ruído e
> permite filtrar.

### Auto-score (LLM) → IndexedDB, por (item, coleção)

Um item pode estar em várias coleções com prompts diferentes, então o auto-score é por
**par (item, coleção)** — não cabe num único campo Extra item-global. Fica no storage local do
plugin, **não** no Extra, e por isso **não** sincroniza.

- Store `scores` em **IndexedDB**, chave composta `itemKey::collectionKey`.
- Valor: `{ score: 0–100, reason, model, scoredAt, stale }`.
- `reason` — justificativa curta do LLM, exibida no tooltip da coluna.
- `stale` — marcado quando o prompt da coleção muda; o comando re-pontua só os obsoletos.
- Config de provider e prompts por coleção ficam em `Zotero.Prefs` (`extensions.zotero-triage.*`);
  a chave de API nunca vai para o Extra nem para o IndexedDB de scores.

### Resolução exibida na coluna

`resolvePriority(item, collection)`: se há `ReadingPriority` (manual) no Extra, vence e a coluna
mostra esse valor; senão, busca o auto-score da coleção aberta no `score-store`; senão, vazio. Um
indicador visual sutil distingue `auto` de `manual`.

---

## 7. UI / UX

- **Coluna:** registrada via `Zotero.ItemTreeManager.registerColumns()`. O `dataKey` recebe
  prefixo automático do Zotero (ex.: `readingpriority-…-priority`) para evitar conflito.
  Habilitável pelo menu de cabeçalho de coluna como qualquer outra.
- **Formato de exibição** (preferência): número cru, estrelas (0–5 mapeado de 0–100) ou mini-barra.
- **Menu de contexto:** submenu "Reading Priority" com set rápido, custom e limpar (Fase 1). Na
  Fase 2, no menu da **coleção**: "Definir prompt de relevância…" e "Pontuar esta pasta".
- **Atalhos:** configuráveis; avisar que `Alt+NUM` colide com o atalho nativo de ordenar coluna
  (mesmo trade-off que o reading-list documenta).
- **Sem janelas modais pesadas:** tudo via menu de contexto + preferências.

---

## 8. Arquitetura técnica

### Plataforma

- Zotero 7 é baseado em Firefox ESR 115; plugins agora usam **manifest.json** (estilo WebExtension)
  em vez de `install.rdf`, e arquitetura **bootstrapped** (`bootstrap.js` com
  `startup/shutdown/install/uninstall`). Plugins continuam tendo acesso pleno às APIs internas do
  Zotero (diferente das WebExtensions do Firefox).

### `manifest.json` (modelo)

```json
{
  "manifest_version": 2,
  "name": "Reading Priority",
  "version": "0.1.0",
  "description": "Adds a sortable reading-priority column to Zotero, with optional opt-in LLM relevance scoring.",
  "author": "SEU_NOME",
  "icons": { "48": "icon.png", "96": "icon@2x.png" },
  "applications": {
    "zotero": {
      "id": "reading-priority@SEU_DOMINIO",
      "update_url": "https://SEU_HOST/updates.json",
      "strict_min_version": "6.999",
      "strict_max_version": "7.0.*"
    }
  }
}
```

### Stack recomendada

- **Linguagem:** TypeScript.
- **Scaffold:** `windingwind/zotero-plugin-template` (bootstrap, hot-reload, build com
  zotero-plugin-scaffold, exemplos de APIs).
- **Toolkit:** `zotero-plugin-toolkit` — fornece `ExtraFieldTool` (campo Extra) e helpers para
  registrar colunas, menus e atalhos. Usar com parcimônia (não acoplar demais).
- **Tipos:** `zotero-types` para autocompletar a API do Zotero.
- **Referência mínima oficial:** plugin de exemplo `zotero/make-it-red`.

### Esqueleto de registro de coluna

```js
// chamado no startup do bootstrap
const registeredDataKey = await Zotero.ItemTreeManager.registerColumns({
  dataKey: "priority",
  label: "Priority",
  pluginID: "reading-priority@SEU_DOMINIO",
  dataProvider: (item /*, dataKey */) => {
    const raw = readExtra(item, "ReadingPriority"); // via ExtraFieldTool
    return raw ?? "";
  },
  // habilitar ordenação numérica correta
  zoteroPersist: ["width", "hidden", "sortDirection"],
});

// no shutdown
await Zotero.ItemTreeManager.unregisterColumns(registeredDataKey);
```

### Camada de relevância (Fase 2) — pipeline

1. **Coleta:** itens da coleção aberta sem prioridade (`none`/`stale`) → `{itemKey, title,
   abstractNote}`. Itens com prioridade manual são pulados (não gastam tokens).
2. **Estimativa de custo:** contar tokens de `título + resumo` × nº de itens + overhead do prompt,
   × preço do modelo → diálogo de confirmação (cost guard). Nada de rede antes disso.
3. **Lotes:** agrupar N itens por chamada (default 15), concorrência limitada (default 3).
4. **Chamada ao provider:** `RelevanceProvider.scoreItems(items, folderPrompt)` → JSON estruturado
   `{itemKey, score 0–100, reason}` por item, validado (descarta lixo).
5. **Persistência:** gravar cada score no `score-store` (IndexedDB), chave `itemKey::collectionKey`.
   Parcial é salvo — re-rodar retoma de onde parou.
6. **Exibição:** a coluna chama `resolvePriority` (manual vence; senão auto da pasta aberta).

> Manter a rede isolada num módulo (`src/relevance/`) atrás da interface `RelevanceProvider`, de
> forma que trocar/adicionar provider (OpenAI, Anthropic, …) não toque no resto do plugin.

### Estrutura de repositório sugerida

```
reading-priority/
├── src/
│   ├── bootstrap.ts            # ciclo de vida do plugin
│   ├── index.ts                # init: registra coluna, menus, atalhos, prefs
│   ├── modules/
│   │   ├── column.ts           # registro/leitura da coluna
│   │   ├── contextMenu.ts      # ações de menu
│   │   ├── shortcuts.ts        # atalhos de teclado
│   │   └── extra.ts            # wrapper do ExtraFieldTool (chaves namespaced)
│   ├── relevance/              # Fase 2 (opt-in LLM)
│   │   ├── provider.ts         # interface RelevanceProvider (única superfície de rede)
│   │   ├── openai.ts           # OpenAIProvider
│   │   ├── anthropic.ts        # AnthropicProvider
│   │   ├── score-store.ts      # IndexedDB (itemKey::collectionKey)
│   │   ├── folder-prompts.ts   # prompt por coleção (prefs)
│   │   ├── scoring-command.ts  # coleta → estimativa → lotes → grava
│   │   └── resolve.ts          # resolvePriority (manual vence)
│   └── prefs/                  # painel de preferências
├── addon/
│   ├── manifest.json
│   ├── bootstrap.js
│   └── locale/                 # .ftl (Fluent) — i18n
├── package.json
├── tsconfig.json
├── LICENSE                     # ver §11
└── README.md
```

---

## 9. Build, desenvolvimento e distribuição

- **Dev:** usar **perfil e diretório de dados separados** para não arriscar a biblioteca real.
- **Hot reload:** o template do windingwind recompila e recarrega ao salvar.
- **Debug:** iniciar o build beta com `-jsdebugger` abre o Browser Toolbox do Firefox 115.
- **Empacotamento:** gerar `.xpi` (zip do conteúdo de `addon/` + build).
- **Auto-update:** publicar `updates.json` (formato Mozilla) e apontar `update_url` no manifest;
  permite atualizar compatibilidade sem redistribuir o `.xpi`.
- **Versionamento:** SemVer. Atualizar `strict_max_version` conforme testa cada minor do Zotero.

---

## 10. Testes e validação

- **Unitários (sem rede):** `resolvePriority` (todas as combinações manual/auto/none/stale),
  `folder-prompts` CRUD, `score-store` (chave composta, stale, get/put), parser/validador do JSON
  do LLM (incluindo lixo: item faltando, score fora de faixa), estimador de custo.
- **Provider com fakes:** `RelevanceProvider` mockado com respostas fixas — exercita lotes, falha
  parcial, cancelamento e retomada. Zero chamadas reais de rede nos testes automatizados.
- **Integração (manual, perfil de dev):** registro/remoção da coluna; persistência após restart;
  seleção múltipla; itens sem resumo; sync da prioridade manual entre dois perfis; e (opt-in, com
  chave real, fora do CI) uma pontuação de pasta ponta-a-ponta.
- **Regressão de versão:** revalidar a cada bump de minor do Zotero (a API de colunas é estável
  desde a 7.0, mas o resto da plataforma pode mudar).

---

## 11. Licença e governança open-source

- **Licença sugerida:** AGPL-3.0 ou GPL-3.0 (alinha com o ecossistema Zotero e mantém derivados
  abertos) — ou MIT, se você quiser adoção máxima e permitir forks fechados. Decisão sua.
- **README** com: o que faz, screenshot/GIF, instalação do `.xpi`, tabela de compatibilidade por
  versão do Zotero, e seção "Fase atual vs. roadmap".
- **CONTRIBUTING.md** + template de issue (bug / feature).
- **Publicação:** repositório no GitHub; opcional submeter ao diretório de plugins do Zotero e
  anunciar no fórum (`Plugins`).
- **Privacidade:** declarar explicitamente no README "sem telemetria; sem rede por padrão" e que
  a relevância por LLM é opt-in com a chave do próprio usuário (é diferencial e reduz fricção de
  adoção).

---

## 12. Roadmap / milestones

| Milestone               | Entrega                                                       | Critério de pronto                              |
| ----------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| **M1 — MVP**            | Coluna manual + menu + atalhos + persistência Extra           | Define/ordena/persiste prioridade após restart  |
| **M2 — Prefs & polish** | Painel de preferências, formatos de coluna, i18n PT/EN        | Configurável e traduzido                        |
| **M3 — LLM relevance: core** | Interface `RelevanceProvider`, `score-store` (IndexedDB), prompts por coleção, `resolvePriority` na coluna, provider OpenAI | Pontuar uma pasta grava scores por (item, coleção); manual vence |
| **M4 — Command, cost & UX**  | Comando "Pontuar esta pasta", cost guard, painel de preferências, provider Anthropic, tooltip + invalidação `stale` | Fluxo opt-in utilizável, com custo estimado antes de rodar |
| **M5 — Robustness & polish** | Retry/backoff, re-score em lote, herança de prompt (opt-in), interop Reading Flow | Robusto a rate-limit e a bibliotecas grandes |

> Sugestão estratégica: **publicar o M1 cedo** (já preenche um buraco real e ninguém oferece) e
> só investir na camada de LLM depois. Como ela é **opt-in** e usa a chave do próprio usuário,
> o risco de custo e privacidade fica com quem escolhe ativá-la — mas o cost guard e o default
> "Nenhum provider" são requisitos, não enfeites.

---

## 13. Riscos e mitigações

| Risco                                     | Mitigação                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| Quebra a cada versão do Zotero            | Ficar na API estável (colunas, Extra); testar betas; `strict_max_version` |
| Dado no Extra vaza em exportações         | Namespacing + doc clara; opção de "limpar dados do plugin"                |
| Custo inesperado de API de LLM            | Cost guard obrigatório (estimativa + confirmação); manual nunca gasta tokens; default "Nenhum provider" |
| Dado sensível enviado a terceiros         | Opt-in explícito; só título+resumo; consentimento na UI; chave em prefs locais |
| Saída do LLM malformada/alucinada         | JSON estruturado validado; score fora de faixa/item ausente é descartado, não inventado |
| Colisão de atalho `Alt+NUM`               | Atalhos configuráveis + aviso na doc                                      |
| Bibliotecas compartilhadas (multiusuário) | Fase 1 assume estados por usuário; tratar shared library como backlog     |

---

## 14. Prior art (referência, não dependência)

- `Dominic-DallOsto/zotero-reading-list` — coluna de status + atalhos; padrão de persistência no Extra.
- `Reading Flow` — colunas Progress/Status/Last Read, sem DB externo.
- `windingwind/zotero-actions-tags` + `zotero-plugin-toolkit` — automação e `ExtraFieldTool`.
- `janbaykara/zotero-syllabus` — prioridade por níveis em listas estruturadas.
- `zotero/make-it-red` — plugin mínimo de exemplo oficial (Zotero 7).
- `ben-AI-cybersec/zotero-publication-rankings` — exemplo de coluna com base de dados de rankings.
- ASReview / Rayyan — referência de UX de priorização (alvo a _não_ duplicar, mas a se inspirar).

---

_Fim da especificação. Ajuste nomes, licença e escopo de fases conforme sua preferência antes de iniciar o M1._
