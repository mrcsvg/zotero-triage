# Especificação — Plugin Zotero de Prioridade de Leitura

> Documento de especificação para desenvolvimento de um plugin open-source para Zotero 7+
> que adiciona uma coluna de **prioridade de leitura**, com opção de **priorização automática**
> baseada no conteúdo dos itens. Nome de trabalho: **Reading Priority** (substituível).

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
2. Uma camada **opcional de priorização automática** que aprende com o que você marca como
   relevante e ranqueia o resto da biblioteca — pensada para **biblioteca crescente** (triagem
   contínua), e não para corpus fixo de revisão sistemática (caso já bem servido por ASReview).

---

## 2. Objetivos e não-objetivos

### Objetivos

- Adicionar uma coluna `Priority` ordenável ao item tree do Zotero.
- Permitir definir prioridade manualmente via menu de contexto e atalhos de teclado.
- Persistir o dado de forma que **sincronize** e **não quebre** exportação/citação.
- (Fase 2) Calcular prioridade automaticamente a partir de título + resumo, treinando num
  classificador leve que roda **localmente**, sem serviço externo.
- Ser leve, sem dependências pesadas e sem telemetria.

### Não-objetivos

- **Não** substituir ferramentas de revisão sistemática (ASReview, Rayyan, Covidence).
- **Não** criar tipos de item customizados (inviável fora do core do Zotero).
- **Não** implementar ordenação manual por arrastar-e-soltar (limitação estrutural do Zotero;
  a coluna numérica é o substituto pragmático).
- **Não** depender de API de LLM/embeddings na versão base (pode ser provider opcional na Fase 3).

---

## 3. Usuários-alvo e casos de uso

| Persona                                 | Caso de uso                                                                |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Pesquisador com pilha grande            | "Quero ler primeiro o que é mais relevante para o meu tema atual."         |
| Estudante de pós                        | "Quero ordenar a fila de leitura sem encher de tags."                      |
| Revisor de literatura (não-sistemática) | "Quero que itens novos entrem já ranqueados conforme o que já achei útil." |

**Fluxo central (Fase 2):** o usuário marca alguns itens como "relevante / não relevante" →
o modelo treina → todos os itens não rotulados recebem um score na coluna `Priority` →
o usuário ordena por essa coluna e lê de cima para baixo. A cada novo rótulo, re-ranqueia.

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

### Fase 2 — Priorização automática (local) — _o diferencial_

- **F2.1** Ação "Mark relevant / Mark not relevant" no menu de contexto (rótulos de treino),
  persistidos em Extra (ver §6).
- **F2.2** Extração de features a partir de `title` + `abstractNote` (opcionalmente tags e
  publicação/venue) → vetor TF-IDF.
- **F2.3** Classificador leve em JS/TS (regressão logística **ou** naive Bayes multinomial),
  treinado **em memória, localmente**, sem rede.
- **F2.4** Loop de aprendizado ativo: ao adicionar/alterar um rótulo, re-treinar e recomputar o
  score (`0–100`) de todos os itens **não rotulados** da coleção/biblioteca ativa, gravando na
  coluna `Priority`.
- **F2.5** Comando "Recompute priorities" (menu/botão) para rodar sob demanda numa coleção.
- **F2.6** Distinção visual/opcional entre prioridade **manual** (travada pelo usuário) e
  **automática** (recalculável). Prioridade manual nunca é sobrescrita pelo auto a menos que o
  usuário destrave.
- **F2.7** Escopo configurável: aplicar à biblioteca inteira, à coleção selecionada ou a uma
  coleção-alvo definida nas preferências.

### Fase 3 — Extensões opcionais (backlog)

- **F3.1** Provider plugável de embeddings/relevância (modelo local empacotado **ou** API externa
  opcional, sempre opt-in e desligado por padrão por privacidade).
- **F3.2** Curva de descoberta de relevantes (gráfico de saturação) para casos quase-SR.
- **F3.3** Boost por recência/venue (ex.: combinar score de conteúdo com quartil de periódico).
- **F3.4** Interop explícita com zotero-reading-list / Reading Flow (ler status para alimentar
  rótulos de treino).

---

## 5. Requisitos não-funcionais

- **Privacidade:** nenhum dado sai do dispositivo na base (Fases 1–2). Sem telemetria.
- **Sem dependências externas em runtime:** ML em JS puro; nada de servidor.
- **Performance:** treino + recálculo de uma coleção de ~5.000 itens deve rodar em poucos
  segundos no thread principal; usar processamento em lote/`requestIdleCallback` para não travar a UI.
- **Sincronização:** por usar o campo Extra (dado padrão do Zotero), os valores sincronizam
  pelo sync nativo automaticamente.
- **Compatibilidade:** Zotero 7.0+ (testar na minor estável corrente; ver §8).
- **Robustez:** itens sem resumo não podem quebrar o pipeline (degradar para só título).
- **Reversibilidade:** ação para limpar todos os dados do plugin do Extra (uninstall limpo).

---

## 6. Modelo de dados

O Zotero **não** suporta campos customizados de primeira classe. O padrão é gravar no campo
**Extra**, um par chave-valor por linha, namespaced para evitar colisão com outros plugins.

Formato proposto no Extra do item:

