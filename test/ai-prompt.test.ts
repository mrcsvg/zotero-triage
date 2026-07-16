import "./_setup";
import { assert } from "chai";
import {
  buildManualPrompt,
  buildMessages,
  parsePriorityResponse,
  type ItemContext,
} from "../src/modules/ai/prompt";

const items: ItemContext[] = [
  {
    key: "AAA",
    title: "Deep learning for triage",
    abstract: "A study.",
    creators: "Silva, Ana",
    year: "2021",
    itemType: "journalArticle",
  },
  {
    key: "BBB",
    title: "Unrelated cooking book",
    abstract: "",
    creators: "",
    year: "2010",
    itemType: "book",
  },
];

describe("AI classification helpers", function () {
  describe("prompt building", function () {
    it("includes the project context and every item key", function () {
      const { system, user } = buildMessages("my ML project", items);
      assert.include(system, "0 to 100");
      assert.include(user, "my ML project");
      assert.include(user, "AAA");
      assert.include(user, "BBB");
    });

    it("falls back to a placeholder when context is blank", function () {
      const { user } = buildMessages("   ", items);
      assert.include(user, "no additional context");
    });
  });

  describe("manual (offline) prompt", function () {
    it("is one self-contained block with the instruction, context, and keys", function () {
      const text = buildManualPrompt("my ML project", items);
      // Everything the automated system+user prompt carries, in one paste-able string.
      assert.include(text, "0 to 100");
      assert.include(text, "JSON array");
      assert.include(text, "my ML project");
      assert.include(text, "AAA");
      assert.include(text, "BBB");
    });

    it("produces a reply the parser round-trips back to priorities", function () {
      // A plausible model reply to the manual prompt parses via the same helper.
      const reply = '[{"key":"AAA","priority":88},{"key":"BBB","priority":12}]';
      const map = parsePriorityResponse(reply, ["AAA", "BBB"]);
      assert.equal(map.get("AAA"), 88);
      assert.equal(map.get("BBB"), 12);
    });
  });

  describe("response parsing", function () {
    it("parses a clean JSON array", function () {
      const map = parsePriorityResponse(
        '[{"key":"AAA","priority":90},{"key":"BBB","priority":5}]',
      );
      assert.equal(map.get("AAA"), 90);
      assert.equal(map.get("BBB"), 5);
    });

    it("tolerates prose and code fences around the JSON", function () {
      const text =
        'Sure! Here are the priorities:\n```json\n[{"key":"AAA","priority":80}]\n```\nHope that helps.';
      const map = parsePriorityResponse(text);
      assert.equal(map.get("AAA"), 80);
    });

    it("clamps out-of-range and rounds fractional priorities", function () {
      const map = parsePriorityResponse(
        '[{"key":"AAA","priority":150},{"key":"BBB","priority":49.6}]',
      );
      assert.equal(map.get("AAA"), 100);
      assert.equal(map.get("BBB"), 50);
    });

    it("coerces numeric strings", function () {
      const map = parsePriorityResponse('[{"key":"AAA","priority":"42"}]');
      assert.equal(map.get("AAA"), 42);
    });

    it("ignores keys outside the allowed set", function () {
      const map = parsePriorityResponse(
        '[{"key":"AAA","priority":70},{"key":"ZZZ","priority":70}]',
        ["AAA", "BBB"],
      );
      assert.equal(map.get("AAA"), 70);
      assert.isFalse(map.has("ZZZ"));
    });

    it("skips malformed entries and non-numeric priorities", function () {
      const map = parsePriorityResponse(
        '[{"key":"AAA","priority":"abc"},{"priority":50},null,{"key":"BBB","priority":30}]',
      );
      assert.isFalse(map.has("AAA"));
      assert.equal(map.get("BBB"), 30);
      assert.equal(map.size, 1);
    });

    it("returns an empty map when there is no JSON array", function () {
      assert.equal(
        parsePriorityResponse("I could not classify these.").size,
        0,
      );
      assert.equal(parsePriorityResponse("").size, 0);
    });
  });
});
