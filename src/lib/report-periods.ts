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
