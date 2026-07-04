import "./_setup";
import { assert } from "chai";
import { resolvePriority } from "../src/relevance/resolve";

/**
 * M3 foundation: the manual-wins decision the Priority column consumes.
 *
 * `resolvePriority` is deliberately pure — it takes the already-read manual
 * value (from Extra) and the already-looked-up auto score (from the score
 * store) and decides which one the column shows and how to label it. All I/O
 * stays at the call site; the decision stays unit-testable here.
 */
describe("resolvePriority (manual wins)", function () {
  it("returns the manual value when only manual is set", function () {
    assert.deepEqual(resolvePriority(80, null), {
      value: 80,
      source: "manual",
    });
  });

  it("manual wins even when an auto score also exists", function () {
    assert.deepEqual(resolvePriority(80, 42), {
      value: 80,
      source: "manual",
    });
  });

  it("falls back to the auto score when there is no manual value", function () {
    assert.deepEqual(resolvePriority(null, 42), {
      value: 42,
      source: "auto",
    });
  });

  it("reports 'none' when neither manual nor auto is set", function () {
    assert.deepEqual(resolvePriority(null, null), {
      value: null,
      source: "none",
    });
  });

  it("treats a manual priority of 0 as a real value, not 'unset'", function () {
    // 0 is a valid priority; it must win over an auto score and must not be
    // mistaken for null. This is the edge that a truthiness check would break.
    assert.deepEqual(resolvePriority(0, 42), {
      value: 0,
      source: "manual",
    });
  });
});
