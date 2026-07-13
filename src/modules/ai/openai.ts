/**
 * OpenAI Chat Completions provider. Called only when the user invokes the
 * collection "Classify with AI…" action. The API key is passed in (read from
 * prefs by the caller) and never logged.
 */
import type { ClassifyPrompt } from "./prompt";
import { providerHttpError } from "./http";

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/** Send the prompt to OpenAI and return the raw model text. */
export async function classifyWithOpenAI(
  prompt: ClassifyPrompt,
  apiKey: string,
  model: string,
): Promise<string> {
  const body = JSON.stringify({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
  });

  const xhr = await Zotero.HTTP.request("POST", ENDPOINT, {
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body,
    responseType: "json",
    // Surface a readable error ourselves instead of letting Zotero throw.
    successCodes: false,
  });

  if (xhr.status < 200 || xhr.status >= 300) {
    throw providerHttpError("OpenAI", xhr);
  }

  const data = xhr.response as OpenAIResponse;
  return String(data?.choices?.[0]?.message?.content ?? "");
}
