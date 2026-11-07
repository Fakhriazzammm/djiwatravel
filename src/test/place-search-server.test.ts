import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The handlers run on the server. Database, admin guard and the trip owner are replaced; the
// geocoder itself is a stubbed `fetch`, so no request leaves the test.
let owner = 0;
vi.mock("../db/client.server", () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })), connect: vi.fn() },
}));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: vi.fn(async () => undefined) }));
vi.mock("@/lib/admin-guard.server", () => ({
  getAdminEmailHandler: vi.fn(async () => "admin@example.test"),
}));
vi.mock("@/lib/guest-trips.server", () => ({
  requireTripOwner: vi.fn(async () => ({ id: `owner-${++owner}`, email: null, guest: false })),
}));

import { pool } from "../db/client.server";
import {
  getAdminItineraryMapHandler,
  placeSearchTarget,
  reversePlaceHandler,
  searchPlacesHandler,
} from "@/lib/itinerary-map.server";
import { GEONAMES_ATTRIBUTION } from "@/lib/place-gazetteer";

const KEY = "maptiler-test-key-9f3a";
const response = {
  type: "FeatureCollection",
  features: [
    {
      text: "Seizeriya",
      place_name: "Seizeriya, Tokyo, Japan",
      geometry: { type: "Point", coordinates: [139.7454, 35.6586] },
    },
  ],
};

