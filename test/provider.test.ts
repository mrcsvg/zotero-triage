import "./_setup";
import { assert } from "chai";
import { normalizeScoreResults } from "../src/relevance/provider";

/**
 * M3 foundation: the provider output guard.
 *
 * A `RelevanceProvider` returns model-generated JSON. `normalizeScoreResults`
 * is the pure gate between that untrusted JSON and the score store: it keeps
 * only well-formed results for items we actually asked about, and never
 * fabricates a score for a missing or out-of-range entry.
 */
describe("normalizeScoreResults", function () {
  const requested = ["ITEM0001", "ITEM0002", "ITEM0003"];

  it("keeps well-formed results for requested items", function () {
    const raw = [
      { itemKey: "ITEM0001", score: 90, reason: "core topic" },
      { itemKey: "ITEM0002", score: 10, reason: "off topic" },
    ];
    assert.deepEqual(normalizeScoreResults(raw, requested), [
      { itemKey: "ITEM0001", score: 90, reason: "core topic" },
      { itemKey: "ITEM0002", score: 10, reason: "off topic" },
    ]);
  });

  it("returns [] when the payload is not an array", function () {
    assert.deepEqual(normalizeScoreResults(null, requested), []);
    assert.deepEqual(
      normalizeScoreResults({ itemKey: "ITEM0001" }, requested),
      [],
    );
    assert.deepEqual(normalizeScoreResults("nope", requested), []);
  });

  it("drops entries for items that were not requested (never fabricate)", function () {
    const raw = [{ itemKey: "GHOST999", score: 80, reason: "hallucinated" }];
    assert.deepEqual(normalizeScoreResults(raw, requested), []);
  });

  it("drops entries with an out-of-range score", function () {
    const raw = [
      { itemKey: "ITEM0001", score: 101, reason: "too high" },
      { itemKey: "ITEM0002", score: -1, reason: "too low" },
    ];
    assert.deepEqual(normalizeScoreResults(raw, requested), []);
  });

  it("drops entries whose score is not a number", function () {
    const raw = [{ itemKey: "ITEM0001", score: "80", reason: "stringy" }];
    assert.deepEqual(normalizeScoreResults(raw, requested), []);
  });

  it("rounds an in-range fractional score to an integer", function () {
    const raw = [{ itemKey: "ITEM0001", score: 72.6, reason: "close" }];
    assert.deepEqual(normalizeScoreResults(raw, requested), [
      { itemKey: "ITEM0001", score: 73, reason: "close" },
    ]);
  });

  it("defaults a missing reason to an empty string", function () {
    const raw = [{ itemKey: "ITEM0001", score: 50 }];
    assert.deepEqual(normalizeScoreResults(raw, requested), [
      { itemKey: "ITEM0001", score: 50, reason: "" },
    ]);
  });

  it("keeps only the first result when an item is repeated", function () {
    const raw = [
      { itemKey: "ITEM0001", score: 40, reason: "first" },
      { itemKey: "ITEM0001", score: 90, reason: "second" },
    ];
    assert.deepEqual(normalizeScoreResults(raw, requested), [
      { itemKey: "ITEM0001", score: 40, reason: "first" },
    ]);
  });
});
