import { describe, expect, it } from "vitest";
import { pickQuickPackages } from "../lib/home-quick-packages";
import type { ViewPackage } from "../lib/package-view";

const pkg = (
  packageCode: string,
  days: number,
  priceIdr: number,
  sellable = true,
): ViewPackage => ({
  packageCode,
  name: packageCode,
  locationCodes: ["JP"],
  volumeBytes: 3_000_000_000,
  unlimited: false,
  durationDays: days,
  priceIdr,
  sellable,
});

const catalog = [
  pkg("A-7D", 7, 49_000), // 7.000/hari
  pkg("B-15D", 15, 89_000), // 5.933/hari
  pkg("C-30D", 30, 149_000), // 4.967/hari  -> best deal
];

const codes = (picks: ReturnType<typeof pickQuickPackages>) =>
  picks.map((pick) => `${pick.tag}:${pick.pkg.packageCode}`);

describe("pickQuickPackages", () => {
  it("picks the lowest Rp/hari as Best Deal and the most-ordered package as Terlaris", () => {
    expect(codes(pickQuickPackages(catalog, { "A-7D": 12, "B-15D": 3 }))).toEqual([
      "best_seller:A-7D",
      "best_deal:C-30D",
    ]);
  });

  it("falls back to the mid-range package for Terlaris when nothing has sold yet", () => {
    expect(codes(pickQuickPackages(catalog, {}))).toEqual(["best_seller:B-15D", "best_deal:C-30D"]);
  });

  it("never offers the same package twice", () => {
    // The best seller is also the cheapest per day: Terlaris keeps it, Best Deal moves on.
    const picks = pickQuickPackages(catalog, { "C-30D": 50 });
    expect(codes(picks)).toEqual(["best_seller:C-30D", "best_deal:B-15D"]);
    expect(new Set(picks.map((pick) => pick.pkg.packageCode)).size).toBe(picks.length);
  });

  it("returns a single pick when only one package is sellable", () => {
    expect(codes(pickQuickPackages([pkg("ONLY", 7, 50_000)], {}))).toHaveLength(1);
  });

  it("ignores sold-out packages and returns nothing when none can be sold", () => {
    expect(
      codes(pickQuickPackages([pkg("X", 7, 1, false), pkg("Y", 7, 2, false)], { X: 99 })),
    ).toEqual([]);
    expect(
      codes(pickQuickPackages(catalog.map((p) => ({ ...p, sellable: p.packageCode === "A-7D" })))),
    ).toEqual(["best_deal:A-7D"]);
  });

  it("honours Admin pins per slot and marks them", () => {
    const picks = pickQuickPackages(
      catalog,
      { "B-15D": 9 },
      { bestSellerPackageCode: "A-7D", bestDealPackageCode: "B-15D" },
    );
    expect(codes(picks)).toEqual(["best_seller:A-7D", "best_deal:B-15D"]);
    expect(picks.every((pick) => pick.pinned)).toBe(true);
  });

  it("pins only one slot and lets the other stay automatic", () => {
    const picks = pickQuickPackages(catalog, {}, { bestDealPackageCode: "A-7D" });
    expect(picks.find((pick) => pick.tag === "best_deal")).toMatchObject({
      pinned: true,
      pkg: { packageCode: "A-7D" },
    });
    const seller = picks.find((pick) => pick.tag === "best_seller");
    expect(seller?.pinned).toBe(false);
    expect(seller?.pkg.packageCode).not.toBe("A-7D");
  });

  it("falls back to the automatic pick when a pin is gone from the catalogue or sold out", () => {
    const picks = pickQuickPackages(
      [catalog[0]!, catalog[1]!, pkg("C-30D", 30, 149_000, false)],
      {},
      { bestSellerPackageCode: "GONE", bestDealPackageCode: "C-30D" },
    );
    expect(picks.every((pick) => !pick.pinned)).toBe(true);
    expect(codes(picks)).toEqual(["best_seller:A-7D", "best_deal:B-15D"]);
  });
});
