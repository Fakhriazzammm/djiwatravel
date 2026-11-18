import { describe, expect, it } from "vitest";
import {
  changePct,
  describeRange,
  normalizeRangeKey,
  parseDay,
  resolveRange,
} from "@/lib/date-range";

// Thursday 19 Nov 2026, 15:30 WIB
const NOW = new Date("2026-11-19T08:30:00Z");
const r = (range: string, from?: string, to?: string) =>
  resolveRange({ range, from, to }, "30h", NOW);
const day = (d: Date) => d.toISOString();

describe("date range presets (WIB)", () => {
  it("today and yesterday are calendar days in WIB", () => {
    const today = r("hari-ini");
    expect(day(today.from)).toBe("2026-11-18T17:00:00.000Z");
    expect(day(today.to)).toBe("2026-11-19T17:00:00.000Z");
    expect(today.granularity).toBe("hour");
    const yesterday = r("kemarin");
    expect(yesterday.fromDay).toBe("2026-11-18");
    expect(yesterday.toDay).toBe("2026-11-18");
    expect(day(yesterday.to)).toBe(day(today.from));
  });

  it("this week starts Monday and last week is the full week before", () => {
    expect(r("minggu-ini").fromDay).toBe("2026-11-16");
    const last = r("minggu-lalu");
    expect([last.fromDay, last.toDay, last.days]).toEqual(["2026-11-09", "2026-11-15", 7]);
  });

  it("this month, last month and this year", () => {
    const month = r("bulan-ini");
    expect([month.fromDay, month.days]).toEqual(["2026-11-01", 19]);
    expect(month.prevFrom.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    const last = r("bulan-lalu");
    expect([last.fromDay, last.toDay, last.days]).toEqual(["2026-10-01", "2026-10-31", 31]);
    expect(r("tahun-ini").fromDay).toBe("2026-01-01");
  });

  it("rolling ranges end today and compare to the same length before", () => {
    const week = r("7h");
    expect([week.fromDay, week.toDay, week.days]).toEqual(["2026-11-13", "2026-11-19", 7]);
    expect(day(week.prevTo)).toBe(day(week.from));
    expect(week.to.getTime() - week.from.getTime()).toBe(
      week.prevTo.getTime() - week.prevFrom.getTime(),
    );
  });

  it("custom ranges validate, swap and cap", () => {
    const c = r("kustom", "2026-11-05", "2026-11-10");
    expect([c.fromDay, c.toDay, c.days, c.custom]).toEqual(["2026-11-05", "2026-11-10", 6, true]);
    expect(r("kustom", "2026-11-10", "2026-11-05").fromDay).toBe("2026-11-05");
    expect(r("kustom", "2026-11-05", "2026-11-05").granularity).toBe("hour");
    expect(r("kustom", "2020-01-01", "2026-11-05").days).toBe(366);
    // Invalid dates fall back instead of reaching SQL.
    expect(r("kustom", "2026-13-40", "x").key).toBe("30h");
    expect(parseDay("2026-02-30")).toBeNull();
  });

  it("keeps old links working and describes the range", () => {
    expect(normalizeRangeKey("all", "30h")).toBe("semua");
    expect(normalizeRangeKey("hack", "7h")).toBe("7h");
    expect(r("bulan-lalu").label).toBe("Bulan lalu");
    expect(describeRange(r("kemarin"))).toContain("2026");
    expect(changePct(150, 100)).toBe(50);
    expect(changePct(1, 0)).toBeNull();
  });
});
