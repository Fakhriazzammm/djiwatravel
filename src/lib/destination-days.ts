/**
 * Pure rules for the destination page's trip-length slider: which packages cover N days, which
 * duration tier is the closest fit, and where the slider stops. Kept free of React so the
 * behavior is pinned by tests rather than checked by eye.
 */

import type { ViewPackage } from "./package-view";

export const MIN_DAYS = 1;
export const SLIDER_MAX_DAYS = 60;
const MARKS = [1, 7, 14, 30, 60] as const;

export type QuotaFilter = "all" | "total" | "daily";

/** "Harian" = a per-day allowance (name carries /Day) rather than one total quota. */
export function isDailyQuota(pkg: Pick<ViewPackage, "name">): boolean {
  return /\/\s*day|per\s*day|harian|daily/i.test(pkg.name);
}

export function matchesQuota(pkg: Pick<ViewPackage, "name">, quota: QuotaFilter): boolean {
  return quota === "all" || (quota === "daily") === isDailyQuota(pkg);
}

/** Longest validity among the packages, rounded up to the slider's range (never below a week). */
export function sliderMaxDays(packages: readonly Pick<ViewPackage, "durationDays">[]): number {
  const longest = packages.reduce((max, pkg) => Math.max(max, pkg.durationDays || 0), 0);
  return Math.min(SLIDER_MAX_DAYS, Math.max(7, longest));
}

/** Quick-jump marks that fit the slider, always ending on the slider's maximum. */
export function sliderMarks(max: number): number[] {
  const marks = MARKS.filter((mark) => mark < max);
  return [...marks, max];
}

export function clampDays(days: number, max: number): number {
  if (!Number.isFinite(days)) return MIN_DAYS;
  return Math.min(max, Math.max(MIN_DAYS, Math.round(days)));
}

export type DayMatch<T> = {
  /** Validity of the closest tier that covers the chosen days, or null when nothing covers it. */
  tier: number | null;
  /** Packages in that tier, cheapest first. */
  fit: T[];
  /** Packages with a longer validity, shortest then cheapest first. */
  longer: T[];
};

export function matchPackagesForDays<T extends Pick<ViewPackage, "durationDays" | "priceIdr">>(
  packages: readonly T[],
  days: number,
): DayMatch<T> {
  const covering = packages.filter((pkg) => pkg.durationDays >= days);
  if (covering.length === 0) return { tier: null, fit: [], longer: [] };
  const tier = Math.min(...covering.map((pkg) => pkg.durationDays));
  const byPrice = (a: T, b: T) => a.priceIdr - b.priceIdr;
  return {
    tier,
    fit: covering.filter((pkg) => pkg.durationDays === tier).sort(byPrice),
    longer: covering
      .filter((pkg) => pkg.durationDays > tier)
      .sort((a, b) => a.durationDays - b.durationDays || byPrice(a, b)),
  };
}

/** Rupiah per day the customer actually uses (chosen days), not per day of validity. */
export function pricePerChosenDay(pkg: Pick<ViewPackage, "priceIdr">, days: number): number {
  return pkg.priceIdr / Math.max(1, days);
}

/** Starting point: the Terlaris package's validity when known, otherwise a week; always in range. */
export function initialDays(sellerDays: number | undefined, max: number): number {
  return clampDays(sellerDays ?? 7, max);
}
