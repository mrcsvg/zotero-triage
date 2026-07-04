import "./_setup";
import { assert } from "chai";
import {
  parseFolderPrompts,
  serializeFolderPrompts,
  setPromptInMap,
  getPromptFromMap,
  getFolderPrompt,
  setFolderPrompt,
  clearFolderPrompt,
  hasFolderPrompt,
} from "../src/relevance/folder-prompts";

/**
 * M3 foundation: per-folder relevance prompts (collectionKey -> text).
 *
 * The prompt map is persisted as a single JSON blob in Zotero.Prefs. The parse/
 * serialize/CRUD core is pure and tolerant of garbage, so it is unit-tested in
 * isolation; the thin Prefs-backed wrapper is exercised under the Zotero harness.
 */
describe("folder-prompts", function () {
  describe("pure map core", function () {
    describe("parseFolderPrompts (tolerant)", function () {
      it("returns {} for undefined, empty, or the default blob", function () {
        assert.deepEqual(parseFolderPrompts(undefined), {});
        assert.deepEqual(parseFolderPrompts(""), {});
        assert.deepEqual(parseFolderPrompts("{}"), {});
      });

      it("parses a valid collectionKey -> prompt object", function () {
        assert.deepEqual(parseFolderPrompts('{"ABC":"read ML papers"}'), {
          ABC: "read ML papers",
        });
      });

      it("returns {} for invalid JSON instead of throwing", function () {
        assert.deepEqual(parseFolderPrompts("not json"), {});
      });

      it("returns {} when the JSON is not a plain object", function () {
        assert.deepEqual(parseFolderPrompts("[1,2,3]"), {});
        assert.deepEqual(parseFolderPrompts("42"), {});
      });

      it("drops entries whose value is not a string", function () {
        assert.deepEqual(parseFolderPrompts('{"A":"ok","B":5,"C":null}'), {
          A: "ok",
        });
      });
    });

    describe("setPromptInMap (immutable)", function () {
      it("adds a new prompt without mutating the input", function () {
        const before = {};
        const after = setPromptInMap(before, "A", "read ML");
        assert.deepEqual(after, { A: "read ML" });
        assert.deepEqual(before, {}, "input map must not be mutated");
      });

      it("overwrites an existing prompt", function () {
        assert.deepEqual(setPromptInMap({ A: "old" }, "A", "new"), {
          A: "new",
        });
      });

      it("trims surrounding whitespace from the stored prompt", function () {
        assert.deepEqual(setPromptInMap({}, "A", "  hi  "), { A: "hi" });
      });

      it("removes the key when the prompt is empty or whitespace-only", function () {
        assert.deepEqual(setPromptInMap({ A: "x", B: "y" }, "A", "   "), {
          B: "y",
        });
        assert.deepEqual(setPromptInMap({ A: "x" }, "A", ""), {});
      });
    });

    describe("getPromptFromMap", function () {
      it("returns the prompt when present, undefined when absent", function () {
        assert.equal(getPromptFromMap({ A: "hi" }, "A"), "hi");
        assert.isUndefined(getPromptFromMap({ A: "hi" }, "Z"));
      });
    });

    describe("round-trip", function () {
      it("parse(serialize(map)) preserves the map", function () {
        const map = { A: "read ML", B: "skip surveys" };
        assert.deepEqual(parseFolderPrompts(serializeFolderPrompts(map)), map);
      });
    });
  });

  /**
   * Prefs-backed CRUD. Runs only under the Zotero harness (needs Zotero.Prefs).
   */
  describe("Prefs-backed CRUD", function () {
    afterEach(function () {
      clearFolderPrompt("COLL-A");
      clearFolderPrompt("COLL-B");
    });

    it("sets, reads back, reports presence, and clears a folder prompt", function () {
      assert.isFalse(hasFolderPrompt("COLL-A"));
      setFolderPrompt("COLL-A", "papers about causal inference");
      assert.equal(getFolderPrompt("COLL-A"), "papers about causal inference");
      assert.isTrue(hasFolderPrompt("COLL-A"));
      clearFolderPrompt("COLL-A");
      assert.isUndefined(getFolderPrompt("COLL-A"));
      assert.isFalse(hasFolderPrompt("COLL-A"));
    });

    it("keeps prompts for other folders independent", function () {
      setFolderPrompt("COLL-A", "prompt A");
      setFolderPrompt("COLL-B", "prompt B");
      assert.equal(getFolderPrompt("COLL-A"), "prompt A");
      assert.equal(getFolderPrompt("COLL-B"), "prompt B");
      clearFolderPrompt("COLL-A");
      assert.isUndefined(getFolderPrompt("COLL-A"));
      assert.equal(getFolderPrompt("COLL-B"), "prompt B");
    });
  });
});
