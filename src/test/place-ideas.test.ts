import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLACE_IDEAS_CONFIG,
  cleanRawIdeas,
  normalizePlaceIdeasConfig,
  parsePlaceIdeasConfig,
  placeIdeaKey,
  placeIdeasCacheKey,
  sourceHost,
  suggestSlot,
} from "@/lib/place-ideas";
import { validateAdminSetting } from "@/lib/admin-settings";
import { reserveSearchSlot } from "@/lib/place-ideas.server";

describe("placeIdeas admin setting", () => {
  it("fills defaults and rejects values outside the safe range", () => {
    expect(parsePlaceIdeasConfig({})).toEqual(DEFAULT_PLACE_IDEAS_CONFIG);
    expect(parsePlaceIdeasConfig({ dailyLimit: 5, model: "deepseek-v4.1-flash" })).toMatchObject({
      dailyLimit: 5,
      model: "deepseek-v4.1-flash",
    });
    expect(() => parsePlaceIdeasConfig({ dailyLimit: 0 })).toThrow(/dailyLimit/);
    expect(() => parsePlaceIdeasConfig({ cacheDays: 90 })).toThrow(/cacheDays/);
    expect(() => parsePlaceIdeasConfig({ maxIdeas: 2 })).toThrow(/maxIdeas/);
    expect(() => parsePlaceIdeasConfig({ model: "gpt-unknown" })).toThrow(/model/);
    expect(() => parsePlaceIdeasConfig({ enabled: "yes" })).toThrow(/enabled/);
  });

  it("falls back to defaults when the stored value is invalid, and is a known Admin setting", () => {
    expect(normalizePlaceIdeasConfig({ dailyLimit: -3 })).toEqual(DEFAULT_PLACE_IDEAS_CONFIG);
    expect(validateAdminSetting("placeIdeas", DEFAULT_PLACE_IDEAS_CONFIG)).toBe(true);
    expect(() => validateAdminSetting("placeIdeas", { dailyLimit: 999 })).toThrow();
  });
});

describe("cache and idea keys", () => {
  it("treat case, accents and spacing as the same city", () => {
    expect(placeIdeasCacheKey("Tōkyō ", "food")).toBe(placeIdeasCacheKey("tokyo", "food"));
    expect(placeIdeasCacheKey("Tokyo", "food")).not.toBe(placeIdeasCacheKey("Tokyo", "cafe"));
    expect(placeIdeasCacheKey("Tokyo", "all", "Ramen  ")).toContain("ramen");
  });
  it("ids a place by name and rounded location", () => {
    expect(placeIdeaKey("Koffee Mameya", 35.6702, 139.7101)).toBe(
      placeIdeaKey("koffee  mameya", 35.6704, 139.7103),
    );
  });
});

describe("cleanRawIdeas (what the AI may return)", () => {
  const good = { name: "Koffee Mameya", category: "cafe", why: "Kopi seduh tangan.", source: 1 };
  it("keeps a valid idea and drops invented or malformed ones", () => {
    const parsed = {
      places: [
        good,
        { ...good, name: "Ghost Cafe", source: 9 }, // source does not exist
        { ...good, name: "No Reason", why: "" },
        { ...good, name: "Bad Kind", category: "casino" },
        { ...good, name: "koffee mameya" }, // duplicate
        "not an object",
      ],
    };
    expect(cleanRawIdeas(parsed, 2, 6).map((i) => i.name)).toEqual(["Koffee Mameya"]);
  });
  it("returns nothing for garbage and respects the limit", () => {
    expect(cleanRawIdeas(null, 3, 6)).toEqual([]);
    expect(cleanRawIdeas({ places: "x" }, 3, 6)).toEqual([]);
    const many = { places: Array.from({ length: 9 }, (_, n) => ({ ...good, name: `Place ${n}` })) };
    expect(cleanRawIdeas(many, 1, 4)).toHaveLength(4);
  });
});

describe("suggestSlot", () => {
  it("starts at 10:00 on an empty day", () => {
    expect(suggestSlot([])).toEqual({ start: "10:00", end: "11:00" });
  });
  it("starts 30 minutes after the last activity, on a quarter hour", () => {
    expect(suggestSlot([{ start: "10:00", end: "11:00" }])).toEqual({
      start: "11:30",
      end: "12:30",
    });
    expect(
      suggestSlot([
        { start: "09:10", end: "10:10" },
        { start: "12:00", end: "13:05" },
      ]),
    ).toEqual({
      start: "13:45",
      end: "14:45",
    });
  });
  it("assumes one hour when an activity has only a start, and stays inside the day", () => {
    expect(suggestSlot([{ start: "14:00" }]).start).toBe("15:30");
    const late = suggestSlot([{ start: "21:00", end: "23:30" }]);
    expect(late.start < "23:00").toBe(true);
    expect(late.end >= late.start).toBe(true);
  });
});

describe("sourceHost and the TinyFish rate guard", () => {
  it("shows the host without www", () => {
    expect(sourceHost("https://www.timeout.com/tokyo/x")).toBe("timeout.com");
    expect(sourceHost("not a url")).toBe("");
  });
  it("stays under the free-tier 5 searches per minute", () => {
    const t = 10_000_000;
    const taken = [0, 1, 2, 3, 4, 5].map((n) => reserveSearchSlot(t + n));
    expect(taken).toEqual([true, true, true, true, false, false]);
    expect(reserveSearchSlot(t + 61_000)).toBe(true);
  });
});
