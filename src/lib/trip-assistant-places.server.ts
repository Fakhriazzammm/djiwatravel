import { pool } from "../db/client.server";
import { distanceKm } from "./itinerary-map";
import { hoursForDay, isOpenAt, weekdayIndex } from "./opening-hours";
import type { AgendaChange, TripFacts } from "./trip-assistant";

/**
 * Checks the places the AI proposes against OpenStreetMap through Nominatim: is the place on the
 * map near the trip's cities (it gets a point, so the Agenda pin appears) and what are its
 * `opening_hours` for that day. Coverage is partial by nature: no data means the card keeps the
 * note "cek jam buka"; nothing is invented. Nominatim's policy is one request a second with a
 * real User-Agent, so the lookups run one after another under a time budget.
 */

type Point = { lat: number; lng: number };
export type VenueHit = { lat: number; lng: number; label: string; hours: string | null };

let lastRequest = 0;
const cache = new Map<string, VenueHit | null>();

export async function nominatimVenue(
  name: string,
  near: Point,
  fetcher: typeof fetch = fetch,
): Promise<VenueHit | null> {
  const key = `${near.lat.toFixed(2)},${near.lng.toFixed(2)}|${name.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const slot = Math.max(Date.now(), lastRequest + 1100);
  lastRequest = slot;
  if (slot > Date.now()) await new Promise((resolve) => setTimeout(resolve, slot - Date.now()));
  let hit: VenueHit | null = null;
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({
      format: "jsonv2",
      limit: "1",
      extratags: "1",
      "accept-language": "en",
      bounded: "1",
      viewbox: `${near.lng - 0.45},${near.lat + 0.35},${near.lng + 0.45},${near.lat - 0.35}`,
      q: name,
    }).toString();
    const response = await fetcher(url, {
      headers: { "User-Agent": "DjiwaTravel/1.0 (https://djiwatravel.com)" },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const rows = (await response.json()) as {
        lat: string;
        lon: string;
        display_name?: string;
        extratags?: Record<string, string>;
      }[];
      const row = rows[0];
      if (row && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lon))) {
        hit = {
          lat: Number(row.lat),
          lng: Number(row.lon),
          label: (row.display_name ?? name).split(",").slice(0, 2).join(",").trim(),
          hours: row.extratags?.["opening_hours"]?.trim() || null,
        };
      }
    }
  } catch {
    hit = null;
  }
  cache.set(key, hit);
  if (cache.size > 500) cache.clear();
  return hit;
}

/** The trip's first city, else the middle of the activities that already have a point. */
export async function tripAnchor(tripId: string): Promise<Point | null> {
  const city = await pool.query(
    "select latitude, longitude from public.travel_trip_cities where trip_id=$1 order by sort_order, created_at limit 1",
    [tripId],
  );
  if (city.rows[0])
    return { lat: Number(city.rows[0].latitude), lng: Number(city.rows[0].longitude) };
  const items = await pool.query(
    "select avg(latitude)::float as lat, avg(longitude)::float as lng from public.travel_itinerary_items where trip_id=$1 and latitude is not null and longitude is not null",
    [tripId],
  );
  const row = items.rows[0];
  return row && row.lat != null && row.lng != null
    ? { lat: Number(row.lat), lng: Number(row.lng) }
    : null;
}

const minutesOf = (hhmm: string | null) => {
  const m = hhmm?.match(/^(\d{2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** The note a card shows once the hours are known (or the honest "cek jam buka" when not). */
export function hoursNote(
  existing: string | null,
  hours: AgendaChange["hours"],
  dayHours: string | null,
): string | null {
  if (hours && hours.open === true && dayHours) return `Buka ${dayHours} (OpenStreetMap)`;
  if (hours && hours.open === false && dayHours)
    return `Mungkin tutup di jam ini: buka ${dayHours} (OpenStreetMap)`;
  if (hours) return `Jam buka: ${hours.raw.slice(0, 60)} (OpenStreetMap)`;
  if (existing && /jam buka/i.test(existing)) return existing;
  return existing ? `${existing} · cek jam buka` : "cek jam buka";
}

/** Fills `lat`/`lng`/`hours` and the note on the new places of an agenda proposal, in place. */
export async function verifyAgendaPlaces(
  items: AgendaChange[],
  tripId: string,
  _facts: Pick<TripFacts, "destination">,
  options: { budgetMs?: number; maxItems?: number; fetcher?: typeof fetch } = {},
) {
  const anchor = await tripAnchor(tripId);
  const deadline = Date.now() + (options.budgetMs ?? 14_000);
  let checked = 0;
  for (const item of items) {
    if (item.op !== "add" || !item.title) continue;
    const found =
      anchor && checked < (options.maxItems ?? 6) && Date.now() < deadline
        ? await nominatimVenue(item.title, anchor, options.fetcher)
        : null;
    checked += 1;
    if (found && anchor && distanceKm(anchor, found) <= 60) {
      item.lat = found.lat;
      item.lng = found.lng;
      item.location = item.location ?? found.label;
      if (found.hours) {
        const weekday = weekdayIndex(item.date);
        const start = minutesOf(item.startTime);
        const open =
          weekday !== null && start !== null ? isOpenAt(found.hours, weekday, start) : null;
        item.hours = { raw: found.hours, open };
        item.note = hoursNote(
          item.note,
          item.hours,
          weekday !== null ? hoursForDay(found.hours, weekday) : null,
        );
        continue;
      }
    }
    item.note = hoursNote(item.note, null, null);
  }
}
