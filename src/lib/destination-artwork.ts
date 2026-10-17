import cn from "@/assets/dest-cn.png";
import jp from "@/assets/dest-jp.jpg";
import kr from "@/assets/dest-kr.jpg";
import sa from "@/assets/dest-sa.png";
import sg from "@/assets/dest-sg.jpg";
import th from "@/assets/dest-th.jpg";

/**
 * Destination artwork.
 *
 * Only a few destinations ship a photo. Every tile therefore renders the same structure and size;
 * a destination without artwork falls back to a styled flag tile that reads as intentional rather
 * than as a missing image. Adding a photo is a one-line change here — nothing in the UI branches on
 * the destination code.
 */
export const DESTINATION_PHOTOS: Record<string, string> = {
  CN: cn,
  JP: jp,
  KR: kr,
  SA: sa,
  SG: sg,
  TH: th,
};

export function destinationPhoto(code: string): string | undefined {
  return DESTINATION_PHOTOS[code.toUpperCase()];
}

/** Codes that have a social share image on disk (see `public/og`). */
export const DESTINATION_OG_CODES = new Set(["jp", "kr", "sg", "th"]);

export function destinationOgImage(code: string, baseUrl: string): string {
  const normalized = code.trim().toLowerCase();
  return DESTINATION_OG_CODES.has(normalized)
    ? `${baseUrl}/og/${normalized}.jpg`
    : `${baseUrl}/icon-512.png`;
}
