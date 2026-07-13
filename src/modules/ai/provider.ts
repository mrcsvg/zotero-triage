/**
 * Provider selection for AI classification. Reads the configured provider,
 * API key, and optional model override from prefs and returns a thin
 * `ClassifyProvider`. Anthropic and OpenAI ship now; the interface leaves the
 * seam for Vertex/Google (service-account OAuth) later.
 */
import { getPref } from "../../utils/prefs";
import type { ClassifyPrompt } from "./prompt";
import { classifyWithAnthropic, DEFAULT_ANTHROPIC_MODEL } from "./anthropic";
import { classifyWithOpenAI, DEFAULT_OPENAI_MODEL } from "./openai";

export type ProviderId = "anthropic" | "openai";

export interface ClassifyProvider {
  readonly id: ProviderId;
  /** Send one prompt, resolve to the raw model text (ideally a JSON array). */
  classify(prompt: ClassifyPrompt): Promise<string>;
}

/** Thrown when no API key is configured — the caller shows a friendly message. */
export class MissingApiKeyError extends Error {
  constructor() {
    super("No API key configured");
    this.name = "MissingApiKeyError";
  }
}

export function getProviderId(): ProviderId {
  return getPref("aiProvider") === "openai" ? "openai" : "anthropic";
}

/** Build the configured provider, or throw MissingApiKeyError if no key is set. */
export function getProvider(): ClassifyProvider {
  const id = getProviderId();
  const apiKey = String(getPref("aiApiKey") ?? "").trim();
  if (!apiKey) throw new MissingApiKeyError();
  const model = String(getPref("aiModel") ?? "").trim();

  if (id === "openai") {
    return {
      id,
      classify: (p) =>
        classifyWithOpenAI(p, apiKey, model || DEFAULT_OPENAI_MODEL),
    };
  }
  return {
    id,
    classify: (p) =>
      classifyWithAnthropic(p, apiKey, model || DEFAULT_ANTHROPIC_MODEL),
  };
}
