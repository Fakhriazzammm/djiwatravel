import { isValidLatLng, type PlaceResult } from "./itinerary-map";

/**
 * Place search and reverse lookup. Pure helpers shared by the server: the request URLs for each
 * provider and the mapping from their GeoJSON responses to the Agenda's `PlaceResult`. No key is
 * read here; the server adds it, and nothing in this file is sent to the browser.
 *
 * Providers: MapTiler Cloud (when `MAPTILER_API_KEY` is set), a self-hosted Photon
 * (`PLACE_SEARCH_URL`), and the offline GeoNames gazetteer (no key; its lookups run in the database,
 * see place-gazetteer.server.ts). The public Photon instance is not used: it refuses connections
 * from the Travel VPS.
 */

export const MAPTILER_GEOCODING_URL = "https://api.maptiler.com/geocoding";

export type PlaceSearchTarget =
  | { provider: "maptiler"; key: string }
  | { provider: "photon"; baseUrl: string }
  | { provider: "gazetteer" };

/** Providers that answer over HTTP. The gazetteer is queried in the database instead. */
export type HttpPlaceTarget = Exclude<PlaceSearchTarget, { provider: "gazetteer" }>;

export type ForwardSearch = {
  query: string;
  limit: number;
  /** Language for names; both providers accept a plain ISO 639-1 code. */
  lang: string;
  /** Typeahead while typing. Batch lookups (place ideas) turn it off. */
  autocomplete: boolean;
  /** Prefer results near this point. */
  proximity?: { lat: number; lng: number };
};

/** Forward search URL. The key is added here, so callers must not log the returned URL. */
export function forwardSearchUrl(target: HttpPlaceTarget, search: ForwardSearch): URL {
  if (target.provider === "maptiler") {
    // MapTiler takes the query in the path and the options as query parameters.
    const url = new URL(`${MAPTILER_GEOCODING_URL}/${encodeURIComponent(search.query)}.json`);
    url.searchParams.set("key", target.key);
    url.searchParams.set("limit", String(Math.min(Math.max(search.limit, 1), 10)));
    url.searchParams.set("language", search.lang);
    url.searchParams.set("autocomplete", String(search.autocomplete));
    if (search.proximity) {
      // MapTiler expects longitude first.
      url.searchParams.set("proximity", `${search.proximity.lng},${search.proximity.lat}`);
    }
    return url;
  }
  const url = new URL(target.baseUrl);
  url.searchParams.set("q", search.query);
  url.searchParams.set("limit", String(search.limit));
  url.searchParams.set("lang", search.lang);
  if (search.proximity) {
    url.searchParams.set("lat", String(search.proximity.lat));
    url.searchParams.set("lon", String(search.proximity.lng));
  }
  return url;
}

/** Reverse lookup URL for the nearest named place to a point. */
export function reverseSearchUrl(
  target: HttpPlaceTarget,
  point: { lat: number; lng: number },
  lang: string,
): URL {
  if (target.provider === "maptiler") {
    const url = new URL(`${MAPTILER_GEOCODING_URL}/${point.lng},${point.lat}.json`);
    url.searchParams.set("key", target.key);
    url.searchParams.set("limit", "1");
    url.searchParams.set("language", lang);
    return url;
  }
  const url = new URL(target.baseUrl.replace(/\/api\/?$/, "/reverse"));
  url.searchParams.set("lat", String(point.lat));
  url.searchParams.set("lon", String(point.lng));
  url.searchParams.set("lang", lang);
  return url;
}

/** Maps a provider response to Agenda places. Unknown or malformed input gives an empty list. */
export function mapPlaceFeatures(provider: HttpPlaceTarget["provider"], payload: unknown) {
  return provider === "maptiler" ? mapMapTilerFeatures(payload) : mapPhotonFeatures(payload);
}

const MAX_PLACES = 6;
const MAX_SUBTITLE = 160;

type Feature = { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> };

/** Shared tail of both mappers: validates the point, names the place, de-duplicates. */
function collectPlaces(
  features: { lng: unknown; lat: unknown; label: string; subtitle: string }[],
): PlaceResult[] {
  const seen = new Set<string>();
  const results: PlaceResult[] = [];
  for (const feature of features) {
    if (!isValidLatLng(feature.lat, feature.lng) || !feature.label) continue;
    const lat = feature.lat;
    const lng = feature.lng as number;
    const key = `${feature.label}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ label: feature.label, subtitle: feature.subtitle, lat, lng });
    if (results.length >= MAX_PLACES) break;
  }
  return results;
}

/** MapTiler: `text` is the name, `place_name` the full display line, `geometry` holds [lng, lat]. */
export function mapMapTilerFeatures(payload: unknown): PlaceResult[] {
  const features = (payload as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  return collectPlaces(
    (features as Array<Record<string, unknown>>).map((feature) => {
      const coords = (feature["geometry"] as { coordinates?: unknown } | undefined)?.coordinates;
      const pair = Array.isArray(coords) ? coords : [];
      const text = typeof feature["text"] === "string" ? feature["text"].trim() : "";
      // A house-number feature keeps its number after the street name, as Photon did.
      const houseNumber = typeof feature["address"] === "string" ? feature["address"].trim() : "";
      const label = [text, houseNumber].filter(Boolean).join(" ").slice(0, 120);
      const placeName = typeof feature["place_name"] === "string" ? feature["place_name"] : "";
      return {
        lng: pair[0],
        lat: pair[1],
        label,
        subtitle: subtitleFrom(placeName, text),
      };
    }),
  );
}

/** Photon: a GeoJSON feature with `name`, `street`, `housenumber`, `city`... in `properties`. */
export function mapPhotonFeatures(payload: unknown): PlaceResult[] {
  const features = (payload as { features?: Feature[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  return collectPlaces(
    features.map((feature) => {
      const coords = feature.geometry?.coordinates;
      const pair = Array.isArray(coords) ? coords : [];
      const props = feature.properties ?? {};
      const str = (key: string) =>
        typeof props[key] === "string" ? (props[key] as string).trim() : "";
      const street = [str("street"), str("housenumber")].filter(Boolean).join(" ");
      const label = (str("name") || street || str("city")).slice(0, 120);
      const subtitle = [
        street && str("name") ? street : "",
        str("district"),
        str("city"),
        str("state"),
        str("country"),
      ]
        .filter((part, i, all) => part && part !== label && all.indexOf(part) === i)
        .join(", ")
        .slice(0, MAX_SUBTITLE);
      return { lng: pair[0], lat: pair[1], label, subtitle };
    }),
  );
}

/**
 * "Shibuya Crossing, Shibuya, Tokyo, Japan" becomes "Shibuya, Tokyo, Japan": the part that names
 * the feature (also when a house number is attached, as in "2-1 Dogenzaka") is dropped.
 */
function subtitleFrom(placeName: string, name: string) {
  const parts = placeName
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (name && parts[0] && parts[0].toLowerCase().includes(name.toLowerCase())) parts.shift();
  return parts
    .filter((part, i, all) => all.indexOf(part) === i)
    .join(", ")
    .slice(0, MAX_SUBTITLE);
}
