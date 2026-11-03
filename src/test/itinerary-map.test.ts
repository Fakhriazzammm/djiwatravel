import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_ITINERARY_MAP_CONFIG,
  boundsOf,
  curvedRoute,
  estimateLeg,
  formatMinutes,
  buildMapModel,
  formatKm,
  googleMapsDayRouteUrl,
  googleMapsDirectionsUrl,
  isAllowedMapStyleUrl,
  itemPoint,
  normalizeItineraryMapConfig,
  parseItineraryMapConfig,
  routeLengthKm,
} from "@/lib/itinerary-map";
import { validateAdminSetting } from "@/lib/admin-settings";
import { allowPlaceSearch, mapPhotonFeatures } from "@/lib/itinerary-map.server";

const shibuya = { id: "a", title: "Makan", latitude: 35.659, longitude: 139.7006 };
const sensoji = { id: "b", title: "Sensō-ji", latitude: "35.7148", longitude: "139.7967" };
const noPoint = { id: "c", title: "Istirahat", latitude: null, longitude: null };

describe("itinerary map config", () => {
  it("defaults to enabled with the OpenFreeMap style", () => {
    expect(DEFAULT_ITINERARY_MAP_CONFIG).toMatchObject({ enabled: true, placeSearch: true });
    expect(parseItineraryMapConfig({})).toEqual(DEFAULT_ITINERARY_MAP_CONFIG);
  });
  it("rejects non-boolean switches and unapproved style hosts", () => {
    expect(() => parseItineraryMapConfig({ enabled: "yes" })).toThrow();
    expect(() => parseItineraryMapConfig({ styleUrl: "http://tiles.openfreemap.org/s" })).toThrow();
    expect(() =>
      parseItineraryMapConfig({ styleUrl: "https://evil.example/style.json" }),
    ).toThrow();
    expect(isAllowedMapStyleUrl("https://tiles.openfreemap.org/styles/bright")).toBe(true);
  });
  it("falls back to the default on read and is accepted by the Admin validator", () => {
    expect(normalizeItineraryMapConfig("garbage")).toEqual(DEFAULT_ITINERARY_MAP_CONFIG);
    expect(validateAdminSetting("itineraryMap", { enabled: false })).toBe(true);
    expect(() => validateAdminSetting("itineraryMap", { enabled: 1 })).toThrow();
  });
});

describe("itinerary points and model", () => {
  it("reads numeric points from strings and ignores invalid ones", () => {
    expect(itemPoint(sensoji)).toEqual({ lat: 35.7148, lng: 139.7967 });
    expect(itemPoint(noPoint)).toBeNull();
    expect(itemPoint({ id: "x", latitude: 999, longitude: 0 })).toBeNull();
  });
  it("numbers pins 1..n without gaps and builds one route per day", () => {
    const model = buildMapModel(
      [
        { date: "2026-11-03", items: [shibuya, noPoint, sensoji] },
        { date: "2026-11-04", items: [{ ...shibuya, id: "d" }] },
      ],
      "all",
    );
    expect(model.pins.map((p) => [p.id, p.n])).toEqual([
      ["a", 1],
      ["b", 2],
      ["d", 3],
    ]);
    expect(model.routes).toHaveLength(1);
    const day = buildMapModel(
      [{ date: "2026-11-04", items: [{ ...shibuya, id: "d" }] }],
      "2026-11-04",
    );
    expect(day.pins[0]?.n).toBe(1);
    expect(day.routes).toHaveLength(0);
  });
  it("measures straight-line distance and frames the pins", () => {
    const km = routeLengthKm([
      { lat: 35.659, lng: 139.7006 },
      { lat: 35.7148, lng: 139.7967 },
    ]);
    expect(km).toBeGreaterThan(8);
    expect(km).toBeLessThan(12);
    expect(
      boundsOf([
        { lat: 1, lng: 2 },
        { lat: 3, lng: -4 },
      ]),
    ).toEqual([
      [-4, 1],
      [2, 3],
    ]);
    expect(formatKm(0.04)).toBe("<100 m");
    expect(formatKm(0.45)).toBe("500 m");
    expect(formatKm(3.44)).toBe("3,4 km");
    expect(formatKm(27.6)).toBe("28 km");
  });
});

