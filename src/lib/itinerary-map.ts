/**
 * Agenda map. Pure helpers shared by the browser and the server: the Admin setting
 * (`admin_settings.itineraryMap`), coordinate validation, day grouping with numbered pins, and the
 * Google Maps links used for turn-by-turn navigation. No provider key is needed anywhere here.
 */
export const ITINERARY_MAP_SETTING_KEY = "itineraryMap";

export const DEFAULT_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
/** Hosts an Admin may point the basemap at. Keeps a typo or a hostile value out of the browser. */
export const ALLOWED_MAP_STYLE_HOSTS = [
  "tiles.openfreemap.org",
  "demotiles.maplibre.org",
  "api.maptiler.com",
  "tiles.stadiamaps.com",
] as const;

export type ItineraryMapConfig = {
  /** Kill switch: false hides the map and place search; the Agenda list keeps working. */
  enabled: boolean;
  /** Place search while adding an activity (server-side proxy). Off = free-text location only. */
  placeSearch: boolean;
  /** MapLibre style JSON URL for the basemap. */
  styleUrl: string;
};

export const DEFAULT_ITINERARY_MAP_CONFIG: ItineraryMapConfig = {
  enabled: true,
  placeSearch: true,
  styleUrl: DEFAULT_MAP_STYLE_URL,
};

export function isAllowedMapStyleUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (ALLOWED_MAP_STYLE_HOSTS as readonly string[]).includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export function parseItineraryMapConfig(value: unknown): ItineraryMapConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("itineraryMap harus berupa objek");
  }
  const raw = value as Record<string, unknown>;
  for (const key of ["enabled", "placeSearch"] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== "boolean") {
      throw new Error(`itineraryMap.${key} harus boolean`);
    }
  }
  const styleUrl = raw["styleUrl"] === undefined ? DEFAULT_MAP_STYLE_URL : raw["styleUrl"];
  if (typeof styleUrl !== "string" || !isAllowedMapStyleUrl(styleUrl.trim())) {
    throw new Error(
      `itineraryMap.styleUrl harus https dari: ${ALLOWED_MAP_STYLE_HOSTS.join(", ")}`,
    );
  }
  return {
    enabled: (raw["enabled"] as boolean | undefined) ?? DEFAULT_ITINERARY_MAP_CONFIG.enabled,
    placeSearch:
      (raw["placeSearch"] as boolean | undefined) ?? DEFAULT_ITINERARY_MAP_CONFIG.placeSearch,
    styleUrl: styleUrl.trim(),
  };
}

/** Read path: a bad stored value falls back to the default instead of breaking the Agenda. */
export function normalizeItineraryMapConfig(value: unknown): ItineraryMapConfig {
  try {
    return parseItineraryMapConfig(value);
  } catch {
    return DEFAULT_ITINERARY_MAP_CONFIG;
  }
}

export type GeoPoint = { lat: number; lng: number };
export type PlaceResult = { label: string; subtitle: string; lat: number; lng: number };

export function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

type MapItem = {
  id: string;
  activity_date?: unknown;
  start_time?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};

export function itemPoint(item: MapItem): GeoPoint | null {
  const lat = item.latitude === null || item.latitude === undefined ? NaN : Number(item.latitude);
  const lng =
    item.longitude === null || item.longitude === undefined ? NaN : Number(item.longitude);
  return isValidLatLng(lat, lng) ? { lat, lng } : null;
}

/** `YYYY-MM-DD` from a date column that may arrive as a string or a Date. */
export function dateKey(value: unknown) {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 10);
  return "";
}

/**
 * Pin numbers follow the order of the day's activities, counting only items that have a point,
 * so the numbers on the map are 1..n without gaps.
 */
export function numberDayPins<T extends MapItem>(dayItems: T[]) {
  const pins = new Map<string, number>();
  let n = 0;
  for (const item of dayItems) {
    if (itemPoint(item)) pins.set(item.id, ++n);
  }
  return pins;
}

const EARTH_KM = 6371;
export function distanceKm(a: GeoPoint, b: GeoPoint) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Straight-line length of the day's pins in order. It is a guide, not a routed distance. */
export function routeLengthKm(points: GeoPoint[]) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distanceKm(points[i - 1]!, points[i]!);
  return total;
}

export function formatKm(km: number) {
  if (km < 1) {
    const meters = Math.round(km * 10) * 100;
    return meters === 0 ? "<100 m" : `${meters} m`;
  }
  return km < 10 ? `${km.toFixed(1).replace(".", ",")} km` : `${Math.round(km)} km`;
}

export function boundsOf(points: GeoPoint[]): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  let w = points[0]!.lng,
    e = w,
    s = points[0]!.lat,
    n = s;
  for (const p of points) {
    w = Math.min(w, p.lng);
    e = Math.max(e, p.lng);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  return [
    [w, s],
    [e, n],
  ];
}

const fix = (n: number) => n.toFixed(6);

/** Opens Google Maps with directions to a point from the traveler's current position. */
export function googleMapsDirectionsUrl(point: GeoPoint) {
  const params = new URLSearchParams({
    api: "1",
    destination: `${fix(point.lat)},${fix(point.lng)}`,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** A multi-stop route (max 9 waypoints in Google's URL scheme) for the whole day. */
export function googleMapsDayRouteUrl(points: GeoPoint[]) {
  if (points.length < 2) return points[0] ? googleMapsDirectionsUrl(points[0]) : null;
  const trimmed = points.slice(0, 11);
  const stop = (p: GeoPoint) => `${fix(p.lat)},${fix(p.lng)}`;
  const params = new URLSearchParams({
    api: "1",
    origin: stop(trimmed[0]!),
    destination: stop(trimmed[trimmed.length - 1]!),
  });
  const middle = trimmed.slice(1, -1).map(stop);
  if (middle.length) params.set("waypoints", middle.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** A pin link for the Google Calendar description; the location text keeps the place name. */
export function googleMapsPointUrl(point: GeoPoint) {
  return `https://www.google.com/maps/search/?api=1&query=${fix(point.lat)},${fix(point.lng)}`;
}

export type MapPin = {
  id: string;
  n: number;
  lat: number;
  lng: number;
  title: string;
  date: string;
};
export type MapModel = { pins: MapPin[]; routes: GeoPoint[][]; pinnedCount: number };

type DayInput<T extends MapItem & { title?: unknown }> = { date: string; items: T[] };

/**
 * Pins for the selected day (or every day). Numbers run 1..n across what is shown, so the badge on
 * the list row, the pin on the map and the order of the route line always agree. Each day has its
 * own route line so two days never get joined by a line across the city.
 */
export function buildMapModel<T extends MapItem & { title?: unknown }>(
  days: DayInput<T>[],
  selected: string | "all",
): MapModel {
  const pins: MapPin[] = [];
  const routes: GeoPoint[][] = [];
  for (const day of days) {
    if (selected !== "all" && day.date !== selected) continue;
    const route: GeoPoint[] = [];
    for (const item of day.items) {
      const point = itemPoint(item);
      if (!point) continue;
      pins.push({
        id: item.id,
        n: pins.length + 1,
        lat: point.lat,
        lng: point.lng,
        title: String(item.title ?? "Aktivitas"),
        date: day.date,
      });
      route.push(point);
    }
    if (route.length > 1) routes.push(route);
  }
  return { pins, routes, pinnedCount: pins.length };
}