function stubFetch(status: number, body: unknown = response) {
  const fetchMock = vi.fn(
    async (..._args: unknown[]) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const GEOCODER_VARS = ["MAPTILER_API_KEY", "PLACE_SEARCH_PROVIDER", "PLACE_SEARCH_URL"] as const;
const saved = Object.fromEntries(GEOCODER_VARS.map((name) => [name, process.env[name]]));

beforeEach(() => {
  for (const name of GEOCODER_VARS) delete process.env[name];
  process.env["MAPTILER_API_KEY"] = KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const name of GEOCODER_VARS) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

describe("place search provider choice", () => {
  it("uses MapTiler when a key is set, Photon when a self-hosted URL is set, else the gazetteer", () => {
    expect(placeSearchTarget()).toEqual({ provider: "maptiler", key: KEY });
    delete process.env["MAPTILER_API_KEY"];
    expect(placeSearchTarget()).toEqual({ provider: "gazetteer" });
    process.env["PLACE_SEARCH_URL"] = "https://photon.internal.example/api/";
    expect(placeSearchTarget()).toEqual({
      provider: "photon",
      baseUrl: "https://photon.internal.example/api/",
    });
  });

  it("does not fall back to the public Photon instance", () => {
    delete process.env["MAPTILER_API_KEY"];
    expect(placeSearchTarget()).toEqual({ provider: "gazetteer" });
  });

  it("honours PLACE_SEARCH_PROVIDER when it names a provider that is configured", () => {
    process.env["PLACE_SEARCH_URL"] = "https://photon.internal.example/api/";
    process.env["PLACE_SEARCH_PROVIDER"] = "photon";
    expect(placeSearchTarget()?.provider).toBe("photon");
    process.env["PLACE_SEARCH_PROVIDER"] = "maptiler";
    expect(placeSearchTarget()?.provider).toBe("maptiler");
  });
});

describe("searchPlacesHandler", () => {
  it("asks MapTiler with the server key and returns the mapped places", async () => {
    const fetchMock = stubFetch(200);
    const result = await searchPlacesHandler({ data: { query: "seizeriya" } });
    expect(result.status).toBe("ok");
    expect(result.places).toEqual([
      { label: "Seizeriya", subtitle: "Tokyo, Japan", lat: 35.6586, lng: 139.7454 },
    ]);
    const requested = String(fetchMock.mock.calls[0]?.[0]);
    expect(requested).toContain("https://api.maptiler.com/geocoding/seizeriya.json?");
    expect(requested).toContain(`key=${KEY}`);
    expect(requested).toContain("autocomplete=true");
  });

  it("is unavailable, with no network call, while the gazetteer has no data", async () => {
    delete process.env["MAPTILER_API_KEY"];
    const fetchMock = stubFetch(200);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    const result = await searchPlacesHandler({ data: { query: "seizeriya" } });
    expect(result).toEqual({ places: [], status: "unavailable", attribution: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "[itinerary-map] place search failed",
      expect.stringContaining("gazetteer"),
    );
  });

  it("reports a rejected key as unavailable and never logs the key", async () => {
    stubFetch(403, { message: "Key is missing, invalid or restricted." });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await searchPlacesHandler({ data: { query: "seizeriya" } });
    expect(result).toEqual({ places: [], status: "unavailable", attribution: null });
    expect(error).toHaveBeenCalledWith("[itinerary-map] place search failed", "HTTP 403 maptiler");
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).not.toContain(KEY);
  });
});

describe("offline gazetteer (no key, no Photon)", () => {
  beforeEach(() => {
    delete process.env["MAPTILER_API_KEY"];
    vi.mocked(pool.query).mockClear();
  });
  /** Parameters of the first query whose SQL contains the fragment (the config read is not one). */
  const paramsOf = (fragment: string) =>
    vi.mocked(pool.query).mock.calls.find(([sql]) => String(sql).includes(fragment))?.[1];

  it("answers from the database and attributes GeoNames, without any network call", async () => {
    const fetchMock = stubFetch(200);
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never); // Agenda map setting
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          name: "Ueno",
          country_code: "JP",
          latitude: 35.7148,
          longitude: 139.77,
          admin1_name: "Tokyo",
        },
      ],
    } as never);
    const result = await searchPlacesHandler({ data: { query: "Ueno" } });
    expect(result).toEqual({
      places: [{ label: "Ueno", subtitle: "Tokyo, Jepang", lat: 35.7148, lng: 139.77 }],
      status: "ok",
      attribution: GEONAMES_ATTRIBUTION,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    // Lowercased prefix, the same text for the exact-match rank, and the limit.
    expect(paramsOf("order by (lower(p.name)")).toEqual(["ueno%", "ueno", 8]);
  });

  it("escapes LIKE wildcards so a typed % matches itself", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ loaded: true }] } as never);
    await searchPlacesHandler({ data: { query: "100%" } });
    expect(paramsOf("order by (lower(p.name)")).toEqual(["100\\%%", "100%", 8]);
  });

  it("reports no match as ok with no places once data is loaded", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ loaded: true }] } as never);
    const result = await searchPlacesHandler({ data: { query: "seizeriya" } });
    expect(result).toEqual({ places: [], status: "ok", attribution: GEONAMES_ATTRIBUTION });
  });

  it("names a point from the nearest populated place, keeping the requested coordinates", async () => {
    const fetchMock = stubFetch(200);
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);

    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          name: "Taito",
          country_code: "JP",
          latitude: 35.7,
          longitude: 139.78,
          admin1_name: "Tokyo",
        },
      ],
    } as never);
    const result = await reversePlaceHandler({ data: { lat: 35.7148, lng: 139.7745 } });
    expect(result).toEqual({
      place: { label: "Taito", subtitle: "Tokyo, Jepang", lat: 35.7148, lng: 139.7745 },
      status: "ok",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports the Admin status without the key, counting the loaded towns", async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: string) =>
      sql.includes("count(*)") ? { rows: [{ n: 236953 }] } : { rows: [] },
    );
    const status = await getAdminItineraryMapHandler();
    expect(status.geocoder).toEqual({ provider: "gazetteer", configured: true, places: 236953 });
  });

  it("reports the Admin status as not connected until the data is loaded", async () => {
    vi.mocked(pool.query).mockImplementation(async () => ({ rows: [{ n: 0 }] }) as never);
    const status = await getAdminItineraryMapHandler();
    expect(status.geocoder).toEqual({ provider: "gazetteer", configured: false, places: 0 });
  });
});

describe("reversePlaceHandler", () => {
  it("names the point the traveller picked and keeps the exact coordinates", async () => {
    const fetchMock = stubFetch(200);
    const result = await reversePlaceHandler({ data: { lat: 35.6586, lng: 139.7454 } });
    expect(result.status).toBe("ok");
    expect(result.place).toEqual({
      label: "Seizeriya",
      subtitle: "Tokyo, Japan",
      lat: 35.6586,
      lng: 139.7454,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "https://api.maptiler.com/geocoding/139.7454,35.6586.json",
    );
  });
});
