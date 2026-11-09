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
  near: Point | null,
  fetcher: typeof fetch = fetch,
): Promise<VenueHit | null> {
  const key = `${near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : "-"}|${name.toLowerCase()}`;
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
      ...(near
        ? {
            bounded: "1",
            viewbox: `${near.lng - 0.45},${near.lat + 0.35},${near.lng + 0.45},${near.lat - 0.35}`,
          }
        : {}),
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
  // Hours that change by season or holiday are not turned into a guess.
  if (hours)
    return dayHours
      ? `Jam buka: ${dayHours} (OpenStreetMap)`
      : "Jam buka berubah menurut musim atau hari libur: cek jam buka";
  if (existing && /jam buka/i.test(existing)) return existing;
  return existing ? `${existing} · cek jam buka` : "cek jam buka";
}

/**
 * Fills `lat`/`lng`/`hours` and the note on the new places of an agenda proposal, in place. With
 * no city or point on the trip yet, the first place's area ("Tsukiji, Tokyo") is looked up to
 * decide where "near" is; every other place must then be within 60 km of it.
 */
export async function verifyAgendaPlaces(
  items: AgendaChange[],
  tripId: string,
  facts: Pick<TripFacts, "destination">,
  options: { budgetMs?: number; maxItems?: number; fetcher?: typeof fetch } = {},
) {
  let anchor = await tripAnchor(tripId);
  const deadline = Date.now() + (options.budgetMs ?? 22_000);
  const maxItems = options.maxItems ?? 10;
  let checked = 0;
  if (!anchor) {
    const first = items.find(
      (item) => item.op === "add" && (item.location || item.place || item.title),
    );
    if (first) {
      const area = await nominatimVenue(
        first.location || `${first.place || first.title}, ${facts.destination}`,
        null,
        options.fetcher,
      );
      if (area) anchor = { lat: area.lat, lng: area.lng };
    }
  }
  for (const item of items) {
    // New places, and changed ones whose name or area changed (their old point would be wrong).
    const changed = item.op === "update" && Boolean(item.title || item.place || item.location);
    if (!(item.op === "add" && item.title) && !changed) continue;
    const inTime = () => anchor && checked < maxItems && Date.now() < deadline;
    const found = inTime()
      ? await nominatimVenue(
          item.place || item.title || item.location || "",
          anchor,
          options.fetcher,
        )
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
      item.note = hoursNote(item.note, null, null);
      continue;
    }
    item.note = hoursNote(item.note, null, null);
    // Not found by name: the activity still belongs on the map, so it gets the point of its area
    // (or the city centre, nudged so pins do not stack), and the card says the point is approximate.
    if (anchor) {
      const area =
        item.location && inTime()
          ? await nominatimVenue(item.location, anchor, options.fetcher)
          : null;
      if (area && distanceKm(anchor, area) <= 60) {
        item.lat = area.lat;
        item.lng = area.lng;
      } else {
        const h = hash(`${item.title}|${item.date}|${item.startTime ?? ""}`);
        item.lat = anchor.lat + ((h % 17) - 8) * 0.0006;
        item.lng = anchor.lng + (((h >> 5) % 17) - 8) * 0.0006;
      }
      item.note = `${item.note} · titik perkiraan di peta`;
    }
  }
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Gives every activity that has no map point one: looked up by its title, else by its area, else
 * the city centre nudged so pins do not stack (approximate, and counted separately). Used after a
 * proposal is applied and by the "Pasang pin di peta" button. Returns how many pins were added.
 */
export async function pinMissingPlaces(
  tripId: string,
  options: { budgetMs?: number; fetcher?: typeof fetch } = {},
): Promise<{ pinned: number; approximate: number; remaining: number }> {
  const rows = await pool.query(
    `select id, title, location from public.travel_itinerary_items
     where trip_id=$1 and (latitude is null or longitude is null)
     order by activity_date, start_time nulls last limit 40`,
    [tripId],
  );
  if (!rows.rows.length) return { pinned: 0, approximate: 0, remaining: 0 };
  let anchor = await tripAnchor(tripId);
  const deadline = Date.now() + (options.budgetMs ?? 20_000);
  if (!anchor) {
    const first = rows.rows.find((r) => r.location || r.title);
    const hit = first
      ? await nominatimVenue(String(first.location || first.title), null, options.fetcher)
      : null;
    if (hit) anchor = { lat: hit.lat, lng: hit.lng };
  }
  if (!anchor) return { pinned: 0, approximate: 0, remaining: rows.rows.length };
  let pinned = 0;
  let approximate = 0;
  for (const row of rows.rows) {
    const title = String(row.title ?? "");
    const location = row.location ? String(row.location) : "";
    let point: Point | null = null;
    let label = location;
    let exact = false;
    if (Date.now() < deadline && title) {
      const hit = await nominatimVenue(title, anchor, options.fetcher);
      if (hit && distanceKm(anchor, hit) <= 60) {
        point = hit;
        label = label || hit.label;
        exact = true;
      }
    }
    if (!point && Date.now() < deadline && location) {
      const area = await nominatimVenue(location, anchor, options.fetcher);
      if (area && distanceKm(anchor, area) <= 60) point = area;
    }
    if (!point) {
      const h = hash(`${title}|${String(row.id)}`);
      point = {
        lat: anchor.lat + ((h % 17) - 8) * 0.0006,
        lng: anchor.lng + (((h >> 5) % 17) - 8) * 0.0006,
      };
    }
    await pool.query(
      `update public.travel_itinerary_items
       set latitude=$2, longitude=$3, place_label=coalesce(place_label, nullif($4,'')), updated_at=now()
       where id=$1 and trip_id=$5`,
      [row.id, point.lat, point.lng, label, tripId],
    );
    pinned += 1;
    if (!exact) approximate += 1;
  }
  return { pinned, approximate, remaining: 0 };
}
