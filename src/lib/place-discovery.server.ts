import { isAllowedImageUrl } from "./place-image";
import { isChain, titleMatchesName, type Candidate } from "./place-discovery";
import { poiAround } from "./place-tiles.server";
import type { PlaceIdeaCategoryId } from "./place-ideas";
import { distanceKm } from "./itinerary-map";

const UA = { "User-Agent": "DjiwaTravel/1.0 (https://djiwatravel.com)" };

export type PlaceFacts = {
  extract: string | null;
  imageUrl: string | null;
  pageUrl: string | null;
};

type SearchPage = {
  title: string;
  coordinates?: { lat: number; lon: number }[];
  thumbnail?: { source?: string };
  extract?: string;
  fullurl?: string;
};

/** The Wikipedia article about a map place: found by name, and it must sit near the place. */
export async function wikipediaFactsByName(candidate: Candidate): Promise<PlaceFacts | null> {
  try {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.search = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: candidate.name,
      gsrlimit: "3",
      prop: "coordinates|pageimages|extracts|info",
      inprop: "url",
      piprop: "thumbnail",
      pithumbsize: "480",
      pilimit: "3",
      colimit: "3",
      exintro: "1",
      explaintext: "1",
      exsentences: "2",
      exlimit: "3",
    }).toString();
    const response = await fetch(url, { headers: UA, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const json = (await response.json()) as { query?: { pages?: Record<string, SearchPage> } };
    for (const page of Object.values(json.query?.pages ?? {})) {
      const c = page.coordinates?.[0];
      if (!c || !titleMatchesName(page.title, candidate.name)) continue;
      if (distanceKm(candidate, { lat: c.lat, lng: c.lon }) > 2.5) continue;
      const image = page.thumbnail?.source;
      return {
        extract: page.extract ? page.extract.slice(0, 600) : null,
        imageUrl: isAllowedImageUrl(image) ? image : null,
        pageUrl: page.fullurl ?? null,
      };
    }
  } catch {
    // No article: the place is still shown from the map data.
  }
  return null;
}

export type Discovered = { candidate: Candidate; wiki: PlaceFacts | null };

/**
 * Places around the trip's city from the map tiles. Those with a matching Wikipedia article come
 * first (text, photo, source link); chains are dropped; the rest follow in map order.
 */
export async function discoverPlaces(
  anchor: { lat: number; lng: number },
  want: PlaceIdeaCategoryId,
  limit: number,
): Promise<Discovered[]> {
  const pool = (await poiAround(anchor, want, 60).catch(() => [])).filter((c) => !isChain(c.name));
  const checked = await Promise.all(
    pool.slice(0, 30).map(async (candidate) => ({
      candidate,
      wiki: await wikipediaFactsByName(candidate),
    })),
  );
  const withArticle = checked.filter((entry) => entry.wiki);
  const rest = [
    ...checked.filter((entry) => !entry.wiki),
    ...pool.slice(30).map((candidate) => ({ candidate, wiki: null })),
  ];
  // Kinds that rarely have articles (cafes, restaurants) fill the list from the map data.
  return [...withArticle, ...rest].slice(0, limit);
}
