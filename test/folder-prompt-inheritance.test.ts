import "./_setup";
import { assert } from "chai";
import { resolveInheritedPrompt } from "../src/relevance/folder-prompts";

/**
 * M5: opt-in prompt inheritance for nested folders.
 *
 * resolveInheritedPrompt walks up the folder tree to the nearest non-empty
 * prompt. Pure — lookups (promptOf, parentOf) are injected, so no Zotero. The
 * Zotero wrapper (build parentOf from collection parents, gated on the
 * inheritPrompts pref) is verified in-app.
 */
describe("resolveInheritedPrompt", function () {
  // Tree: A -> B -> C (C is the root; parentOf returns the parent key or null).
  const parent: Record<string, string | null> = { A: "B", B: "C", C: null };
  const parentOf = (k: string) => parent[k] ?? null;
  const promptOfFrom =
    (m: Record<string, string>) =>
    (k: string): string | undefined =>
      m[k];

  it("returns the folder's own prompt, ignoring ancestors", function () {
    const r = resolveInheritedPrompt(
      "A",
      promptOfFrom({ A: "own", C: "root" }),
      parentOf,
    );
    assert.deepEqual(r, { prompt: "own", sourceKey: "A" });
  });

  it("inherits the nearest ancestor's prompt when the folder has none", function () {
    const r = resolveInheritedPrompt(
      "A",
      promptOfFrom({ B: "from-b", C: "from-c" }),
      parentOf,
    );
    assert.deepEqual(r, { prompt: "from-b", sourceKey: "B" });
  });

  it("walks multiple levels to the first prompt found", function () {
    const r = resolveInheritedPrompt(
      "A",
      promptOfFrom({ C: "root" }),
      parentOf,
    );
    assert.deepEqual(r, { prompt: "root", sourceKey: "C" });
  });

  it("returns null when no folder in the chain has a prompt", function () {
    assert.isNull(resolveInheritedPrompt("A", promptOfFrom({}), parentOf));
  });

  it("treats a blank/whitespace prompt as unset and keeps walking", function () {
    const r = resolveInheritedPrompt(
      "A",
      promptOfFrom({ A: "   ", B: "real" }),
      parentOf,
    );
    assert.deepEqual(r, { prompt: "real", sourceKey: "B" });
  });

  it("terminates on a cycle without a prompt", function () {
    const cyclic = (k: string) => (k === "X" ? "Y" : "X"); // X<->Y
    assert.isNull(resolveInheritedPrompt("X", promptOfFrom({}), cyclic));
  });
});
