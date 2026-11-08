import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import type { Candidate } from "./place-discovery";
import type { PlaceIdeaCategoryId } from "./place-ideas";

/**
 * Places from the same free map tiles the Agenda map draws (OpenFreeMap, OpenMapTiles "poi" layer).
 * That is why the ideas match the Stasiun / Makan / Atraksi markers: one source, no extra service.
 */
const TILEJSON = "https://tiles.openfreemap.org/planet";
const UA = { "User-Agent": "DjiwaTravel/1.0 (https://djiwatravel.com)" };
const ZOOM = 14;

let template: { url: string; at: number } | null = null;
async function tileTemplate() {
  if (template && Date.now() - template.at < 6 * 3600_000) return template.url;
  const response = await fetch(TILEJSON, { headers: UA, signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`tilejson ${response.status}`);
  const json = (await response.json()) as { tiles?: string[] };
  const url = json.tiles?.[0];
  if (!url) throw new Error("tilejson without tiles");
  template = { url, at: Date.now() };
  return url;
}

export function tileXY(lat: number, lng: number, z = ZOOM) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { x, y };
}

const CLASS_TO_CATEGORY: Record<string, Candidate["category"]> = {
  restaurant: "food",
  fast_food: "food",
  bar: "food",
  bakery: "cafe",
  cafe: "cafe",
  ice_cream: "cafe",
  attraction: "sight",
  museum: "sight",
  zoo: "sight",
  theatre: "sight",
  art_gallery: "sight",
  castle: "sight",
  place_of_worship: "sight",
  park: "nature",
  garden: "nature",
  shop: "shop",
  department_store: "shop",
  clothing_store: "shop",
};

const LATIN = /[A-Za-z]{3}/;

async function readTile(base: string, z: number, x: number, y: number): Promise<Candidate[]> {
  try {
    const response = await fetch(
      base.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)),
      { headers: UA, signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) return [];
    const tile = new VectorTile(new PbfReader(new Uint8Array(await response.arrayBuffer())));
    const layer = tile.layers["poi"];
    if (!layer) return [];
    const out: Candidate[] = [];
    for (let i = 0; i < layer.length; i += 1) {
      const feature = layer.feature(i);
      const props = feature.properties as Record<string, string | number | undefined>;
      const category = CLASS_TO_CATEGORY[String(props["class"] ?? "")];
      const name = [props["name:latin"], props["name_en"], props["name"]]
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .find((v) => LATIN.test(v));
      if (!category || !name) continue;
      const geo = feature.toGeoJSON(x, y, z).geometry;
      if (geo.type !== "Point") continue;
      const [lng, lat] = geo.coordinates as [number, number];
      const rank = Number(props["rank"]);
      out.push({
        osmType: "node",
        osmId: 0,
        name,
        category,
        lat,
        lng,
        // Lower OpenMapTiles rank = more prominent place.
        score: 100 - (Number.isFinite(rank) ? Math.min(rank, 99) : 50),
        wikipedia: null,
        facts: [String(props["subclass"] ?? props["class"] ?? "").replace(/_/g, " ")].filter(
          Boolean,
        ),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Places in the 3x3 tiles around a point (about 7 km square), best-ranked first, deduped by name. */
export async function poiAround(
  anchor: { lat: number; lng: number },
  want: PlaceIdeaCategoryId,
  limit: number,
): Promise<Candidate[]> {
  const base = await tileTemplate();
  const { x, y } = tileXY(anchor.lat, anchor.lng);
  const reads: Promise<Candidate[]>[] = [];
  for (let dx = -1; dx <= 1; dx += 1)
    for (let dy = -1; dy <= 1; dy += 1) reads.push(readTile(base, ZOOM, x + dx, y + dy));
  const all = (await Promise.all(reads)).flat();
  const seen = new Set<string>();
  const unique = all
    .filter((c) => (want === "all" ? true : c.category === want))
    .sort((a, b) => b.score - a.score)
    .filter((c) => {
      const key = c.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (want !== "all") return unique.slice(0, limit);
  // A mixed list takes turns between kinds so it is not all temples.
  const order: Candidate["category"][] = ["sight", "food", "nature", "cafe", "sight", "shop"];
  const buckets = new Map<string, Candidate[]>();
  for (const c of unique) buckets.set(c.category, [...(buckets.get(c.category) ?? []), c]);
  const picked: Candidate[] = [];
  for (let round = 0; picked.length < limit && round < limit * 3; round += 1) {
    const next = buckets.get(order[round % order.length]!)?.shift();
    if (next) picked.push(next);
  }
  return picked;
}
