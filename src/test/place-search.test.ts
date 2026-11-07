import { describe, expect, it } from "vitest";
import {
  forwardSearchUrl,
  mapMapTilerFeatures,
  mapPlaceFeatures,
  reverseSearchUrl,
} from "@/lib/place-search";

const maptilerTarget = { provider: "maptiler" as const, key: "test-key" };
const photonTarget = { provider: "photon" as const, baseUrl: "https://photon.example/api/" };

// Shaped like MapTiler's FeatureCollection: `text` is the name, `place_name` the display line,
// `geometry.coordinates` is [lng, lat]. Includes a duplicate, a house-number feature and bad rows.
const maptilerResponse = {
  type: "FeatureCollection",
  query: ["shibuya"],
  features: [
    {
      id: "poi.1",
      type: "Feature",
      text: "Shibuya Crossing",
      place_name: "Shibuya Crossing, Shibuya, Tokyo, Japan",
      place_type: ["poi"],
      center: [139.7006, 35.659],
      geometry: { type: "Point", coordinates: [139.7006, 35.659] },
      properties: {},
      context: [],
    },
    {
      id: "poi.2",
      type: "Feature",
      text: "Shibuya Crossing",
      place_name: "Shibuya Crossing, Shibuya, Tokyo, Japan",
      place_type: ["poi"],
      geometry: { type: "Point", coordinates: [139.7006, 35.659] },
    },
    {
      id: "address.3",
      type: "Feature",
      text: "Dogenzaka",
      address: "2-1",
      place_name: "2-1 Dogenzaka, Shibuya, Tokyo, Japan",
      place_type: ["address"],
      geometry: { type: "Point", coordinates: [139.6995, 35.6605] },
    },
    { id: "bad.4", text: "Nowhere", place_name: "Nowhere", geometry: { coordinates: [500, 99] } },
    { id: "nopoint.5", text: "Tokyo", place_name: "Tokyo, Japan" },
  ],
};

describe("MapTiler mapping", () => {
  it("maps names, display lines and [lng, lat] points, dropping bad and duplicate rows", () => {
    expect(mapMapTilerFeatures(maptilerResponse)).toEqual([
      {
        label: "Shibuya Crossing",
        subtitle: "Shibuya, Tokyo, Japan",
        lat: 35.659,
        lng: 139.7006,
      },
      {
        label: "Dogenzaka 2-1",
        subtitle: "Shibuya, Tokyo, Japan",
        lat: 35.6605,
        lng: 139.6995,
      },
    ]);
  });

  it("gives an empty list for unexpected payloads", () => {
    expect(mapMapTilerFeatures(null)).toEqual([]);
    expect(mapMapTilerFeatures({ features: "nope" })).toEqual([]);
    expect(mapPlaceFeatures("photon", null)).toEqual([]);
  });

  it("uses the mapper that matches the provider", () => {
    expect(mapPlaceFeatures("maptiler", maptilerResponse)).toHaveLength(2);
  });
});

describe("forward search URL", () => {
  it("queries MapTiler by path with the key, typeahead and longitude-first proximity", () => {
    const url = forwardSearchUrl(maptilerTarget, {
      query: "Shibuya Crossing",
      limit: 8,
      lang: "en",
      autocomplete: true,
      proximity: { lat: 35.659, lng: 139.7006 },
    });
    expect(url.origin + url.pathname).toBe(
      "https://api.maptiler.com/geocoding/Shibuya%20Crossing.json",
    );
    expect(url.searchParams.get("key")).toBe("test-key");
    expect(url.searchParams.get("limit")).toBe("8");
    expect(url.searchParams.get("language")).toBe("en");
    expect(url.searchParams.get("autocomplete")).toBe("true");
    expect(url.searchParams.get("proximity")).toBe("139.7006,35.659");
  });

  it("keeps the limit inside MapTiler's 1 to 10 range and turns batch typeahead off", () => {
    const url = forwardSearchUrl(maptilerTarget, {
      query: "Jepang",
      limit: 50,
      lang: "en",
      autocomplete: false,
    });
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("autocomplete")).toBe("false");
    expect(url.searchParams.has("proximity")).toBe(false);
  });

  it("keeps the Photon query shape for a self-hosted instance", () => {
    const url = forwardSearchUrl(photonTarget, {
      query: "Ichiran",
      limit: 8,
      lang: "en",
      autocomplete: true,
      proximity: { lat: 35.7, lng: 139.8 },
    });
    expect(url.origin + url.pathname).toBe("https://photon.example/api/");
    expect(url.searchParams.get("q")).toBe("Ichiran");
    expect(url.searchParams.get("lat")).toBe("35.7");
    expect(url.searchParams.get("lon")).toBe("139.8");
    expect(url.searchParams.has("key")).toBe(false);
  });
});

describe("reverse lookup URL", () => {
  it("asks MapTiler for the nearest place at longitude,latitude", () => {
    const url = reverseSearchUrl(maptilerTarget, { lat: 35.659, lng: 139.7006 }, "en");
    expect(url.origin + url.pathname).toBe(
      "https://api.maptiler.com/geocoding/139.7006,35.659.json",
    );
    expect(url.searchParams.get("limit")).toBe("1");
    expect(url.searchParams.get("key")).toBe("test-key");
  });

  it("points Photon's reverse endpoint at the same host", () => {
    const url = reverseSearchUrl(photonTarget, { lat: 1, lng: 2 }, "en");
    expect(url.origin + url.pathname).toBe("https://photon.example/reverse");
    expect(url.searchParams.get("lat")).toBe("1");
    expect(url.searchParams.get("lon")).toBe("2");
  });
});
