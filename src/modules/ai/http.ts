/**
 * Shared HTTP helpers for the AI providers. All provider network calls go
 * through `Zotero.HTTP.request` (the only sanctioned HTTP path in a Zotero
 * plugin) — see the individual provider modules.
 */

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

/** Build a readable ProviderError from a failed response, without leaking the key. */
export function providerHttpError(
  provider: string,
  xhr: XMLHttpRequest,
): ProviderError {
  let detail = "";
  try {
    const r = xhr.response as
      { error?: { message?: string; type?: string } } | string | undefined;
    if (r && typeof r === "object") {
      detail = r.error?.message || r.error?.type || "";
    } else if (typeof r === "string") {
      detail = r;
    }
  } catch {
    detail = "";
  }
  const snippet = String(detail).slice(0, 300);
  return new ProviderError(
    `${provider} request failed (HTTP ${xhr.status})${
      snippet ? `: ${snippet}` : ""
    }`,
    xhr.status,
  );
}
