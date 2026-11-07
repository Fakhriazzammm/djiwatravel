import { afterEach, describe, expect, it } from "vitest";
import { rankMapFeatures, registerMapSearch, searchMapPlaces } from "@/lib/map-place-search";

const center = { lat: 35.7148, lng: 139.777 };
const f = (names: string[], lat: number, lng: number, cls = "restaurant") => ({
  names,
  lat,
  lng,
  cls,
});

describe("rankMapFeatures", () => {
  it("matches any name, ranks prefix matches first, then the nearest", () => {
    const places = rankMapFeatures(
      [
        f(["Far Sushi", "Far Sushi"], 35.8, 139.9),
        f(["Tajima's Sushi"], 35.716, 139.778),
        f(["Sushi Ueno", "上野寿司"], 35.72, 139.78),
        f(["Ramen"], 35.7148, 139.777),
      ],
      "sushi",
      center,
    );
    expect(places.map((p) => p.label)).toEqual(["Sushi Ueno", "Tajima's Sushi", "Far Sushi"]);
    expect(places[0]).toMatchObject({ subtitle: "Makan" });
  });

  it("finds a place by a non-primary name and drops duplicates", () => {
    const places = rankMapFeatures(
      [
        f(["Ueno Station", "上野駅"], 35.71, 139.77, "railway"),
        f(["Ueno Station"], 35.71, 139.77, "railway"),
      ],
      "上野",
      center,
    );
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ label: "Ueno Station", subtitle: "Stasiun" });
  });

  it("returns nothing for a short query", () => {
    expect(rankMapFeatures([f(["Ramen"], 1, 1)], "r", center)).toEqual([]);
  });
});

describe("map search bridge", () => {
  let off = () => {};
  afterEach(() => off());
  it("reports unavailable until a map registers, then answers", () => {
    expect(searchMapPlaces("x").available).toBe(false);
    off = registerMapSearch({ search: () => ({ places: [], zoomedOut: true }), focusOn: () => {} });
    expect(searchMapPlaces("x")).toMatchObject({ available: true, zoomedOut: true });
    off();
    expect(searchMapPlaces("x").available).toBe(false);
  });
});
