/**
 * M4 — the "Score this folder" orchestrator.
 *
 * This is the pure core that ties the M4 pieces together:
 *
 *   collect (selectItemsToScore) → estimate (estimateScoringCost) → confirm →
 *   batches (scoreInBatches) → persist (putScores).
 *
 * Everything Zotero- or network-specific is **injected** ({@link ScoringDeps}):
 * the provider, the persistence sink, the confirm dialog, the clock, progress
 * and cancel callbacks. That keeps the decision logic — what gets spent, what
 * gets stored, and what the outcome is — unit-testable without Zotero. The thin
 * menu-command wrapper (gather items from a collection, read the folder prompt,
 * build the provider from prefs, show a real dialog + progress window) lives in
 * the UI layer and calls {@link runScoring}.
 *
 * Design invariants honored here: manual priority is never spent on (collect
 * skips it), nothing runs before the user confirms the cost, and whatever the
 * provider returns is persisted even on partial failure or cancellation, so a
 * re-run resumes only the still-unscored items.
 */

import { type RelevanceProvider, type ScoreItemInput } from "./provider";
import { type ScoreRecord } from "./score-store";
import {
  estimateScoringCost,
  scoreInBatches,
  selectItemsToScore,
  type CostEstimate,
  type ModelPricing,
  type ScoreCandidate,
} from "./scoring";

/** A folder item as seen by the command: its text plus its current state. */
export interface ScoringItem extends ScoreCandidate {
  title: string;
  abstract: string;
}

export interface ScoringDeps {
  /** The network-facing provider (OpenAI/Anthropic), already configured. */
  provider: RelevanceProvider;
  /** Per-1M-token prices for the chosen model, for the cost estimate. */
  pricing: ModelPricing;
  /** Model id stamped onto each persisted score record. */
  model: string;
  /** Shown the cost estimate before any network call; return true to proceed. */
  confirm: (estimate: CostEstimate) => boolean | Promise<boolean>;
  /** Persist finished records for the folder (e.g. score-store `putScores`). */
  persist: (collectionKey: string, records: ScoreRecord[]) => Promise<void>;
  /** Clock for `scoredAt` (injectable for tests). Defaults to `Date.now`. */
  now?: () => number;
  /** Items per provider call. Default 15. */
  batchSize?: number;
  /** Max provider calls in flight. Default 3. */
  concurrency?: number;
  /** Per-batch progress (cumulative attempted count, total). */
  onProgress?: (done: number, total: number) => void;
  /** Polled before each batch; true stops launching more. */
  isCancelled?: () => boolean;
}

export type ScoringStatus =
  | "empty" // nothing needed scoring — no cost, no dialog
  | "cancelled-preflight" // user declined the cost estimate
  | "completed" // ran to completion (possibly with failed batches)
  | "cancelled"; // cancelled mid-run; partial results were persisted

export interface ScoringOutcome {
  status: ScoringStatus;
  /** How many items were selected for scoring (unscored/stale, non-manual). */
  selected: number;
  /** How many score records were persisted. */
  scored: number;
  /** How many provider batches threw (their items stay unscored). */
  failedBatches: number;
  /** The cost estimate shown to the user (absent only when nothing was selected). */
  estimate?: CostEstimate;
}

/**
 * Run the "Score this folder" flow over `items` for one collection. Pure aside
 * from the injected dependencies; returns a structured outcome the UI can
 * report. See the module doc for the flow and invariants.
 */
export async function runScoring(
  items: ScoringItem[],
  folderPrompt: string,
  collectionKey: string,
  deps: ScoringDeps,
): Promise<ScoringOutcome> {
  const keys = selectItemsToScore(items);
  if (keys.length === 0) {
    return { status: "empty", selected: 0, scored: 0, failedBatches: 0 };
  }

  const byKey = new Map(items.map((it) => [it.itemKey, it]));
  const selected = keys.map((k) => byKey.get(k)!);

  const estimate = estimateScoringCost(
    selected.map((it) => ({ title: it.title, abstract: it.abstract })),
    folderPrompt,
    deps.pricing,
    { batchSize: deps.batchSize },
  );

  const proceed = await deps.confirm(estimate);
  if (!proceed) {
    return {
      status: "cancelled-preflight",
      selected: keys.length,
      scored: 0,
      failedBatches: 0,
      estimate,
    };
  }

  const inputs: ScoreItemInput[] = selected.map((it) => ({
    itemKey: it.itemKey,
    title: it.title,
    abstract: it.abstract,
  }));

  const outcome = await scoreInBatches(inputs, folderPrompt, deps.provider, {
    batchSize: deps.batchSize,
    concurrency: deps.concurrency,
    onProgress: deps.onProgress,
    isCancelled: deps.isCancelled,
  });

  const now = deps.now ?? Date.now;
  const scoredAt = now();
  const records: ScoreRecord[] = outcome.results.map((r) => ({
    itemKey: r.itemKey,
    collectionKey,
    score: r.score,
    reason: r.reason,
    model: deps.model,
    scoredAt,
    stale: false,
  }));

  if (records.length > 0) {
    await deps.persist(collectionKey, records);
  }

  return {
    status: outcome.cancelled ? "cancelled" : "completed",
    selected: keys.length,
    scored: records.length,
    failedBatches: outcome.failedBatches,
    estimate,
  };
}
