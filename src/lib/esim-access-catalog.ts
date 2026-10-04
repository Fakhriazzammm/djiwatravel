import { queryEsimAccessPackages } from "./esim-access";
import { calculateSellingPrice, type PriceBreakdown } from "./reseller-pricing";

type ProviderPackage = {
  packageCode: string; slug?: string; name?: string; location?: string; locationCode?: string;
  volume?: number; duration?: number; price?: number; speed?: string; supportTopUpType?: number;
  [key: string]: unknown;
};
type PackageListResponse = { obj?: { packageList?: ProviderPackage[] }; data?: { packageList?: ProviderPackage[] } };

export type ResellerCatalogPackage = {
  provider: "esimaccess"; packageCode: string; slug: string; name: string; locationCodes: string[];
  volumeBytes: number; durationDays: number; providerPriceUnits: number; sellingPrice: PriceBreakdown;
  speed?: string; supportsTopUp: boolean; providerSnapshot: ProviderPackage;
};

export function normalizeEsimAccessPackage(pkg: ProviderPackage): ResellerCatalogPackage {
  const locationCodes = (pkg.location ?? pkg.locationCode ?? "").split(",").map((v) => v.trim().toUpperCase()).filter(Boolean);
  const providerPriceUnits = pkg.price ?? 0;
  return {
    provider: "esimaccess", packageCode: pkg.packageCode, slug: pkg.slug ?? pkg.packageCode,
    name: pkg.name ?? pkg.packageCode, locationCodes, volumeBytes: pkg.volume ?? 0,
    durationDays: pkg.duration ?? 0, providerPriceUnits,
    sellingPrice: calculateSellingPrice({ providerPriceUnits }), speed: pkg.speed,
    supportsTopUp: (pkg.supportTopUpType ?? 1) > 1, providerSnapshot: pkg,
  };
}

export async function loadResellerCatalog(query: Parameters<typeof queryEsimAccessPackages>[0] = {}) {
  const response = await queryEsimAccessPackages({ data: query });
  const payload = response as PackageListResponse;
  const packages = payload.obj?.packageList ?? payload.data?.packageList ?? [];
  return packages.map(normalizeEsimAccessPackage);
}
