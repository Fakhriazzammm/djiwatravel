import { describe, expect, it } from "vitest";

import { destinations } from "@/lib/catalog";
import {
  destinationForCode,
  filterDestinationsByAvailability,
  regionalCoverage,
  type DestinationAvailability,
} from "@/lib/destination-availability";

const live = (codes: string[]): DestinationAvailability => ({
  codes,
  source: "live",
  degraded: false,
});

const degraded: DestinationAvailability = { codes: [], source: "fallback", degraded: true };

describe("destination availability", () => {
  it("keeps only destinations that have a sellable package", () => {
    const filtered = filterDestinationsByAvailability(live(["JP", "SG"]));
    expect(filtered.map((destination) => destination.code)).toEqual(["JP", "SG"]);
  });

  it("matches codes case-insensitively", () => {
    const filtered = filterDestinationsByAvailability(live(["jp"]));
    expect(filtered.map((destination) => destination.code)).toEqual(["JP"]);
  });

  it("never blanks the storefront when the catalogue read is degraded", () => {
    const filtered = filterDestinationsByAvailability(degraded);
    expect(filtered.length).toBe(destinations.length);
  });

  it("treats an empty code list as degraded rather than showing nothing", () => {
    const filtered = filterDestinationsByAvailability(live([]));
    expect(filtered.length).toBe(destinations.length);
  });

  it("resolves display metadata and falls back for unknown codes", () => {
    expect(destinationForCode("jp").nameId).toBe(destinationForCode("JP").nameId);
    expect(destinationForCode("ZZ").code).toBe("ZZ");
  });
});

describe("regional coverage", () => {
  const asia = { code: "ASIA", region: "Regional" };

  it("falls back to the seed list when availability is unavailable", () => {
    expect(regionalCoverage(asia, degraded)).toContain("JP");
  });

  it("extends the seed list with every sellable country in the same region", () => {
    const coverage = regionalCoverage(asia, live(["JP", "MY"]));
    expect(coverage).toContain("JP");
    expect(coverage).toContain("MY");
    // Nothing outside the seeded region set sneaks in.
    expect(coverage).not.toContain("FR");
  });

  it("does not invent coverage for a country that is not sellable", () => {
    const coverage = regionalCoverage(asia, live(["JP"]));
    const sellableCountries = destinations
      .filter((destination) => destination.region === "Asia")
      .map((destination) => destination.code);
    expect(coverage.length).toBeGreaterThanOrEqual(1);
    expect(sellableCountries).toContain("JP");
  });

  it("has no coverage for a non-regional destination", () => {
    expect(regionalCoverage({ code: "JP", region: "Asia" }, live(["JP"]))).toEqual([]);
  });
});
