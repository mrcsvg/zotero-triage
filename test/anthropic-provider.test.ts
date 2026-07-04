import "./_setup";
import { assert } from "chai";
import {
  buildAnthropicRequestBody,
  parseAnthropicContent,
} from "../src/relevance/anthropic-provider";
import { type ScoreItemInput } from "../src/relevance/provider";

/**
 * M4: the Anthropic provider's pure request/response mapping.
 *
 * As with the OpenAI provider, only the request-body construction and the
 * response-content parsing are pure and unit-tested here; the network call
 * (`AnthropicProvider.scoreItems`) is a thin `fetch` wrapper verified in the
 * app. Parsing is tolerant: any malformed response yields an empty list, which
 * the caller's normalizeScoreResults then treats as "no scores".
 *
 * The shape differs from OpenAI in three ways that matter: the system prompt is
 * a top-level `system` field (not a message), there is no `temperature` (current
 * Anthropic models reject it), and the response text lives in `content[].text`.
 */
describe("anthropic-provider pure mapping", function () {
  const items: ScoreItemInput[] = [
    { itemKey: "ITEM0001", title: "Deep learning", abstract: "A survey." },
    { itemKey: "ITEM0002", title: "Causal forests", abstract: "CATE method." },
  ];

  describe("buildAnthropicRequestBody", function () {
    let body: ReturnType<typeof buildAnthropicRequestBody>;

    before(function () {
      body = buildAnthropicRequestBody(
        items,
        "papers about ML",
        "claude-opus-4-8",
      );
    });

    it("sets the model and a max_tokens budget", function () {
      assert.equal(body.model, "claude-opus-4-8");
      assert.isNumber(body.max_tokens);
      assert.isAbove(body.max_tokens, 0);
    });

    it("does NOT set temperature (rejected by current Anthropic models)", function () {
      assert.notProperty(body, "temperature");
    });

    it("puts the scoring instructions in the top-level system field", function () {
      assert.isString(body.system);
      assert.match(body.system, /json/i);
    });

    it("uses a single user message (system is not a message)", function () {
      assert.equal(body.messages.length, 1);
      assert.equal(body.messages[0].role, "user");
    });

    it("includes the folder prompt and every item's key/title/abstract", function () {
      const user = body.messages[0].content;
      assert.include(user, "papers about ML");
      for (const it of items) {
        assert.include(user, it.itemKey);
        assert.include(user, it.title);
        assert.include(user, it.abstract);
      }
    });
  });

  describe("parseAnthropicContent", function () {
    function resp(text: string) {
      return { content: [{ type: "text", text }] };
    }

    it("extracts the results array from a wrapping object", function () {
      const json = resp(
        JSON.stringify({
          results: [{ itemKey: "ITEM0001", score: 90, reason: "core" }],
        }),
      );
      assert.deepEqual(parseAnthropicContent(json), [
        { itemKey: "ITEM0001", score: 90, reason: "core" },
      ]);
    });

    it("accepts a bare array as content too", function () {
      const json = resp(JSON.stringify([{ itemKey: "ITEM0001", score: 5 }]));
      assert.deepEqual(parseAnthropicContent(json), [
        { itemKey: "ITEM0001", score: 5 },
      ]);
    });

    it("skips non-text blocks and reads the first text block", function () {
      const json = {
        content: [
          { type: "thinking", thinking: "" },
          {
            type: "text",
            text: JSON.stringify([{ itemKey: "ITEM0001", score: 7 }]),
          },
        ],
      };
      assert.deepEqual(parseAnthropicContent(json), [
        { itemKey: "ITEM0001", score: 7 },
      ]);
    });

    it("returns [] when content is missing or has no text block", function () {
      assert.deepEqual(parseAnthropicContent({}), []);
      assert.deepEqual(parseAnthropicContent({ content: [] }), []);
      assert.deepEqual(
        parseAnthropicContent({ content: [{ type: "thinking" }] }),
        [],
      );
    });

    it("returns [] when the text is not valid JSON", function () {
      assert.deepEqual(parseAnthropicContent(resp("not json")), []);
    });

    it("returns [] when results is present but not an array", function () {
      assert.deepEqual(
        parseAnthropicContent(resp(JSON.stringify({ results: "nope" }))),
        [],
      );
    });
  });
});
