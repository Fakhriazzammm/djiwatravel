import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { buildSettingAudit } from "./admin-settings";
import { requireTripOwner } from "./guest-trips.server";
import {
  distinctiveQuery,
  isAllowedImageUrl,
  pickNamedImage,
  pickPlaceImage,
  type WikiPage,
} from "./place-image";
import {
  forwardSearchUrl,
  mapPlaceFeatures,
  reverseSearchUrl,
  type ForwardSearch,
  type HttpPlaceTarget,
  type PlaceSearchTarget,
} from "./place-search";
import { GEONAMES_ATTRIBUTION } from "./place-gazetteer";
import { placesNearCity } from "./trip-cities";
import { countGazetteerPlaces, gazetteerNearest, gazetteerSearch } from "./place-gazetteer.server";
import {
  DEFAULT_ITINERARY_MAP_CONFIG,
  ITINERARY_MAP_SETTING_KEY,
  normalizeItineraryMapConfig,
  parseItineraryMapConfig,
  type ItineraryMapConfig,
  type PlaceResult,
} from "./itinerary-map";

export type ItineraryMapConfigRecord = { config: ItineraryMapConfig; version: number };

/** Customer-safe read: a missing or unreadable setting keeps the map on with the default basemap. */
export async function readItineraryMapConfig(): Promise<ItineraryMapConfigRecord> {
  try {
    const result = await pool.query(
      "select value_json, version from public.admin_settings where setting_key = $1",
      [ITINERARY_MAP_SETTING_KEY],
    );
    const row = result.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    if (!row) return { config: DEFAULT_ITINERARY_MAP_CONFIG, version: 0 };
    return {
      config: normalizeItineraryMapConfig(row.value_json),
      version: Number(row.version) || 0,
    };
  } catch {
    return { config: DEFAULT_ITINERARY_MAP_CONFIG, version: 0 };
  }
}

export const getItineraryMapConfigHandler = async () => {
  await requireTripOwner();
  return (await readItineraryMapConfig()).config;
};

/* ------------------------------------------------------------ place search */

const searchSchema = z.object({
  query: z.string().trim().min(2).max(120),
  /** City centre the search is scoped to; results outside the city radius are dropped. */
  near: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .optional(),
});
export const searchPlacesInput = (data: unknown) => searchSchema.parse(data);

/**
 * Which geocoder answers place search, reverse lookup and the place-ideas map check, in this order:
 * MapTiler when `MAPTILER_API_KEY` is set (the key never leaves the server); a self-hosted Photon
 * when `PLACE_SEARCH_URL` is set; otherwise the offline GeoNames gazetteer, which needs no key and
 * answers towns and districts only. `PLACE_SEARCH_PROVIDER` (maptiler | photon | gazetteer) forces one.
 */
export function placeSearchTarget(env: NodeJS.ProcessEnv = process.env): PlaceSearchTarget | null {
  const key = (env["MAPTILER_API_KEY"] ?? "").trim();
  const photonUrl = (env["PLACE_SEARCH_URL"] ?? "").trim();
  const forced = (env["PLACE_SEARCH_PROVIDER"] ?? "").trim().toLowerCase();
  const provider: PlaceSearchTarget["provider"] =
    forced === "photon" || forced === "maptiler" || forced === "gazetteer"
      ? forced
      : key
        ? "maptiler"
        : photonUrl
          ? "photon"
          : "gazetteer";
  if (provider === "maptiler") return key ? { provider, key } : null;
  if (provider === "photon") return photonUrl ? { provider, baseUrl: photonUrl } : null;
  return { provider: "gazetteer" };
}

export type GeocodeOutcome =
  { ok: true; places: PlaceResult[]; attribution: string | null } | { ok: false; detail: string };

export type ReverseOutcome =
  { ok: true; place: PlaceResult | null } | { ok: false; detail: string };

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Forward search through the selected provider. Failures come back as `ok: false` with a short,
 * URL-free detail for the log, so a key in a request URL is never printed.
 */
