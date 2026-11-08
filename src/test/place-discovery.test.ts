import { describe, expect, it } from "vitest";
import {
  classify,
  displayName,
  overpassQuery,
  parseWikipediaTag,
  pickCandidates,
} from "@/lib/place-discovery";

const el = (id: number, tags: Record<string, string>) => ({
  type: "node" as const,
  id,
  lat: 35.68,
  lon: 139.76,
  tags,
});

describe("place discovery from the map", () => {
  it("builds an Overpass query around the point", () => {
    expect(overpassQuery(35.6762, 139.6503)).toContain("around:12000,35.67620,139.65030");
  });

  it("classifies OSM tags and needs a Latin name", () => {
    expect(classify({ amenity: "cafe" })).toBe("cafe");
    expect(classify({ leisure: "park" })).toBe("nature");
    expect(classify({ tourism: "museum" })).toBe("sight");
    expect(displayName({ name: "上野公園" })).toBeNull();
    expect(displayName({ name: "上野公園", "name:en": "Ueno Park" })).toBe("Ueno Park");
  });

  it("ranks well-known places first and filters by kind", () => {
    const list = [
      el(1, { tourism: "museum", name: "Small Museum", "name:en": "Small Museum" }),
      el(2, {
        tourism: "attraction",
        name: "Tokyo Tower",
        wikipedia: "en:Tokyo Tower",
        wikidata: "Q1",
      }),
      el(3, { amenity: "cafe", name: "Kissa", "name:en": "Kissa" }),
    ];
    expect(pickCandidates(list, "sight", 5).map((c) => c.name)).toEqual([
      "Tokyo Tower",
      "Small Museum",
    ]);
    expect(pickCandidates(list, "cafe", 5).map((c) => c.name)).toEqual(["Kissa"]);
    expect(pickCandidates(list, "all", 5).length).toBe(3);
  });

  it("reads the wikipedia tag", () => {
    expect(parseWikipediaTag("ja:東京タワー")).toEqual({ lang: "ja", title: "東京タワー" });
    expect(parseWikipediaTag(null)).toBeNull();
  });
});
