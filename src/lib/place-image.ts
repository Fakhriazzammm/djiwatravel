/**
 * Place thumbnails. Pure helpers: a photo is only shown when it clearly belongs to the place, so a
 * wrong picture never appears next to someone's plan.
 */
export type WikiPage = {
  title: string;
  thumbnail?: { source?: string } | undefined;
  /** metres from the searched point */
  dist?: number | undefined;
};

const ALLOWED_IMAGE_HOST = "upload.wikimedia.org";

export function isAllowedImageUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === ALLOWED_IMAGE_HOST;
  } catch {
    return false;
  }
}

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function tokens(text: string) {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4);
}

/** Closest page with a photo whose title shares a word with the place name, or sits right on it. */
export function pickPlaceImage(pages: WikiPage[], names: string[]) {
  const wanted = new Set(names.flatMap(tokens));
  const withImage = pages
    .filter((page) => isAllowedImageUrl(page.thumbnail?.source))
    .sort((a, b) => (a.dist ?? 9999) - (b.dist ?? 9999));
  const matched = withImage.find((page) => tokens(page.title).some((word) => wanted.has(word)));
  if (matched) return { url: matched.thumbnail!.source!, title: matched.title };
  const onSpot = withImage[0];
  if (onSpot && (onSpot.dist ?? 9999) <= 40) {
    return { url: onSpot.thumbnail!.source!, title: onSpot.title };
  }
  return null;
}

const GENERIC = new Set([
  "house",
  "tokyo",
  "garden",
  "park",
  "hotel",
  "temple",
  "shrine",
  "museum",
  "restaurant",
  "cafe",
  "coffee",
  "tower",
  "station",
  "street",
  "market",
  "japan",
  "indonesia",
  "bali",
]);

/**
 * Photo found by name (no coordinates): the page or file title must contain the distinctive words
 * of the place, so "Nakajima Tea House" never gets a random house.
 */
export function pickNamedImage(pages: WikiPage[], name: string) {
  const wanted = tokens(name).filter((word) => !GENERIC.has(word));
  if (!wanted.length) return null;
  const need = Math.ceil(wanted.length / 2);
  const match = pages.find((page) => {
    if (!isAllowedImageUrl(page.thumbnail?.source)) return false;
    if (/\.(svg|png|gif|tiff?)$/i.test(page.title)) return false;
    const have = new Set(tokens(page.title));
    return wanted.filter((word) => have.has(word)).length >= need;
  });
  return match ? { url: match.thumbnail!.source!, title: match.title } : null;
}
