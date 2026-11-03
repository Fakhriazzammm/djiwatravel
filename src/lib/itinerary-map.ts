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
  /** Category helper on the map (stations, airports, food...). Off = plain map with pins only. */
  poiHelper: boolean;
  /** "My location" button (browser GPS) and "add here". */
  locateMe: boolean;
  /** Place photos from Wikipedia on activities and tapped places. */
  placeImages: boolean;
  /** Map on the trip's Ringkas (overview) page. Off = the overview keeps its lists without a map. */
  summaryMap: boolean;
  /** MapLibre style JSON URL for the basemap. */
  styleUrl: string;
};

export const DEFAULT_ITINERARY_MAP_CONFIG: ItineraryMapConfig = {
  enabled: true,
  placeSearch: true,
  poiHelper: true,
  locateMe: true,
  placeImages: true,
  summaryMap: true,
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
  for (const key of [
    "enabled",
    "placeSearch",
    "poiHelper",
    "locateMe",
    "placeImages",
    "summaryMap",
  ] as const) {
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
    poiHelper: (raw["poiHelper"] as boolean | undefined) ?? DEFAULT_ITINERARY_MAP_CONFIG.poiHelper,
    locateMe: (raw["locateMe"] as boolean | undefined) ?? DEFAULT_ITINERARY_MAP_CONFIG.locateMe,
    placeImages:
      (raw["placeImages"] as boolean | undefined) ?? DEFAULT_ITINERARY_MAP_CONFIG.placeImages,
    summaryMap:
      (raw["summaryMap"] as boolean | undefined) ?? DEFAULT_ITINERARY_MAP_CONFIG.summaryMap,
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
  /** Position within its own day, so it matches the number on the list row. */
  n: number;
  lat: number;
  lng: number;
  title: string;
  date: string;
  color: string;
  /** Belongs to another day than the selected one: drawn grey. */
  muted: boolean;
};
export type MapRoute = { date: string; color: string; muted: boolean; points: GeoPoint[] };
export type MapModel = { pins: MapPin[]; routes: MapRoute[]; pinnedCount: number };

type DayInput<T extends MapItem & { title?: unknown }> = { date: string; items: T[] };

export const BRAND_RED = "#c4353b";
export const MUTED_GREY = "#9aa0a6";
/** One colour per day when every day is shown together. */
export const DAY_COLORS = [BRAND_RED, "#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];

/**
 * Pins and routes for every day. The selected day is red; other days stay on the map in grey (still
 * with their dotted route) so the trip reads as a whole. With "all" each day gets its own colour.
 * Numbers restart per day so the pin, the list badge and the route order always agree.
 */
export function buildMapModel<T extends MapItem & { title?: unknown }>(
  days: DayInput<T>[],
  selected: string | "all",
): MapModel {
  const pins: MapPin[] = [];
  const routes: MapRoute[] = [];
  days.forEach((day, dayIndex) => {
    const muted = selected !== "all" && day.date !== selected;
    const color =
      selected === "all"
        ? DAY_COLORS[dayIndex % DAY_COLORS.length]!
        : muted
          ? MUTED_GREY
          : BRAND_RED;
    const route: GeoPoint[] = [];
    let n = 0;
    for (const item of day.items) {
      const point = itemPoint(item);
      if (!point) continue;
      pins.push({
        id: item.id,
        n: ++n,
        lat: point.lat,
        lng: point.lng,
        title: String(item.title ?? "Aktivitas"),
        date: day.date,
        color,
        muted,
      });
      route.push(point);
    }
    if (route.length > 1) routes.push({ date: day.date, color, muted, points: route });
  });
  return { pins, routes, pinnedCount: pins.filter((pin) => !pin.muted).length };
}

export type TravelLeg = { mode: "walk" | "rail"; minutes: number; km: number };

const WALK_MAX_KM = 1.5;
/** Streets are longer than the straight line between two pins. */
const DETOUR = 1.3;

/**
 * A quick guide between two stops, from the straight-line distance. Up to 1,5 km it is a walk,
 * beyond that public rail. It is an estimate, not a routed time, and is shown with a "≈".
 */
export function estimateLeg(km: number): TravelLeg {
  const road = km * DETOUR;
  if (km <= WALK_MAX_KM) {
    return { mode: "walk", minutes: Math.max(1, Math.round((road / 4.8) * 60)), km };
  }
  return { mode: "rail", minutes: Math.round(8 + (road / 35) * 60), km };
}

export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} mnt`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} j ${m} mnt` : `${h} j`;
}

/**
 * Points along a gentle arc between two stops (alternating sides), so the route reads as a drawn
 * line like the design instead of a ruler line. Pure geometry; steps include both end points.
 */
