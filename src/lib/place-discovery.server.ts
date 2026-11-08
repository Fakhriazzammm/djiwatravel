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
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) continue;
      const json = (await response.json()) as { elements?: OsmElement[] };
      return pickCandidates(json.elements ?? [], want, limit);
    } catch {
      // Try the next mirror.
    }
  }
  return [];
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
