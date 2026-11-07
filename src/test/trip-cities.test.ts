import { describe, expect, it } from "vitest";
import {
  citiesBounds,
  guessActivityCategory,
  placesNearCity,
  popularCitiesFor,
  titleForPlace,
  tripCitiesSchema,
} from "@/lib/trip-cities";
import { DEFAULT_ITINERARY_MAP_CONFIG, parseItineraryMapConfig } from "@/lib/itinerary-map";

const tokyo = { lat: 35.6762, lng: 139.6503 };

describe("trip cities", () => {
  it("offers popular cities for Japan and none for unknown countries", () => {
    expect(popularCitiesFor("jp").map((c) => c.name)).toContain("Tokyo");
    expect(popularCitiesFor("ZZ")).toEqual([]);
    expect(popularCitiesFor(null)).toEqual([]);
  });

  it("frames the chosen cities with a margin", () => {
    expect(citiesBounds([])).toBeNull();
    const box = citiesBounds([{ name: "Tokyo", ...tokyo }])!;
    expect(box[0]).toBeLessThan(tokyo.lng);
    expect(box[2]).toBeGreaterThan(tokyo.lng);
    expect(box[1]).toBeLessThan(tokyo.lat);
    expect(box[3]).toBeGreaterThan(tokyo.lat);
  });

  it("keeps only places within the city radius, nearest first", () => {
    const places = [
      { label: "Osaka Castle", subtitle: "", lat: 34.6873, lng: 135.5262 },
      { label: "Shinjuku", subtitle: "", lat: 35.6896, lng: 139.7006 },
      { label: "Tokyo Tower", subtitle: "", lat: 35.6586, lng: 139.7454 },
    ];
    expect(placesNearCity(places, tokyo).map((p) => p.label)).toEqual(["Shinjuku", "Tokyo Tower"]);
  });

  it("guesses a category and a title from a place", () => {
    expect(guessActivityCategory("Restoran · Shinjuku, Tokyo")).toBe("food");
    expect(guessActivityCategory("Stasiun · Tokyo")).toBe("transport");
    expect(guessActivityCategory("")).toBe("");
    expect(titleForPlace("Saizeriya Shinjuku", "food")).toBe("Makan di Saizeriya Shinjuku");
    expect(titleForPlace("Senso-ji", "attraction")).toBe("Senso-ji");
  });

  it("validates the cities payload", () => {
    const tripId = "11111111-1111-4111-8111-111111111111";
    expect(tripCitiesSchema.safeParse({ tripId, cities: [] }).success).toBe(true);
    expect(
      tripCitiesSchema.safeParse({ tripId, cities: [{ name: "X", lat: 99, lng: 0 }] }).success,
    ).toBe(false);
  });

  it("lets Admin switch the city onboarding off", () => {
    expect(DEFAULT_ITINERARY_MAP_CONFIG.cityOnboarding).toBe(true);
    expect(parseItineraryMapConfig({ cityOnboarding: false })).toMatchObject({
      cityOnboarding: false,
    });
    expect(() => parseItineraryMapConfig({ cityOnboarding: "off" })).toThrow();
  });
});
