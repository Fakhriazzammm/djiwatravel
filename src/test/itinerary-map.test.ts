import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_ITINERARY_MAP_CONFIG,
  boundsOf,
  conflictingIds,
  findConflicts,
  itinerarySortKey,
  POI_CATEGORIES,
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
import { isAllowedImageUrl, pickPlaceImage } from "@/lib/place-image";
import { allowPlaceSearch } from "@/lib/itinerary-map.server";
import { mapPhotonFeatures } from "@/lib/place-search";

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
  it("numbers pins per day, keeps other days grey and colours days apart in all mode", () => {
    const days = [
      { date: "2026-11-03", items: [shibuya, noPoint, sensoji] },
      {
        date: "2026-11-04",
        items: [
          { ...shibuya, id: "d" },
          { ...sensoji, id: "e" },
        ],
      },
    ];
    const one = buildMapModel(days, "2026-11-04");
    expect(one.pins.map((p) => [p.id, p.n, p.muted])).toEqual([
      ["a", 1, true],
      ["b", 2, true],
      ["d", 1, false],
      ["e", 2, false],
    ]);
    expect(one.routes.map((r) => [r.date, r.muted, r.color])).toEqual([
      ["2026-11-03", true, "#9aa0a6"],
      ["2026-11-04", false, "#c4353b"],
    ]);
    expect(one.pinnedCount).toBe(2);
    const all = buildMapModel(days, "all");
    expect(all.pins.every((p) => !p.muted)).toBe(true);
    expect(new Set(all.pins.map((p) => p.color)).size).toBe(2);
    expect(
      buildMapModel([{ date: "2026-11-04", items: [{ ...shibuya, id: "d" }] }], "2026-11-04")
        .routes,
    ).toHaveLength(0);
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

describe("schedule overlaps", () => {
  const existing = [
    { id: "a", title: "Ngopi", date: "2026-11-04", start: "10:00", end: "11:00" },
    { id: "b", title: "Makan", date: "2026-11-04", start: "12:00", end: "13:00" },
    { id: "c", title: "Kereta malam", date: "2026-11-04", start: "23:00", end: "01:00" },
    { id: "d", title: "Tanpa jam", date: "2026-11-04", start: null, end: null },
  ];
  it("flags overlapping time ranges and ignores touching ones", () => {
    expect(
      findConflicts({ date: "2026-11-04", start: "10:30", end: "11:30" }, existing).map(
        (x) => x.id,
      ),
    ).toEqual(["a"]);
    expect(findConflicts({ date: "2026-11-04", start: "11:00", end: "12:00" }, existing)).toEqual(
      [],
    );
    expect(findConflicts({ date: "2026-11-05", start: "10:30", end: "11:30" }, existing)).toEqual(
      [],
    );
  });
  it("counts an overnight activity into the next morning", () => {
    expect(
      findConflicts({ date: "2026-11-05", start: "00:30", end: "01:30" }, existing).map(
        (x) => x.id,
      ),
    ).toEqual(["c"]);
  });
  it("treats a missing end time as 30 minutes and never flags an untimed activity", () => {
    expect(
      findConflicts({ date: "2026-11-04", start: "10:45", end: null }, existing).map((x) => x.id),
    ).toEqual(["a"]);
    expect(findConflicts({ date: "2026-11-04", start: null }, existing)).toEqual([]);
  });
  it("marks existing activities that overlap each other", () => {
    const ids = conflictingIds([
      ...existing,
      { id: "e", title: "Cek", date: "2026-11-04", start: "12:30", end: "14:00" },
    ]);
    expect([...ids].sort()).toEqual(["b", "e"]);
  });
  it("sorts by date then start then end, untimed last", () => {
    const rows = [
      { activity_date: "2026-11-04", start_time: null },
      { activity_date: "2026-11-04", start_time: "10:30:00", end_time: "12:00:00" },
      { activity_date: "2026-11-04", start_time: "09:00:00" },
      { activity_date: "2026-11-04", start_time: "10:30:00", end_time: "11:00:00" },
    ];
    const sorted = [...rows].sort((a, b) => itinerarySortKey(a).localeCompare(itinerarySortKey(b)));
    expect(sorted.map((r) => r.start_time)).toEqual(["09:00:00", "10:30:00", "10:30:00", null]);
    expect(sorted[1]!.end_time).toBe("11:00:00");
  });
});

describe("map helper categories", () => {
  it("offers station, airport and food markers with icons, on by default", () => {
    const ids = POI_CATEGORIES.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["station", "airport", "food"]));
    for (const c of POI_CATEGORIES) {
      expect(c.icon.length).toBeGreaterThan(20);
      expect(c.classes.length).toBeGreaterThan(0);
    }
    expect(POI_CATEGORIES.filter((c) => c.defaultOn).map((c) => c.id)).toContain("station");
  });
  it("lets Admin turn the helper off", () => {
    expect(parseItineraryMapConfig({ poiHelper: false }).poiHelper).toBe(false);
    expect(() => parseItineraryMapConfig({ poiHelper: "no" })).toThrow();
  });
});

