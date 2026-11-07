import { pool } from "../db/client.server";
import type { PlaceResult } from "./itinerary-map";
import { escapeLikePattern, mapGazetteerRows, type GazetteerRow } from "./place-gazetteer";

// Prefix search on the name or the ASCII name. An exact match ranks first, then the bigger place,
// so "ueno" finds Ueno in Tokyo before Uenohara. The indexes come from migration 047.
const SEARCH_SQL = `
select p.name, p.country_code, p.latitude, p.longitude, a.name as admin1_name
from public.geo_places p
left join public.geo_admin1 a on a.code = p.country_code || '.' || p.admin1_code
where lower(p.name) like $1 escape '\\' or lower(p.ascii_name) like $1 escape '\\'
order by (lower(p.name) = $2 or lower(p.ascii_name) = $2) desc, p.population desc, p.name
limit $3`;

// Nearest populated place inside a window of about 30 km around the point. The window is a plain
// range on the latitude index; the distance is compared with a cosine correction for longitude.
const NEAREST_SQL = `
select p.name, p.country_code, p.latitude, p.longitude, a.name as admin1_name
from public.geo_places p
left join public.geo_admin1 a on a.code = p.country_code || '.' || p.admin1_code
where p.latitude between $1 and $2 and p.longitude between $3 and $4
order by ((p.latitude - $5) ^ 2 + ((p.longitude - $6) * cos(radians($5))) ^ 2) asc,
         p.population desc
limit 1`;

const NEAREST_WINDOW_DEGREES = 0.3;

/** True once scripts/import-geonames.mjs has loaded at least one place. */
export async function gazetteerLoaded() {
  const result = await pool.query("select exists (select 1 from public.geo_places) as loaded");
  return Boolean((result.rows[0] as { loaded?: boolean } | undefined)?.loaded);
}

/** Places whose name starts with the query. Throws when the gazetteer has not been loaded yet. */
export async function gazetteerSearch(query: string, limit: number): Promise<PlaceResult[]> {
  const needle = query.trim().toLowerCase();
  const result = await pool.query(SEARCH_SQL, [escapeLikePattern(needle) + "%", needle, limit]);
  const rows = result.rows as GazetteerRow[];
  if (rows.length === 0 && !(await gazetteerLoaded())) {
    throw new Error("gazetteer has no data; run scripts/import-geonames.mjs");
  }
  return mapGazetteerRows(rows);
}

/** The nearest town or district to a point, or null when none is within about 30 km. */
export async function gazetteerNearest(point: { lat: number; lng: number }) {
  const { lat, lng } = point;
  const w = NEAREST_WINDOW_DEGREES;
  const result = await pool.query(NEAREST_SQL, [lat - w, lat + w, lng - w, lng + w, lat, lng]);
  const rows = result.rows as GazetteerRow[];
  if (rows.length === 0 && !(await gazetteerLoaded())) {
    throw new Error("gazetteer has no data; run scripts/import-geonames.mjs");
  }
  return mapGazetteerRows(rows)[0] ?? null;
}

/** Number of loaded places, for the Admin status line. Zero when the table cannot be read. */
export async function countGazetteerPlaces() {
  try {
    const result = await pool.query("select count(*)::int as n from public.geo_places");
    return Number((result.rows[0] as { n?: unknown } | undefined)?.n) || 0;
  } catch {
    return 0;
  }
}
