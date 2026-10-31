import { getSellableDestinationCodes } from "./destination-availability.server";
import {
  regionalCoverage as extendRegionalCoverage,
  resolveCatalogDestination,
} from "./destination-availability";
import { toViewPackages } from "./package-view";
import { getResellerCatalog } from "./reseller-catalog-cache";
import { filterPackagesByDestination } from "./reseller-catalog-view";
import { getSellabilityState } from "./sellability.server";

const REGIONAL_COVERAGE: Record<string, readonly string[]> = {
  ASIA: ["CN", "HK", "JP", "KR", "MY", "SG", "TH", "TW"],
  EU: ["EU"],
};

async function coverageFor(destination: { code: string; region: string }) {
  const seed = REGIONAL_COVERAGE[destination.code.toUpperCase()] ?? [];
  if (destination.region !== "Regional") return seed;
  const availability = await getSellableDestinationCodes(1_500);
  return extendRegionalCoverage(
    { code: destination.code, region: destination.region },
    availability,
  );
}

/**
 * The one reader of "which packages can this destination sell right now".
 *
 * The destination page, the Home package sheet and anything else that lists a destination's
 * packages go through here, so the catalogue, regional coverage and balance-aware sellability
 * rules cannot diverge between surfaces. Only display fields leave the server
 * (`toViewPackages`): the cost basis and the balance stay here.
 */
export async function getDestinationPackagesHandler(code: string) {
  const requestedCode = code.trim().toUpperCase();
  // Regional provider packages are represented by their member country codes; querying the
  // provider with a display code (for example ASIA) is rejected by some accounts, so read the full
  // list and apply the regional coverage locally.
  const seeded = resolveCatalogDestination(requestedCode, []);
  const catalog = await getResellerCatalog(
    seeded?.region === "Regional" ? undefined : requestedCode,
  );
  const destination = resolveCatalogDestination(requestedCode, catalog.packages);
  if (!destination) return null;
  const visible = filterPackagesByDestination(
    catalog.packages,
    destination.code,
    await coverageFor(destination),
  );
  const sellability = await getSellabilityState(visible);
  const balanceUnknown =
    sellability.mode === "on" &&
    (sellability.snapshot.balanceUnits === null ||
      !Number.isFinite(sellability.snapshot.balanceUnits));
  // Never advertise availability we cannot honour, and say so neutrally.
  const unavailable = balanceUnknown
    ? new Set(visible.map((pkg) => pkg.packageCode))
    : new Set<string>(sellability.hidden);
  return {
    destination,
    packages: toViewPackages(visible, unavailable),
    stale: catalog.stale,
    soldOut: unavailable.size,
    balanceUnknown,
    stockPending: balanceUnknown,
  };
}