describe("place photos", () => {
  const wiki = "https://upload.wikimedia.org/a.jpg";
  it("only accepts https images from Wikimedia", () => {
    expect(isAllowedImageUrl(wiki)).toBe(true);
    expect(isAllowedImageUrl("http://upload.wikimedia.org/a.jpg")).toBe(false);
    expect(isAllowedImageUrl("https://evil.example/a.jpg")).toBe(false);
    expect(isAllowedImageUrl(null)).toBe(false);
  });
  it("shows a photo only when the article matches the place, or sits right on it", () => {
    const pages = [
      { title: "Sensō-ji", thumbnail: { source: wiki }, dist: 120 },
      { title: "Asakusa Station", thumbnail: { source: wiki + "?s" }, dist: 30 },
    ];
    expect(pickPlaceImage(pages, ["Kuil Sensō-ji"])?.title).toBe("Sensō-ji");
    expect(
      pickPlaceImage(
        [{ title: "Random Tower", thumbnail: { source: wiki }, dist: 200 }],
        ["Kafe kecil"],
      ),
    ).toBeNull();
    expect(
      pickPlaceImage(
        [{ title: "Random Tower", thumbnail: { source: wiki }, dist: 20 }],
        ["Kafe kecil"],
      )?.title,
    ).toBe("Random Tower");
    expect(pickPlaceImage([{ title: "No photo" }], ["No photo"])).toBeNull();
  });
  it("lets Admin turn the Ringkas map off on its own", () => {
    expect(DEFAULT_ITINERARY_MAP_CONFIG.summaryMap).toBe(true);
    expect(parseItineraryMapConfig({ summaryMap: false })).toMatchObject({
      enabled: true,
      summaryMap: false,
    });
    expect(() => parseItineraryMapConfig({ summaryMap: "no" })).toThrow();
  });
  it("lets Admin turn the weather strip off", () => {
    expect(DEFAULT_ITINERARY_MAP_CONFIG.weather).toBe(true);
    expect(parseItineraryMapConfig({ weather: false })).toMatchObject({ weather: false });
    expect(() => parseItineraryMapConfig({ weather: "off" })).toThrow();
  });
  it("lets Admin turn GPS and photos off", () => {
    expect(parseItineraryMapConfig({ locateMe: false, placeImages: false })).toMatchObject({
      locateMe: false,
      placeImages: false,
    });
    expect(() => parseItineraryMapConfig({ locateMe: 1 })).toThrow();
  });
});

import { friendlyTripLine } from "@/lib/trip-overview";
describe("friendly trip line on Ringkas", () => {
  it("talks about the trip instead of showing a status label", () => {
    expect(friendlyTripLine("Hari ke-2", "Jepang")).toBe("Hari ke-2 serunya di Jepang");
    expect(friendlyTripLine("3 hari", "Jepang")).toBe("3 hari lagi menuju Jepang");
    expect(friendlyTripLine("Berangkat!", "Jepang")).toBe("Hari ini berangkat ke Jepang!");
    expect(friendlyTripLine("Selesai", "Jepang")).toBe("Kenangan serumu di Jepang");
    expect(friendlyTripLine("Atur tanggal", "")).toBe("Rencanakan serumu di tujuanmu");
  });
});
