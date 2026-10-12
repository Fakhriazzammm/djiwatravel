import type { ResellerCatalogPackage } from "@/lib/esim-access-catalog";

/**
 * The package shape allowed to cross into the browser.
 *
 * The full reseller record carries our cost basis (`providerCostIdr`, `markupIdr`, the FX and
 * markup snapshot, the raw provider payload). Serialising it into the SSR payload both leaked
 * margins into the page source and made a destination page ~680 KB, so only the fields needed to
 * draw a card travel to the client. Anything that needs the real record (order creation, the
 * checkout price check) resolves it server-side by package code.
 */
export type ViewPackage = {
  packageCode: string;
  name: string;
  locationCodes: string[];
  volumeBytes: number;
  unlimited: boolean;
  durationDays: number;
  priceIdr: number;
  /**
   * False when the provider balance cannot cover this package: shown as sold out, never sold.
   * A boolean keeps the balance and the cost basis on the server.
   */
  sellable: boolean;
};

/** Anything that carries at least the display fields — the full record or a narrower pick. */
export type PackageDisplaySource = Pick<
  ResellerCatalogPackage,
  "packageCode" | "name" | "locationCodes" | "volumeBytes" | "durationDays" | "sellingPrice"
> & { unlimited?: boolean };

export function toViewPackage(pkg: PackageDisplaySource, sellable = true): ViewPackage {
  return {
    packageCode: pkg.packageCode,
    name: pkg.name,
    locationCodes: [...pkg.locationCodes],
    volumeBytes: pkg.volumeBytes,
    unlimited: pkg.unlimited === true,
    durationDays: pkg.durationDays,
    priceIdr: pkg.sellingPrice.sellingPriceIdr,
    sellable,
  };
}

/** `hidden` holds the package codes the balance cannot cover; everything else is sellable. */
export function toViewPackages(
  packages: PackageDisplaySource[],
  hidden?: ReadonlySet<string>,
): ViewPackage[] {
  return packages.map((pkg) => toViewPackage(pkg, !hidden?.has(pkg.packageCode)));
}
