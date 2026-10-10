import {
  isRecommendablePackage,
  type ResellerCatalogPackage,
} from "@/lib/esim-access-catalog";
import type { RecommendationPreferences } from "./preferences";
import { RECOMMENDATION_CONFIG } from "./recommendation-config";

export type FilteredPackage = {
  package: ResellerCatalogPackage;
  destinationFit: number;
};

export function filterPackages(
  packages: ResellerCatalogPackage[],
  preferences: RecommendationPreferences,
): FilteredPackage[] {
  const wanted = new Set(
    preferences.destinations.map((v) => v.trim().toUpperCase()).filter(Boolean),
  );
  if (!wanted.size) return [];
  return packages.flatMap((pkg) => {
    if (!isRecommendablePackage(pkg)) return [];
    const locations = new Set(
      pkg.locationCodes.map((v) => v.trim().toUpperCase()),
    );
    // Every requested destination must be covered by a single recommended package.
    if (![...wanted].every((v) => locations.has(v))) return [];
    if (preferences.durationDays && pkg.durationDays < preferences.durationDays)
      return [];
    if (
      preferences.budgetIdr != null &&
      pkg.sellingPrice.sellingPriceIdr >
        preferences.budgetIdr * RECOMMENDATION_CONFIG.budgetCeilingFactor
    )
      return [];
    if (preferences.needsTopUp && !pkg.supportsTopUp) return [];
    if (preferences.dataNeed === "unlimited" && pkg.unlimited !== true)
      return [];
    return [{ package: pkg, destinationFit: 1 }];
  });
}
