import {
  overpassQuery,
  parseWikipediaTag,
  pickCandidates,
  type Candidate,
  type OsmElement,
} from "./place-discovery";
import type { PlaceIdeaCategoryId } from "./place-ideas";
import { isAllowedImageUrl } from "./place-image";

const UA = { "User-Agent": "DjiwaTravel/1.0 (https://djiwatravel.com)" };
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

/** Places around the trip's city from OpenStreetMap, best known first. Free, no key. */
export async function discoverPlaces(
  anchor: { lat: number; lng: number },
  want: PlaceIdeaCategoryId,
  limit: number,
): Promise<Candidate[]> {
  const body = new URLSearchParams({ data: overpassQuery(anchor.lat, anchor.lng) });
  for (const endpoint of OVERPASS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { ...UA, "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(14_000),
      });
      if (!response.ok) continue;
      const json = (await response.json()) as { elements?: OsmElement[] };
      return pickCandidates(json.elements ?? [], want, limit);
    } catch {
      // Try the next mirror.
    }
  }
  // Overpass is a shared public service and is sometimes down. Wikipedia still knows the well-known
  // sights and parks around the point, with coordinates and photos.
  return want === "all" || want === "sight" || want === "nature"
    ? discoverFromWikipedia(anchor, want, limit)
    : [];
}

type GeoPage = {
  title: string;
  coordinates?: { lat: number; lon: number }[];
  thumbnail?: { source?: string };
  extract?: string;
};

const NATURE = /\b(park|garden|gardens|forest|beach|lake|mountain|river|island)\b/i;
const NOT_A_PLACE =
  /\b(station|line|ward|district|prefecture|city|airport|university|school|company)\b/i;

/** Well-known places near a point from Wikipedia's own geosearch (free, no key). */
export async function discoverFromWikipedia(
  anchor: { lat: number; lng: number },
  want: PlaceIdeaCategoryId,
  limit: number,
): Promise<Candidate[]> {
  try {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.search = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "geosearch",
      ggscoord: `${anchor.lat}|${anchor.lng}`,
      ggsradius: "9000",
      ggslimit: "40",
      prop: "coordinates|pageimages|extracts",
      piprop: "thumbnail",
      pithumbsize: "480",
      pilimit: "40",
      colimit: "40",
      exintro: "1",
      explaintext: "1",
      exsentences: "2",
      exlimit: "20",
    }).toString();
    const response = await fetch(url, { headers: UA, signal: AbortSignal.timeout(6000) });
    if (!response.ok) return [];
    const json = (await response.json()) as { query?: { pages?: Record<string, GeoPage> } };
    const out: Candidate[] = [];
    for (const page of Object.values(json.query?.pages ?? {})) {
      const c = page.coordinates?.[0];
      if (!c || !page.thumbnail?.source || NOT_A_PLACE.test(page.title)) continue;
      const category = NATURE.test(page.title) ? "nature" : "sight";
      if (want !== "all" && want !== category) continue;
      out.push({
        osmType: "node",
        osmId: 0,
        name: page.title.replace(/\s*\(.*\)$/, ""),
        category,
        lat: c.lat,
        lng: c.lon,
        score: 5,
        wikipedia: `en:${page.title}`,
        facts: page.extract ? [page.extract.slice(0, 300)] : [],
      });
    }
    return out.slice(0, limit);
  } catch {
    return [];
  }
}

export type PlaceFacts = {
  extract: string | null;
  imageUrl: string | null;
  pageUrl: string | null;
};

/** What Wikipedia says about a place that OpenStreetMap links to an article: text, photo, link. */
export async function wikipediaFacts(candidate: Candidate): Promise<PlaceFacts> {
  const ref = parseWikipediaTag(candidate.wikipedia);
  if (!ref) return { extract: null, imageUrl: null, pageUrl: null };
  try {
    const response = await fetch(
      `https://${ref.lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(ref.title.replace(/ /g, "_"))}`,
      { headers: UA, signal: AbortSignal.timeout(4000) },
    );
    if (!response.ok) return { extract: null, imageUrl: null, pageUrl: null };
    const json = (await response.json()) as {
      extract?: string;
      thumbnail?: { source?: string };
      content_urls?: { desktop?: { page?: string } };
    };
    const image = json.thumbnail?.source;
    return {
      extract: typeof json.extract === "string" ? json.extract.slice(0, 700) : null,
      imageUrl: isAllowedImageUrl(image) ? image : null,
      pageUrl: json.content_urls?.desktop?.page ?? null,
    };
  } catch {
    return { extract: null, imageUrl: null, pageUrl: null };
  }
}
