import { queryEsimAccessPackages } from "./esim-access";
import { getPriceRuleSnapshot } from "./price-rules-snapshot";
import { resolvePricingRule } from "./price-rules";
import { calculateSellingPrice, type PriceBreakdown } from "./reseller-pricing";

type ProviderPackage = {
  packageCode: string;
  slug?: string;
  name?: string;
  location?: string;
  locationCode?: string;
  volume?: number;
  duration?: number;
  price?: number;
  speed?: string;
  supportTopUpType?: number;
  [key: string]: unknown;
};
type PackageListResponse = {
  obj?: { packageList?: ProviderPackage[] };
  data?: { packageList?: ProviderPackage[] };
};

type EsimAccessPackageQuery = {
  locationCode?: string;
  type?: string;
  slug?: string;
  packageCode?: string;
  iccid?: string;
};

export type ResellerCatalogPackage = {
  provider: "esimaccess";
  packageCode: string;
  slug: string;
  name: string;
  locationCodes: string[];
  volumeBytes: number;
  durationDays: number;
  providerPriceUnits: number;
  sellingPrice: PriceBreakdown;
  /** Which price rule answered for this package; `default` means the reseller fallback. */
  pricingSource?: "package" | "country" | "global" | "default";
  speed?: string;
  supportsTopUp: boolean;
  /** Explicit provider signals only; absent signals remain unknown. */
  unlimited?: boolean;
  available?: boolean;
  reliabilityScore?: number;
  providerSnapshot: ProviderPackage;
};

export function normalizeEsimAccessPackage(pkg: ProviderPackage): ResellerCatalogPackage {
  const locationCodes = (pkg.location ?? pkg.locationCode ?? "")
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
  const providerPriceUnits = pkg.price ?? 0;
  // Every catalogue price follows the operator's active price rules. With no rule loaded this is
  // exactly the previous behaviour: the reseller defaults answer and the numbers do not move.
  const pricing = resolvePricingRule(
    { packageCode: pkg.packageCode, locationCodes },
    getPriceRuleSnapshot(),
  );
  return {
    provider: "esimaccess",
    packageCode: pkg.packageCode,
    slug: pkg.slug ?? pkg.packageCode,
    name: pkg.name ?? pkg.packageCode,
    locationCodes,
    volumeBytes: pkg.volume ?? 0,
    durationDays: pkg.duration ?? 0,
    providerPriceUnits,
    sellingPrice: calculateSellingPrice({
      providerPriceUnits,
      markupPercent: pricing.markupPercent,
      fixedMarkupIdr: pricing.fixedMarkupIdr,
    }),
    pricingSource: pricing.source,
    ...(pkg.speed == null ? {} : { speed: pkg.speed }),
    supportsTopUp: (pkg.supportTopUpType ?? 1) > 1,
    ...(typeof pkg["unlimited"] === "boolean" ? { unlimited: pkg["unlimited"] } : {}),
    ...(typeof pkg["available"] === "boolean" ? { available: pkg["available"] } : {}),
    ...(typeof pkg["reliabilityScore"] === "number" &&
    Number.isFinite(pkg["reliabilityScore"]) &&
    pkg["reliabilityScore"] >= 0 &&
    pkg["reliabilityScore"] <= 1
      ? { reliabilityScore: pkg["reliabilityScore"] }
      : {}),
    providerSnapshot: pkg,
  };
}

function hasUsableProviderPrice(price: unknown): price is number {
  return typeof price === "number" && Number.isFinite(price) && price > 0;
}

/**
 * Customer catalog boundary. The partner catalog is the single source of truth
 * for what the customer app may list and order, and only packages the partner
 * can actually sell are kept: a known positive price, a known duration, at
 * least one location and a known data volume (or an explicit unlimited signal).
 * Anything whose commercial terms are missing or zero is hidden instead of being
 * shown as free, unlimited or unmetered.
 */
export async function loadResellerCatalog(query: EsimAccessPackageQuery = {}) {
  const response = await queryEsimAccessPackages({ data: query });
  const payload = response as PackageListResponse;
  const packages = payload.obj?.packageList ?? payload.data?.packageList ?? [];
  return packages
    .filter((pkg) => hasUsableProviderPrice(pkg.price))
    .map(normalizeEsimAccessPackage)
    .filter(isRecommendablePackage);
}

/**
 * Availability gate shared by the catalog boundary and the recommendation
 * layer. Unknown or zero provider fields are never treated as free or
 * unlimited data: a package must carry known, positive commercial terms to be
 * listed, recommended or ordered.
 */
export function isRecommendablePackage(pkg: ResellerCatalogPackage): boolean {
  return (
    Number.isFinite(pkg.providerPriceUnits) &&
    pkg.providerPriceUnits > 0 &&
    Number.isFinite(pkg.sellingPrice.sellingPriceIdr) &&
    pkg.sellingPrice.sellingPriceIdr > 0 &&
    Number.isFinite(pkg.durationDays) &&
    pkg.durationDays > 0 &&
    pkg.locationCodes.some((code) => code.trim().length > 0) &&
    (pkg.unlimited === true || (Number.isFinite(pkg.volumeBytes) && pkg.volumeBytes > 0)) &&
    pkg.available !== false
  );
}

/**
 * Provider terms for one package code straight from the provider, bypassing the browsing cache.
 *
 * Money must never be based on a cached price: the provider refuses an order whose price no longer
 * matches its catalogue, so the price the customer pays — and the price we send back to the
 * provider — is always derived from this live read.
 */
export async function loadLiveResellerPackage(
  packageCode: string,
): Promise<ResellerCatalogPackage | null> {
  const response = await queryEsimAccessPackages({ data: { packageCode } });
  const payload = response as PackageListResponse;
  const packages = payload.obj?.packageList ?? payload.data?.packageList ?? [];
  const match = packages.find((pkg) => pkg.packageCode === packageCode) ?? packages[0];
  if (!match || !hasUsableProviderPrice(match.price)) return null;
  return normalizeEsimAccessPackage(match);
}
