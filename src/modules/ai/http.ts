/**
 * Shared HTTP helpers for the AI providers. All provider network calls go
 * through `Zotero.HTTP.request` (the only sanctioned HTTP path in a Zotero
 * plugin) — see the individual provider modules.
 */

/** Build a readable Error from a failed provider response, without leaking the key. */
export function providerHttpError(
  provider: string,
  xhr: XMLHttpRequest,
): Error {
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
  return new Error(
    `${provider} request failed (HTTP ${xhr.status})${
      snippet ? `: ${snippet}` : ""
    }`,
  );
}
