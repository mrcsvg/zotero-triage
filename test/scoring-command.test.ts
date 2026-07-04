import "./_setup";
import { assert } from "chai";
import { runScoring, type ScoringItem } from "../src/relevance/scoring-command";
import {
  type RelevanceProvider,
  type ScoreItemInput,
} from "../src/relevance/provider";
import { type ScoreRecord } from "../src/relevance/score-store";

/**
 * M4: the "Score this folder" orchestrator core, exercised with fakes (no
 * network, no Zotero, no clock). It ties together the pure pieces —
 * selectItemsToScore, estimateScoringCost, scoreInBatches — and the persistence
 * callback, deciding what actually gets spent and stored. The Zotero glue (menu
 * action, confirm dialog, progress window) wraps this and is verified in-app.
 */

const PRICING = { inputPer1M: 1, outputPer1M: 5 };

function item(
  itemKey: string,
  manual: number | null,
  record?: ScoreRecord,
): ScoringItem {
  return {
    itemKey,
    title: `T-${itemKey}`,
    abstract: `A-${itemKey}`,
    manual,
    record,
  };
}

function record(itemKey: string, stale: boolean): ScoreRecord {
  return {
    itemKey,
    collectionKey: "COLL",
    score: 50,
    reason: "old",
    model: "old-model",
    scoredAt: 1,
    stale,
  };
}

/** A fake provider that records the batches it saw and scores every item 42. */
function fakeProvider(opts: { failOn?: string } = {}) {
  const calls: string[][] = [];
  const provider: RelevanceProvider = {
    id: "fake",
    async scoreItems(batch: ScoreItemInput[]) {
      calls.push(batch.map((b) => b.itemKey));
      if (opts.failOn && batch.some((b) => b.itemKey === opts.failOn)) {
        throw new Error("batch failed");
      }
      return batch.map((b) => ({
        itemKey: b.itemKey,
        score: 42,
        reason: "ok",
      }));
    },
  };
  return { provider, calls };
}

/** A fake persist sink that captures what would be written. */
function fakePersist() {
  const saved: Array<{ collectionKey: string; records: ScoreRecord[] }> = [];
  return {
    saved,
    fn: async (collectionKey: string, records: ScoreRecord[]) => {
      saved.push({ collectionKey, records });
    },
  };
}

describe("runScoring", function () {
  it("returns 'empty' and spends nothing when no item needs scoring", async function () {
    const { provider, calls } = fakeProvider();
    const persist = fakePersist();
    let confirmed = false;

    const out = await runScoring(
      [item("A", 80), item("B", null, record("B", false))], // manual + fresh
      "prompt",
      "COLL",
      {
        provider,
        pricing: PRICING,
        model: "m",
        confirm: () => {
          confirmed = true;
          return true;
        },
        persist: persist.fn,
      },
    );

    assert.equal(out.status, "empty");
    assert.equal(out.selected, 0);
    assert.isFalse(confirmed, "confirm not shown");
    assert.equal(calls.length, 0, "provider not called");
    assert.equal(persist.saved.length, 0, "nothing persisted");
  });

  it("stops at pre-flight when the cost estimate is declined", async function () {
    const { provider, calls } = fakeProvider();
    const persist = fakePersist();

    const out = await runScoring([item("A", null)], "prompt", "COLL", {
      provider,
      pricing: PRICING,
      model: "m",
      confirm: () => false,
      persist: persist.fn,
    });

    assert.equal(out.status, "cancelled-preflight");
    assert.equal(out.selected, 1);
    assert.isDefined(out.estimate);
    assert.equal(calls.length, 0, "provider not called after decline");
    assert.equal(persist.saved.length, 0);
  });

  it("scores only unscored/stale non-manual items and persists stamped records", async function () {
    const { provider, calls } = fakeProvider();
    const persist = fakePersist();

    const out = await runScoring(
      [
        item("A", 80), // manual → skip
        item("B", null), // unscored → score
        item("C", null, record("C", false)), // fresh → skip
        item("D", null, record("D", true)), // stale → score
      ],
      "prompt",
      "COLL",
      {
        provider,
        pricing: PRICING,
        model: "gpt-x",
        confirm: () => true,
        persist: persist.fn,
        now: () => 12345,
      },
    );

    assert.equal(out.status, "completed");
    assert.equal(out.selected, 2);
    assert.equal(out.scored, 2);
    assert.equal(out.failedBatches, 0);
    assert.deepEqual(calls, [["B", "D"]], "only B and D sent, in order");

    assert.equal(persist.saved.length, 1);
    const { collectionKey, records } = persist.saved[0];
    assert.equal(collectionKey, "COLL");
    assert.deepEqual(records.map((r) => r.itemKey).sort(), ["B", "D"]);
    for (const r of records) {
      assert.equal(r.collectionKey, "COLL");
      assert.equal(r.model, "gpt-x");
      assert.equal(r.scoredAt, 12345);
      assert.isFalse(r.stale, "freshly scored records are not stale");
      assert.equal(r.score, 42);
      assert.equal(r.reason, "ok");
    }
  });

  it("tolerates a failed batch and still persists the successful ones", async function () {
    const { provider } = fakeProvider({ failOn: "B" });
    const persist = fakePersist();

    const out = await runScoring(
      [item("A", null), item("B", null), item("C", null)],
      "prompt",
      "COLL",
      {
        provider,
        pricing: PRICING,
        model: "m",
        confirm: () => true,
        persist: persist.fn,
        batchSize: 1,
        concurrency: 1,
      },
    );

    assert.equal(out.status, "completed");
    assert.equal(out.failedBatches, 1);
    assert.deepEqual(persist.saved[0].records.map((r) => r.itemKey).sort(), [
      "A",
      "C",
    ]);
  });

  it("reports 'cancelled' but still persists whatever came back", async function () {
    const { provider } = fakeProvider();
    const persist = fakePersist();
    let done = 0;

    const out = await runScoring(
      [item("A", null), item("B", null), item("C", null)],
      "prompt",
      "COLL",
      {
        provider,
        pricing: PRICING,
        model: "m",
        confirm: () => true,
        persist: persist.fn,
        batchSize: 1,
        concurrency: 1,
        onProgress: (d) => {
          done = d;
        },
        isCancelled: () => done > 0, // cancel after the first batch
      },
    );

    assert.equal(out.status, "cancelled");
    assert.equal(persist.saved.length, 1);
    assert.deepEqual(
      persist.saved[0].records.map((r) => r.itemKey),
      ["A"],
    );
  });

  it("does not persist when a cancel happens before any batch completed", async function () {
    const { provider } = fakeProvider();
    const persist = fakePersist();

    const out = await runScoring([item("A", null)], "prompt", "COLL", {
      provider,
      pricing: PRICING,
      model: "m",
      confirm: () => true,
      persist: persist.fn,
      isCancelled: () => true, // cancelled immediately
    });

    assert.equal(out.status, "cancelled");
    assert.equal(out.scored, 0);
    assert.equal(persist.saved.length, 0, "no empty write when nothing scored");
  });
});
