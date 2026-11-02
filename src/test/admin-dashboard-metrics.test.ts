import { describe, expect, it } from "vitest";
import {
  averageOrderValue,
  barPercent,
  formatDelta,
  percentChange,
  sharePercent,
} from "@/lib/admin-dashboard-metrics";

describe("admin dashboard metrics", () => {
  it("returns a signed percent change and no delta without a positive baseline", () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(75, 100)).toBe(-25);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(5, null)).toBeNull();
    expect(formatDelta(20)).toBe("+20%");
    expect(formatDelta(-25)).toBe("−25%");
    expect(formatDelta(0)).toBe("0%");
    expect(formatDelta(null)).toBeNull();
  });

  it("computes shares and average order value without dividing by zero", () => {
    expect(sharePercent(1, 4)).toBe(25);
    expect(sharePercent(1, 0)).toBeNull();
    expect(averageOrderValue(300000, 3)).toBe(100000);
    expect(averageOrderValue(300000, 0)).toBeNull();
    expect(averageOrderValue(null, 3)).toBeNull();
  });

  it("keeps non-zero bars visible and caps them at the full height", () => {
    expect(barPercent(1, 1000)).toBe(4);
    expect(barPercent(0, 1000)).toBe(0);
    expect(barPercent(1000, 1000)).toBe(100);
    expect(barPercent(5, 0)).toBe(0);
  });
});
