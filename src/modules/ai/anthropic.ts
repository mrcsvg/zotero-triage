/**
 * Anthropic Messages API provider. Called only when the user invokes the
 * collection "Classify with AI…" action. The API key is passed in (read from
 * prefs by the caller) and never logged.
 */
import type { ClassifyPrompt } from "./prompt";
import { providerHttpError } from "./http";

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const MAX_TOKENS = 4096;

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
}

/** Send the prompt to Anthropic and return the raw model text. */
export async function classifyWithAnthropic(
  prompt: ClassifyPrompt,
  apiKey: string,
  model: string,
): Promise<string> {
  const body = JSON.stringify({
    model,
    max_tokens: MAX_TOKENS,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
  });

  const xhr = await Zotero.HTTP.request("POST", ENDPOINT, {
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body,
    responseType: "json",
    // Surface a readable error ourselves instead of letting Zotero throw.
    successCodes: false,
  });

  if (xhr.status < 200 || xhr.status >= 300) {
    throw providerHttpError("Anthropic", xhr);
  }

  const data = xhr.response as AnthropicResponse;
  return (data?.content ?? [])
    .filter((b) => b?.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}
