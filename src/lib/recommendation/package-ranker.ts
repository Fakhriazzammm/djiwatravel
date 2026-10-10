import type { ResellerCatalogPackage } from "@/lib/esim-access-catalog";
import type { RecommendationPreferences } from "./preferences";
import { filterPackages, type FilteredPackage } from "./package-filter";
import {
  RECOMMENDATION_CONFIG,
  UNLIMITED_TARGET_BYTES,
  type RecommendationWeights,
} from "./recommendation-config";

/** Tuning lives in recommendation-config.ts so it is not hardcoded in the ranking logic. */
export const RECOMMENDATION_WEIGHTS: RecommendationWeights =
  RECOMMENDATION_CONFIG.weights;
export type PackageRecommendation = {
  packageCode: string;
  rank: number;
  score: number;
  category: "best_match" | "best_value" | "most_flexible" | "popular";
  reasons: string[];
  package: Pick<
    ResellerCatalogPackage,
    | "packageCode"
    | "name"
    | "locationCodes"
    | "volumeBytes"
    | "durationDays"
    | "sellingPrice"
    | "supportsTopUp"
    | "unlimited"
  >;
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const compareCodes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function rankPackages(
  items: FilteredPackage[],
  preferences: RecommendationPreferences,
  limit: number = RECOMMENDATION_CONFIG.defaultLimit,
): PackageRecommendation[] {
  // Revalidate eligibility so direct callers cannot rank invalid or unavailable terms.
  const eligible = filterPackages(
    items.map((item) => item.package),
    preferences,
  );
  if (!eligible.length || !Number.isFinite(limit) || limit < 1) return [];
  const prices = eligible.map(
    ({ package: pkg }) => pkg.sellingPrice.sellingPriceIdr,
  );
  const perGb = (pkg: ResellerCatalogPackage) =>
    pkg.unlimited === true
      ? undefined
      : pkg.sellingPrice.sellingPriceIdr / (pkg.volumeBytes / 1e9);
  const perDay = (pkg: ResellerCatalogPackage) =>
    pkg.sellingPrice.sellingPriceIdr / pkg.durationDays;
  const minPrice = Math.min(...prices);
  const gbPrices = eligible.flatMap(({ package: pkg }) =>
    perGb(pkg) == null ? [] : [perGb(pkg)!],
  );
  const minGbPrice = gbPrices.length ? Math.min(...gbPrices) : undefined;
  const minDayPrice = Math.min(
    ...eligible.map(({ package: pkg }) => perDay(pkg)),
  );
  const scored = eligible
    .map(({ package: pkg, destinationFit }) => {
      const durationFit = preferences.durationDays
        ? clamp(preferences.durationDays / pkg.durationDays)
        : 1;
      const dataFit =
        pkg.unlimited === true
          ? 1
          : clamp(
              pkg.volumeBytes /
                (preferences.dataNeed === "unlimited"
                  ? UNLIMITED_TARGET_BYTES
                  : RECOMMENDATION_CONFIG.dataNeedTargets[preferences.dataNeed]),
            );
      const priceFit = minPrice / pkg.sellingPrice.sellingPriceIdr;
      const gbPrice = perGb(pkg);
      // Unlimited has no measurable price/GB; do not assign it a fictitious zero unit cost.
      const gbValue =
        gbPrice == null || minGbPrice == null
          ? undefined
          : minGbPrice / gbPrice;
      const dayValue = minDayPrice / perDay(pkg);
      const features = pkg.supportsTopUp ? 1 : 0;
      const reliability = pkg.reliabilityScore;
      const terms: Array<[number | undefined, number]> = [
        [destinationFit, RECOMMENDATION_WEIGHTS.destination],
        [durationFit, RECOMMENDATION_WEIGHTS.duration],
        [dataFit, RECOMMENDATION_WEIGHTS.data],
        [priceFit, RECOMMENDATION_WEIGHTS.price],
        [gbValue, RECOMMENDATION_WEIGHTS.valuePerGb],
        [dayValue, RECOMMENDATION_WEIGHTS.valuePerDay],
        [features, RECOMMENDATION_WEIGHTS.features],
        [
          reliability != null &&
          Number.isFinite(reliability) &&
          reliability >= 0 &&
          reliability <= 1
            ? reliability
            : undefined,
          RECOMMENDATION_WEIGHTS.reliability,
        ],
      ];
      const known = terms.filter(
        (term): term is [number, number] => term[0] != null,
      );
      const score =
        known.reduce((sum, [fit, weight]) => sum + fit * weight, 0) /
        known.reduce((sum, [, weight]) => sum + weight, 0);
      const reasons = [
        "Mencakup semua destinasi",
        durationFit === 1
          ? "Durasi sesuai perjalanan"
          : "Durasi mencakup perjalanan dengan masa aktif tambahan",
        dataFit === 1
          ? "Kuota memenuhi kebutuhan"
          : "Kuota di bawah kebutuhan perkiraan",
      ];
      if (pkg.supportsTopUp) reasons.push("Mendukung top-up");
      return {
        pkg,
        score,
        reasons,
        value:
          (priceFit + dayValue + (gbValue ?? 0)) / (gbValue == null ? 2 : 3),
        flexibility: durationFit + (pkg.supportsTopUp ? 0.5 : 0),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.pkg.sellingPrice.sellingPriceIdr -
          b.pkg.sellingPrice.sellingPriceIdr ||
        compareCodes(a.pkg.packageCode, b.pkg.packageCode),
    );
  const bestMatch = scored[0];
  const assigned = new Map<string, PackageRecommendation["category"]>();
  if (bestMatch) assigned.set(bestMatch.pkg.packageCode, "best_match");
  const pickBy = (
    metric: (item: (typeof scored)[number]) => number,
  ): (typeof scored)[number] | undefined =>
    scored
      .filter((item) => !assigned.has(item.pkg.packageCode))
      .sort(
        (a, b) =>
          metric(b) - metric(a) ||
          b.score - a.score ||
          compareCodes(a.pkg.packageCode, b.pkg.packageCode),
      )[0];
  const bestValue = pickBy((item) => item.value);
  if (bestValue) assigned.set(bestValue.pkg.packageCode, "best_value");
  const mostFlexible = pickBy((item) => item.flexibility);
  if (mostFlexible) assigned.set(mostFlexible.pkg.packageCode, "most_flexible");
  // "popular" is never inferred: the provider exposes no popularity signal.
  return scored
    .slice(0, Math.floor(limit))
    .map(({ pkg, score, reasons }, index) => ({
      packageCode: pkg.packageCode,
      rank: index + 1,
      score: Number(score.toFixed(4)),
      category: assigned.get(pkg.packageCode) ?? "best_match",
      reasons,
      package: {
        packageCode: pkg.packageCode,
        name: pkg.name,
        locationCodes: pkg.locationCodes,
        volumeBytes: pkg.volumeBytes,
        durationDays: pkg.durationDays,
        sellingPrice: pkg.sellingPrice,
        supportsTopUp: pkg.supportsTopUp,
        ...(pkg.unlimited == null ? {} : { unlimited: pkg.unlimited }),
      },
    }));
}
