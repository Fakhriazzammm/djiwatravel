import { describe, expect, it } from "vitest";
import { formatTripMoney, tripCurrencyCode } from "@/lib/trip-money";

describe("trip money formatting", () => {
  it("never throws on an empty or malformed currency; falls back to IDR", () => {
    expect(tripCurrencyCode("")).toBe("IDR");
    expect(tripCurrencyCode(null)).toBe("IDR");
    expect(tripCurrencyCode("XYZ1")).toBe("IDR");
    expect(tripCurrencyCode(" jpy ")).toBe("JPY");
    expect(() => formatTripMoney(150000, "")).not.toThrow();
    expect(formatTripMoney(150000, "")).toContain("1.500");
  });

  it("formats minor units with the currency when it is valid", () => {
    expect(formatTripMoney(100000, "IDR")).toContain("1.000");
    expect(formatTripMoney(undefined, null)).toContain("0");
  });
});