export async function forwardGeocode(
  target: PlaceSearchTarget,
  search: ForwardSearch,
): Promise<GeocodeOutcome> {
  if (target.provider === "gazetteer") {
    try {
      const places = await gazetteerSearch(search.query, search.limit);
      return { ok: true, places, attribution: GEONAMES_ATTRIBUTION };
    } catch (error) {
      return { ok: false, detail: `gazetteer: ${errorText(error)}` };
    }
  }
  try {
    const response = await geocoderFetch(forwardSearchUrl(target, search));
    if (!response.ok) return { ok: false, detail: `HTTP ${response.status} ${target.provider}` };
    const places = mapPlaceFeatures(target.provider, await response.json());
    return { ok: true, places, attribution: null };
  } catch (error) {
    return { ok: false, detail: `${target.provider}: ${errorText(error)}` };
  }
}

/** Nearest named place to a point through the selected provider. Failures come back as `ok: false`. */
export async function reverseGeocode(
  target: PlaceSearchTarget,
  point: { lat: number; lng: number },
): Promise<ReverseOutcome> {
  if (target.provider === "gazetteer") {
    try {
      return { ok: true, place: await gazetteerNearest(point) };
    } catch (error) {
      return { ok: false, detail: `gazetteer: ${errorText(error)}` };
    }
  }
  try {
    const response = await geocoderFetch(reverseSearchUrl(target as HttpPlaceTarget, point, "en"));
    if (!response.ok) return { ok: false, detail: `HTTP ${response.status} ${target.provider}` };
    const [first] = mapPlaceFeatures(target.provider, await response.json());
    return { ok: true, place: first ?? null };
  } catch (error) {
    return { ok: false, detail: `${target.provider}: ${errorText(error)}` };
  }
}

