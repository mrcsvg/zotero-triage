import { config } from "../../package.json";
import { getPref } from "../utils/prefs";
import { getString } from "../utils/locale";
import { clampPriority } from "./extra";

/** Column display format. */
export type ColumnFormat = "number" | "stars" | "bar";

const DEFAULTS = {
  format: "number" as ColumnFormat,
  step: 10,
  levelHigh: 80,
  levelMedium: 50,
  levelLow: 20,
};

export function getFormat(): ColumnFormat {
  const v = getPref("format");
  return v === "stars" || v === "bar" ? v : "number";
}

export function getStep(): number {
  const v = Number(getPref("step"));
  return Number.isFinite(v) && v > 0 ? Math.round(v) : DEFAULTS.step;
}

export function getLevel(which: "High" | "Medium" | "Low"): number {
  const v = Number(getPref(`level${which}` as keyof typeof DEFAULTS));
  return Number.isFinite(v) ? clampPriority(v) : DEFAULTS[`level${which}`];
}

/**
 * Render a priority as text for the chosen format.
 * Pure + format-explicit so it's unit-testable. Sort order is unaffected — the
 * column's dataProvider always returns the zero-padded numeric key.
 */
export function formatPriorityDisplay(
  priority: number | null,
  format: ColumnFormat,
): string {
  if (priority === null) return "";
  const p = clampPriority(priority);
  if (format === "stars") {
    const filled = Math.round((p / 100) * 5);
    return "★".repeat(filled) + "☆".repeat(5 - filled);
  }
  if (format === "bar") {
    const filled = Math.round((p / 100) * 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
  }
  return String(p);
}

export async function registerPrefPane(): Promise<void> {
  await Zotero.PreferencePanes.register({
    pluginID: config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title"),
    image: `chrome://${config.addonRef}/content/icons/favicon.png`,
  });
}