describe("Google Maps links", () => {
  it("builds a directions link and a multi-stop day route", () => {
    expect(googleMapsDirectionsUrl({ lat: 35.659, lng: 139.7006 })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=35.659000%2C139.700600",
    );
    const route = googleMapsDayRouteUrl([
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
      { lat: 3, lng: 3 },
    ]);
    expect(route).toContain("origin=1.000000%2C1.000000");
    expect(route).toContain("destination=3.000000%2C3.000000");
    expect(route).toContain("waypoints=2.000000%2C2.000000");
    expect(googleMapsDayRouteUrl([])).toBeNull();
  });
});

describe("place search server helpers", () => {
  it("maps Photon features, drops invalid ones and de-duplicates", () => {
    const places = mapPhotonFeatures({
      features: [
        {
          geometry: { coordinates: [139.7006, 35.659] },
          properties: { name: "Shibuya Crossing", city: "Tokyo", country: "Japan" },
        },
        {
          geometry: { coordinates: [139.7006, 35.659] },
          properties: { name: "Shibuya Crossing", city: "Tokyo" },
        },
        { geometry: { coordinates: [500, 99] }, properties: { name: "Nowhere" } },
        { geometry: { coordinates: [1, 2] }, properties: {} },
      ],
    });
    expect(places).toEqual([
      { label: "Shibuya Crossing", subtitle: "Tokyo, Japan", lat: 35.659, lng: 139.7006 },
    ]);
    expect(mapPhotonFeatures(null)).toEqual([]);
  });
  it("limits searches per customer within a minute", () => {
    const now = 1_000_000;
    for (let i = 0; i < 20; i += 1) expect(allowPlaceSearch("u-limit", now + i)).toBe(true);
    expect(allowPlaceSearch("u-limit", now + 21)).toBe(false);
    expect(allowPlaceSearch("u-limit", now + 61_000)).toBe(true);
  });
});

describe("migration and wiring", () => {
  it("adds nullable bounded coordinates additively", () => {
    const sql = readFileSync("migrations/037_itinerary_map_points.sql", "utf8");
    expect(sql).toMatch(/add column if not exists latitude/i);
    expect(sql).toMatch(/latitude between -90 and 90/);
    expect(sql).toMatch(/longitude between -180 and 180/);
    expect(sql).not.toMatch(/drop |delete from/i);
  });
  it("is controllable from Admin settings", () => {
    expect(readFileSync("src/routes/admin.settings.tsx", "utf8")).toContain(
      "AdminItineraryMapPanel",
    );
  });
});

describe("travel legs and curved route", () => {
  it("walks short hops and takes rail for longer ones, with an estimated time", () => {
    expect(estimateLeg(0.5)).toMatchObject({ mode: "walk", minutes: 8 });
    const rail = estimateLeg(9.6);
    expect(rail.mode).toBe("rail");
    expect(rail.minutes).toBeGreaterThan(20);
    expect(rail.minutes).toBeLessThan(40);
    expect(formatMinutes(38)).toBe("38 mnt");
    expect(formatMinutes(65)).toBe("1 j 5 mnt");
    expect(formatMinutes(120)).toBe("2 j");
  });
  it("draws an arc that keeps both stops as its ends", () => {
    const a = { lat: 35.659, lng: 139.7006 };
    const b = { lat: 35.7148, lng: 139.7967 };
    const line = curvedRoute([a, b, { lat: 35.71, lng: 139.81 }]);
    expect(line[0]).toEqual(a);
    expect(line).toContainEqual(b);
    expect(line.length).toBeGreaterThan(40);
    expect(curvedRoute([a])).toEqual([]);
  });
});
