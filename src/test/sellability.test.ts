import { describe, expect, it } from "vitest";

import {
  affordableCeilingUsd,
  isPackageSellable,
  partitionSellability,
  requiredUnits,
  SELLABILITY_BUFFER,
  sellabilityMode,
  type BalanceSnapshot,
} from "@/lib/sellability";
import { toViewPackage, toViewPackages } from "@/lib/package-view";

const live = (
  balanceUnits: number | null,
  source: BalanceSnapshot["source"] = "live",
): BalanceSnapshot => ({
  balanceUnits,
  capturedAtMs: balanceUnits === null ? null : Date.now(),
  source,
});

const pkg = (packageCode: string, providerPriceUnits: number) => ({
  packageCode,
  providerPriceUnits,
});

/** The provider balance the production account actually holds, in 1/10,000 USD units. */
const REAL_BALANCE = 193_000; // US$19.30

describe("sellability mode", () => {
  it("defaults to off so deploying the code changes nothing", () => {
    expect(sellabilityMode(undefined)).toBe("off");
    expect(sellabilityMode("")).toBe("off");
    expect(sellabilityMode("nonsense")).toBe("off");
  });

  it("accepts shadow and on, case-insensitively", () => {
    expect(sellabilityMode("shadow")).toBe("shadow");
    expect(sellabilityMode(" ON ")).toBe("on");
  });
});

describe("requiredUnits", () => {
  it("adds the 15% price headroom", () => {
    expect(SELLABILITY_BUFFER).toBe(0.15);
    expect(requiredUnits(100_000)).toBe(115_000);
    // Rounds up, so a fractional threshold can never round down into an oversell.
    expect(requiredUnits(3)).toBe(4);
  });
});

describe("isPackageSellable", () => {
  it("sells a package priced at or under the balance", () => {
    expect(isPackageSellable(pkg("cheap", 3000), live(REAL_BALANCE))).toBe(true);
  });

  it("marks a package above the balance as sold out", () => {
    expect(isPackageSellable(pkg("too-big", 193_200), live(REAL_BALANCE))).toBe(false);
    expect(isPackageSellable(pkg("huge", 3_816_900), live(REAL_BALANCE))).toBe(false);
  });

  it("keeps the 15% headroom out of reach", () => {
    // 170_000 fits the balance but not the buffer (170_000 * 1.15 = 195_500 > 193_000).
    expect(isPackageSellable(pkg("borderline", 170_000), live(REAL_BALANCE))).toBe(false);
    // 160_000 * 1.15 = 184_000, still inside.
    expect(isPackageSellable(pkg("inside", 160_000), live(REAL_BALANCE))).toBe(true);
  });

  it("does not claim a package is sellable when the balance is unknown", () => {
    expect(isPackageSellable(pkg("anything", 3_816_900), live(null, "unknown"))).toBe(false);
  });

  it("does not claim a package is sellable when its provider price is invalid", () => {
    expect(isPackageSellable(pkg("no-price", 0), live(REAL_BALANCE))).toBe(false);
    expect(isPackageSellable(pkg("nan-price", Number.NaN), live(REAL_BALANCE))).toBe(false);
  });

  it("sells everything when the balance is zero only if it costs nothing", () => {
    expect(isPackageSellable(pkg("cheap", 3000), live(0))).toBe(false);
  });
});

describe("partitionSellability", () => {
  it("splits the catalogue and counts both sides", () => {
    const packages = [pkg("a", 3000), pkg("b", 200_000), pkg("c", 50_000), pkg("d", 3_816_900)];
    const partition = partitionSellability(packages, live(REAL_BALANCE));
    expect([...partition.hidden].sort()).toEqual(["b", "d"]);
    expect(partition.hiddenCount).toBe(2);
    expect(partition.sellableCount).toBe(2);
  });

  it("marks every package unavailable when the balance is unknown", () => {
    const partition = partitionSellability([pkg("a", 3_816_900)], live(null, "unknown"));
    expect(partition.hiddenCount).toBe(1);
    expect(partition.hidden).toEqual(new Set(["a"]));
  });
});

describe("affordableCeilingUsd", () => {
  it("reports the priciest sellable package in USD", () => {
    // 19.30 / 1.15 = 16.78
    expect(affordableCeilingUsd(live(REAL_BALANCE))).toBeCloseTo(16.78, 2);
  });

  it("reports nothing when the balance is unknown", () => {
    expect(affordableCeilingUsd(live(null, "unknown"))).toBeNull();
  });
});

describe("view packages carry the sold-out flag", () => {
  const source = {
    packageCode: "id-5gb",
    name: "Indonesia 5GB",
    locationCodes: ["ID"],
    volumeBytes: 5_000_000_000,
    durationDays: 30,
    sellingPrice: {
      providerCostIdr: 51_000,
      markupIdr: 12_750,
      sellingPriceIdr: 63_750,
      currency: "IDR" as const,
      configSnapshot: { markupPercent: 25, usdToIdr: 17_000, roundingIdr: 1_000 },
    },
  };

  it("defaults to sellable when no decision is supplied", () => {
    expect(toViewPackage(source).sellable).toBe(true);
  });

  it("marks the codes the balance cannot cover", () => {
    const [hidden] = toViewPackages([source], new Set(["id-5gb"]));
    expect(hidden?.sellable).toBe(false);
    const [shown] = toViewPackages([source], new Set(["other"]));
    expect(shown?.sellable).toBe(true);
  });

  it("never leaks the cost basis to the browser payload", () => {
    const view = toViewPackage(source);
    expect(Object.keys(view).sort()).toEqual(
      [
        "packageCode",
        "name",
        "locationCodes",
        "volumeBytes",
        "unlimited",
        "durationDays",
        "priceIdr",
        "sellable",
      ].sort(),
    );
  });
});
