/**
 * M4 — the OpenAI relevance provider.
 *
 * Implements {@link RelevanceProvider} against OpenAI's Chat Completions API in
 * `json_object` mode. The two pure pieces — building the request body and
 * pulling the results array out of the response — are unit-tested; the network
 * call (`scoreItems`) is a thin wrapper around `fetch` verified in the app.
 *
 * All model output is funneled through `normalizeScoreResults`, so a
 * hallucinated key, an out-of-range score, or malformed JSON can never enter the
 * store — the worst case is "no score for that item".
 */

import {
  normalizeScoreResults,
  type RelevanceProvider,
  type ScoreItemInput,
  type ScoreResult,
} from "./provider";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";

const SYSTEM_PROMPT =
  "You rank how relevant each academic item is to a user's reading goal. " +
  "Score every item from 0 (irrelevant) to 100 (essential) as an integer, " +
  "with a short reason. Respond ONLY with a JSON object of the form " +
  '{"results": [{"itemKey": string, "score": number, "reason": string}]}, ' +
  "one entry per item, using the exact itemKey given.";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface OpenAIRequestBody {
  model: string;
  messages: ChatMessage[];
  response_format: { type: "json_object" };
  temperature: number;
}

/** Build the Chat Completions request body for one batch of items. */
export function buildOpenAIRequestBody(
  items: ScoreItemInput[],
  folderPrompt: string,
  model: string,
): OpenAIRequestBody {
  const itemLines = items
    .map(
      (it) =>
        `- itemKey: ${it.itemKey}\n  title: ${it.title}\n  abstract: ${it.abstract}`,
    )
    .join("\n");
  const user =
    `Reading goal for this folder:\n${folderPrompt}\n\n` +
    `Score these ${items.length} item(s):\n${itemLines}`;

  return {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  };
}

/**
 * Pull the results array out of a Chat Completions response, tolerating any
 * malformed shape. The model returns a JSON string in `choices[0].message
 * .content`; we accept either `{results: [...]}` or a bare array, and return
 * `[]` on anything unexpected.
 */
export function parseOpenAIContent(json: unknown): unknown[] {
  const content = (json as any)?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) return parsed;
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as Record<string, unknown>).results)
  ) {
    return (parsed as { results: unknown[] }).results;
  }
  return [];
}

export interface OpenAIProviderConfig {
  apiKey: string;
  model?: string;
  endpoint?: string;
}

export class OpenAIProvider implements RelevanceProvider {
  readonly id = "openai";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint: string;

  constructor(config: OpenAIProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
  }

  async scoreItems(
    items: ScoreItemInput[],
    folderPrompt: string,
  ): Promise<ScoreResult[]> {
    if (items.length === 0) return [];
    const body = buildOpenAIRequestBody(items, folderPrompt, this.model);

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI request failed (${res.status}): ${detail}`);
    }

    const json = await res.json();
    const raw = parseOpenAIContent(json);
    return normalizeScoreResults(
      raw,
      items.map((it) => it.itemKey),
    );
  }
}
