import { isRecommendablePackage, type ResellerCatalogPackage } from "./esim-access-catalog";
import { packageDataLabel, packageDestinationLabel } from "./package-copy";
import { toViewPackage } from "./package-view";
import { getResellerCatalog } from "./reseller-catalog-cache";
import { getSellabilityState } from "./sellability.server";

const regionNames = new Intl.DisplayNames(["id-ID"], { type: "region" });
const RESULT_LIMIT = 4;

function normalize(value: string) {
  return value.toLocaleLowerCase("id-ID").replace(/(\d)([a-z])/g, "$1 $2");
}

function matches(pkg: ResellerCatalogPackage, terms: string[]) {
  const regions = pkg.locationCodes.map((code) => {
    try {
      return regionNames.of(code) ?? code;
    } catch {
      return code;
    }
  });
  const text = normalize(
    [
      pkg.name,
      pkg.packageCode,
      packageDestinationLabel(pkg),
      packageDataLabel(pkg),
      ...pkg.locationCodes,
      ...regions,
      `${pkg.durationDays} hari`,
      `${pkg.durationDays} days`,
    ].join(" "),
  );
  return terms.every((term) => text.includes(term));
}

export async function searchHomeEsimCatalogHandler(query: string) {
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return { packages: [], stale: false, hasMore: false };

  const catalog = await getResellerCatalog();
  const matching = catalog.packages
    .filter(isRecommendablePackage)
    .filter((pkg) => matches(pkg, terms));
  if (matching.length === 0) return { packages: [], stale: catalog.stale, hasMore: false };
  const sellability = await getSellabilityState(matching);
  if (sellability.mode === "on" && sellability.snapshot.balanceUnits === null) {
    throw new Error("Ketersediaan paket belum dapat dipastikan");
  }

  const preorderable = sellability.preorderable;
  return {
    packages: matching.sort((a, b) => Number(sellability.hidden.has(a.packageCode)) - Number(sellability.hidden.has(b.packageCode))).slice(0, RESULT_LIMIT).map((pkg) =>
      toViewPackage(
        pkg,
        !sellability.hidden.has(pkg.packageCode),
        preorderable.has(pkg.packageCode),
      ),
    ),
    stale: catalog.stale,
    hasMore: matching.length > RESULT_LIMIT,
  };
}
