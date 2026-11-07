import { POI_CATEGORIES, distanceKm, type PlaceResult } from "./itinerary-map";

/**
 * Place search on the Agenda map's own data. The basemap already carries OpenStreetMap places
 * (food, stations, attractions...) in its vector tiles, so the location field can search the very
 * places the traveler sees on the map. Only places in tiles the map has loaded can be found,
 * which is the area around the current view at a close zoom.
 */

export type MapFeature = {
  /** Every name the tile gives the place (local, Latin, English). The first is shown. */
  names: string[];
  lat: number;
  lng: number;
  /** Tile `class` of the place, mapped to a category label. */
  cls: string;
};

/** Below this zoom the tiles hold no places, so a search would find nothing. */
export const MAP_SEARCH_MIN_ZOOM = 13;

const norm = (value: string) => value.trim().toLowerCase();

/** Places whose name contains the query, name-prefix matches first, then nearest to the view. */
export function rankMapFeatures(
  features: MapFeature[],
  query: string,
  center: { lat: number; lng: number },
  limit = 6,
): PlaceResult[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const seen = new Set<string>();
  const hits: { place: PlaceResult; starts: boolean; km: number }[] = [];
  for (const feature of features) {
    const names = feature.names.map((n) => n.trim()).filter(Boolean);
    const label = names[0];
    if (!label) continue;
    const matching = names.filter((n) => norm(n).includes(q));
    if (!matching.length) continue;
    const key = `${norm(label)}|${feature.lat.toFixed(4)}|${feature.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const category = POI_CATEGORIES.find((c) =>
      (c.classes as readonly string[]).includes(feature.cls),
    );
    hits.push({
      place: {
        label: label.slice(0, 120),
        subtitle: category?.label ?? "Di peta",
        lat: feature.lat,
        lng: feature.lng,
      },
      starts: matching.some((n) => norm(n).startsWith(q)),
      km: distanceKm(center, { lat: feature.lat, lng: feature.lng }),
    });
  }
  hits.sort((a, b) => Number(b.starts) - Number(a.starts) || a.km - b.km);
  return hits.slice(0, limit).map((hit) => hit.place);
}

/* The map and the location field live in different components. The map registers what it can do. */

export type MapSearchApi = {
  search: (query: string) => { places: PlaceResult[]; zoomedOut: boolean };
  /** Moves the map close enough for its places to load. */
  focusOn: (point: { lat: number; lng: number }) => void;
};

let current: MapSearchApi | null = null;

export function registerMapSearch(api: MapSearchApi) {
  current = api;
  return () => {
    if (current === api) current = null;
  };
}

export function searchMapPlaces(query: string) {
  return current
    ? { available: true as const, ...current.search(query) }
    : { available: false as const, places: [], zoomedOut: false };
}

export function focusMapOn(point: { lat: number; lng: number }) {
  current?.focusOn(point);
}