/** One geocoder request with a short timeout. Callers log status codes, never the URL (it has a key). */
export function geocoderFetch(url: URL) {
  return fetch(url, {
    headers: {
      "User-Agent": "DjiwaTravel/1.0 (https://djiwatravel.com)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(4000),
  });
}

const SEARCH_WINDOW_MS = 60_000;
const SEARCH_MAX_PER_WINDOW = 20;
const searchHits = new Map<string, number[]>();

/** Small per-customer limiter so one account cannot burn the shared public geocoder. */
export function allowPlaceSearch(subject: string, now = Date.now()) {
  const recent = (searchHits.get(subject) ?? []).filter((t) => now - t < SEARCH_WINDOW_MS);
  if (recent.length >= SEARCH_MAX_PER_WINDOW) {
    searchHits.set(subject, recent);
    return false;
  }
  recent.push(now);
  searchHits.set(subject, recent);
  if (searchHits.size > 5000) {
    for (const [key, hits] of searchHits) {
      if (!hits.some((t) => now - t < SEARCH_WINDOW_MS)) searchHits.delete(key);
    }
  }
  return true;
}

export async function searchPlacesHandler({
  data,
}: {
  data: ReturnType<typeof searchPlacesInput>;
}) {
  const user = await requireTripOwner();
  const { config } = await readItineraryMapConfig();
  if (!config.enabled || !config.placeSearch)
    return { places: [] as PlaceResult[], status: "disabled" as const, attribution: null };
  if (!allowPlaceSearch(user.id))
    return { places: [] as PlaceResult[], status: "rate_limited" as const, attribution: null };
  const target = placeSearchTarget();
  if (!target) {
    console.error("[itinerary-map] place search has no provider configured");
    return { places: [] as PlaceResult[], status: "unavailable" as const, attribution: null };
  }
  const outcome = await forwardGeocode(target, {
    query: data.query,
    limit: data.near ? 20 : 8,
    lang: "en",
    autocomplete: true,
    ...(data.near ? { proximity: data.near } : {}),
  });
  if (!outcome.ok) {
    console.error("[itinerary-map] place search failed", outcome.detail);
    return { places: [] as PlaceResult[], status: "unavailable" as const, attribution: null };
  }
  return {
    places: data.near ? placesNearCity(outcome.places, data.near).slice(0, 8) : outcome.places,
    status: "ok" as const,
    attribution: outcome.attribution,
  };
}

/* ------------------------------------------------------------------ admin */

const saveSchema = z.object({
  config: z.unknown(),
  reason: z.string().trim().min(4).max(300),
  expectedVersion: z.number().int().min(0),
});

export type ItineraryMapStats = {
  totalItems: number;
  pinnedItems: number;
  tripsWithPins: number;
  tripsWithCities: number;
  totalTrips: number;
};

async function readStats(): Promise<ItineraryMapStats> {
  try {
    const result = await pool.query(
      `select count(*)::int as total,
              count(*) filter (where latitude is not null and longitude is not null)::int as pinned,
              count(distinct trip_id) filter (where latitude is not null and longitude is not null)::int as trips,
              (select count(distinct trip_id)::int from public.travel_trip_cities) as city_trips,
              (select count(*)::int from public.travel_trips) as all_trips
       from public.travel_itinerary_items`,
    );
    const row = result.rows[0] as
      | { total?: number; pinned?: number; trips?: number; city_trips?: number; all_trips?: number }
      | undefined;
    return {
      totalItems: Number(row?.total) || 0,
      pinnedItems: Number(row?.pinned) || 0,
      tripsWithPins: Number(row?.trips) || 0,
      tripsWithCities: Number(row?.city_trips) || 0,
      totalTrips: Number(row?.all_trips) || 0,
    };
  } catch {
    return { totalItems: 0, pinnedItems: 0, tripsWithPins: 0, tripsWithCities: 0, totalTrips: 0 };
  }
}

export const getAdminItineraryMapHandler = async () => {
  await requireAdmin();
  const [record, stats] = await Promise.all([readItineraryMapConfig(), readStats()]);
  // Provider name and whether search can answer. Keys and URLs are never returned.
  const target = placeSearchTarget();
  const gazetteerPlaces = target?.provider === "gazetteer" ? await countGazetteerPlaces() : null;
  const configured =
    target === null ? false : target.provider === "gazetteer" ? (gazetteerPlaces ?? 0) > 0 : true;
  const geocoder = { provider: target?.provider ?? null, configured, places: gazetteerPlaces };
  return { ...record, stats, geocoder };
};

export const saveItineraryMapConfigInput = (data: unknown) => saveSchema.parse(data);

export async function saveItineraryMapConfigHandler({
  data,
}: {
  data: ReturnType<typeof saveItineraryMapConfigInput>;
}) {
  await requireAdmin();
  const config = parseItineraryMapConfig(data.config);
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      "select value_json, version from public.admin_settings where setting_key = $1 for update",
      [ITINERARY_MAP_SETTING_KEY],
    );
    const row = current.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    const version = row ? Number(row.version) : 0;
    if (version !== data.expectedVersion) {
      await client.query("rollback");
      return { ok: false as const, conflict: true as const, version };
    }
    const audit = buildSettingAudit(
      ITINERARY_MAP_SETTING_KEY,
      row?.value_json ?? null,
      config,
      actor,
      data.reason,
    );
    await client.query(
      `insert into public.admin_settings (setting_key, value_json, version, updated_at)
       values ($1, $2::jsonb, 1, now())
       on conflict (setting_key) do update
       set value_json = excluded.value_json, version = admin_settings.version + 1, updated_at = now()`,
      [ITINERARY_MAP_SETTING_KEY, JSON.stringify(config)],
    );
    await client.query(
      `insert into public.admin_audit_logs
         (id, action, entity_type, entity_id, reason, before_json, after_json)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [
        randomUUID(),
        audit.action,
        audit.entityType,
        audit.entityId,
        `${actor}: ${audit.reason}`,
        JSON.stringify(audit.beforeJson),
        JSON.stringify(audit.afterJson),
      ],
    );
    await client.query("commit");
    return { ok: true as const, conflict: false as const, version: version + 1, config };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------- reverse geocode and photos */

const reverseSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export const reversePlaceInput = (data: unknown) => reverseSchema.parse(data);

/** Name for the traveler's own position, so "add here" has a readable location. */
export async function reversePlaceHandler({
  data,
}: {
  data: ReturnType<typeof reversePlaceInput>;
}) {
  const user = await requireTripOwner();
  const { config } = await readItineraryMapConfig();
  if (!config.enabled || !config.locateMe) return { place: null, status: "disabled" as const };
  if (!allowPlaceSearch(`rev:${user.id}`)) return { place: null, status: "rate_limited" as const };
  const target = placeSearchTarget();
  if (!target) return { place: null, status: "unavailable" as const };
  const outcome = await reverseGeocode(target, { lat: data.lat, lng: data.lng });
  if (!outcome.ok) {
    console.error("[itinerary-map] reverse lookup failed", outcome.detail);
    return { place: null, status: "unavailable" as const };
  }
  return {
    place: outcome.place ? { ...outcome.place, lat: data.lat, lng: data.lng } : null,
    status: "ok" as const,
  };
}

const imageCache = new Map<string, { at: number; value: { url: string; title: string } | null }>();
const IMAGE_TTL_MS = 24 * 60 * 60 * 1000;

export async function lookupPlaceImage(point: { lat: number; lng: number }, names: string[]) {
  const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}|${names.join("|").toLowerCase()}`;
  const hit = imageCache.get(key);
  if (hit && Date.now() - hit.at < IMAGE_TTL_MS) return hit.value;
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "geosearch",
    ggscoord: `${point.lat}|${point.lng}`,
    ggsradius: "250",
    ggslimit: "10",
    prop: "pageimages|coordinates",
    piprop: "thumbnail",
    pithumbsize: "480",
    pilimit: "10",
    colimit: "10",
  }).toString();
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "DjiwaTravel/1.0 (https://djiwatravel.com)" },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      query?: {
        pages?: Record<string, WikiPage & { coordinates?: { lat: number; lon: number }[] }>;
      };
    };
    const pages = Object.values(payload.query?.pages ?? {}).map((page) => {
      const c = page.coordinates?.[0];
      const dist = c ? distanceMeters(point, { lat: c.lat, lng: c.lon }) : undefined;
      return { title: page.title, thumbnail: page.thumbnail, dist };
    });
    const value = pickPlaceImage(pages, names);
    if (imageCache.size > 500) imageCache.clear();
    imageCache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}

