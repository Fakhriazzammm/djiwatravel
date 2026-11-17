import { describe, expect, it } from "vitest";
import {
  clampDays,
  initialDays,
  matchesQuota,
  matchPackagesForDays,
  pricePerChosenDay,
  sliderMarks,
  sliderMaxDays,
} from "@/lib/destination-days";

const p = (code: string, days: number, price: number, name = code) => ({
  packageCode: code,
  name,
  durationDays: days,
  priceIdr: price,
});

describe("destination day slider rules", () => {
  const list = [
    p("a3", 3, 9000),
    p("b7", 7, 32000),
    p("a7", 7, 15000),
    p("c15", 15, 95000),
    p("d15", 15, 80000),
    p("e30", 30, 189000),
  ];

  it("shows the closest covering tier cheapest first, longer tiers after", () => {
    const m = matchPackagesForDays(list, 7);
    expect(m.tier).toBe(7);
    expect(m.fit.map((x) => x.packageCode)).toEqual(["a7", "b7"]);
    expect(m.longer.map((x) => x.packageCode)).toEqual(["d15", "c15", "e30"]);
  });

  it("moves to the next tier when no package has exactly that validity", () => {
    const m = matchPackagesForDays(list, 10);
    expect(m.tier).toBe(15);
    expect(m.fit.map((x) => x.packageCode)).toEqual(["d15", "c15"]);
    expect(m.longer.map((x) => x.packageCode)).toEqual(["e30"]);
  });

  it("returns nothing when no validity covers the days", () => {
    expect(matchPackagesForDays(list, 45)).toEqual({ tier: null, fit: [], longer: [] });
    expect(matchPackagesForDays([], 3)).toEqual({ tier: null, fit: [], longer: [] });
  });

  it("limits the slider to the longest package, between a week and 60 days", () => {
    expect(sliderMaxDays([p("x", 3, 1)])).toBe(7);
    expect(sliderMaxDays(list)).toBe(30);
    expect(sliderMaxDays([p("x", 365, 1)])).toBe(60);
    expect(sliderMarks(30)).toEqual([1, 7, 14, 30]);
    expect(sliderMarks(60)).toEqual([1, 7, 14, 30, 60]);
    expect(sliderMarks(7)).toEqual([1, 7]);
  });

  it("clamps days and starts at the best seller's validity", () => {
    expect(clampDays(0, 30)).toBe(1);
    expect(clampDays(99, 30)).toBe(30);
    expect(clampDays(Number.NaN, 30)).toBe(1);
    expect(initialDays(15, 30)).toBe(15);
    expect(initialDays(undefined, 30)).toBe(7);
    expect(initialDays(45, 30)).toBe(30);
  });

  it("prices per chosen day and filters daily versus total quota", () => {
    expect(pricePerChosenDay(p("x", 15, 15000), 5)).toBe(3000);
    expect(matchesQuota({ name: "Japan 1GB/Day" }, "daily")).toBe(true);
    expect(matchesQuota({ name: "Japan 1GB/Day" }, "total")).toBe(false);
    expect(matchesQuota({ name: "Japan 3GB 7Days" }, "total")).toBe(true);
    expect(matchesQuota({ name: "Japan 3GB 7Days" }, "all")).toBe(true);
  });
});
