import type { Destination } from "./catalog";

export type ExploreAvailability = {
  destinations: Destination[];
  source: "live" | "cached" | "error";
  errorMessage?: string;
};

/** Do not invent package-backed destinations when the provider read failed. */
export function exploreErrorState(message = "Katalog belum dapat dimuat."): ExploreAvailability {
  return { destinations: [], source: "error", errorMessage: message };
}

export function exploreAvailability(
  destinations: Destination[],
  source: "live" | "cached",
): ExploreAvailability {
  return { destinations, source };
}