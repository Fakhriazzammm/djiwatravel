import { createServerFn } from "@tanstack/react-start";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";
import { toViewPackage } from "@/lib/package-view";
import { getSellabilityState } from "@/lib/sellability.server";
import { filterPackages } from "./package-filter";
import { rankPackages } from "./package-ranker";
import { normalizePreferences, recommendationPreferencesSchema } from "./preferences";
export const recommendPackages = createServerFn({ method: "POST" })
  .validator(recommendationPreferencesSchema)
  .handler(async ({ data }) => {
    const preferences = normalizePreferences(data);
    const catalog = await getResellerCatalog();
    const filtered = filterPackages(catalog.packages, preferences);
    // Recommendations must obey the same balance rule as the catalogue pages.
    const sellability = await getSellabilityState(filtered.map((entry) => entry.package));
    return {
      // Only display fields go over the wire: the ranked records carry our cost
      // basis (lib/package-view.ts).
      recommendations: rankPackages(filtered, preferences).map((item) => ({
        ...item,
        package: toViewPackage(item.package, !sellability.hidden.has(item.package.packageCode)),
      })),
      catalogCount: catalog.packages.length,
      filteredCount: filtered.length,
      source: catalog.source,
      stale: catalog.stale,
    };
  });
