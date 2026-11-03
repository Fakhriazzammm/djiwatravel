/**
 * Weather for the Ringkas page. Pure helpers shared by the page, the server proxy and tests: which
 * place stands for each day, the forecast window, and WMO weather codes in Indonesian.
 */
import { itemPoint, type GeoPoint } from "./itinerary-map";

/** Open-Meteo forecasts up to 16 days ahead (today included). */
export const WEATHER_WINDOW_DAYS = 16;

export type WeatherPlace = { date: string; lat: number; lng: number };

export type DayWeather = {
  date: string;
  code: number;
  tempMax: number;
  tempMin: number;
  /** Chance of rain, 0-100, when the provider has it. */
  rainPercent: number | null;
};

export type WeatherKind =
  "sun" | "partly" | "cloud" | "fog" | "drizzle" | "rain" | "storm" | "snow";

/** WMO weather interpretation codes: https://open-meteo.com/en/docs */
export function describeWeather(code: number): { kind: WeatherKind; label: string } {
  if (code === 0) return { kind: "sun", label: "Cerah" };
  if (code === 1 || code === 2) return { kind: "partly", label: "Cerah berawan" };
  if (code === 3) return { kind: "cloud", label: "Berawan" };
  if (code === 45 || code === 48) return { kind: "fog", label: "Berkabut" };
  if (code >= 51 && code <= 57) return { kind: "drizzle", label: "Gerimis" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return { kind: "rain", label: code >= 80 ? "Hujan lokal" : "Hujan" };
  if (code >= 71 && code <= 77) return { kind: "snow", label: "Salju" };
  if (code === 85 || code === 86) return { kind: "snow", label: "Salju" };
  if (code >= 95) return { kind: "storm", label: "Badai petir" };
  return { kind: "cloud", label: "Berawan" };
}

type DayWithItems<T> = { date: string; items: T[] };

/**
 * One place per day: the first activity with a map point on that day, else the nearest earlier or
 * later day that has one, so a day without pins still gets the forecast of where the trip is.
 */
export function weatherPlaces<T extends Parameters<typeof itemPoint>[0]>(
  days: DayWithItems<T>[],
): WeatherPlace[] {
  const own = days.map((day) => {
    for (const item of day.items) {
      const point = itemPoint(item);
      if (point) return point;
    }
    return null as GeoPoint | null;
  });
  const places: WeatherPlace[] = [];
  days.forEach((day, index) => {
    let best: GeoPoint | null = own[index] ?? null;
    for (let gap = 1; !best && gap < days.length; gap++) {
      best = own[index - gap] ?? own[index + gap] ?? null;
    }
    if (best) places.push({ date: day.date, lat: best.lat, lng: best.lng });
  });
  return places;
}

const dayNumber = (key: string) => Math.round(Date.parse(`${key}T00:00:00Z`) / 86400000);

/** Only days from today through the provider's forecast window are asked for. */
export function forecastablePlaces(places: WeatherPlace[], today: string) {
  const start = dayNumber(today);
  return places.filter((place) => {
    const offset = dayNumber(place.date) - start;
    return offset >= 0 && offset < WEATHER_WINDOW_DAYS;
  });
}

/** Group days that share (almost) the same place so one request covers them. */
export function groupWeatherPlaces(places: WeatherPlace[]) {
  const groups = new Map<string, { lat: number; lng: number; dates: string[] }>();
  for (const place of places) {
    const key = `${place.lat.toFixed(1)},${place.lng.toFixed(1)}`;
    const group = groups.get(key);
    if (group) group.dates.push(place.date);
    else groups.set(key, { lat: place.lat, lng: place.lng, dates: [place.date] });
  }
  return [...groups.values()];
}

type OpenMeteoDaily = {
  time?: unknown;
  weather_code?: unknown;
  temperature_2m_max?: unknown;
  temperature_2m_min?: unknown;
  precipitation_probability_max?: unknown;
};

/** Read the provider's daily block defensively: bad rows are dropped, never thrown. */
export function parseOpenMeteoDaily(json: unknown): DayWeather[] {
  const daily = (json as { daily?: OpenMeteoDaily } | null)?.daily;
  if (!daily || !Array.isArray(daily.time)) return [];
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  const code = list(daily.weather_code);
  const max = list(daily.temperature_2m_max);
  const min = list(daily.temperature_2m_min);
  const rain = list(daily.precipitation_probability_max);
  const out: DayWeather[] = [];
  daily.time.forEach((date, index) => {
    const c = Number(code[index]);
    const hi = Number(max[index]);
    const lo = Number(min[index]);
    if (
      typeof date !== "string" ||
      !Number.isFinite(c) ||
      !Number.isFinite(hi) ||
      !Number.isFinite(lo)
    )
      return;
    const r = rain[index] === null || rain[index] === undefined ? NaN : Number(rain[index]);
    out.push({
      date,
      code: c,
      tempMax: Math.round(hi),
      tempMin: Math.round(lo),
      rainPercent: Number.isFinite(r) ? Math.round(r) : null,
    });
  });
  return out;
}
