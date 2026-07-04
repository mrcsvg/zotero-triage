import "./_setup";
import { assert } from "chai";
import { chunk, scoreInBatches } from "../src/relevance/scoring";
import {
  type RelevanceProvider,
  type ScoreItemInput,
} from "../src/relevance/provider";

/**
 * M4: the batched scoring engine, exercised with a fake provider (no network,
 * no Zotero). Covers chunking, aggregation, partial-batch failure, cancellation,
 * and progress — the design's "provider with fakes" test surface.
 */
function items(...keys: string[]): ScoreItemInput[] {
  return keys.map((k) => ({ itemKey: k, title: "", abstract: "" }));
}

/** A fake provider that records the batches it was asked to score. */
function countingProvider() {
  const calls: string[][] = [];
  const provider: RelevanceProvider = {
    id: "fake",
    async scoreItems(batch) {
      calls.push(batch.map((b) => b.itemKey));
      if (batch[0]?.itemKey === "BOOM") throw new Error("batch failed");
      return batch.map((b) => ({
        itemKey: b.itemKey,
        score: 50,
        reason: "ok",
      }));
    },
  };
  return { provider, calls };
}

describe("scoreInBatches", function () {
  describe("chunk", function () {
    it("splits into fixed-size groups with a short final group", function () {
      assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    });

    it("handles empty input and oversized group sizes", function () {
      assert.deepEqual(chunk([], 2), []);
      assert.deepEqual(chunk([1], 5), [[1]]);
    });
  });

  it("scores every batch and aggregates all results", async function () {
    const { provider, calls } = countingProvider();
    const out = await scoreInBatches(
      items("a", "b", "c", "d", "e"),
      "P",
      provider,
      {
        batchSize: 2,
        concurrency: 1,
      },
    );
    assert.deepEqual(calls, [["a", "b"], ["c", "d"], ["e"]]);
    assert.equal(out.results.length, 5);
    assert.equal(out.failedBatches, 0);
    assert.isFalse(out.cancelled);
  });

  it("counts a failed batch and keeps the others' results", async function () {
    const { provider } = countingProvider();
    const out = await scoreInBatches(
      items("a", "b", "BOOM", "d"),
      "P",
      provider,
      { batchSize: 1, concurrency: 1 },
    );
    assert.equal(out.failedBatches, 1);
    assert.deepEqual(
      out.results.map((r) => r.itemKey),
      ["a", "b", "d"],
    );
  });

  it("stops launching batches once cancelled", async function () {
    const { provider, calls } = countingProvider();
    let done = 0;
    const out = await scoreInBatches(items("a", "b", "c"), "P", provider, {
      batchSize: 1,
      concurrency: 1,
      onProgress: (d) => {
        done = d;
      },
      isCancelled: () => done > 0, // cancel after the first batch completes
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(
      out.results.map((r) => r.itemKey),
      ["a"],
    );
    assert.isTrue(out.cancelled);
  });

  it("reports cumulative progress up to the total", async function () {
    const { provider } = countingProvider();
    const seen: Array<[number, number]> = [];
    await scoreInBatches(items("a", "b", "c"), "P", provider, {
      batchSize: 1,
      concurrency: 1,
      onProgress: (done, total) => seen.push([done, total]),
    });
    assert.deepEqual(seen, [
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("aggregates all results under concurrency > 1", async function () {
    const { provider } = countingProvider();
    const out = await scoreInBatches(
      items("a", "b", "c", "d", "e"),
      "P",
      provider,
      { batchSize: 1, concurrency: 3 },
    );
    assert.deepEqual(out.results.map((r) => r.itemKey).sort(), [
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
    assert.equal(out.failedBatches, 0);
  });
});
