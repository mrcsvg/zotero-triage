/**
 * M4 — the Anthropic relevance provider.
 *
 * Implements {@link RelevanceProvider} against Anthropic's Messages API
 * (`POST /v1/messages`). As with the OpenAI provider, the two pure pieces —
 * building the request body and pulling the results array out of the response —
 * are unit-tested; the network call (`scoreItems`) is a thin wrapper around
 * `fetch` verified in the app.
 *
 * All model output is funneled through `normalizeScoreResults`, so a
 * hallucinated key, an out-of-range score, or malformed JSON can never enter the
 * store — the worst case is "no score for that item".
 *
 * Three shape differences from the OpenAI provider matter here: the system
 * prompt is a top-level `system` field (not a message); there is NO
 * `temperature` (current Anthropic models — Opus 4.8 etc. — reject it with a
 * 400); and the response text lives in `content[].text` rather than
 * `choices[0].message.content`.
 */

import {
  normalizeScoreResults,
  ProviderError,
  type RelevanceProvider,
  type ScoreItemInput,
  type ScoreResult,
} from "./provider";

const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
/** Enough headroom for a JSON object scoring a full batch (title + reason per item). */
const MAX_TOKENS = 2048;

const SYSTEM_PROMPT =
  "You rank how relevant each academic item is to a user's reading goal. " +
  "Score every item from 0 (irrelevant) to 100 (essential) as an integer, " +
  "with a short reason. Respond ONLY with a JSON object of the form " +
  '{"results": [{"itemKey": string, "score": number, "reason": string}]}, ' +
  "one entry per item, using the exact itemKey given. No prose, no code fences.";

interface AnthropicMessage {
  role: "user";
  content: string;
}

export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  system: string;
  messages: AnthropicMessage[];
}

/** Build the Messages API request body for one batch of items. */
export function buildAnthropicRequestBody(
  items: ScoreItemInput[],
  folderPrompt: string,
  model: string,
): AnthropicRequestBody {
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
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: user }],
  };
}

/**
 * Pull the results array out of a Messages API response, tolerating any
 * malformed shape. The model's answer is a JSON string in the first `text`
 * content block; we accept either `{results: [...]}` or a bare array, and return
 * `[]` on anything unexpected.
 */
export function parseAnthropicContent(json: unknown): unknown[] {
  const content = (json as any)?.content;
  if (!Array.isArray(content)) return [];
  const textBlock = content.find(
    (b: any) => b?.type === "text" && typeof b?.text === "string",
  );
  if (!textBlock) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
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

export interface AnthropicProviderConfig {
  apiKey: string;
  model?: string;
  endpoint?: string;
}

export class AnthropicProvider implements RelevanceProvider {
  readonly id = "anthropic";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint: string;

  constructor(config: AnthropicProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
  }

  async scoreItems(
    items: ScoreItemInput[],
    folderPrompt: string,
  ): Promise<ScoreResult[]> {
    if (items.length === 0) return [];
    const body = buildAnthropicRequestBody(items, folderPrompt, this.model);

    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      // Transport/network failure — no status, retryable.
      throw new ProviderError(`Anthropic request failed: ${e}`);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new ProviderError(
        `Anthropic request failed (${res.status}): ${detail}`,
        res.status,
      );
    }

    const json = await res.json();
    const raw = parseAnthropicContent(json);
    return normalizeScoreResults(
      raw,
      items.map((it) => it.itemKey),
    );
  }
}
