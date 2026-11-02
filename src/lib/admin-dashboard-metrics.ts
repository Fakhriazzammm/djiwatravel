/**
 * Pure derived metrics for the admin dashboard. Kept free of React and database imports so the
 * arithmetic (deltas, shares, scaling) is unit-tested and shared by the dashboard and analytics.
 */

/** Percent change from `previous` to `current`; null when there is no baseline to compare. */
export function percentChange(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || !Number.isFinite(previous) || previous <= 0) {
    return null;
  }
  if (!Number.isFinite(current)) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Share of `part` in `whole` as a whole percent (0-100); null when `whole` is empty. */
export function sharePercent(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

/** Average order value in the same currency unit as `grossIdr`; null when no paid orders. */
export function averageOrderValue(grossIdr: number | null, paidCount: number): number | null {
  if (grossIdr === null || !Number.isFinite(grossIdr) || paidCount <= 0) return null;
  return Math.round(grossIdr / paidCount);
}

/** Bar height as a percent of the tallest value, with a minimum so non-zero values stay visible. */
export function barPercent(value: number, max: number, minPercent = 4): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max(minPercent, (value / max) * 100));
}

/** Signed label such as "+12%" / "−4%"; null when the delta is unavailable. */
export function formatDelta(delta: number | null): string | null {
  if (delta === null) return null;
  if (delta === 0) return "0%";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta)}%`;
}
