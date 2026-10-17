import { describe, expect, it } from "vitest";
import type { ResellerCatalogPackage } from "@/lib/esim-access-catalog";
import { packageDataLabel } from "@/lib/package-copy";
import type { RecommendationPreferences } from "./preferences";
import { filterPackages } from "./package-filter";
import { rankPackages } from "./package-ranker";

const pkg = (
  code: string,
  price = 100000,
  volumeBytes = 3e9,
  days = 7,
): ResellerCatalogPackage => ({
  provider: "esimaccess",
  packageCode: code,
  slug: code,
  name: code,
  locationCodes: ["JP"],
  volumeBytes,
  durationDays: days,
  providerPriceUnits: 1,
  sellingPrice: {
    providerCostIdr: price,
    markupIdr: 0,
    sellingPriceIdr: price,
    currency: "IDR",
    configSnapshot: { usdToIdr: 16000 },
  },
  supportsTopUp: false,
  providerSnapshot: { packageCode: code },
});
const prefs = {
  destinations: ["JP"],
  durationDays: 7,
  dataNeed: "medium" as const,
};
const ranked = (
  packages: ResellerCatalogPackage[],
  preferences: RecommendationPreferences = prefs,
  limit = 8,
) => rankPackages(filterPackages(packages, preferences), preferences, limit);

describe("deterministic package recommendations", () => {
  it("rejects zero, negative, nonfinite and missing commercial terms", () => {
    const valid = pkg("valid");
    const invalid = [
      pkg("zero", 0),
      pkg("nan", NaN),
      pkg("negative", -1),
      { ...valid, providerPriceUnits: 0 },
      { ...valid, locationCodes: [] },
      { ...valid, durationDays: NaN },
      { ...valid, durationDays: 0 },
      pkg("unknown-data", 100000, 0),
    ];
    expect(ranked([...invalid, valid]).map((item) => item.packageCode)).toEqual(["valid"]);
    expect(
      rankPackages(
        invalid.map((package_) => ({ package: package_, destinationFit: 1 })),
        prefs,
      ),
    ).toEqual([]);
  });
  it("requires all destinations, sufficient duration, budget and requested top-up", () => {
    expect(
      filterPackages([pkg("partial")], {
        ...prefs,
        destinations: ["JP", "KR"],
      }),
    ).toEqual([]);
    expect(ranked([pkg("short", 100000, 3e9, 6)])).toEqual([]);
    expect(filterPackages([pkg("over")], { ...prefs, budgetIdr: 99999 })).toEqual([]);
    expect(filterPackages([pkg("zero-budget")], { ...prefs, budgetIdr: 0 })).toEqual([]);
    expect(filterPackages([pkg("no-top-up")], { ...prefs, needsTopUp: true })).toEqual([]);
  });
  it("never infers unlimited from zero data or marketing names", () => {
    const unknown = { ...pkg("Unlimited", 100000, 0) };
    const explicit = { ...pkg("explicit", 100000, 0), unlimited: true };
    expect(
      filterPackages([unknown, pkg("finite"), explicit], {
        ...prefs,
        dataNeed: "unlimited",
      }).map((item) => item.package.packageCode),
    ).toEqual(["explicit"]);
    expect(packageDataLabel(unknown)).toBe("Kuota belum tersedia");
    expect(packageDataLabel(explicit)).toBe("Data unlimited");
  });
  it("uses total price and normalized GB/day value without a budget", () => {
    expect(ranked([pkg("costly", 200000), pkg("value", 100000)])[0]!.packageCode).toBe("value");
    expect(ranked([pkg("small", 100000, 3e9), pkg("more-data", 100000, 6e9)])[0]!.packageCode).toBe(
      "more-data",
    );
    expect(
      ranked([pkg("short", 100000, 3e9, 7), pkg("long", 100000, 3e9, 14)], {
        destinations: ["JP"],
        dataNeed: "medium",
      })[0]!.packageCode,
    ).toBe("long");
    expect(ranked([pkg("too-small", 50000, 1e9), pkg("fit", 100000)])[0]!.packageCode).toBe("fit");
  });
  it("uses exact duration fit and explicit flexibility and reliability", () => {
    expect(ranked([pkg("long", 100000, 3e9, 30), pkg("fit")])[0]!.packageCode).toBe("fit");
    expect(ranked([{ ...pkg("flex"), supportsTopUp: true }, pkg("plain")])[0]!.packageCode).toBe(
      "flex",
    );
    expect(
      ranked([
        { ...pkg("reliable"), reliabilityScore: 1 },
        { ...pkg("poor"), reliabilityScore: 0 },
      ])[0]!.packageCode,
    ).toBe("reliable");
    expect(ranked([{ ...pkg("unavailable"), available: false }])).toEqual([]);
    expect(ranked([{ ...pkg("unknown"), reliabilityScore: NaN }])[0]!.score).toBe(
      ranked([pkg("unknown")])[0]!.score,
    );
  });
  it("assigns each category label at most once and never invents popularity", () => {
    const packages = [
      { ...pkg("cheap-flexible", 60000), supportsTopUp: true },
      pkg("mid"),
      { ...pkg("big", 200000, 20e9, 30), supportsTopUp: true },
      pkg("other"),
    ];
    const result = ranked(packages);
    expect(result[0]!.category).toBe("best_match");
    const counts = (category: string) => result.filter((item) => item.category === category).length;
    expect(counts("best_value")).toBeLessThanOrEqual(1);
    expect(counts("most_flexible")).toBeLessThanOrEqual(1);
    expect(counts("popular")).toBe(0);
    expect(result.filter((item) => item.category === "best_match").length).toBeGreaterThanOrEqual(
      1,
    );
  });
  it("keeps score order, deterministic ties and limits, without inventing popularity", () => {
    const packages = [pkg("B"), pkg("A"), pkg("C")];
    expect(ranked(packages).map((item) => item.packageCode)).toEqual(["A", "B", "C"]);
    expect(ranked([...packages].reverse())).toEqual(ranked(packages));
    expect(ranked(packages, prefs, 1)).toHaveLength(1);
    expect(ranked(packages, prefs, 0)).toEqual([]);
    expect(ranked(packages).some((item) => item.category === "popular")).toBe(false);
    expect(ranked(packages)[0]!.package.sellingPrice).toBe(packages[1]!.sellingPrice);
  });
});
