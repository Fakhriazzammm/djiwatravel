import { describe, expect, it } from "vitest";

import { destinations } from "@/lib/catalog";
import {
  destinationForCode,
  filterDestinationsByAvailability,
  isDestinationSellable,
  listableDestinations,
  regionalCoverage,
  resolveCatalogDestination,
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

describe("listable destinations", () => {
  // Shapes taken from the real catalogue: an Asia bundle lists its member countries, a Europe bundle
  // carries the literal EU code. Neither ever carries the display code ASIA.
  const bundles = [
    { locationCodes: ["JP", "KR"] },
    { locationCodes: ["SG"] },
    { locationCodes: ["EU"] },
  ];

  it("lists a regional destination whose member countries are sellable", () => {
    const codes = listableDestinations(bundles, live(["JP", "KR", "SG"])).map((d) => d.code);
    expect(codes).toContain("ASIA");
  });

  it("lists a regional destination that carries its own literal code", () => {
    const codes = listableDestinations(bundles, live(["EU"])).map((d) => d.code);
    expect(codes).toContain("EU");
  });

  it("hides a destination with nothing sellable instead of advertising it", () => {
    const onlyJapan = [{ locationCodes: ["JP"] }];
    const codes = listableDestinations(onlyJapan, live(["JP"])).map((d) => d.code);
    expect(codes).toContain("JP");
    expect(codes).not.toContain("SG");
    expect(codes).not.toContain("US");
  });

  it("fails open on a degraded read so regional entries never vanish with the rest", () => {
    const listed = listableDestinations([], degraded);
    expect(listed.length).toBe(destinations.length);
    const codes = listed.map((d) => d.code);
    expect(codes).toContain("ASIA");
    expect(codes).toContain("EU");
  });

  it("answers per destination, leaving fail-open to the list rule", () => {
    const availability = live(["JP", "KR"]);
    expect(isDestinationSellable({ code: "ASIA", region: "Regional" }, bundles, availability)).toBe(
      true,
    );
    expect(isDestinationSellable({ code: "JP", region: "Asia" }, bundles, availability)).toBe(true);
    expect(isDestinationSellable({ code: "US", region: "Amerika" }, bundles, availability)).toBe(
      false,
    );
  });

  it("projects an unknown live country into the destination list", () => {
    const packages = [{ locationCodes: ["DE"] }, { locationCodes: ["DE", "FR"] }];
    const listed = listableDestinations(packages, live(["DE", "FR"]));

    expect(listed.map((destination) => destination.code)).toContain("DE");
    expect(listed.find((destination) => destination.code === "DE")).toEqual({
      code: "DE",
      flag: "🌐",
      name: "Germany",
      nameId: "Jerman",
      aliases: [],
      region: "Lainnya",
    });
  });

  it("keeps known metadata and live unknown countries unique", () => {
    const packages = [{ locationCodes: ["JP"] }, { locationCodes: ["JP", "DE"] }];
    const listed = listableDestinations(packages, live(["JP", "DE", "DE"]));

    expect(listed.filter((destination) => destination.code === "JP")).toHaveLength(1);
    expect(listed.find((destination) => destination.code === "JP")?.nameId).toBe("Jepang");
    expect(listed.filter((destination) => destination.code === "DE")).toHaveLength(1);
  });

  it("allows an unknown destination route only when live packages cover its code", () => {
    expect(resolveCatalogDestination("DE", [{ locationCodes: ["DE"] }])?.code).toBe("DE");
    expect(resolveCatalogDestination("DE", [{ locationCodes: ["FR"] }])).toBeNull();
  });
});
