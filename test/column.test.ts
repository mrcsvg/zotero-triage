import "./_setup";
import { assert } from "chai";
import { config } from "../package.json";
import { getReadingPriority } from "../src/modules/extra";

/**
 * Verifies the Reading Priority column on the running Zotero:
 *  1. it parses `ReadingPriority: <n>` out of the Extra field;
 *  2. it is actually registered with Zotero's ItemTreeManager;
 *  3. sorting by the column's cell data (what the item tree sorts on) yields
 *     NUMERIC order, not lexical — i.e. 100 sorts after 20.
 */
describe("Reading Priority column", function () {
  this.timeout(20000);
  const created: Zotero.Item[] = [];

  async function makeItem(title: string, priority?: number) {
    const item = new Zotero.Item("journalArticle");
    item.setField("title", title);
    if (priority !== undefined) {
      item.setField("extra", `ReadingPriority: ${priority}`);
    }
    await item.saveTx();
    created.push(item);
    return item;
  }

  // The plugin stashes the real (Zotero-namespaced) key on its addon instance.
  function findPriorityKey(): string | undefined {
    const data = (Zotero[config.addonInstance] as any)?.data;
    const key = data?.priorityColumnKey;
    return typeof key === "string" ? key : undefined;
  }

  after(async function () {
    for (const item of created) {
      try {
        await item.eraseTx();
      } catch (e) {
        /* ignore */
      }
    }
  });

  it("plugin instance is defined", function () {
    assert.isNotEmpty(Zotero[config.addonInstance]);
  });

  it("parses ReadingPriority from the Extra field", async function () {
    const a = await makeItem("parse-20", 20);
    const b = await makeItem("parse-100", 100);
    const none = await makeItem("parse-none");
    assert.equal(getReadingPriority(a), 20);
    assert.equal(getReadingPriority(b), 100);
    assert.isNull(getReadingPriority(none));
  });

  it("is registered as a custom column with Zotero", function () {
    const err = (Zotero[config.addonInstance] as any)?.data?.priorityColumnError;
    const key = findPriorityKey();
    assert.isString(key, `expected a registered dataKey; registration error: ${err ?? "none"}`);
    assert.isTrue((Zotero.ItemTreeManager as any).isCustomColumn(key));
  });

  it("sorts NUMERICALLY (100 after 20), not lexically", async function () {
    const items = [
      await makeItem("p3", 3),
      await makeItem("p20", 20),
      await makeItem("p100", 100),
      await makeItem("p9", 9),
    ];
    const key = findPriorityKey() as string;

    // getCustomCellData is exactly what the item tree reads to sort the column.
    const rows = items.map((it) => ({
      priority: getReadingPriority(it),
      cell: (Zotero.ItemTreeManager as any).getCustomCellData(it, key) as string,
    }));

    // The tree sorts the column by this string via a locale compare.
    const sorted = [...rows].sort((x, y) => x.cell.localeCompare(y.cell));
    assert.deepEqual(
      sorted.map((r) => r.priority),
      [3, 9, 20, 100],
      `column-data sort gave ${sorted.map((r) => r.priority)}`,
    );

    // Sanity: prove the naive un-padded approach WOULD be wrong — this is why
    // dataProvider returns a zero-padded sort key.
    const naive = [...rows].sort((x, y) =>
      String(x.priority).localeCompare(String(y.priority)),
    );
    assert.deepEqual(
      naive.map((r) => r.priority),
      [100, 20, 3, 9],
      "naive string sort should be wrong, justifying the padding",
    );
  });
});
