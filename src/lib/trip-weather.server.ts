import { z } from "zod";
import { requireTripOwner } from "./guest-trips.server";
import { allowPlaceSearch, readItineraryMapConfig } from "./itinerary-map.server";
import { isValidLatLng } from "./itinerary-map";
import {
  groupWeatherPlaces,
  parseOpenMeteoDaily,
  type DayWeather,
  type WeatherPlace,
} from "./trip-weather";

/** Open-Meteo by default; point `WEATHER_API_URL` at a self-hosted or paid endpoint when needed. */
const WEATHER_API_URL = () =>
  process.env["WEATHER_API_URL"] || "https://api.open-meteo.com/v1/forecast";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const weatherSchema = z.object({
  places: z
    .array(
      z.object({
        date: dateSchema,
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      }),
    )
    .min(1)
    .max(16),
});
export const tripWeatherInput = (data: unknown) => weatherSchema.parse(data);

const cache = new Map<string, { at: number; value: DayWeather[] }>();
const TTL_MS = 30 * 60 * 1000;

async function forecast(lat: number, lng: number, dates: string[]): Promise<DayWeather[]> {
  const sorted = [...dates].sort();
  const key = `${lat.toFixed(1)},${lng.toFixed(1)}|${sorted[0]}|${sorted[sorted.length - 1]}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const url = new URL(WEATHER_API_URL());
  url.searchParams.set("latitude", lat.toFixed(2));
  url.searchParams.set("longitude", lng.toFixed(2));
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  );
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("start_date", sorted[0]!);
  url.searchParams.set("end_date", sorted[sorted.length - 1]!);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "DjiwaTravel/1.0 (https://djiwatravel.com)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`weather ${response.status}`);
  const value = parseOpenMeteoDaily(await response.json());
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.clear();
  return value;
}

export type TripWeatherResult =
  | { status: "ok"; days: DayWeather[] }
  | { status: "disabled" | "rate_limited" | "unavailable"; days: [] };

export async function tripWeatherHandler({
  data,
}: {
  data: ReturnType<typeof tripWeatherInput>;
}): Promise<TripWeatherResult> {
  const user = await requireTripOwner();
  const { config } = await readItineraryMapConfig();
  if (!config.weather) return { status: "disabled", days: [] };
  if (!allowPlaceSearch(`weather:${user.id}`)) return { status: "rate_limited", days: [] };
  const places = data.places.filter((place: WeatherPlace) => isValidLatLng(place.lat, place.lng));
  try {
    const groups = groupWeatherPlaces(places).slice(0, 4);
    const results = await Promise.all(
      groups.map(async (group) => {
        const rows = await forecast(group.lat, group.lng, group.dates);
        return rows.filter((row) => group.dates.includes(row.date));
      }),
    );
    const days = results.flat().sort((a, b) => a.date.localeCompare(b.date));
    return { status: "ok", days };
  } catch (error) {
    console.error("[trip-weather] failed", error instanceof Error ? error.message : error);
    return { status: "unavailable", days: [] };
  }
}
