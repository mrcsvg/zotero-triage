import "./_setup";
import { assert } from "chai";
import { ScoreCache, shouldRefresh } from "../src/relevance/score-cache";
import { type ScoreRecord } from "../src/relevance/score-store";

/**
 * M4: the synchronous score cache the column reads.
 *
 * The item-tree `dataProvider`/`renderCell` are synchronous, but scores load
 * from disk asynchronously — so the current folder's scores are held in this
 * in-memory cache, (re)loaded when the open folder changes. The cache container
 * and the "should I reload?" decision are pure and tested here; the async
 * loader + tree repaint are Zotero-runtime and verified in-app.
 */

function rec(itemKey: string, score: number): ScoreRecord {
  return {
    itemKey,
    collectionKey: "C",
    score,
    reason: "r",
    model: "m",
    scoredAt: 0,
    stale: false,
  };
}

describe("ScoreCache", function () {
  it("starts empty with no folder", function () {
    const c = new ScoreCache();
    assert.isNull(c.collectionKey);
    assert.isUndefined(c.get("X"));
  });

  it("holds one folder's scores and looks them up by item key", function () {
    const c = new ScoreCache();
    c.setFolder("C", { A: rec("A", 90), B: rec("B", 10) });
    assert.equal(c.collectionKey, "C");
    assert.equal(c.get("A")?.score, 90);
    assert.equal(c.get("B")?.score, 10);
    assert.isUndefined(c.get("Z"));
  });

  it("replaces scores when a new folder is set", function () {
    const c = new ScoreCache();
    c.setFolder("C", { A: rec("A", 90) });
    c.setFolder("D", { E: rec("E", 5) });
    assert.equal(c.collectionKey, "D");
    assert.isUndefined(c.get("A"), "old folder's scores are gone");
    assert.equal(c.get("E")?.score, 5);
  });

  it("clears back to empty", function () {
    const c = new ScoreCache();
    c.setFolder("C", { A: rec("A", 90) });
    c.clear();
    assert.isNull(c.collectionKey);
    assert.isUndefined(c.get("A"));
  });
});

describe("shouldRefresh", function () {
  it("is false when there is no collection selected", function () {
    assert.isFalse(shouldRefresh("C", null, null));
    assert.isFalse(shouldRefresh(null, null, null));
  });

  it("is false when the cache already holds the current folder", function () {
    assert.isFalse(shouldRefresh("C", "C", null));
  });

  it("is false when a load for the current folder is already in flight", function () {
    assert.isFalse(shouldRefresh("C", "D", "D"));
  });

  it("is true when the current folder differs and no load is in flight", function () {
    assert.isTrue(shouldRefresh("C", "D", null));
    assert.isTrue(shouldRefresh(null, "C", null));
    assert.isTrue(shouldRefresh("C", "D", "E"));
  });
});
