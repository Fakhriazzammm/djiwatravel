import { createServerFn } from "@tanstack/react-start";

import { destinations, type Destination } from "./catalog";
import {
  filterDestinationsByAvailability,
  listableDestinations,
  type AvailabilitySource,
  type DestinationAvailability,
} from "./destination-availability";
import { isRecommendablePackage } from "./esim-access-catalog";
import { configureResellerCatalogCache, getResellerCatalog } from "./reseller-catalog-cache";
import { createResellerCatalogFileStore } from "./reseller-catalog-file-store.server";
import { getSellabilityState } from "./sellability.server";

const catalogFileStore = createResellerCatalogFileStore();
if (catalogFileStore) configureResellerCatalogCache({ store: catalogFileStore });

/**
 * Reads the live reseller catalogue and answers "which destinations can we actually sell right now".
 *
 * Every reader degrades rather than fails: a provider hiccup must never blank the home page, the
 * sitemap, or a destination page. The pure filtering rules live in `destination-availability.ts`
 * so they can be unit tested without a provider.
 */

export type { AvailabilitySource, DestinationAvailability };

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/**
 * Codes that currently have at least one package we are allowed to sell.
 *
 * `deadlineMs` bounds how long a caller is willing to wait: the home page pays for the first paint,
 * so it waits briefly and falls back to the seeded list, while the sitemap (cached for an hour) can
 * afford longer. The underlying provider read keeps running in the module cache either way, so a
 * bounded wait is not wasted work.
 */
export async function getSellableDestinationCodes(
  deadlineMs = 2_000,
): Promise<DestinationAvailability> {
  try {
    const catalog = await withDeadline(getResellerCatalog(), deadlineMs);
    if (!catalog) return { codes: [], source: "fallback", degraded: true };
    const packages = catalog.packages.filter(isRecommendablePackage);
    if (packages.length === 0) return { codes: [], source: "fallback", degraded: true };
    const sellability = await getSellabilityState(packages);
    const codes = new Set<string>();
    for (const pkg of packages) {
      if (sellability.hidden.has(pkg.packageCode)) continue;
      for (const code of pkg.locationCodes) {
        const normalized = code.trim().toUpperCase();
        if (normalized) codes.add(normalized);
      }
    }
    return {
      codes: [...codes].sort(),
      source: catalog.stale ? "cached" : "live",
      degraded: false,
    };
  } catch {
    return { codes: [], source: "fallback", degraded: true };
  }
}

/**
 * The destination list a page should show.
 *
 * This is the same rule that gates a destination page, so anything we list can actually be opened
 * (regional destinations included, through their coverage). A degraded read returns the seeded list
 * rather than an empty storefront.
 */
export async function getListableDestinations(deadlineMs = 2_000): Promise<Destination[]> {
  try {
    const catalog = await withDeadline(getResellerCatalog(), deadlineMs);
    if (!catalog) return [...destinations];
    const packages = catalog.packages.filter(isRecommendablePackage);
    if (packages.length === 0) return [...destinations];
    const sellability = await getSellabilityState(packages);
    const sellable = packages.filter((pkg) => !sellability.hidden.has(pkg.packageCode));
    const codes = new Set<string>();
    for (const pkg of sellable) {
      for (const code of pkg.locationCodes) {
        const normalized = code.trim().toUpperCase();
        if (normalized) codes.add(normalized);
      }
    }
    return listableDestinations(sellable, {
      codes: [...codes].sort(),
      source: catalog.stale ? "cached" : "live",
      degraded: false,
    });
  } catch {
    return [...destinations];
  }
}

export type HomeDestinations = {
  popular: Destination[];
  availabilitySource: AvailabilitySource;
};

/**
 * The home page's "Destinasi Populer" row.
 *
 * `popular: true` in the seed list is now only a *preference*: entries are dropped when the live
 * catalogue cannot sell them, and quiet days fall back to whatever is actually sellable.
 */
export async function getHomeDestinations(limit = 6): Promise<HomeDestinations> {
  const availability = await getSellableDestinationCodes(1_500);
  const available = filterDestinationsByAvailability(availability, destinations);
  const preferred = available.filter((destination) => destination.popular);
  const pool = preferred.length > 0 ? preferred : available;
  return { popular: pool.slice(0, limit), availabilitySource: availability.source };
}

/**
 * Browser-callable version of the row above.
 *
 * The home page renders the seeded row immediately and replaces it with this feed once it arrives,
 * so the first paint never waits on the reseller provider. A provider failure returns an empty
 * `popular` list and the caller keeps what it already rendered.
 */
export const getHomeDestinationFeed = createServerFn({ method: "GET" }).handler(async () =>
  getHomeDestinations(),
);
