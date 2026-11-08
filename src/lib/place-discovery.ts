/**
 * Ide tempat from the map. Pure helpers: the candidate shape, chain filtering, and the match
 * between a map place and a Wikipedia article. Places come from the same map tiles as the Agenda
 * map markers (see place-tiles.server.ts), so every idea already has coordinates.
 */
import type { PlaceIdeaCategoryId } from "./place-ideas";

export type Candidate = {
  osmType: string;
  osmId: number;
  name: string;
  category: Exclude<PlaceIdeaCategoryId, "all">;
  lat: number;
  lng: number;
  score: number;
  /** `lang:Title` of a Wikipedia article, when one is known. */
  wikipedia: string | null;
  /** Short facts from the map data, used when no article exists. */
  facts: string[];
};

const CHAINS =
  /\b(mcdonald'?s|starbucks|kfc|burger king|subway|lawson|7-?eleven|familymart|family mart|doutor|tully'?s|yoshinoya|sukiya|matsuya|mos burger|domino'?s|pizza hut|saizeriya|gusto|jonathan'?s|denny'?s|coco'?s|ministop|daiso|uniqlo|muji|donki|don quijote|stamp|datum|toilet|parking|vending|salon|clinic|hall)\b/i;

/** Big chains are not "ideas": drop them so the list shows places worth a trip. */
export const isChain = (name: string) => CHAINS.test(name);

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const words = (text: string) =>
  fold(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4);

/** A Wikipedia title belongs to the place when they share a distinctive word. */
export function titleMatchesName(title: string, name: string) {
  const have = new Set(words(title));
  return words(name).some((word) => have.has(word));
}

export function parseWikipediaTag(tag: string | null) {
  const match = tag?.match(/^([a-z-]{2,10}):(.+)$/i);
  return match ? { lang: match[1]!.toLowerCase(), title: match[2]!.trim() } : null;
}

export const osmUrl = (c: Pick<Candidate, "lat" | "lng">) =>
  `https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=18/${c.lat}/${c.lng}`;