const venueCache = new Map<string, { lat: number; lng: number; label: string } | null>();
let lastNominatim = 0;

/**
 * Free venue lookup on OpenStreetMap Nominatim (no key; one request per second at most), limited to
 * a box around the trip's destination so a same-named place elsewhere never matches. A name like
 * "Nakajima Tea House & Hamarikyu Gardens" is tried part by part.
 */
export async function lookupVenuePoint(
  name: string,
  near: { lat: number; lng: number },
): Promise<{ lat: number; lng: number; label: string } | null> {
  const key = `${near.lat.toFixed(2)},${near.lng.toFixed(2)}|${name.toLowerCase()}`;
  if (venueCache.has(key)) return venueCache.get(key) ?? null;
  const parts = [name, ...name.split(/\s*(?:&|\||\/|,| and | - )\s*/i)]
    .map((part) => part.trim())
    .filter((part, index, all) => part.length >= 3 && all.indexOf(part) === index);
  let found: { lat: number; lng: number; label: string } | null = null;
  for (const part of parts.slice(0, 2)) {
    const slot = Math.max(Date.now(), lastNominatim + 1100);
    lastNominatim = slot;
    if (slot > Date.now()) await new Promise((resolve) => setTimeout(resolve, slot - Date.now()));
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.search = new URLSearchParams({
        format: "jsonv2",
        limit: "1",
        "accept-language": "en",
        bounded: "1",
        viewbox: `${near.lng - 0.45},${near.lat + 0.35},${near.lng + 0.45},${near.lat - 0.35}`,
        q: part,
      }).toString();
      const response = await fetch(url, {
        headers: { "User-Agent": "DjiwaTravel/1.0 (https://djiwatravel.com)" },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) continue;
      const rows = (await response.json()) as { lat: string; lon: string; display_name?: string }[];
      const row = rows[0];
      if (row && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lon))) {
        found = {
          lat: Number(row.lat),
          lng: Number(row.lon),
          label: (row.display_name ?? part).split(",").slice(0, 2).join(",").trim(),
        };
        break;
      }
    } catch {
      // Try the next part.
    }
  }
  if (venueCache.size > 500) venueCache.clear();
  venueCache.set(key, found);
  return found;
}

type NamedPages = {
  query?: {
    pages?: Record<
      string,
      {
        title: string;
        thumbnail?: { source?: string };
        imageinfo?: { thumburl?: string }[];
      }
    >;
  };
};

