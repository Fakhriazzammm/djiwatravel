import { describe, expect, it } from "vitest";
import { bestValuePackage, defaultPackage, durationBuckets } from "../lib/package-picker";
import type { ViewPackage } from "../lib/package-view";

const pkg = (
  code: string,
  gb: number,
  days: number,
  price: number,
  sellable = true,
): ViewPackage => ({
  packageCode: code,
  name: code,
  locationCodes: ["JP"],
  volumeBytes: gb * 1_073_741_824,
  unlimited: false,
  durationDays: days,
  priceIdr: price,
  sellable,
});

describe("package picker", () => {
  const list = [
    pkg("a", 1, 3, 50_000),
    pkg("b", 3, 7, 90_000),
    pkg("c", 10, 15, 220_000),
    pkg("d", 20, 30, 390_000),
  ];

  it("groups by trip length, drops empty groups and sorts by price", () => {
    const buckets = durationBuckets(list);
    expect(buckets.map((bucket) => bucket.label)).toEqual(["1–7 hari", "8–15 hari", "16+ hari"]);
    expect(buckets[0]!.packages.map((item) => item.packageCode)).toEqual(["a", "b"]);
    expect(durationBuckets([pkg("x", 1, 3, 1)]).map((bucket) => bucket.id)).toEqual(["short"]);
  });

  it("preselects the lowest Rp/hari sellable package and never a sold-out one", () => {
    expect(bestValuePackage(list.slice(0, 2))?.packageCode).toBe("b");
    expect(bestValuePackage([pkg("x", 1, 1, 10_000), pkg("y", 1, 5, 40_000)])?.packageCode).toBe("y");
    const soldOut = [pkg("a", 1, 3, 50_000, false), pkg("b", 3, 7, 90_000)];
    expect(defaultPackage(soldOut)?.packageCode).toBe("b");
    expect(defaultPackage([pkg("a", 1, 3, 50_000, false)])).toBeUndefined();
  });
});
