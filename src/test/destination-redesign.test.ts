import { describe, expect, it } from "vitest";
import { durationFilterOf, isDailyQuota, isMultiCountry } from "@/routes/destination.$code";
import { pickFastPackages } from "@/lib/home-quick-packages";
import type { ViewPackage } from "@/lib/package-view";

const p = (code: string, days: number, price: number, sellable = true): ViewPackage => ({
  packageCode: code,
  name: code,
  locationCodes: ["JP"],
  volumeBytes: 1e9,
  unlimited: false,
  durationDays: days,
  priceIdr: price,
  sellable,
});

describe("destination redesign helpers", () => {
  it("buckets durations", () => {
    expect(durationFilterOf(3)).toBe("short");
    expect(durationFilterOf(7)).toBe("week");
    expect(durationFilterOf(30)).toBe("month");
    expect(durationFilterOf(45)).toBe("long");
  });
  it("detects daily and multi-country packages", () => {
    expect(isDailyQuota({ name: "Japan 500MB/Day" })).toBe(true);
    expect(isDailyQuota({ name: "Japan 5GB 15Days" })).toBe(false);
    expect(isMultiCountry({ locationCodes: ["JP", "KR"] })).toBe(true);
  });
  it("adds a cheapest pick distinct from Terlaris/Best Deal, sorted by price", () => {
    const picks = pickFastPackages([p("a", 3, 50), p("b", 12, 200), p("c", 30, 300), p("d", 7, 10, false)]);
    const codes = picks.map((x) => x.pkg.packageCode);
    expect(new Set(codes).size).toBe(codes.length);
    expect(picks.some((x) => x.tag === "cheapest")).toBe(true);
    expect(codes).not.toContain("d");
    expect(picks.map((x) => x.pkg.priceIdr)).toEqual([...picks.map((x) => x.pkg.priceIdr)].sort((a, b) => a - b));
  });
});
