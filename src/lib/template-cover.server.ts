import { isAllowedImageUrl } from "./place-image";

/**
 * Cover photo for a template that has no photo of its own: the lead image of the most specific
 * Wikipedia page we can name (the city the plan spends most time in, then the country). Only
 * wikimedia hosts are accepted, so a cover never points at an arbitrary site.
 */

const cache = new Map<string, { at: number; url: string | null }>();
const TTL_MS = 24 * 60 * 60 * 1000;

/** The city most activities share: the last part of "Shibuya, Tokyo". */
export function dominantCity(locations: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  for (const raw of locations) {
    const last = String(raw ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .at(-1);
    if (last && last.length <= 40) counts.set(last, (counts.get(last) ?? 0) + 1);
  }
  let best: string | null = null;
  let top = 0;
  for (const [name, n] of counts)
    if (n > top) {
      best = name;
      top = n;
    }
  return best;
}

export function englishCountryName(code: string): string | null {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? null;
  } catch {
    return null;
  }
}

async function leadImage(title: string): Promise<string | null> {
  const key = title.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.url;
  let found: string | null = null;
  try {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.search = new URLSearchParams({
      action: "query",
      format: "json",
      titles: title,
      redirects: "1",
      prop: "pageimages",
      piprop: "thumbnail",
      pithumbsize: "900",
    }).toString();
    const response = await fetch(url, {
      headers: { "User-Agent": "DjiwaTravel/1.0 (https://djiwatravel.com)" },
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) {
      const payload = (await response.json()) as {
        query?: { pages?: Record<string, { thumbnail?: { source?: string } }> };
      };
      const source = Object.values(payload.query?.pages ?? {})[0]?.thumbnail?.source;
      // Flags, maps and logos are SVG/PNG; a travel cover should be a photograph.
      if (isAllowedImageUrl(source) && /\.(jpe?g|webp)(\?|$)/i.test(source)) found = source;
    }
  } catch {
    found = null;
  }
  if (cache.size > 300) cache.clear();
  cache.set(key, { at: Date.now(), url: found });
  return found;
}

export async function resolveTemplateCover(input: {
  destinationCode: string;
  destinationName: string;
  locations: (string | null | undefined)[];
}): Promise<string | null> {
  const country = englishCountryName(input.destinationCode);
  const city = dominantCity(input.locations);
  const candidates = [
    city && country ? `${city}` : null,
    country ? `Tourism in ${country}` : null,
    country,
    input.destinationName,
  ].filter((value): value is string => Boolean(value));
  for (const title of candidates) {
    const url = await leadImage(title);
    if (url) return url;
  }
  return null;
}
