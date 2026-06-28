# Zotero Triage — dando prioridade de leitura ao Zotero

_Uma coluna numérica, ordenável, para responder a pergunta que o Zotero nunca respondeu: "o que eu leio primeiro?"_

---

## O problema

Quem acumula leitura no Zotero conhece a sensação: centenas de itens na fila e nenhuma
forma nativa de ordenar por **o que importa ler primeiro**. As saídas de hoje são todas
contornos:

- **Tags** (`*`, `**`, `to-read`) — funcionam, mas poluem o painel de tags, não ordenam
  de forma limpa e exigem manutenção manual constante.
- **Coleção "TO READ"** — separa, mas não ordena nem prioriza.
- **Plugins de status de leitura** (zotero-reading-list, Reading Flow) — resolvem _status_
  (lido / não lido), mas não dão um **valor numérico de prioridade ordenável**.

A demanda aparece nos fóruns do Zotero desde ~2007 e nunca virou recurso nativo nem plugin
de propósito único. O **Zotero Triage** preenche exatamente esse buraco.

## A solução

Uma coisa simples, bem feita:

- **Coluna `Priority`** ordenável no item tree, exibindo um inteiro de 0–100.
- **Menu de contexto** (botão direito → _Zotero Triage_): níveis rápidos (Alta / Média /
  Baixa), valor personalizado e "limpar" — aplicável a **vários itens de uma vez**.
- **Atalhos de teclado**: `Alt+↑` / `Alt+↓` sobem/descem a prioridade; `Alt+Backspace` limpa.
- **Formatos de exibição** configuráveis: número, **estrelas** (★★★☆☆) ou **mini-barra** (███░░).
- **Persistência no campo Extra** — o dado é gravado como `ReadingPriority: 85`, então
  **sincroniza pelo sync nativo** do Zotero e **não depende de banco externo**.
- **PT/EN** e **zero telemetria, zero rede**: nada sai do seu dispositivo.

## A parte técnica que quase nos pegou

O plano era um plugin "de fim de semana" para Zotero 7. Na prática, a máquina-alvo já era
**Zotero 9.0.4** (baseado no Firefox 140 ESR), e três armadilhas só apareceram rodando contra
a versão real:

1. **Instalação de dev mudou.** O Firefox 140 removeu o _sideload_ silencioso da pasta de
   extensões do perfil. O velho truque do "arquivo-ponteiro" e o `.xpi` solto **simplesmente
   não carregam** no Zotero 9. A saída foi o scaffold instalar o plugin como **add-on
   temporário** pela ponte de depuração — o único caminho que funciona.

2. **A API de coluna do template está quebrada no 9.** O `registerColumns` (plural,
   _deprecated_) lança exceção silenciosa; só o `registerColumn` (singular) registra a coluna.

3. **Ordenação numérica não é de graça.** A árvore de itens ordena a coluna pela _string_
   retornada. Um número cru ordena lexicograficamente — colocando **"100" antes de "20"**.
   A correção: o provedor de dados devolve uma **chave com zero à esquerda** (`020`, `100`)
   para o ordenamento, e a célula mostra o inteiro limpo. Resultado: ordem **3, 9, 20, 100**
   — e não o errado 100, 20, 3, 9.

Essas três descobertas valeram mais que o código em si: cada uma seria um bug silencioso de
lançamento.

## Benchmark (números honestos)

O que é **medível hoje**, no Zotero 9 real:

| Métrica                    | Valor                                                                     |
| -------------------------- | ------------------------------------------------------------------------- |
| Tamanho do `.xpi`          | **38 KB** (sem dependências de runtime)                                   |
| Testes automatizados       | **14/14 verdes**, rodando _dentro_ de um Zotero 9 real                    |
| Correção de ordenação      | numérica `[3, 9, 20, 100]` vs. lexical ingênua `[100, 20, 3, 9]`          |
| Custo de cálculo do plugin | **~1,8 ms** para gerar chave de ordenação + 3 formatos de **5.000 itens** |

Ou seja: o trabalho próprio do plugin é desprezível — o gargalo de uma biblioteca grande é o
I/O do próprio Zotero, não a coluna.

> **Ainda não medido (honestidade total):** o _benchmark de relevância_ da camada de
> auto-ranqueamento (abaixo) ainda não existe, porque essa camada não foi construída. A
> metodologia planejada: rotular ~100 itens, medir a **% de relevantes encontrados nos
> primeiros 20%** da lista ranqueada e comparar com a simples ordenação por data como
> _baseline_ — antes de afirmar qualquer valor.

## O que vem (roadmap)

O diferencial de longo prazo é **priorização automática local**: marcar alguns itens como
relevante / não relevante, treinar um classificador leve (TF-IDF + regressão logística ou
naive Bayes) **em memória, sem rede**, e ranquear o resto da biblioteca — pensado para
**triagem contínua** de biblioteca crescente, não para revisão sistemática de corpus fixo.
Tudo atrás de uma interface de _provider_, para que embeddings/LLM (opt-in) sejam só uma
alternativa plugável no futuro.

## Por que isso importa

Não é só mais um plugin: é o "simples" que faltava — uma coluna de prioridade ordenável,
que sincroniza, não te prende a um banco externo e não manda nada pra lugar nenhum. E a
fundação está pronta para a parte que ninguém oferece: ranqueamento automático que aprende
com o que **você** acha relevante.

_Sem telemetria. Sem rede. Seu dispositivo, seus dados._
