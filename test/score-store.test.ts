import "./_setup";
import { assert } from "chai";
import {
  scoreKey,
  parseScoreKey,
  needsScoring,
  type ScoreRecord,
} from "../src/relevance/score-store";

/**
 * M3 foundation: the per-(item, folder) auto-score store.
 *
 * The async persistence layer is deferred until the storage mechanism is
 * settled; this covers the storage-agnostic core: the composite key codec and
 * the "which items still need scoring" rule (unscored or stale).
 */
describe("score-store: pure core", function () {
  describe("scoreKey / parseScoreKey", function () {
    it("composes a composite key from item and collection keys", function () {
      assert.equal(scoreKey("ITEM1234", "COLLABCD"), "ITEM1234::COLLABCD");
    });

    it("round-trips a composite key back to its parts", function () {
      assert.deepEqual(parseScoreKey("ITEM1234::COLLABCD"), {
        itemKey: "ITEM1234",
        collectionKey: "COLLABCD",
      });
    });

    it("parse is the inverse of compose", function () {
      const parts = { itemKey: "AAAABBBB", collectionKey: "CCCCDDDD" };
      assert.deepEqual(
        parseScoreKey(scoreKey(parts.itemKey, parts.collectionKey)),
        parts,
      );
    });
  });

  describe("needsScoring", function () {
    const base: ScoreRecord = {
      itemKey: "ITEM1234",
      collectionKey: "COLLABCD",
      score: 70,
      reason: "on topic",
      model: "gpt-x",
      scoredAt: 1_700_000_000_000,
      stale: false,
    };

    it("is true when the item has no record yet", function () {
      assert.isTrue(needsScoring(undefined));
    });

    it("is true when the record is stale", function () {
      assert.isTrue(needsScoring({ ...base, stale: true }));
    });

    it("is false when a fresh record exists", function () {
      assert.isFalse(needsScoring(base));
    });
  });
});
