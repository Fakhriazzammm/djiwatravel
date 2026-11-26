import { isRecommendablePackage, type ResellerCatalogPackage } from "./esim-access-catalog";
import { getResellerCatalog, isCatalogPriceCurrent } from "./reseller-catalog-cache";
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
  const catalog = await getPublicEsimCatalog(deadlineMs);
  return isCatalogPriceCurrent(catalog.syncedAt) ? catalog.plans : [];
}

export async function getPublicEsimCatalog(deadlineMs = 8_500) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const catalog = await Promise.race([
    getResellerCatalog(),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("SEO catalog timeout")), deadlineMs);
    }),
  ]).finally(() => clearTimeout(timeout));
  const candidates = catalog.packages.filter(isRecommendablePackage);
  const sellability = await getSellabilityState(candidates);
  const byCode = new Map<string, IndexablePlan>();
  for (const pkg of candidates) {
    if (sellability.hidden.has(pkg.packageCode) || !pkg.packageCode) continue;
    const plan = toViewPackage(pkg);
    if (!Number.isSafeInteger(plan.priceIdr) || plan.priceIdr <= 0) continue;
    const key = plan.packageCode.toLowerCase();
    if (!byCode.has(key)) byCode.set(key, { package: plan, source: pkg });
  }
  return { plans: [...byCode.values()], syncedAt: catalog.syncedAt };
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
