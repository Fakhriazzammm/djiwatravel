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

import {
  placeSearchTarget,
  reversePlaceHandler,
  searchPlacesHandler,
} from "@/lib/itinerary-map.server";

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
  it("uses MapTiler when a key is set, and Photon only when a self-hosted URL is set", () => {
    expect(placeSearchTarget()).toEqual({ provider: "maptiler", key: KEY });
    delete process.env["MAPTILER_API_KEY"];
    expect(placeSearchTarget()).toBeNull();
    process.env["PLACE_SEARCH_URL"] = "https://photon.internal.example/api/";
    expect(placeSearchTarget()).toEqual({
      provider: "photon",
      baseUrl: "https://photon.internal.example/api/",
    });
  });

  it("does not fall back to the public Photon instance", () => {
    delete process.env["MAPTILER_API_KEY"];
    expect(placeSearchTarget()).toBeNull();
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

  it("is unavailable without calling anything when no provider is configured", async () => {
    delete process.env["MAPTILER_API_KEY"];
    const fetchMock = stubFetch(200);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await searchPlacesHandler({ data: { query: "seizeriya" } });
    expect(result).toEqual({ places: [], status: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it("reports a rejected key as unavailable and never logs the key", async () => {
    stubFetch(403, { message: "Key is missing, invalid or restricted." });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await searchPlacesHandler({ data: { query: "seizeriya" } });
    expect(result).toEqual({ places: [], status: "unavailable" });
    expect(error).toHaveBeenCalledWith("[itinerary-map] place search HTTP", 403, "maptiler");
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).not.toContain(KEY);
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
