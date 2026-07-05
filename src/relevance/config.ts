/**
 * M4 — relevance provider configuration.
 *
 * Turns the plugin's stored preferences (provider, API key, model, batch tuning)
 * into a ready-to-use {@link RelevanceProvider} plus the model pricing the cost
 * estimate needs. The provider/key/model live in local `Zotero.Prefs` only —
 * never in Extra, never synced (design §"Data model & persistence").
 *
 * The mapping is split so the decision logic stays pure and testable:
 * `resolveModel`, `makeProvider`, and `pricingFor` take plain arguments and are
 * unit-tested; only `getScoringConfig` reads `Zotero.Prefs` and so is verified
 * in-app.
 */

import { getPref } from "../utils/prefs";
import { AnthropicProvider } from "./anthropic-provider";
import { OpenAIProvider } from "./openai-provider";
import { type RelevanceProvider } from "./provider";
import { type ModelPricing } from "./scoring";

export type ProviderName = "none" | "openai" | "anthropic";

/** The default model for each provider when the user hasn't overridden it. */
export const DEFAULT_MODELS: Record<Exclude<ProviderName, "none">, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-opus-4-8",
};

/** Per-1M-token USD pricing for models we know. */
const PRICING: Record<string, ModelPricing> = {
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
  "claude-opus-4-8": { inputPer1M: 5, outputPer1M: 25 },
  "claude-sonnet-5": { inputPer1M: 3, outputPer1M: 15 },
  "claude-haiku-4-5": { inputPer1M: 1, outputPer1M: 5 },
};

/** Used when a model isn't in the table — a deliberately non-trivial estimate. */
const DEFAULT_PRICING: ModelPricing = { inputPer1M: 1, outputPer1M: 5 };

/** The resolved model: the user's override, or the provider's default. */
export function resolveModel(
  provider: Exclude<ProviderName, "none">,
  model: string,
): string {
  const trimmed = model.trim();
  return trimmed === "" ? DEFAULT_MODELS[provider] : trimmed;
}

/**
 * Build a provider from a name + key + resolved model, or null when scoring is
 * off (`none`) or no key is configured. The only place providers are
 * instantiated.
 */
export function makeProvider(
  provider: ProviderName,
  apiKey: string,
  model: string,
): RelevanceProvider | null {
  const key = apiKey.trim();
  if (provider === "none" || key === "") return null;
  if (provider === "openai") return new OpenAIProvider({ apiKey: key, model });
  if (provider === "anthropic")
    return new AnthropicProvider({ apiKey: key, model });
  return null;
}

/** Per-1M pricing for a model, falling back to a positive default. */
export function pricingFor(model: string): ModelPricing {
  return PRICING[model] ?? DEFAULT_PRICING;
}

/** Everything the "Score this folder" command needs, resolved from prefs. */
export interface ScoringConfig {
  provider: RelevanceProvider;
  model: string;
  pricing: ModelPricing;
  batchSize: number;
  concurrency: number;
}

function positiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

/**
 * Resolve the active scoring configuration from `Zotero.Prefs`, or null when no
 * provider is configured (fully local — the "Score this folder" command should
 * explain that a provider must be set). Reads prefs; verified in-app.
 */
export function getScoringConfig(): ScoringConfig | null {
  const provider = (getPref("provider") as ProviderName) ?? "none";
  if (provider === "none") return null;

  const model = resolveModel(provider, String(getPref("model") ?? ""));
  const instance = makeProvider(
    provider,
    String(getPref("apiKey") ?? ""),
    model,
  );
  if (!instance) return null;

  return {
    provider: instance,
    model,
    pricing: pricingFor(model),
    batchSize: positiveInt(getPref("batchSize"), 15),
    concurrency: positiveInt(getPref("concurrency"), 3),
  };
}
