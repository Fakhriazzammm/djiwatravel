import { isValidLatLng, type PlaceResult } from "./itinerary-map";

/**
 * Offline place gazetteer: towns and districts from GeoNames, loaded by scripts/import-geonames.mjs.
 * Pure helpers only. The database queries live in place-gazetteer.server.ts.
 */

/** Attribution GeoNames requires (CC BY 4.0). It is shown wherever its names are shown. */
export const GEONAMES_ATTRIBUTION = "Data kota: GeoNames (CC BY 4.0)";

/** Escapes LIKE wildcards so a typed "%" or "_" matches itself. */
export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export type GazetteerRow = {
  name: string;
  country_code: string;
  latitude?: number;
  longitude?: number;
  admin1_name: string | null;
};

const regionNames =
  typeof Intl !== "undefined" && Intl.DisplayNames
    ? new Intl.DisplayNames(["id-ID"], { type: "region" })
    : null;

/** Indonesian country name for an ISO code, falling back to the code itself. */
export function countryNameFor(code: string) {
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** "Tokyo, Jepang" for Ueno. A part that repeats the name is dropped, so Jakarta shows "Indonesia". */
export function gazetteerSubtitle(
  row: Pick<GazetteerRow, "name" | "country_code" | "admin1_name">,
) {
  const parts = [row.admin1_name ?? "", countryNameFor(row.country_code)]
    .map((part) => part.trim())
    .filter(Boolean);
  return parts
    .filter((part, i, all) => part !== row.name && all.indexOf(part) === i)
    .join(", ")
    .slice(0, 160);
}

/** Database rows as Agenda places. Rows without a valid point or a name are dropped. */
export function mapGazetteerRows(rows: GazetteerRow[]): PlaceResult[] {
  const results: PlaceResult[] = [];
  for (const row of rows) {
    const lat = row.latitude;
    const lng = row.longitude;
    if (!isValidLatLng(lat, lng)) continue;
    const label = row.name.trim().slice(0, 120);
    if (!label) continue;
    results.push({ label, subtitle: gazetteerSubtitle(row), lat, lng: lng as number });
  }
  return results;
}