```
ReadingPriority: 85
ReadingPriorityMode: manual        # manual | auto
ReadingPriorityLabel: relevant     # relevant | irrelevant | (ausente = não rotulado)
```

Regras:

- `ReadingPriority` — inteiro 0–100; é o que a coluna ordena. Pode ser vazio/ausente.
- `ReadingPriorityMode` — `manual` trava contra sobrescrita pelo auto; `auto` é recalculável.
- `ReadingPriorityLabel` — usado só na Fase 2 como sinal de treino.
- Ler/escrever via `ExtraFieldTool` do **zotero-plugin-toolkit** (lida com o parsing das linhas),
  evitando manipular o texto do Extra na mão.

> **Cuidado de exportação:** lembre o usuário (nas docs) que essas linhas aparecem no campo Extra
> e podem vazar para algumas exportações/estilos. Manter o prefixo `ReadingPriority` reduz ruído e
> permite filtrar.

---

## 7. UI / UX

- **Coluna:** registrada via `Zotero.ItemTreeManager.registerColumns()`. O `dataKey` recebe
  prefixo automático do Zotero (ex.: `readingpriority-…-priority`) para evitar conflito.
  Habilitável pelo menu de cabeçalho de coluna como qualquer outra.
- **Formato de exibição** (preferência): número cru, estrelas (0–5 mapeado de 0–100) ou mini-barra.
- **Menu de contexto:** submenu "Reading Priority" com set rápido, custom, marcar relevante/irrelevante,
  travar/destravar (manual/auto) e "Recompute".
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
  "description": "Adds a sortable reading-priority column to Zotero, with optional local auto-ranking.",
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

### Camada de ML (Fase 2) — pipeline

1. **Coleta:** itens da coleção/biblioteca ativa → `{id, title, abstractNote, tags?}`.
2. **Pré-processamento:** lowercase, remoção de stopwords (PT/EN), tokenização simples.
3. **Vetorização:** TF-IDF (vocabulário construído sobre o corpus corrente).
4. **Treino:** rótulos `relevant=1 / irrelevant=0` → regressão logística (gradiente em JS) ou
   naive Bayes multinomial. Começar com poucos exemplos (5–10 por classe já dá sinal útil).
5. **Inferência:** probabilidade → `score = round(p * 100)` → grava `ReadingPriority` (mode=auto)
   apenas em itens não travados.
6. **Re-treino incremental:** disparado por mudança de rótulo (com debounce) ou pelo comando manual.

> Manter o ML num módulo isolado (`src/ranking/`) e atrás de uma interface
> (`RankingProvider`) para que a Fase 3 (embeddings/LLM) seja só um provider alternativo.

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
│   ├── ranking/                # Fase 2
│   │   ├── RankingProvider.ts  # interface
│   │   ├── tfidf.ts
│   │   ├── classifier.ts       # logistic regression / naive bayes
│   │   └── pipeline.ts         # coleta → treino → score
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

- **Unitários:** TF-IDF, classificador (treino/predição com fixtures), parser do Extra.
- **Integração (manual, perfil de dev):** registro/remoção da coluna; persistência após restart;
  comportamento com seleção múltipla; itens sem resumo; sync entre dois perfis.
- **Validação do ranqueamento (Fase 2):** montar um conjunto rotulado de ~100 itens, medir se os
  relevantes sobem ao topo (ex.: % de relevantes encontrados nos primeiros 20%). Comparar com
  ordenação por data como baseline antes de afirmar valor.
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
- **Privacidade:** declarar explicitamente "sem telemetria, sem rede" no README (é diferencial e
  reduz fricção de adoção).

---

## 12. Roadmap / milestones

| Milestone               | Entrega                                                       | Critério de pronto                              |
| ----------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| **M1 — MVP**            | Coluna manual + menu + atalhos + persistência Extra           | Define/ordena/persiste prioridade após restart  |
| **M2 — Prefs & polish** | Painel de preferências, formatos de coluna, i18n PT/EN        | Configurável e traduzido                        |
| **M3 — Auto local**     | TF-IDF + classificador + loop de rótulos                      | Relevantes sobem mensuravelmente vs. baseline   |
| **M4 — Escopo & UX**    | Recompute por coleção, travar manual/auto, curva de saturação | Fluxo contínuo utilizável no dia a dia          |
| **M5 — Providers**      | Interface de provider + (opcional) embeddings opt-in          | Provider alternativo plugável sem mexer no core |

> Sugestão estratégica: **publicar o M1 cedo** (já preenche um buraco real e ninguém oferece) e
> só investir no ML depois de validar, num conjunto seu, que o ranqueamento automático supera de
> forma perceptível a simples ordenação por data. Assim você evita carregar a manutenção da camada
> de ML antes de ter certeza do valor.

---

## 13. Riscos e mitigações

| Risco                                     | Mitigação                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| Quebra a cada versão do Zotero            | Ficar na API estável (colunas, Extra); testar betas; `strict_max_version` |
| Dado no Extra vaza em exportações         | Namespacing + doc clara; opção de "limpar dados do plugin"                |
| ML fraco com poucos rótulos               | Começar com TF-IDF+NB (robusto em baixo volume); mostrar baseline honesto |
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
