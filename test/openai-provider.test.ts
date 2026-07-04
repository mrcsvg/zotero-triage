import "./_setup";
import { assert } from "chai";
import {
  buildOpenAIRequestBody,
  parseOpenAIContent,
} from "../src/relevance/openai-provider";
import { type ScoreItemInput } from "../src/relevance/provider";

/**
 * M4: the OpenAI provider's pure request/response mapping.
 *
 * The network call (`OpenAIProvider.scoreItems`) is a thin wrapper verified in
 * the app; the request-body construction and the response-content parsing are
 * pure and unit-tested here. Parsing is tolerant: any malformed response yields
 * an empty list, which the caller's normalizeScoreResults then treats as "no
 * scores" rather than fabricating anything.
 */
describe("openai-provider pure mapping", function () {
  const items: ScoreItemInput[] = [
    { itemKey: "ITEM0001", title: "Deep learning", abstract: "A survey." },
    { itemKey: "ITEM0002", title: "Causal forests", abstract: "CATE method." },
  ];

  describe("buildOpenAIRequestBody", function () {
    let body: ReturnType<typeof buildOpenAIRequestBody>;

    before(function () {
      body = buildOpenAIRequestBody(items, "papers about ML", "gpt-4o-mini");
    });

    it("sets the model, deterministic temperature, and JSON response format", function () {
      assert.equal(body.model, "gpt-4o-mini");
      assert.equal(body.temperature, 0);
      assert.deepEqual(body.response_format, { type: "json_object" });
    });

    it("uses a system message plus a single user message", function () {
      assert.equal(body.messages.length, 2);
      assert.equal(body.messages[0].role, "system");
      assert.equal(body.messages[1].role, "user");
    });

    it("includes the folder prompt and every item's key/title/abstract", function () {
      const user = body.messages[1].content;
      assert.include(user, "papers about ML");
      for (const it of items) {
        assert.include(user, it.itemKey);
        assert.include(user, it.title);
        assert.include(user, it.abstract);
      }
    });

    it("mentions json in the system message (required by json_object mode)", function () {
      assert.match(body.messages[0].content, /json/i);
    });
  });

  describe("parseOpenAIContent", function () {
    function resp(content: string) {
      return { choices: [{ message: { content } }] };
    }

    it("extracts the results array from a wrapping object", function () {
      const json = resp(
        JSON.stringify({
          results: [{ itemKey: "ITEM0001", score: 90, reason: "core" }],
        }),
      );
      assert.deepEqual(parseOpenAIContent(json), [
        { itemKey: "ITEM0001", score: 90, reason: "core" },
      ]);
    });

    it("accepts a bare array as content too", function () {
      const json = resp(JSON.stringify([{ itemKey: "ITEM0001", score: 5 }]));
      assert.deepEqual(parseOpenAIContent(json), [
        { itemKey: "ITEM0001", score: 5 },
      ]);
    });

    it("returns [] when choices are missing", function () {
      assert.deepEqual(parseOpenAIContent({}), []);
      assert.deepEqual(parseOpenAIContent({ choices: [] }), []);
    });

    it("returns [] when the content is not valid JSON", function () {
      assert.deepEqual(parseOpenAIContent(resp("not json")), []);
    });

    it("returns [] when results is present but not an array", function () {
      assert.deepEqual(
        parseOpenAIContent(resp(JSON.stringify({ results: "nope" }))),
        [],
      );
    });
  });
});
