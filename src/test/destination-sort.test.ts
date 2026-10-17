import { describe, expect, it } from "vitest";

import {
  filterPackagesByAvailability,
  PAGE_SIZE,
  sortPackages,
  toggleComparisonSelection,
  type SortKey,
} from "@/routes/destination.$code";
import type { ViewPackage } from "@/lib/package-view";

function pkg(
  code: string,
  priceIdr: number,
  volumeBytes: number,
  durationDays: number,
): ViewPackage {
  return {
    packageCode: code,
    name: code,
    locationCodes: ["JP"],
    volumeBytes,
    unlimited: false,
    durationDays,
    priceIdr,
    sellable: true,
  };
}

// Sorting decides which packages a customer sees first, so the rules are pinned here rather
// than eyeballed on production.
describe("destination package sorting", () => {
  const packages = [
    pkg("MID", 50_000, 5_000_000_000, 7),
    pkg("CHEAP", 15_000, 1_000_000_000, 3),
    pkg("BIG", 120_000, 20_000_000_000, 30),
  ];
  const codes = (key: SortKey) => sortPackages(packages, key).map((p) => p.packageCode);

  it("keeps the catalogue order for the recommended view", () => {
    expect(codes("recommended")).toEqual(["MID", "CHEAP", "BIG"]);
  });

  it("sorts by price ascending", () => {
    expect(codes("price")).toEqual(["CHEAP", "MID", "BIG"]);
  });

  it("sorts by quota descending", () => {
    expect(codes("data")).toEqual(["BIG", "MID", "CHEAP"]);
  });

  it("sorts by validity descending", () => {
    expect(codes("duration")).toEqual(["BIG", "MID", "CHEAP"]);
  });

  it("sorts by price per GB ascending", () => {
    expect(codes("value")).toEqual(["BIG", "MID", "CHEAP"]);
  });

  it("does not mutate the loader array", () => {
    const original = [...packages];
    sortPackages(packages, "price");
    expect(packages).toEqual(original);
  });

  it("filters confirmed available and sold-out packages", () => {
    const soldOut: ViewPackage = { ...packages[0]!, sellable: false };

    expect(filterPackagesByAvailability([...packages, soldOut], "all")).toHaveLength(4);
    expect(
      filterPackagesByAvailability([...packages, soldOut], "available").map(
        (packageItem) => packageItem.packageCode,
      ),
    ).toEqual(["MID", "CHEAP", "BIG"]);
    expect(
      filterPackagesByAvailability([...packages, soldOut], "sold-out").map(
        (packageItem) => packageItem.packageCode,
      ),
    ).toEqual(["MID"]);
  });

  it("does not classify pending stock as sold out", () => {
    const pending: ViewPackage[] = packages.map((packageItem) => ({
      ...packageItem,
      sellable: false,
    }));

    expect(filterPackagesByAvailability(pending, "available", true)).toEqual([]);
    expect(filterPackagesByAvailability(pending, "sold-out", true)).toEqual([]);
    expect(filterPackagesByAvailability(pending, "all", true)).toEqual(pending);
  });

  it("adds, removes, and caps comparison selections", () => {
    expect(toggleComparisonSelection([], "a")).toEqual(["a"]);
    expect(toggleComparisonSelection(["a"], "a")).toEqual([]);
    expect(toggleComparisonSelection(["a", "b", "c"], "d")).toEqual(["a", "b", "c"]);
    expect(toggleComparisonSelection(["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });

  it("renders one screen of cards on the first paint", () => {
    expect(PAGE_SIZE).toBe(20);
  });
});
