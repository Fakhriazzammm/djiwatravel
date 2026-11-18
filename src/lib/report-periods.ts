/**
 * Reporting windows offered by the admin finance screen.
 *
 * The options and the server's accepted range used to be duplicated literals, so the UI could offer a
 * window the server would reject (or hide one it supports). Both sides now read these constants.
 */

export const REPORT_PERIODS = [
  { days: 30, label: "30 hari" },
  { days: 90, label: "90 hari" },
  { days: 365, label: "1 tahun" },
] as const;

/**
 * Presets the Travel book can serve: its report takes "the last N days ending today", so only
 * windows that end today are offered (yesterday or last month need the book to accept a date range).
 */
export function reportPeriodOptions(now: Date = new Date()): { days: number; label: string }[] {
  const keys = [
    "hari-ini",
    "7h",
    "minggu-ini",
    "bulan-ini",
    "30h",
    "90h",
    "tahun-ini",
    "365h",
  ] as const;
  const seen = new Set<number>();
  const options: { days: number; label: string }[] = [];
  for (const key of keys) {
    const days = Math.min(MAX_REPORT_DAYS, resolveRange({ range: key }, "30h", now).days);
    if (seen.has(days)) continue;
    seen.add(days);
    options.push({ days, label: RANGE_LABEL[key] });
  }
  return options;
}

import { RANGE_LABEL, resolveRange } from "./date-range";

export const MIN_REPORT_DAYS = 1;
export const MAX_REPORT_DAYS = 366;

export const DEFAULT_REPORT_DAYS = 30;

/** Label for an arbitrary window, so a deep link outside the presets still reads clearly. */
export function reportPeriodLabel(days: number): string {
  const preset = REPORT_PERIODS.find((option) => option.days === days);
  if (preset) return preset.label;
  if (days === 1) return "1 hari";
  return `${days} hari`;
}
