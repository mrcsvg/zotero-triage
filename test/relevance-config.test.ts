import "./_setup";
import { assert } from "chai";
import {
  makeProvider,
  pricingFor,
  resolveModel,
  DEFAULT_MODELS,
} from "../src/relevance/config";

/**
 * M4: the pure provider-factory + pricing core.
 *
 * `getScoringConfig` (the prefs-backed wrapper) reads Zotero.Prefs and is
 * verified in-app; the mapping it depends on — turning a provider name + key +
 * model into a concrete provider, resolving the default model, and looking up
 * per-model pricing — is pure and unit-tested here.
 */
describe("relevance config core", function () {
  describe("resolveModel", function () {
    it("uses the explicit model when given", function () {
      assert.equal(resolveModel("openai", "gpt-4o"), "gpt-4o");
      assert.equal(
        resolveModel("anthropic", "claude-haiku-4-5"),
        "claude-haiku-4-5",
      );
    });

    it("falls back to the provider default when empty", function () {
      assert.equal(resolveModel("openai", ""), DEFAULT_MODELS.openai);
      assert.equal(resolveModel("anthropic", "   "), DEFAULT_MODELS.anthropic);
    });
  });

  describe("makeProvider", function () {
    it("returns null for provider 'none'", function () {
      assert.isNull(makeProvider("none", "sk-whatever", "m"));
    });

    it("returns null when the API key is blank", function () {
      assert.isNull(makeProvider("openai", "", "gpt-4o-mini"));
      assert.isNull(makeProvider("anthropic", "   ", "claude-opus-4-8"));
    });

    it("builds an OpenAI provider with a key", function () {
      const p = makeProvider("openai", "sk-x", "gpt-4o-mini");
      assert.isNotNull(p);
      assert.equal(p!.id, "openai");
    });

    it("builds an Anthropic provider with a key", function () {
      const p = makeProvider("anthropic", "sk-x", "claude-opus-4-8");
      assert.isNotNull(p);
      assert.equal(p!.id, "anthropic");
    });
  });

  describe("pricingFor", function () {
    it("returns known per-1M pricing for listed models", function () {
      const mini = pricingFor("gpt-4o-mini");
      assert.isAbove(mini.inputPer1M, 0);
      assert.isAbove(mini.outputPer1M, 0);
      const opus = pricingFor("claude-opus-4-8");
      assert.equal(opus.inputPer1M, 5);
      assert.equal(opus.outputPer1M, 25);
    });

    it("falls back to a positive default for unknown models", function () {
      const p = pricingFor("some-unknown-model");
      assert.isAbove(p.inputPer1M, 0);
      assert.isAbove(p.outputPer1M, 0);
    });
  });
});
