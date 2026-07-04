import "./_setup";
import { assert } from "chai";
import {
  selectItemsToScore,
  estimateScoringCost,
  type ScoreCandidate,
} from "../src/relevance/scoring";
import { type ScoreRecord } from "../src/relevance/score-store";

/**
 * M4 pre-flight cores for the "Score this folder" command.
 *
 * `selectItemsToScore` is the "collect" step: which items actually need an LLM
 * call (unscored or stale, and never manually prioritized — manual wins, no
 * tokens spent). `estimateScoringCost` is the cost guard shown before any
 * network call. Both are pure so the token/spend math and the skip rules are
 * unit-tested without a provider or Zotero.
 */
describe("scoring pre-flight", function () {
  const fresh: ScoreRecord = {
    itemKey: "X",
    collectionKey: "C",
    score: 50,
    reason: "",
    model: "m",
    scoredAt: 1,
    stale: false,
  };

  describe("selectItemsToScore", function () {
    it("skips items with a manual priority (manual wins, no tokens)", function () {
      const cands: ScoreCandidate[] = [
        { itemKey: "A", manual: 80, record: undefined },
        { itemKey: "B", manual: 0, record: undefined }, // 0 is a real manual value
      ];
      assert.deepEqual(selectItemsToScore(cands), []);
    });

    it("includes unscored and stale items, skips fresh ones", function () {
      const cands: ScoreCandidate[] = [
        { itemKey: "A", manual: null, record: undefined }, // unscored -> in
        { itemKey: "B", manual: null, record: { ...fresh, stale: true } }, // stale -> in
        { itemKey: "C", manual: null, record: fresh }, // fresh -> out
      ];
      assert.deepEqual(selectItemsToScore(cands), ["A", "B"]);
    });

    it("preserves input order", function () {
      const cands: ScoreCandidate[] = [
        { itemKey: "Z", manual: null, record: undefined },
        { itemKey: "Y", manual: null, record: undefined },
      ];
      assert.deepEqual(selectItemsToScore(cands), ["Z", "Y"]);
    });
  });

  describe("estimateScoringCost", function () {
    const pricing = { inputPer1M: 1.0, outputPer1M: 2.0 };
    const items = [
      { title: "AAAA", abstract: "BBBB" }, // "AAAA\nBBBB" = 9 chars -> 3 tokens
      { title: "CC", abstract: "DD" }, // "CC\nDD" = 5 chars -> 2 tokens
    ];

    it("estimates tokens and spend for a single batch", function () {
      // perItemInput=5, prompt "PROMPT"=6 chars->2 tok, batches=1,
      // promptInput=1*(200+2)=202, inputTokens=207, outputTokens=2*40=80
      const est = estimateScoringCost(items, "PROMPT", pricing);
      assert.equal(est.items, 2);
      assert.equal(est.batches, 1);
      assert.equal(est.inputTokens, 207);
      assert.equal(est.outputTokens, 80);
      // usd = 207/1e6*1 + 80/1e6*2 = 0.000367
      assert.closeTo(est.usd, 0.000367, 1e-9);
    });

    it("charges the prompt once per batch", function () {
      // batchSize=1 -> 2 batches -> promptInput=2*(200+2)=404 -> inputTokens=409
      const est = estimateScoringCost(items, "PROMPT", pricing, {
        batchSize: 1,
      });
      assert.equal(est.batches, 2);
      assert.equal(est.inputTokens, 409);
    });

    it("is all zeros for no items", function () {
      const est = estimateScoringCost([], "PROMPT", pricing);
      assert.deepEqual(
        {
          items: est.items,
          batches: est.batches,
          inputTokens: est.inputTokens,
          outputTokens: est.outputTokens,
          usd: est.usd,
        },
        { items: 0, batches: 0, inputTokens: 0, outputTokens: 0, usd: 0 },
      );
    });
  });
});
