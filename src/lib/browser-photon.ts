import type { PlaceResult } from "./itinerary-map";
import { mapPhotonFeatures } from "./place-search";

/**
 * Venue search straight from the traveler's browser, through the public Photon instance
 * (OpenStreetMap data, no key). The Travel server cannot use it: that host refuses the VPS address.
 * Calling it from each traveler's own connection spreads the load over many addresses and keeps
 * the shared public instance within fair use. It only adds suggestions; any failure returns an
 * empty list and the server and map suggestions stay as they are.
 */

export const PHOTON_PUBLIC_URL = "https://photon.komoot.io/api/";
export const PHOTON_ATTRIBUTION = "Tempat: © OpenStreetMap via Photon";

export async function searchPhotonInBrowser(
  query: string,
  near?: { lat: number; lng: number },
): Promise<PlaceResult[]> {
  const url = new URL(PHOTON_PUBLIC_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "8");
  url.searchParams.set("lang", "en");
  if (near) {
    url.searchParams.set("lat", String(near.lat));
    url.searchParams.set("lon", String(near.lng));
  }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return [];
    return mapPhotonFeatures(await response.json());
  } catch {
    return [];
  }
}
