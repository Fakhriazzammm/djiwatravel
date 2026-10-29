import { destinations, type Destination } from "./catalog";
import { filterPackagesByDestination, type DestinationPackage } from "./reseller-catalog-view";

/**
 * Destination availability rules, kept free of any provider/runtime dependency so they can be unit
 * tested and reused by both server and browser code.
 *
 * The seeded destination list in `lib/catalog.ts` is display metadata (flag, Indonesian name,
 * aliases). Whether a destination can actually be *sold* is a property of the live catalogue plus
 * the provider balance; `destination-availability.server.ts` reads that and feeds it in here.
 */

export type AvailabilitySource = "live" | "cached" | "fallback";

export type DestinationAvailability = {
  /** Uppercase location codes that currently have at least one sellable package. */
  codes: string[];
  source: AvailabilitySource;
  /** True when `codes` is empty because the catalogue could not be read. */
  degraded: boolean;
};

function localizedRegionName(code: string, locale: string): string | undefined {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Display metadata for a code, falling back to the raw code so nothing is ever dropped. */
export function destinationForCode(code: string): Destination {
  const wanted = code.trim().toUpperCase();
  const englishName = localizedRegionName(wanted, "en") ?? wanted;
  const indonesianName = localizedRegionName(wanted, "id") ?? englishName;
  return (
    destinations.find((d) => d.code.toUpperCase() === wanted) ?? {
      code: wanted,
      flag: "🌐",
      name: englishName,
      nameId: indonesianName,
      aliases: [],
      region: "Lainnya",
    }
  );
}

/** Resolves a destination route without allowing arbitrary, package-less codes. */
export function resolveCatalogDestination(
  code: string,
  catalogPackages: readonly DestinationPackage[],
): Destination | null {
  const wanted = code.trim().toUpperCase();
  if (!wanted) return null;
  const known = destinations.find((destination) => destination.code.toUpperCase() === wanted);
  if (known) return known;
  const covered = catalogPackages.some((pkg) =>
    pkg.locationCodes.some((locationCode) => locationCode.trim().toUpperCase() === wanted),
  );
  return covered ? destinationForCode(wanted) : null;
}

/**
 * Filters display destinations against live availability.
 *
 * A degraded read returns the unfiltered list on purpose: showing a destination whose packages are
 * temporarily unreadable is far better than showing an empty storefront.
 */
export function filterDestinationsByAvailability(
  available: DestinationAvailability,
  destinationsToFilter: readonly Destination[] = destinations,
): Destination[] {
  if (available.degraded || available.codes.length === 0) return [...destinationsToFilter];
  const allowed = new Set(available.codes.map((code) => code.trim().toUpperCase()));
  return destinationsToFilter.filter((destination) => allowed.has(destination.code.toUpperCase()));
}

/**
 * Regional coverage for a package whose provider location list is the member country codes.
 *
 * The seed list is the fallback for regions we cannot reconstruct from the catalogue (for example
 * Europe, whose member countries are not all in our display list); it is extended with every
 * catalogued country that belongs to the same region and is actually sellable.
 */
const REGIONAL_SEED: Record<string, readonly string[]> = {
  ASIA: ["CN", "HK", "JP", "KR", "MY", "SG", "TH", "TW"],
  EU: ["EU"],
};

export function regionalCoverage(
  destination: Pick<Destination, "code" | "region">,
  available?: DestinationAvailability,
): string[] {
  const seed = REGIONAL_SEED[destination.code.toUpperCase()] ?? [];
  const seedSet = new Set(seed.map((code) => code.toUpperCase()));
  // A country destination covers a package whose own location list contains it, so the seed set is
  // empty; only a regional destination is widened with its sellable member countries.
  if (destination.region !== "Regional") return [...seedSet];
  if (!available || available.degraded) return [...seedSet];
  const allowed = new Set(available.codes.map((code) => code.trim().toUpperCase()));
  const dynamic = destinations
    .filter(
      (candidate) =>
        candidate.region !== "Regional" &&
        candidate.region === destination.region &&
        allowed.has(candidate.code.toUpperCase()),
    )
    .map((candidate) => candidate.code.toUpperCase());
  for (const code of dynamic) seedSet.add(code);
  return [...seedSet];
}

/**
 * Whether a display destination currently has something we can sell.
 *
 * Matching a package by its literal location code alone hides every regional destination: provider
 * regional bundles list their member countries (DE, FR, …) and never carry a literal "EU"/"ASIA"
 * code, so the region is reached through `regionalCoverage` instead. Listing and opening a
 * destination must agree, so this is the single rule both call.
 */
export function isDestinationSellable(
  destination: Pick<Destination, "code" | "region">,
  sellablePackages: readonly DestinationPackage[],
  available?: DestinationAvailability,
): boolean {
  const coverage = regionalCoverage(destination, available);
  return filterPackagesByDestination(sellablePackages, destination.code, coverage).length > 0;
}

/**
 * The destinations to list, in seeded display order.
 *
 * A degraded or empty read returns the whole list on purpose: an unreadable catalogue must not
 * produce an empty storefront (each destination pages re-validates what it can actually sell).
 */
export function listableDestinations(
  sellablePackages: readonly DestinationPackage[],
  available: DestinationAvailability,
  destinationsToList: readonly Destination[] = destinations,
): Destination[] {
  if (available.degraded || available.codes.length === 0) return [...destinationsToList];
  const known = destinationsToList.filter((destination) =>
    isDestinationSellable(destination, sellablePackages, available),
  );
  const knownCodes = new Set(known.map((destination) => destination.code.toUpperCase()));
  const dynamic: Destination[] = [];
  for (const code of available.codes) {
    const destination = destinationForCode(code);
    const normalizedCode = destination.code.toUpperCase();
    if (knownCodes.has(normalizedCode)) continue;
    knownCodes.add(normalizedCode);
    dynamic.push(destination);
  }
  return [...known, ...dynamic];
}
