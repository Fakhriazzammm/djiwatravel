/**
 * Picks the two packages the Home card offers after a customer taps a destination: "Terlaris"
 * (best seller) and "Best Deal" (lowest price per day). Pure so the server reader, the Admin
 * preview and the tests all apply one rule.
 *
 * Order of precedence per slot: an Admin pin (if it is still in the live catalogue and sellable),
 * then the automatic pick. The two slots never return the same package.
 */

import type { PackageHighlight } from "./home-esim-config";
import { bestValuePackage, pricePerDay } from "./package-picker";
import type { ViewPackage } from "./package-view";

export type QuickPackageTag = "best_seller" | "best_deal";
export type QuickPackagePick = { tag: QuickPackageTag; pkg: ViewPackage; pinned: boolean };

/** Paid orders per package code over the sales window (server-derived, never browser-supplied). */
export type PackageSales = Readonly<Record<string, number>>;

const sellable = (packages: readonly ViewPackage[]) => packages.filter((pkg) => pkg.sellable);

function byCode(packages: readonly ViewPackage[], code?: string) {
  return code ? packages.find((pkg) => pkg.packageCode === code) : undefined;
}

/**
 * Automatic best seller: the sellable package with the most paid orders. With no sales yet, the
 * mid-range package (closest to a 12-day trip, the middle of the 8-15 day range) is the safest default for a first-time buyer.
 */
export function automaticBestSeller(
  packages: readonly ViewPackage[],
  sales: PackageSales,
  exclude?: string,
): ViewPackage | undefined {
  const pool = sellable(packages).filter((pkg) => pkg.packageCode !== exclude);
  const sold = pool
    .filter((pkg) => (sales[pkg.packageCode] ?? 0) > 0)
    .sort(
      (a, b) =>
        (sales[b.packageCode] ?? 0) - (sales[a.packageCode] ?? 0) ||
        pricePerDay(a) - pricePerDay(b) ||
        a.priceIdr - b.priceIdr,
    )[0];
  if (sold) return sold;
  const distance = (pkg: ViewPackage) => Math.abs(pkg.durationDays - 12);
  return [...pool].sort((a, b) => distance(a) - distance(b) || a.priceIdr - b.priceIdr)[0];
}

export function pickQuickPackages(
  packages: readonly ViewPackage[],
  sales: PackageSales = {},
  pin: PackageHighlight = {},
): QuickPackagePick[] {
  const live = sellable(packages);
  const pinnedDeal = byCode(live, pin.bestDealPackageCode);
  const pinnedSeller = byCode(live, pin.bestSellerPackageCode);
  const bestDealExcluding = (exclude?: ViewPackage) =>
    bestValuePackage(live.filter((pkg) => pkg !== exclude));

  let seller: ViewPackage | undefined;
  let deal: ViewPackage | undefined;
  if (pinnedSeller || pinnedDeal) {
    // A pin always wins; the other slot is filled automatically around it.
    seller = pinnedSeller ?? automaticBestSeller(live, sales, pinnedDeal?.packageCode);
    deal = pinnedDeal ?? bestDealExcluding(seller);
  } else if (live.some((pkg) => (sales[pkg.packageCode] ?? 0) > 0)) {
    // Real sales decide Terlaris first; Best Deal is the best value among the rest.
    seller = automaticBestSeller(live, sales);
    deal = bestDealExcluding(seller);
  } else {
    // No sales yet: lead with value, then a mid-range default for Terlaris.
    deal = bestDealExcluding();
    seller = automaticBestSeller(live, sales, deal?.packageCode);
  }

  const picks: QuickPackagePick[] = [];
  if (seller) picks.push({ tag: "best_seller", pkg: seller, pinned: seller === pinnedSeller });
  if (deal && deal !== seller) {
    picks.push({ tag: "best_deal", pkg: deal, pinned: deal === pinnedDeal });
  }
  return picks;
}
