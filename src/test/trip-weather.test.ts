import { describe, expect, it } from "vitest";
import {
  describeWeather,
  forecastablePlaces,
  groupWeatherPlaces,
  parseOpenMeteoDaily,
  weatherPlaces,
} from "@/lib/trip-weather";

type P = { id: string; latitude?: number; longitude?: number };
const pin = (id: string, lat: number, lng: number): P => ({ id, latitude: lat, longitude: lng });

describe("trip weather model", () => {
  it("names WMO codes in Indonesian", () => {
    expect(describeWeather(0)).toEqual({ kind: "sun", label: "Cerah" });
    expect(describeWeather(3).kind).toBe("cloud");
    expect(describeWeather(63).kind).toBe("rain");
    expect(describeWeather(95).kind).toBe("storm");
    expect(describeWeather(73).kind).toBe("snow");
  });

  it("uses a day's first pin, else the nearest day that has one", () => {
    const places = weatherPlaces([
      { date: "2026-11-03", items: [{ id: "x" } as P] },
      { date: "2026-11-04", items: [pin("a", 35.6, 139.7), pin("b", 1, 1)] },
      { date: "2026-11-05", items: [] },
    ]);
    expect(places).toEqual([
      { date: "2026-11-03", lat: 35.6, lng: 139.7 },
      { date: "2026-11-04", lat: 35.6, lng: 139.7 },
      { date: "2026-11-05", lat: 35.6, lng: 139.7 },
    ]);
    expect(weatherPlaces([{ date: "2026-11-03", items: [{ id: "x" } as P] }])).toEqual([]);
  });

  it("asks only for today through the 16-day window", () => {
    const places = ["2026-11-03", "2026-11-04", "2026-11-19", "2026-11-20"].map((date) => ({
      date,
      lat: 1,
      lng: 2,
    }));
    expect(forecastablePlaces(places, "2026-11-04").map((p) => p.date)).toEqual([
      "2026-11-04",
      "2026-11-19",
    ]);
  });

  it("shares one request between days at the same place", () => {
    const groups = groupWeatherPlaces([
      { date: "a", lat: 35.61, lng: 139.72 },
      { date: "b", lat: 35.64, lng: 139.69 },
      { date: "c", lat: -8.4, lng: 115.2 },
    ]);
    expect(groups.map((g) => g.dates)).toEqual([["a", "b"], ["c"]]);
  });

  it("parses the provider's daily block and drops bad rows", () => {
    const rows = parseOpenMeteoDaily({
      daily: {
        time: ["2026-11-04", "2026-11-05", "2026-11-06"],
        weather_code: [61, 0, "x"],
        temperature_2m_max: [18.6, 20, 1],
        temperature_2m_min: [11.2, 12, 1],
        precipitation_probability_max: [70, null, 0],
      },
    });
    expect(rows).toEqual([
      { date: "2026-11-04", code: 61, tempMax: 19, tempMin: 11, rainPercent: 70 },
      { date: "2026-11-05", code: 0, tempMax: 20, tempMin: 12, rainPercent: null },
    ]);
    expect(parseOpenMeteoDaily(null)).toEqual([]);
  });
});
