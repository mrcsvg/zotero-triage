import "./_setup";
import { assert } from "chai";
import { resolveInheritedContext } from "../src/modules/collectionContext";

/**
 * Opt-in project-context inheritance for nested collections.
 *
 * resolveInheritedContext walks up the collection tree to the nearest non-blank
 * context. Pure — lookups (contextOf, parentOf) are injected, so no Zotero. The
 * Zotero wrapper (getEffectiveContext: build parentOf from collection parents,
 * gated on the inheritContexts pref) is verified in-app.
 */
describe("resolveInheritedContext", function () {
  // Tree: A -> B -> C (C is the root; parentOf returns the parent key or null).
  const parent: Record<string, string | null> = { A: "B", B: "C", C: null };
  const parentOf = (k: string) => parent[k] ?? null;
  const contextOfFrom =
    (m: Record<string, string>) =>
    (k: string): string =>
      m[k] ?? "";

  it("returns the collection's own context, ignoring ancestors", function () {
    const r = resolveInheritedContext(
      "A",
      contextOfFrom({ A: "own", C: "root" }),
      parentOf,
    );
    assert.deepEqual(r, { context: "own", sourceKey: "A" });
  });

  it("inherits the nearest ancestor's context when the collection has none", function () {
    const r = resolveInheritedContext(
      "A",
      contextOfFrom({ B: "from-b", C: "from-c" }),
      parentOf,
    );
    assert.deepEqual(r, { context: "from-b", sourceKey: "B" });
  });

  it("walks multiple levels to the first context found", function () {
    const r = resolveInheritedContext(
      "A",
      contextOfFrom({ C: "root" }),
      parentOf,
    );
    assert.deepEqual(r, { context: "root", sourceKey: "C" });
  });

  it("returns null when no collection in the chain has a context", function () {
    assert.isNull(resolveInheritedContext("A", contextOfFrom({}), parentOf));
  });

  it("treats a blank/whitespace context as unset and keeps walking", function () {
    const r = resolveInheritedContext(
      "A",
      contextOfFrom({ A: "   ", B: "real" }),
      parentOf,
    );
    assert.deepEqual(r, { context: "real", sourceKey: "B" });
  });

  it("terminates on a cycle without a context", function () {
    const cyclic = (k: string) => (k === "X" ? "Y" : "X"); // X<->Y
    assert.isNull(resolveInheritedContext("X", contextOfFrom({}), cyclic));
  });
});
