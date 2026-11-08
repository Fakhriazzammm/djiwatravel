/**
 * Ide tempat from the map. Pure helpers: build the OpenStreetMap (Overpass) query around the trip's
 * city, sort what comes back by how well known each place is, and map OSM tags to our categories.
 * Every place found this way already has coordinates, so it can always be pinned on the Agenda.
 */
import type { PlaceIdeaCategoryId } from "./place-ideas";

export type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type Candidate = {
  osmType: string;
  osmId: number;
  name: string;
  category: Exclude<PlaceIdeaCategoryId, "all">;
  lat: number;
  lng: number;
  score: number;
  /** `lang:Title` of the Wikipedia article, when OSM links one. */
  wikipedia: string | null;
  /** Short facts from the OSM tags, used when no article exists. */
  facts: string[];
};

const SIGHT = "attraction|museum|gallery|viewpoint|theme_park|zoo|aquarium|artwork";

/** One query for every kind; results are sorted into categories locally. */
export function overpassQuery(lat: number, lng: number, radiusM = 7000) {
  const around = `(around:${radiusM},${lat.toFixed(5)},${lng.toFixed(5)})`;
  const known = `[name][~"^(wikidata|wikipedia)$"~"."]`;
  const named = `[name]["name:en"]`;
  return `[out:json][timeout:25];(
nwr[tourism~"^(${SIGHT})$"]${known}${around};
nwr[historic~"^(castle|monument|memorial|ruins)$"]${known}${around};
nwr[amenity="place_of_worship"]${known}${around};
nwr[leisure~"^(park|garden|nature_reserve)$"]${known}${around};
nwr[natural~"^(beach|peak|waterfall)$"]${known}${around};
nwr[shop~"^(mall|department_store)$"]${known}${around};
nwr[amenity="marketplace"]${known}${around};
nwr[amenity~"^(restaurant|cafe)$"]${named}${around};
);out center tags 400;`;
}

export function classify(tags: Record<string, string>): Candidate["category"] | null {
  if (tags["amenity"] === "cafe") return "cafe";
  if (tags["amenity"] === "restaurant") return "food";
  if (
    tags["shop"] === "mall" ||
    tags["shop"] === "department_store" ||
    tags["amenity"] === "marketplace"
  )
    return "shop";
  if (/^(park|garden|nature_reserve)$/.test(tags["leisure"] ?? "")) return "nature";
  if (/^(beach|peak|waterfall)$/.test(tags["natural"] ?? "")) return "nature";
  if (tags["tourism"] || tags["historic"] || tags["amenity"] === "place_of_worship") return "sight";
  return null;
}

const LATIN = /[A-Za-z]{3}/;

export function displayName(tags: Record<string, string>) {
  const en = tags["name:en"];
  if (en && LATIN.test(en)) return en.trim();
  const name = tags["name"];
  if (name && LATIN.test(name)) return name.trim();
  return null;
}

export function scoreTags(tags: Record<string, string>) {
  let score = 0;
  if (tags["wikipedia"]) score += 4;
  if (tags["wikidata"]) score += 3;
  if (tags["website"] || tags["contact:website"]) score += 1.5;
  if (tags["name:en"]) score += 1;
  if (tags["opening_hours"]) score += 0.5;
  if (tags["cuisine"]) score += 0.5;
  score += Math.min(Object.keys(tags).length, 30) / 30;
  return score;
}

const FACT_LABELS: [string, string][] = [
  ["cuisine", "Masakan"],
  ["opening_hours", "Jam buka"],
  ["tourism", "Jenis"],
  ["historic", "Jenis"],
  ["leisure", "Jenis"],
  ["religion", "Agama"],
];

function factsOf(tags: Record<string, string>) {
  const out: string[] = [];
  for (const [key, label] of FACT_LABELS) {
    const value = tags[key];
    if (value && out.length < 4) out.push(`${label}: ${value.replace(/_/g, " ")}`);
  }
  return out;
}

/** Best-known places first, a few per kind when "all" is asked, deduped by name. */
export function pickCandidates(
  elements: OsmElement[],
  want: PlaceIdeaCategoryId,
  limit: number,
): Candidate[] {
  const seen = new Set<string>();
  const all: Candidate[] = [];
  for (const el of elements) {
    const tags = el.tags;
    if (!tags) continue;
    const category = classify(tags);
    const name = displayName(tags);
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!category || !name || lat === undefined || lng === undefined) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    all.push({
      osmType: el.type,
      osmId: el.id,
      name,
      category,
      lat,
      lng,
      score: scoreTags(tags),
      wikipedia: tags["wikipedia"] ?? null,
      facts: factsOf(tags),
    });
  }
  all.sort((a, b) => b.score - a.score);
  if (want !== "all") return all.filter((c) => c.category === want).slice(0, limit);
  // A mixed list: take turns between kinds so it is not all temples.
  const order: Candidate["category"][] = ["sight", "food", "nature", "cafe", "sight", "shop"];
  const buckets = new Map<string, Candidate[]>();
  for (const c of all) buckets.set(c.category, [...(buckets.get(c.category) ?? []), c]);
  const picked: Candidate[] = [];
  for (let round = 0; picked.length < limit && round < limit * 2; round += 1) {
    const next = buckets.get(order[round % order.length]!)?.shift();
    if (next) picked.push(next);
  }
  return picked;
}

export function parseWikipediaTag(tag: string | null) {
  const match = tag?.match(/^([a-z-]{2,10}):(.+)$/i);
  return match ? { lang: match[1]!.toLowerCase(), title: match[2]!.trim() } : null;
}

export const osmUrl = (c: Pick<Candidate, "osmType" | "osmId">) =>
  `https://www.openstreetmap.org/${c.osmType}/${c.osmId}`;