export function curveBetween(a: GeoPoint, b: GeoPoint, side: 1 | -1, steps = 24): GeoPoint[] {
  const dLat = b.lat - a.lat;
  const dLng = b.lng - a.lng;
  const bend = 0.18 * side;
  const control = {
    lat: (a.lat + b.lat) / 2 + dLng * bend,
    lng: (a.lng + b.lng) / 2 - dLat * bend,
  };
  const out: GeoPoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      lat: u * u * a.lat + 2 * u * t * control.lat + t * t * b.lat,
      lng: u * u * a.lng + 2 * u * t * control.lng + t * t * b.lng,
    });
  }
  return out;
}

/** One smooth line through a day's stops, bending to alternate sides leg by leg. */
export function curvedRoute(points: GeoPoint[]): GeoPoint[] {
  const line: GeoPoint[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const leg = curveBetween(points[i - 1]!, points[i]!, i % 2 ? 1 : -1);
    line.push(...(i === 1 ? leg : leg.slice(1)));
  }
  return line;
}

/* ------------------------------------------------------------ POI helper */

export type PoiCategoryId = "station" | "airport" | "food" | "attraction" | "hotel" | "shop";
export type PoiCategory = {
  id: PoiCategoryId;
  label: string;
  color: string;
  /** Lucide icon body (24x24 viewBox, stroke) drawn white on the colored badge. */
  icon: string;
  /** OpenMapTiles `poi.class` values. */
  classes: string[];
  minZoom: number;
  defaultOn: boolean;
};

export const POI_CATEGORIES: PoiCategory[] = [
  {
    id: "station",
    label: "Stasiun",
    color: "#2563eb",
    icon: '<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/>',
    classes: ["railway", "rail"],
    minZoom: 11,
    defaultOn: true,
  },
  {
    id: "airport",
    label: "Bandara",
    color: "#0891b2",
    icon: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    classes: ["airport"],
    minZoom: 8,
    defaultOn: true,
  },
  {
    id: "food",
    label: "Makan",
    color: "#ea580c",
    icon: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    classes: ["restaurant", "fast_food", "cafe", "bar", "bakery", "ice_cream"],
    minZoom: 14,
    defaultOn: true,
  },
  {
    id: "attraction",
    label: "Atraksi",
    color: "#16a34a",
    icon: '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
    classes: [
      "attraction",
      "museum",
      "zoo",
      "theatre",
      "art_gallery",
      "castle",
      "place_of_worship",
    ],
    minZoom: 13,
    defaultOn: true,
  },
  {
    id: "hotel",
    label: "Hotel",
    color: "#7c3aed",
    icon: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
    classes: ["lodging"],
    minZoom: 14,
    defaultOn: false,
  },
  {
    id: "shop",
    label: "Belanja",
    color: "#db2777",
    icon: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    classes: ["shop", "grocery", "department_store", "clothing_store"],
    minZoom: 14.5,
    defaultOn: false,
  },
];

export function poiCategory(id: string) {
  return POI_CATEGORIES.find((category) => category.id === id);
}

/* ------------------------------------------------------- schedule overlaps */

export type TimedActivity = {
  id?: string;
  title?: unknown;
  date: string;
  start: string | null | undefined;
  end?: string | null | undefined;
};

/** An activity with no end time is treated as this long when looking for overlaps. */
export const DEFAULT_ACTIVITY_MINUTES = 30;

function minutesOf(value: string) {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** [from, to) in minutes on a shared timeline; an end earlier than the start runs past midnight. */
export function activitySpan(a: TimedActivity): { from: number; to: number } | null {
  const start = a.start ? minutesOf(a.start) : null;
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(a.date);
  if (start === null || !day) return null;
  const dayNumber = Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])) / 86_400_000;
  const from = dayNumber * 1440 + start;
  const end = a.end ? minutesOf(a.end) : null;
  let to = from + DEFAULT_ACTIVITY_MINUTES;
  if (end !== null) to = dayNumber * 1440 + end + (end < start ? 1440 : 0);
  if (to <= from) to = from + 1;
  return { from, to };
}

export function findConflicts<T extends TimedActivity>(candidate: TimedActivity, others: T[]): T[] {
  const span = activitySpan(candidate);
  if (!span) return [];
  return others.filter((other) => {
    if (candidate.id && other.id === candidate.id) return false;
    const o = activitySpan(other);
    return Boolean(o && span.from < o.to && o.from < span.to);
  });
}

/** Ids of existing activities that overlap another one, to mark them in the list. */
export function conflictingIds<T extends TimedActivity & { id: string }>(items: T[]) {
  const ids = new Set<string>();
  for (const item of items) {
    if (findConflicts(item, items).length) ids.add(item.id);
  }
  return ids;
}

/** Sort key: date, start time, end time; activities without a time go last in their day. */
export function itinerarySortKey(item: {
  activity_date?: unknown;
  start_time?: unknown;
  end_time?: unknown;
}) {
  const hhmm = (value: unknown, fallback: string) =>
    typeof value === "string" && /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : fallback;
  return `${dateKey(item.activity_date)}T${hhmm(item.start_time, "99:99")}T${hhmm(item.end_time, "99:99")}`;
}
