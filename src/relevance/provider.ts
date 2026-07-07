/**
 * M3 foundation — the relevance provider contract and its output guard.
 *
 * A `RelevanceProvider` is the **only** place in the plugin that touches the
 * network: given a batch of items and a folder's relevance prompt, it asks an
 * LLM to score each item 0–100 and returns normalized results. Concrete
 * implementations (`OpenAIProvider`, `AnthropicProvider`) come later; this file
 * defines the contract and the pure validation gate every implementation must
 * run its raw model output through.
 *
 * Provider responses are model-generated and therefore untrusted:
 * `normalizeScoreResults` keeps only well-formed results for items we actually
 * asked about and never fabricates a score for a missing, unknown, or
 * out-of-range entry (design §"Scoring flow" — output validation).
 */

/** Minimal item payload sent to a provider (only title + abstract leave the device). */
export interface ScoreItemInput {
  itemKey: string;
  title: string;
  abstract: string;
}

/** A single normalized relevance result. Persistence metadata is added later. */
export interface ScoreResult {
  itemKey: string;
  /** Integer relevance 0–100. */
  score: number;
  /** Short justification, shown in the column tooltip. */
  reason: string;
}

/** The network-facing contract. One implementation per provider. */
export interface RelevanceProvider {
  /** Stable id, e.g. "openai" | "anthropic". */
  readonly id: string;
  /** Score a batch of items against a folder prompt. */
  scoreItems(
    items: ScoreItemInput[],
    folderPrompt: string,
  ): Promise<ScoreResult[]>;
}

/** HTTP statuses worth retrying: rate limit, transient, and gateway errors. */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);

/**
 * A failure from a provider call. Carries the HTTP status (absent for a
 * transport/network failure) and a `retryable` flag the retry layer reads:
 * rate-limit/transient statuses and network errors are worth retrying; a 400 or
 * 401 (bad request / bad key) is fatal and must not be.
 */
export class ProviderError extends Error {
  readonly status?: number;
  readonly retryable: boolean;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.retryable = status === undefined || RETRYABLE_STATUS.has(status);
  }
}

const MIN_SCORE = 0;
const MAX_SCORE = 100;

/**
 * Validate and normalize a provider's raw JSON into trustworthy results.
 *
 * @param raw The provider's parsed response (untrusted; any shape).
 * @param requestedItemKeys The keys we asked about; results for anything else
 *   are discarded so a hallucinated key can never enter the store.
 * @returns One result per accepted item, deduped (first wins), in input order.
 */
export function normalizeScoreResults(
  raw: unknown,
  requestedItemKeys: string[],
): ScoreResult[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(requestedItemKeys);
  const seen = new Set<string>();
  const out: ScoreResult[] = [];

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { itemKey, score, reason } = entry as Record<string, unknown>;

    if (typeof itemKey !== "string" || !allowed.has(itemKey)) continue;
    if (seen.has(itemKey)) continue;
    if (
      typeof score !== "number" ||
      !Number.isFinite(score) ||
      score < MIN_SCORE ||
      score > MAX_SCORE
    ) {
      continue;
    }

    seen.add(itemKey);
    out.push({
      itemKey,
      score: Math.round(score),
      reason: typeof reason === "string" ? reason : "",
    });
  }

  return out;
}
