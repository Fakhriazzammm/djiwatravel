import { describe, expect, it } from "vitest";
import { compactMoney, stepFor } from "@/lib/trip-budget-format";

describe("trip budget formatting", () => {
  it("shortens rupiah amounts", () => {
    expect(compactMoney(300_000_000, "IDR")).toBe("3 jt");
    expect(compactMoney(120_000_000, "IDR")).toBe("1,2 jt");
    expect(compactMoney(75_000_000, "IDR")).toBe("750 rb");
    expect(compactMoney(0, "IDR")).toBe("0");
  });

  it("uses a sensible stepper size per currency", () => {
    expect(stepFor("IDR")).toBe(100_000);
    expect(stepFor("USD")).toBe(50);
    expect(stepFor("")).toBe(100_000);
  });
});
