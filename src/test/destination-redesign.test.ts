import { describe, expect, it } from "vitest";
import {
  durationFilterOf,
  isDailyQuota,
  isMultiCountry,
  packageDeckCardClass,
  sampleDeck,
} from "@/routes/destination.$code";
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
  preorderAvailable: false,
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
    const picks = pickFastPackages([
      p("a", 3, 50),
      p("b", 12, 200),
      p("c", 30, 300),
      p("d", 7, 10, false),
    ]);
    const codes = picks.map((x) => x.pkg.packageCode);
    expect(new Set(codes).size).toBe(codes.length);
    expect(picks.some((x) => x.tag === "cheapest")).toBe(true);
    expect(codes).not.toContain("d");
    expect(picks.map((x) => x.pkg.priceIdr)).toEqual(
      [...picks.map((x) => x.pkg.priceIdr)].sort((a, b) => a - b),
    );
  });
  it("samples a long deck evenly, keeping cheapest and priciest", () => {
    const list = Array.from({ length: 20 }, (_, i) => i);
    const deck = sampleDeck(list, 6);
    expect(deck).toHaveLength(6);
    expect(deck[0]).toBe(0);
    expect(deck[5]).toBe(19);
    expect(sampleDeck([1, 2], 6)).toEqual([1, 2]);
  });
  it("keeps the destination package deck compact", () => {
    const selected = packageDeckCardClass(true);
    const unselected = packageDeckCardClass(false);

    expect(selected).toContain("w-[48%] max-w-[188px]");
    expect(selected).toContain("rounded-2xl p-3");
    expect(selected).toContain("bg-brand-red text-white");
    expect(unselected).toContain("bg-surface ring-1 ring-border/60");
    expect(selected).not.toContain("bg-gradient");
    expect(selected).not.toContain("shadow");
    expect(unselected).not.toContain("shadow");
  });
});
