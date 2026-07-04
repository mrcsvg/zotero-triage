/**
 * M4 pre-flight — the pure cores of the "Score this folder" command.
 *
 * The command's expensive parts (network, file writes, progress UI) live in the
 * orchestrator; the two decisions that must be right *before* spending anything
 * live here and are pure:
 *
 * - `selectItemsToScore` — the "collect" step. Only unscored or stale items are
 *   sent to the LLM, and items with a manual priority are always skipped
 *   (manual wins — no tokens spent on them).
 * - `estimateScoringCost` — the cost guard shown to the user before any network
 *   call: an approximate token count and dollar figure for the batch.
 */

import { needsScoring, type ScoreRecord } from "./score-store";

/** One item considered for scoring, with its current manual value and record. */
export interface ScoreCandidate {
  itemKey: string;
  /** Manual priority from Extra, or null if unset. */
  manual: number | null;
  /** Existing auto-score for this (item, folder), if any. */
  record?: ScoreRecord;
}

/**
 * The item keys that still need an LLM score: unscored or stale, and never
 * manually prioritized. Input order is preserved.
 */
export function selectItemsToScore(candidates: ScoreCandidate[]): string[] {
  return candidates
    .filter((c) => c.manual === null && needsScoring(c.record))
    .map((c) => c.itemKey);
}

/** Minimal per-item text sent to the provider (only title + abstract leave). */
export interface CostItem {
  title: string;
  abstract: string;
}

/** Per-1M-token prices for the chosen model, in USD. */
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

export interface CostEstimateOptions {
  /** Items per provider call (the prompt is re-sent once per batch). */
  batchSize?: number;
  /** Rough output token budget per item ({itemKey, score, reason}). */
  outputTokensPerItem?: number;
  /** Fixed instruction/schema overhead added to each batch's prompt. */
  promptOverheadTokens?: number;
}

export interface CostEstimate {
  items: number;
  batches: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

const DEFAULTS: Required<CostEstimateOptions> = {
  batchSize: 15,
  outputTokensPerItem: 40,
  promptOverheadTokens: 200,
};

/** Rough token count: ~4 characters per token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Approximate the token usage and dollar cost of scoring `items` against a
 * folder prompt. Deliberately rough (chars/4, fixed per-item output budget) —
 * enough to warn the user before spending, not an exact billing figure.
 */
export function estimateScoringCost(
  items: CostItem[],
  folderPrompt: string,
  pricing: ModelPricing,
  options: CostEstimateOptions = {},
): CostEstimate {
  const { batchSize, outputTokensPerItem, promptOverheadTokens } = {
    ...DEFAULTS,
    ...options,
  };

  const n = items.length;
  const batches = Math.ceil(n / batchSize);

  const perItemInput = items.reduce(
    (sum, it) => sum + estimateTokens(`${it.title}\n${it.abstract}`),
    0,
  );
  const promptInput =
    batches * (promptOverheadTokens + estimateTokens(folderPrompt));
  const inputTokens = perItemInput + promptInput;
  const outputTokens = n * outputTokensPerItem;

  const usd =
    (inputTokens / 1_000_000) * pricing.inputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M;

  return { items: n, batches, inputTokens, outputTokens, usd };
}
