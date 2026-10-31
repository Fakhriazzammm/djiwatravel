import { packageDisplayedGb } from "./package-copy";
import type { ViewPackage } from "./package-view";

/** Rupiah per displayed GB; infinite when the size is unknown or unlimited. */
export function pricePerGb(pkg: ViewPackage): number {
  const gb = packageDisplayedGb(pkg.volumeBytes);
  if (!Number.isFinite(gb) || gb <= 0) return Number.POSITIVE_INFINITY;
  return pkg.priceIdr / gb;
}

export type DurationBucket = { id: string; label: string; packages: ViewPackage[] };

const BUCKETS = [
  { id: "short", label: "1–7 hari", max: 7 },
  { id: "medium", label: "8–15 hari", max: 15 },
  { id: "long", label: "16+ hari", max: Number.POSITIVE_INFINITY },
] as const;

/** Groups packages by trip length; empty groups are dropped and each group is sorted by price. */
export function durationBuckets(packages: readonly ViewPackage[]): DurationBucket[] {
  return BUCKETS.flatMap((bucket, index) => {
    const min = index === 0 ? 0 : BUCKETS[index - 1]!.max;
    const list = packages
      .filter((pkg) => pkg.durationDays > min && pkg.durationDays <= bucket.max)
      .sort((a, b) => a.priceIdr - b.priceIdr || b.volumeBytes - a.volumeBytes);
    return list.length ? [{ id: bucket.id, label: bucket.label, packages: list }] : [];
  });
}

/** The best-value sellable package of a bucket (lowest Rp/GB, then cheapest), if any. */
export function bestValuePackage(packages: readonly ViewPackage[]): ViewPackage | undefined {
  const sellable = packages.filter((pkg) => pkg.sellable);
  return [...sellable].sort((a, b) => pricePerGb(a) - pricePerGb(b) || a.priceIdr - b.priceIdr)[0];
}

/** Preselect the best-value package; fall back to the first sellable one. */
export function defaultPackage(packages: readonly ViewPackage[]): ViewPackage | undefined {
  return bestValuePackage(packages) ?? packages.find((pkg) => pkg.sellable);
}
