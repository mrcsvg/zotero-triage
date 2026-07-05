import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { getReadingPriority } from "./extra";
import { getFolderPrompt, setFolderPrompt } from "../relevance/folder-prompts";
import { getScoringConfig } from "../relevance/config";
import {
  loadFolderScores,
  markFolderStale,
  putScores,
} from "../relevance/score-store";
import { runScoring, type ScoringItem } from "../relevance/scoring-command";
import { refreshScoresForFolder } from "./column";

/**
 * The Zotero-facing "Score this folder" / "Set relevance prompt…" commands.
 *
 * This is the thin UI wrapper the design leaves to the app layer: it gathers a
 * collection's items, reads the folder prompt, builds the provider from prefs,
 * shows the cost-estimate confirm dialog and a progress window, then hands the
 * pure decision logic to {@link runScoring}. All of it is Zotero-runtime code and
 * is verified in a dev Zotero, not in the standalone unit tests.
 */

function notify(text: string, type: "success" | "fail" = "success") {
  new ztoolkit.ProgressWindow(config.addonName, { closeTime: 3000 })
    .createLine({ text, type })
    .show();
}

function selectedCollection(): Zotero.Collection | null {
  const pane = Zotero.getActiveZoteroPane();
  const coll = pane?.getSelectedCollection?.();
  return coll || null;
}

/** Build the scoring inputs for a collection: text + manual value + prior score. */
async function collectItems(
  collection: Zotero.Collection,
): Promise<ScoringItem[]> {
  const items = (
    collection.getChildItems(false, false) as Zotero.Item[]
  ).filter((it) => it.isRegularItem());
  const existing = await loadFolderScores(collection.key);
  return items.map((it) => ({
    itemKey: it.key,
    title: it.getField("title") || "",
    abstract: it.getField("abstractNote") || "",
    manual: getReadingPriority(it),
    record: existing[it.key],
  }));
}

/** Command: score the currently selected folder against its relevance prompt. */
export async function scoreSelectedFolder(): Promise<void> {
  const collection = selectedCollection();
  if (!collection) {
    notify(getString("relevance-no-collection"), "fail");
    return;
  }

  const prompt = getFolderPrompt(collection.key);
  if (!prompt) {
    notify(getString("relevance-no-prompt"), "fail");
    return;
  }

  const cfg = getScoringConfig();
  if (!cfg) {
    notify(getString("relevance-no-provider"), "fail");
    return;
  }

  const items = await collectItems(collection);
  const win = Zotero.getMainWindow();

  // Progress window, updated per batch. The toolkit ProgressWindow has no cancel
  // button, so cancellation is not wired yet (a re-run resumes unscored items
  // regardless — the engine supports isCancelled for a future cancel affordance).
  const pw = new ztoolkit.ProgressWindow(config.addonName, { closeTime: -1 });
  let started = false;

  const outcome = await runScoring(items, prompt, collection.key, {
    provider: cfg.provider,
    pricing: cfg.pricing,
    model: cfg.model,
    batchSize: cfg.batchSize,
    concurrency: cfg.concurrency,
    persist: putScores,
    confirm: (estimate) => {
      const ok = (Services.prompt as any).confirm(
        win,
        config.addonName,
        getString("relevance-confirm", {
          args: {
            items: estimate.items,
            batches: estimate.batches,
            tokens: estimate.inputTokens + estimate.outputTokens,
            usd: estimate.usd.toFixed(3),
          },
        }),
      );
      if (ok) {
        started = true;
        pw.createLine({
          text: getString("relevance-progress", {
            args: { done: 0, total: estimate.items },
          }),
          progress: 0,
        }).show();
      }
      return ok;
    },
    onProgress: (done, total) => {
      pw.changeLine({
        text: getString("relevance-progress", { args: { done, total } }),
        progress: total > 0 ? Math.round((done / total) * 100) : 100,
      });
    },
  });

  if (started) pw.startCloseTimer(1500);

  if (outcome.status === "empty") {
    notify(getString("relevance-nothing"));
    return;
  }
  if (outcome.status === "cancelled-preflight") {
    notify(getString("relevance-declined"));
    return;
  }

  // Persisted new scores for the open folder — reload the column cache and
  // repaint so they show immediately (auto values in italic with a tooltip).
  if (outcome.scored > 0) await refreshScoresForFolder(collection.key);

  notify(
    outcome.failedBatches > 0
      ? getString("relevance-done-failed", {
          args: {
            scored: outcome.scored,
            failed: outcome.failedBatches,
          },
        })
      : getString("relevance-done", { args: { scored: outcome.scored } }),
    outcome.failedBatches > 0 ? "fail" : "success",
  );
}

/** Command: set (or clear) the selected folder's relevance prompt. */
export function setSelectedFolderPrompt(): void {
  const collection = selectedCollection();
  if (!collection) {
    notify(getString("relevance-no-collection"), "fail");
    return;
  }
  const win = Zotero.getMainWindow();
  const input = { value: getFolderPrompt(collection.key) ?? "" };
  const ok = (Services.prompt as any).prompt(
    win,
    config.addonName,
    getString("relevance-prompt-text"),
    input,
    null,
    { value: false },
  );
  if (!ok) return;

  setFolderPrompt(collection.key, String(input.value));
  // Editing a prompt invalidates the folder's existing scores (design §
  // Invalidation): mark them stale so the next run re-scores only those.
  void markFolderStale(collection.key);
  notify(getString("relevance-prompt-saved"));
}
