/**
 * Retry with exponential backoff for transient provider failures.
 *
 * A collection classification is sent in batches; without retry a single
 * rate-limit (HTTP 429) or transient 5xx drops a whole batch. `withRetry` wraps
 * a call so those failures are retried with exponentially growing, jittered
 * delays, while fatal errors (400 bad request, 401 bad key) fail fast.
 * Retryability is decided by {@link ProviderError.retryable}, set when the
 * provider throws (see `./http.ts`).
 *
 * Pure and injectable: `sleep` and `rng` are parameters, so the delay schedule
 * is deterministic under test and no real time passes.
 */
import { ProviderError } from "./http";

export interface RetryOptions {
  /** Extra attempts after the first. Default 3 (so up to 4 tries total). */
  retries?: number;
  /** First backoff, doubled each retry. Default 500ms. */
  baseMs?: number;
  /** Upper bound on any single backoff. Default 8000ms. */
  capMs?: number;
  /** Injectable delay (tests pass a fake). Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable [0,1) source for jitter. Defaults to Math.random. */
  rng?: () => number;
}

/** Exponential backoff for a 0-based retry index, capped. Pure. */
export function computeBackoff(
  attempt: number,
  baseMs: number,
  capMs: number,
): number {
  return Math.min(capMs, baseMs * 2 ** attempt);
}

/** Whether an error is worth retrying (a retryable {@link ProviderError}). */
export function isRetryable(err: unknown): boolean {
  return err instanceof ProviderError && err.retryable;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying retryable failures with capped exponential backoff and
 * full jitter (delay uniform in [backoff/2, backoff]). Fatal errors and a
 * spent retry budget rethrow the last error.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = Math.max(0, options.retries ?? 3);
  const baseMs = options.baseMs ?? 500;
  const capMs = options.capMs ?? 8000;
  const sleep = options.sleep ?? defaultSleep;
  const rng = options.rng ?? Math.random;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) throw err;
      const backoff = computeBackoff(attempt, baseMs, capMs);
      // Full jitter: a random point in [backoff/2, backoff] spreads out
      // concurrent batches that were rate-limited together.
      await sleep(backoff / 2 + rng() * (backoff / 2));
      attempt++;
    }
  }
}
