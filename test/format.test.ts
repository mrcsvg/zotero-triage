import "./_setup";
import { assert } from "chai";
import { formatPriorityDisplay } from "../src/modules/prefs";

describe("Priority display format", function () {
  it("number format shows the clamped integer (blank when unset)", function () {
    assert.equal(formatPriorityDisplay(0, "number"), "0");
    assert.equal(formatPriorityDisplay(100, "number"), "100");
    assert.equal(formatPriorityDisplay(150, "number"), "100");
    assert.equal(formatPriorityDisplay(null, "number"), "");
  });

  it("stars map 0..100 onto 0..5", function () {
    assert.equal(formatPriorityDisplay(0, "stars"), "☆☆☆☆☆");
    assert.equal(formatPriorityDisplay(100, "stars"), "★★★★★");
    assert.equal(formatPriorityDisplay(50, "stars"), "★★★☆☆");
    assert.equal(formatPriorityDisplay(null, "stars"), "");
  });

  it("bar maps 0..100 onto 0..10 blocks", function () {
    assert.equal(formatPriorityDisplay(0, "bar"), "░░░░░░░░░░");
    assert.equal(formatPriorityDisplay(100, "bar"), "██████████");
    assert.equal(formatPriorityDisplay(30, "bar"), "███░░░░░░░");
  });
});
