import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { buildSettingAudit } from "./admin-settings";
import { requireTripOwner } from "./guest-trips.server";
import { isAllowedImageUrl, pickPlaceImage, type WikiPage } from "./place-image";
import {
  DEFAULT_ITINERARY_MAP_CONFIG,
  ITINERARY_MAP_SETTING_KEY,
  isValidLatLng,
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

const searchSchema = z.object({ query: z.string().trim().min(2).max(120) });
export const searchPlacesInput = (data: unknown) => searchSchema.parse(data);

export const PLACE_SEARCH_URL = () =>
  process.env["PLACE_SEARCH_URL"] || "https://photon.komoot.io/api/";
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

type PhotonFeature = {
  geometry?: { coordinates?: unknown };
  properties?: Record<string, unknown>;
};

export function mapPhotonFeatures(payload: unknown): PlaceResult[] {
  const features = (payload as { features?: PhotonFeature[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const seen = new Set<string>();
  const results: PlaceResult[] = [];
  for (const feature of features) {
    const coords = feature.geometry?.coordinates;
    if (!Array.isArray(coords)) continue;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!isValidLatLng(lat, lng)) continue;
    const props = feature.properties ?? {};
    const str = (key: string) =>
      typeof props[key] === "string" ? (props[key] as string).trim() : "";
    const street = [str("street"), str("housenumber")].filter(Boolean).join(" ");
    const label = (str("name") || street || str("city")).slice(0, 120);
    if (!label) continue;
    const subtitle = [
      street && str("name") ? street : "",
      str("district"),
      str("city"),
      str("state"),
      str("country"),
    ]
      .filter((part, i, all) => part && part !== label && all.indexOf(part) === i)
      .join(", ")
      .slice(0, 160);
    const key = `${label}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ label, subtitle, lat, lng });
    if (results.length >= 6) break;
  }
  return results;
}

export async function searchPlacesHandler({
  data,
}: {
  data: ReturnType<typeof searchPlacesInput>;
}) {
  const user = await requireTripOwner();
  const { config } = await readItineraryMapConfig();
  if (!config.enabled || !config.placeSearch)
    return { places: [] as PlaceResult[], status: "disabled" as const };
  if (!allowPlaceSearch(user.id))
    return { places: [] as PlaceResult[], status: "rate_limited" as const };
  const url = new URL(PLACE_SEARCH_URL());
  url.searchParams.set("q", data.query);
  url.searchParams.set("limit", "8");
  url.searchParams.set("lang", "en");
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "DjiwaTravel/1.0 (https://djiwatravel.com)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return { places: [] as PlaceResult[], status: "unavailable" as const };
    return { places: mapPhotonFeatures(await response.json()), status: "ok" as const };
  } catch (error) {
    console.error(
      "[itinerary-map] place search failed",
      error instanceof Error ? error.message : error,
    );
    return { places: [] as PlaceResult[], status: "unavailable" as const };
  }
}

/* ------------------------------------------------------------------ admin */

const saveSchema = z.object({
  config: z.unknown(),
  reason: z.string().trim().min(4).max(300),
  expectedVersion: z.number().int().min(0),
});

export type ItineraryMapStats = { totalItems: number; pinnedItems: number; tripsWithPins: number };

async function readStats(): Promise<ItineraryMapStats> {
  try {
    const result = await pool.query(
      `select count(*)::int as total,
              count(*) filter (where latitude is not null and longitude is not null)::int as pinned,
              count(distinct trip_id) filter (where latitude is not null and longitude is not null)::int as trips
       from public.travel_itinerary_items`,
    );
    const row = result.rows[0] as { total?: number; pinned?: number; trips?: number } | undefined;
    return {
      totalItems: Number(row?.total) || 0,
      pinnedItems: Number(row?.pinned) || 0,
      tripsWithPins: Number(row?.trips) || 0,
    };
  } catch {
    return { totalItems: 0, pinnedItems: 0, tripsWithPins: 0 };
  }
}

export const getAdminItineraryMapHandler = async () => {
  await requireAdmin();
  const [record, stats] = await Promise.all([readItineraryMapConfig(), readStats()]);
  return { ...record, stats };
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
  const url = new URL(PLACE_SEARCH_URL().replace(/\/api\/?$/, "/reverse"));
  url.searchParams.set("lat", String(data.lat));
  url.searchParams.set("lon", String(data.lng));
  url.searchParams.set("lang", "en");
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "DjiwaTravel/1.0 (https://djiwatravel.com)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return { place: null, status: "unavailable" as const };
    const [first] = mapPhotonFeatures(await response.json());
    return {
      place: first ? { ...first, lat: data.lat, lng: data.lng } : null,
      status: "ok" as const,
    };
  } catch {
    return { place: null, status: "unavailable" as const };
  }
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
