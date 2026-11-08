import { describe, expect, it } from "vitest";
import { isChain, parseWikipediaTag, titleMatchesName } from "@/lib/place-discovery";
import { tileXY } from "@/lib/place-tiles.server";

describe("place discovery from the map tiles", () => {
  it("drops big chains", () => {
    expect(isChain("McDonald's")).toBe(true);
    expect(isChain("Starbucks Coffee")).toBe(true);
    expect(isChain("Nakajima Tea House")).toBe(false);
  });

  it("matches a Wikipedia title to a place by a distinctive word", () => {
    expect(titleMatchesName("Hamarikyu Gardens", "Hama-rikyu Hamarikyu Gardens")).toBe(true);
    expect(titleMatchesName("Tokyo", "Gosho")).toBe(false);
  });

  it("reads the wikipedia tag", () => {
    expect(parseWikipediaTag("ja:東京タワー")).toEqual({ lang: "ja", title: "東京タワー" });
    expect(parseWikipediaTag(null)).toBeNull();
  });

  it("finds the z14 tile of a point", () => {
    expect(tileXY(35.6812, 139.7671)).toEqual({ x: 14552, y: 6451 });
  });
});
