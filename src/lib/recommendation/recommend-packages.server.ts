import { createServerFn } from "@tanstack/react-start";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";
import { filterPackages } from "./package-filter";
import { rankPackages } from "./package-ranker";
import {
  normalizePreferences,
  recommendationPreferencesSchema,
} from "./preferences";
export const recommendPackages = createServerFn({ method: "POST" })
  .validator(recommendationPreferencesSchema)
  .handler(async ({ data }) => {
    const preferences = normalizePreferences(data);
    const catalog = await getResellerCatalog();
    const filtered = filterPackages(catalog.packages, preferences);
    return {
      recommendations: rankPackages(filtered, preferences),
      catalogCount: catalog.packages.length,
      filteredCount: filtered.length,
      source: catalog.source,
      stale: catalog.stale,
    };
  });
