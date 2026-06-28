import "./_setup";
import { assert } from "chai";
import {
  getReadingPriority,
  setReadingPriority,
  setReadingPriorityForItems,
  bumpReadingPriorityForItems,
  clampPriority,
} from "../src/modules/extra";

/** Exercises the M1 write-path (set / clear / clamp / multi-select / bump). */
describe("Reading Priority write-path", function () {
  this.timeout(20000);
  const created: Zotero.Item[] = [];

  async function makeItem(title: string, extra?: string) {
    const item = new Zotero.Item("journalArticle");
    item.setField("title", title);
    if (extra) item.setField("extra", extra);
    await item.saveTx();
    created.push(item);
    return item;
  }

  after(async function () {
    for (const it of created) {
      try {
        await it.eraseTx();
      } catch (e) {
        /* ignore */
      }
    }
  });

  it("clampPriority clamps to 0..100 and rounds", function () {
    assert.equal(clampPriority(-5), 0);
    assert.equal(clampPriority(150), 100);
    assert.equal(clampPriority(49.6), 50);
  });

  it("sets and reads back a priority", async function () {
    const it = await makeItem("set-1");
    await setReadingPriority(it, 80);
    assert.equal(getReadingPriority(it), 80);
  });

  it("clamps out-of-range writes", async function () {
    const it = await makeItem("clamp-1");
    await setReadingPriority(it, 250);
    assert.equal(getReadingPriority(it), 100);
  });

  it("clears the priority and preserves other Extra lines", async function () {
    const it = await makeItem(
      "clear-1",
      "DOI: 10.1/x\nReadingPriority: 42\ntldr: hello",
    );
    assert.equal(getReadingPriority(it), 42);
    await setReadingPriority(it, null);
    assert.isNull(getReadingPriority(it));
    const extra = it.getField("extra");
    assert.include(extra, "DOI: 10.1/x");
    assert.include(extra, "tldr: hello");
    assert.notInclude(extra, "ReadingPriority");
  });

  it("applies the same value to many items at once", async function () {
    const items = [
      await makeItem("m1"),
      await makeItem("m2"),
      await makeItem("m3"),
    ];
    await setReadingPriorityForItems(items, 30);
    assert.deepEqual(
      items.map((it) => getReadingPriority(it)),
      [30, 30, 30],
    );
  });

  it("bumps by delta, clamped, treating unset as 0", async function () {
    const a = await makeItem("b1"); // unset
    const b = await makeItem("b2", "ReadingPriority: 95");
    await bumpReadingPriorityForItems([a, b], 10);
    assert.equal(getReadingPriority(a), 10); // 0 -> 10
    assert.equal(getReadingPriority(b), 100); // 95 -> clamp 100
    await bumpReadingPriorityForItems([a], -25);
    assert.equal(getReadingPriority(a), 0); // 10 -> clamp 0
  });
});
