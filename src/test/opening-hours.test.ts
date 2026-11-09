import { describe, expect, it } from "vitest";
import { hoursForDay, isOpenAt, parseOpeningHours, weekdayIndex } from "@/lib/opening-hours";

const MON = 0;
const SUN = 6;
const at = (h: number, m = 0) => h * 60 + m;

describe("opening hours reader", () => {
  it("reads a plain daily range", () => {
    expect(isOpenAt("10:00-20:00", MON, at(10))).toBe(true);
    expect(isOpenAt("10:00-20:00", MON, at(19, 59))).toBe(true);
    expect(isOpenAt("10:00-20:00", MON, at(20))).toBe(false);
    expect(isOpenAt("10:00-20:00", SUN, at(9))).toBe(false);
  });

  it("reads 24/7, day ranges, lists and overrides", () => {
    expect(isOpenAt("24/7", 3, at(3))).toBe(true);
    expect(isOpenAt("Mo-Fr 09:00-17:00", MON, at(12))).toBe(true);
    expect(isOpenAt("Mo-Fr 09:00-17:00", 5, at(12))).toBe(false);
    expect(isOpenAt("Mo-Fr 09:00-17:00; Sa,Su 10:00-14:00", SUN, at(11))).toBe(true);
    expect(isOpenAt("Mo-Su 10:00-22:00; We off", 2, at(12))).toBe(false);
    expect(isOpenAt("Mo-Su 10:00-22:00; We off", 3, at(12))).toBe(true);
  });

  it("reads split hours and hours past midnight", () => {
    expect(isOpenAt("11:30-14:00,17:00-22:00", MON, at(15))).toBe(false);
    expect(isOpenAt("11:30-14:00,17:00-22:00", MON, at(18))).toBe(true);
    expect(isOpenAt("Fr,Sa 18:00-02:00", 5, at(1))).toBe(true); // Saturday 01:00 is Friday's night
    expect(isOpenAt("Fr,Sa 18:00-02:00", 5, at(3))).toBe(false);
    expect(isOpenAt("Mo-Su 00:00-24:00", MON, at(23, 59))).toBe(true);
  });

  it("says unknown instead of guessing", () => {
    for (const raw of [
      "Mo-Fr 09:00-17:00; PH off",
      "sunrise-sunset",
      "Jun-Aug 10:00-18:00",
      "09:00+",
      "by appointment",
      "",
      "week 1-4 Mo 10:00-12:00",
    ])
      expect(isOpenAt(raw, MON, at(12))).toBeNull();
    expect(parseOpeningHours("x".repeat(300))).toBeNull();
  });

  it("finds the weekday and summarizes the day", () => {
    expect(weekdayIndex("2026-11-09")).toBe(0); // Monday
    expect(weekdayIndex("2026-11-08")).toBe(6);
    expect(weekdayIndex("nope")).toBeNull();
    expect(hoursForDay("Mo-Fr 09:00-17:00", MON)).toBe("09:00-17:00");
    expect(hoursForDay("Mo-Fr 09:00-17:00", SUN)).toBe("tutup");
    expect(hoursForDay("PH off", MON)).toBeNull();
  });
});
