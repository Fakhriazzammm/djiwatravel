import { isRecommendablePackage, type ResellerCatalogPackage } from "./esim-access-catalog";
import { getResellerCatalog } from "./reseller-catalog-cache";
import { getSellabilityState } from "./sellability.server";
import { toViewPackage, type ViewPackage } from "./package-view";

export type IndexablePlan = {
  package: ViewPackage;
  source: ResellerCatalogPackage;
};

/**
 * Public SEO projection. Only recommendable packages that the current sellability gate permits
 * are eligible; provider snapshots and commercial cost fields never leave this server module.
 */
export async function getIndexablePlans(deadlineMs = 8_500): Promise<IndexablePlan[]> {
  const catalog = await Promise.race([
    getResellerCatalog(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("SEO catalog timeout")), deadlineMs),
    ),
  ]);
  const candidates = catalog.packages.filter(isRecommendablePackage);
  const sellability = await getSellabilityState(candidates);
  return candidates
    .filter((pkg) => !sellability.hidden.has(pkg.packageCode))
    .map((pkg) => ({ package: toViewPackage(pkg), source: pkg }));
}

export async function getIndexablePlan(id: string): Promise<IndexablePlan | null> {
  const plans = await getIndexablePlans();
  return (
    plans.find(
      ({ package: pkg }) =>
        pkg.packageCode === id || pkg.packageCode.toLowerCase() === id.toLowerCase(),
    ) ?? null
  );
}
