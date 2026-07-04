import "./_setup";
import { assert } from "chai";
import {
  scoreKey,
  parseScoreKey,
  needsScoring,
  serializeFolderScores,
  parseFolderScores,
  markAllStale,
  saveFolderScores,
  loadFolderScores,
  getScore,
  putScores,
  markFolderStale,
  deleteFolderScores,
  type ScoreRecord,
} from "../src/relevance/score-store";

const recA: ScoreRecord = {
  itemKey: "ITEMAAAA",
  collectionKey: "COLLZZZZ",
  score: 70,
  reason: "on topic",
  model: "gpt-x",
  scoredAt: 1_700_000_000_000,
  stale: false,
};
const recB: ScoreRecord = {
  itemKey: "ITEMBBBB",
  collectionKey: "COLLZZZZ",
  score: 20,
  reason: "tangential",
  model: "gpt-x",
  scoredAt: 1_700_000_000_001,
  stale: false,
};

/**
 * M3 foundation: the per-(item, folder) auto-score store.
 *
 * Scores persist as one JSON file per folder in the profile (via IOUtils). The
 * storage-agnostic core (key codec, freshness, folder-file serialize/parse) is
 * unit-tested here; the IOUtils-backed file layer runs under the Zotero harness.
 */
describe("score-store", function () {
  describe("pure core", function () {
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
      it("is true when the item has no record yet", function () {
        assert.isTrue(needsScoring(undefined));
      });

      it("is true when the record is stale", function () {
        assert.isTrue(needsScoring({ ...recA, stale: true }));
      });

      it("is false when a fresh record exists", function () {
        assert.isFalse(needsScoring(recA));
      });
    });

    describe("serializeFolderScores / parseFolderScores", function () {
      it("round-trips a set of records for a folder", function () {
        const raw = serializeFolderScores([recA, recB]);
        assert.deepEqual(parseFolderScores(raw, "COLLZZZZ"), {
          ITEMAAAA: recA,
          ITEMBBBB: recB,
        });
      });

      it("does not store itemKey/collectionKey inside each value", function () {
        const parsed = JSON.parse(serializeFolderScores([recA]));
        assert.deepEqual(Object.keys(parsed), ["ITEMAAAA"]);
        assert.notProperty(parsed.ITEMAAAA, "itemKey");
        assert.notProperty(parsed.ITEMAAAA, "collectionKey");
      });

      it("returns {} for missing, empty, or malformed content", function () {
        assert.deepEqual(parseFolderScores(undefined, "C"), {});
        assert.deepEqual(parseFolderScores("", "C"), {});
        assert.deepEqual(parseFolderScores("not json", "C"), {});
        assert.deepEqual(parseFolderScores("[1,2]", "C"), {});
      });

      it("drops entries with an out-of-range or non-numeric score", function () {
        const raw = JSON.stringify({
          ITEMAAAA: { score: 150, reason: "bad", model: "m", scoredAt: 1 },
          ITEMBBBB: { score: "x", reason: "bad", model: "m", scoredAt: 1 },
        });
        assert.deepEqual(parseFolderScores(raw, "COLLZZZZ"), {});
      });

      it("defaults missing metadata fields tolerantly", function () {
        const raw = JSON.stringify({ ITEMAAAA: { score: 55 } });
        assert.deepEqual(parseFolderScores(raw, "COLLZZZZ"), {
          ITEMAAAA: {
            itemKey: "ITEMAAAA",
            collectionKey: "COLLZZZZ",
            score: 55,
            reason: "",
            model: "",
            scoredAt: 0,
            stale: false,
          },
        });
      });
    });

    describe("markAllStale", function () {
      it("returns a new map with every record marked stale", function () {
        const input = { ITEMAAAA: recA, ITEMBBBB: recB };
        const out = markAllStale(input);
        assert.isTrue(out.ITEMAAAA.stale && out.ITEMBBBB.stale);
        assert.isFalse(input.ITEMAAAA.stale, "input must not be mutated");
      });
    });
  });

  describe("file layer (Zotero)", function () {
    afterEach(async function () {
      await deleteFolderScores("COLLZZZZ");
    });

    it("saves, reads back, and gets a single record", async function () {
      await saveFolderScores("COLLZZZZ", [recA, recB]);
      assert.deepEqual(await loadFolderScores("COLLZZZZ"), {
        ITEMAAAA: recA,
        ITEMBBBB: recB,
      });
      assert.deepEqual(await getScore("ITEMAAAA", "COLLZZZZ"), recA);
    });

    it("putScores merges into the existing folder file", async function () {
      await saveFolderScores("COLLZZZZ", [recA]);
      await putScores("COLLZZZZ", [recB]);
      const all = await loadFolderScores("COLLZZZZ");
      assert.deepEqual(Object.keys(all).sort(), ["ITEMAAAA", "ITEMBBBB"]);
    });

    it("markFolderStale flags every record, deleteFolderScores clears them", async function () {
      await saveFolderScores("COLLZZZZ", [recA, recB]);
      await markFolderStale("COLLZZZZ");
      const staled = await loadFolderScores("COLLZZZZ");
      assert.isTrue(staled.ITEMAAAA.stale && staled.ITEMBBBB.stale);
      await deleteFolderScores("COLLZZZZ");
      assert.deepEqual(await loadFolderScores("COLLZZZZ"), {});
    });
  });
});
