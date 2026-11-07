import { z } from "zod";
import { distanceKm, isValidLatLng, POI_CATEGORIES, type PlaceResult } from "./itinerary-map";
import type { CountryBounds } from "./trip-country-bounds";

/**
 * Cities of a trip. Pure helpers shared by the server and the UI: the shape a trip stores, the
 * popular cities offered per country, the map box around the chosen cities, and the radius that
 * scopes place search to one city.
 */

export type TripCity = { name: string; lat: number; lng: number };

export const MAX_TRIP_CITIES = 12;

/** A place search scoped to a city keeps results within this distance of the city centre. */
export const CITY_SEARCH_RADIUS_KM = 60;

export const tripCitiesSchema = z.object({
  tripId: z.string().uuid(),
  cities: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      }),
    )
    .max(MAX_TRIP_CITIES),
});

/** Popular cities offered as chips. Other countries use the search box (GeoNames/Photon). */
export const POPULAR_CITIES: Readonly<Record<string, readonly TripCity[]>> = {
  JP: [
    { name: "Tokyo", lat: 35.6762, lng: 139.6503 },
    { name: "Osaka", lat: 34.6937, lng: 135.5023 },
    { name: "Kyoto", lat: 35.0116, lng: 135.7681 },
    { name: "Sapporo", lat: 43.0618, lng: 141.3545 },
    { name: "Fukuoka", lat: 33.5904, lng: 130.4017 },
    { name: "Nara", lat: 34.6851, lng: 135.8048 },
    { name: "Hiroshima", lat: 34.3853, lng: 132.4553 },
    { name: "Nagoya", lat: 35.1815, lng: 136.9066 },
    { name: "Okinawa (Naha)", lat: 26.2124, lng: 127.6809 },
    { name: "Yokohama", lat: 35.4437, lng: 139.638 },
    { name: "Kobe", lat: 34.6901, lng: 135.1956 },
    { name: "Hakone", lat: 35.2324, lng: 139.1069 },
  ],
  KR: [
    { name: "Seoul", lat: 37.5665, lng: 126.978 },
    { name: "Busan", lat: 35.1796, lng: 129.0756 },
    { name: "Jeju", lat: 33.4996, lng: 126.5312 },
    { name: "Incheon", lat: 37.4563, lng: 126.7052 },
  ],
  SG: [{ name: "Singapura", lat: 1.3521, lng: 103.8198 }],
  MY: [
    { name: "Kuala Lumpur", lat: 3.139, lng: 101.6869 },
    { name: "Penang", lat: 5.4141, lng: 100.3288 },
    { name: "Langkawi", lat: 6.35, lng: 99.8 },
  ],
  TH: [
    { name: "Bangkok", lat: 13.7563, lng: 100.5018 },
    { name: "Phuket", lat: 7.8804, lng: 98.3923 },
    { name: "Chiang Mai", lat: 18.7883, lng: 98.9853 },
    { name: "Pattaya", lat: 12.9236, lng: 100.8825 },
  ],
};

export function popularCitiesFor(countryCode: string | null | undefined): readonly TripCity[] {
  return POPULAR_CITIES[String(countryCode ?? "").toUpperCase()] ?? [];
}

/** Map box around the cities with a margin so a single city still shows its surroundings. */
export function citiesBounds(cities: readonly TripCity[]): CountryBounds | null {
  const valid = cities.filter((c) => isValidLatLng(c.lat, c.lng));
  if (!valid.length) return null;
  const margin = 0.35;
  const lats = valid.map((c) => c.lat);
  const lngs = valid.map((c) => c.lng);
  return [
    Math.min(...lngs) - margin,
    Math.min(...lats) - margin,
    Math.max(...lngs) + margin,
    Math.max(...lats) + margin,
  ];
}

/** Keeps places within the city radius, nearest first. */
export function placesNearCity(
  places: PlaceResult[],
  city: { lat: number; lng: number },
  radiusKm = CITY_SEARCH_RADIUS_KM,
): PlaceResult[] {
  return places
    .map((place) => ({ place, km: distanceKm(city, { lat: place.lat, lng: place.lng }) }))
    .filter((entry) => entry.km <= radiusKm)
    .sort((a, b) => a.km - b.km)
    .map((entry) => entry.place);
}

/** Activity category (form select value) guessed from a place's subtitle label ("Restoran · ..."). */
export function guessActivityCategory(subtitle: string | undefined): string {
  const label = (subtitle ?? "").split("·")[0]?.trim().toLowerCase() ?? "";
  if (!label) return "";
  const found = POI_CATEGORIES.find((c) => c.label.toLowerCase() === label);
  if (found?.id === "food") return "food";
  if (found?.id === "attraction") return "attraction";
  if (found?.id === "station" || found?.id === "airport") return "transport";
  if (/restoran|kafe|cafe|makan|bar\b/.test(label)) return "food";
  if (/hotel|penginapan/.test(label)) return "hotel";
  if (/stasiun|bandara|halte/.test(label)) return "transport";
  return "";
}

/** Default activity title for a picked place. */
export function titleForPlace(label: string, category: string): string {
  const short = label.trim();
  if (category === "food") return `Makan di ${short}`;
  if (category === "hotel") return `Check-in ${short}`;
  return short;
}