async function searchImagePages(host: string, params: Record<string, string>) {
  const url = new URL(`https://${host}/w/api.php`);
  url.search = new URLSearchParams({ action: "query", format: "json", ...params }).toString();
  const response = await fetch(url, {
    headers: { "User-Agent": "DjiwaTravel/1.0 (https://djiwatravel.com)" },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as NamedPages;
  return Object.values(payload.query?.pages ?? {}).map((page) => ({
    title: page.title,
    thumbnail:
      page.thumbnail ??
      (page.imageinfo?.[0]?.thumburl ? { source: page.imageinfo[0].thumburl } : undefined),
  }));
}

/**
 * Free, keyless photo lookup by name: Wikipedia article image first, then Wikimedia Commons files.
 * Used when a place has no coordinates (or none matched nearby).
 */
export async function lookupPlaceImageByName(name: string, area?: string) {
  const key = `name|${name.toLowerCase()}|${(area ?? "").toLowerCase()}`;
  const hit = imageCache.get(key);
  if (hit && Date.now() - hit.at < IMAGE_TTL_MS) return hit.value;
  let value: { url: string; title: string } | null = null;
  try {
    const wiki = await searchImagePages("en.wikipedia.org", {
      generator: "search",
      gsrsearch: distinctiveQuery(name) || name,
      gsrlimit: "5",
      prop: "pageimages",
      piprop: "thumbnail",
      pithumbsize: "480",
      pilimit: "5",
    });
    value = pickNamedImage(wiki, name);
    if (!value) {
      const commons = await searchImagePages("commons.wikimedia.org", {
        generator: "search",
        gsrnamespace: "6",
        gsrsearch: distinctiveQuery(name) || name,
        gsrlimit: "6",
        prop: "imageinfo",
        iiprop: "url",
        iiurlwidth: "480",
      });
      value = pickNamedImage(commons, name);
    }
  } catch {
    value = null;
  }
  if (imageCache.size > 500) imageCache.clear();
  imageCache.set(key, { at: Date.now(), value });
  return value;
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const placeImageSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().trim().min(1).max(200),
});
export const placeImageInput = (data: unknown) => placeImageSchema.parse(data);

/** Photo for a place the traveler tapped on the map. Nothing is stored. */
export async function placeImageHandler({ data }: { data: ReturnType<typeof placeImageInput> }) {
  const user = await requireTripOwner();
  const { config } = await readItineraryMapConfig();
  if (!config.enabled || !config.placeImages) return { image: null };
  if (!allowPlaceSearch(`img:${user.id}`)) return { image: null };
  return { image: await lookupPlaceImage({ lat: data.lat, lng: data.lng }, [data.label]) };
}

const itemImageSchema = z.object({ itemId: z.string().uuid() });
export const itemImageInput = (data: unknown) => itemImageSchema.parse(data);

/** Looks up and stores the photo of one of the traveler's own activities, once. */
export async function resolveItemImageHandler({
  data,
}: {
  data: ReturnType<typeof itemImageInput>;
}) {
  const user = await requireTripOwner();
  const { config } = await readItineraryMapConfig();
  if (!config.enabled || !config.placeImages) return { url: null as string | null, checked: false };
  const row = (
    await pool.query(
      `select i.title, i.location, i.latitude, i.longitude, i.place_image_url, i.place_image_checked_at
       from public.travel_itinerary_items i join public.travel_trips t on t.id = i.trip_id
       where i.id = $1 and t.customer_auth_subject = $2`,
      [data.itemId, user.id],
    )
  ).rows[0] as
    | {
        title: string;
        location: string | null;
        latitude: number | null;
        longitude: number | null;
        place_image_url: string | null;
        place_image_checked_at: string | null;
      }
    | undefined;
  if (!row || row.latitude === null || row.longitude === null) return { url: null, checked: true };
  if (row.place_image_checked_at) {
    return {
      url: isAllowedImageUrl(row.place_image_url) ? row.place_image_url : null,
      checked: true,
    };
  }
  if (!allowPlaceSearch(`img:${user.id}`)) return { url: null, checked: false };
  const found = await lookupPlaceImage(
    { lat: row.latitude, lng: row.longitude },
    [row.location ?? "", row.title].filter(Boolean),
  );
  await pool.query(
    "update public.travel_itinerary_items set place_image_url = $2, place_image_checked_at = now() where id = $1",
    [data.itemId, found?.url ?? null],
  );
  return { url: found?.url ?? null, checked: true };
}
