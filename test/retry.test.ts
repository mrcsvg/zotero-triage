import "./_setup";
import { assert } from "chai";
import {
  computeBackoff,
  isRetryable,
  withRetry,
} from "../src/modules/ai/retry";
import { ProviderError } from "../src/modules/ai/http";

/**
 * Rate-limit/transient retry with exponential backoff.
 *
 * All pure/injectable — `withRetry` takes a fake `sleep` and `rng` so the delay
 * schedule is deterministic and no real time passes. Only retryable failures
 * (429/5xx/network, via ProviderError.retryable) are retried; a fatal 400/401 or
 * any non-ProviderError throws immediately.
 */
describe("retry", function () {
  describe("computeBackoff", function () {
    it("doubles from the base each attempt", function () {
      assert.equal(computeBackoff(0, 500, 8000), 500);
      assert.equal(computeBackoff(1, 500, 8000), 1000);
      assert.equal(computeBackoff(2, 500, 8000), 2000);
      assert.equal(computeBackoff(3, 500, 8000), 4000);
    });

    it("never exceeds the cap", function () {
      assert.equal(computeBackoff(4, 500, 8000), 8000);
      assert.equal(computeBackoff(10, 500, 8000), 8000);
    });
  });

  describe("isRetryable", function () {
    it("is true for rate-limit and transient statuses", function () {
      assert.isTrue(isRetryable(new ProviderError("x", 429)));
      assert.isTrue(isRetryable(new ProviderError("x", 503)));
      assert.isTrue(isRetryable(new ProviderError("x", 529)));
    });

    it("is true for a network failure (no status)", function () {
      assert.isTrue(isRetryable(new ProviderError("network")));
    });

    it("is false for fatal statuses and non-ProviderError", function () {
      assert.isFalse(isRetryable(new ProviderError("bad request", 400)));
      assert.isFalse(isRetryable(new ProviderError("bad key", 401)));
      assert.isFalse(isRetryable(new Error("plain")));
      assert.isFalse(isRetryable("nope"));
    });
  });

  describe("withRetry", function () {
    function fakeSleep() {
      const delays: number[] = [];
      return {
        delays,
        fn: async (ms: number) => {
          delays.push(ms);
        },
      };
    }

    it("returns immediately on success with no sleeps", async function () {
      const sleep = fakeSleep();
      let calls = 0;
      const out = await withRetry(
        async () => {
          calls++;
          return "ok";
        },
        { sleep: sleep.fn },
      );
      assert.equal(out, "ok");
      assert.equal(calls, 1);
      assert.equal(sleep.delays.length, 0);
    });

    it("retries retryable failures then succeeds", async function () {
      const sleep = fakeSleep();
      let calls = 0;
      const out = await withRetry(
        async () => {
          calls++;
          if (calls < 3) throw new ProviderError("rate limited", 429);
          return "done";
        },
        { sleep: sleep.fn, baseMs: 500, capMs: 8000, rng: () => 0 },
      );
      assert.equal(out, "done");
      assert.equal(calls, 3, "1 initial + 2 retries");
      // rng=0 → full-jitter delay = base/2: [250, 500]
      assert.deepEqual(sleep.delays, [250, 500]);
    });

    it("throws immediately on a fatal (non-retryable) error", async function () {
      const sleep = fakeSleep();
      let calls = 0;
      try {
        await withRetry(
          async () => {
            calls++;
            throw new ProviderError("bad key", 401);
          },
          { sleep: sleep.fn },
        );
        assert.fail("should have thrown");
      } catch (e) {
        assert.instanceOf(e, ProviderError);
      }
      assert.equal(calls, 1, "no retries on a fatal error");
      assert.equal(sleep.delays.length, 0);
    });

    it("gives up after the retry budget and rethrows the last error", async function () {
      const sleep = fakeSleep();
      let calls = 0;
      try {
        await withRetry(
          async () => {
            calls++;
            throw new ProviderError("still 429", 429);
          },
          { sleep: sleep.fn, retries: 2, rng: () => 0 },
        );
        assert.fail("should have thrown");
      } catch (e) {
        assert.instanceOf(e, ProviderError);
      }
      assert.equal(calls, 3, "1 initial + 2 retries");
      assert.equal(sleep.delays.length, 2);
    });
  });
});
