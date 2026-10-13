export type DestinationPackage = { locationCodes: readonly string[] };

export function filterPackagesByDestination<T extends DestinationPackage>(
  packages: readonly T[],
  locationCode: string,
  coveredCodes: readonly string[] = [],
): T[] {
  const normalizedCode = locationCode.trim().toUpperCase();
  if (!normalizedCode) return [];
  const acceptedCodes = new Set([
    normalizedCode,
    ...coveredCodes.map((code) => code.trim().toUpperCase()),
  ]);
  return packages.filter((pkg) =>
    pkg.locationCodes.some((code) => acceptedCodes.has(code.trim().toUpperCase())),
  );
}

export type CatalogPricingPackage = {
  packageCode: string;
  sellingPrice: { providerCostIdr: number; sellingPriceIdr: number };
};

export function getCatalogPreviewSellingPrice(
  pkg: CatalogPricingPackage,
  overrides: Readonly<Record<string, number>>,
): number {
  return overrides[pkg.packageCode] ?? pkg.sellingPrice.sellingPriceIdr;
}

export function getCatalogPreviewProfit(
  pkg: CatalogPricingPackage,
  overrides: Readonly<Record<string, number>>,
): number {
  return getCatalogPreviewSellingPrice(pkg, overrides) - pkg.sellingPrice.providerCostIdr;
}
