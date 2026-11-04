import { describe, expect, it } from "vitest";
import { itemsRemainder, totalsAfterDelta } from "@/lib/expense-items";

describe("Expense total after an item changes", () => {
  const rupiah = {
    originalMinor: 20_350_000,
    convertedMinor: 20_350_000,
    rate: null,
    sameCurrency: true,
  };

  it("lowers the total by exactly the removed item and keeps tax and service", () => {
    expect(totalsAfterDelta(rupiah, -5_000_000)).toEqual({
      originalMinor: 15_350_000,
      convertedMinor: 15_350_000,
    });
  });

  it("raises the total when an item is added or made pricier", () => {
    expect(totalsAfterDelta(rupiah, 1_000_000)?.originalMinor).toBe(21_350_000);
  });

  it("converts a foreign-currency change with the stored rate", () => {
    const yen = {
      originalMinor: 148_000,
      convertedMinor: 16_576,
      rate: 0.112,
      sameCurrency: false,
    };
    expect(totalsAfterDelta(yen, -68_000)).toEqual({
      originalMinor: 80_000,
      convertedMinor: 8_960,
    });
  });

  it("scales proportionally when a foreign expense has no stored rate", () => {
    const noRate = { originalMinor: 1_000, convertedMinor: 5_000, rate: null, sameCurrency: false };
    expect(totalsAfterDelta(noRate, -500)).toEqual({ originalMinor: 500, convertedMinor: 2_500 });
  });

  it("refuses a total that would be zero or negative", () => {
    expect(totalsAfterDelta(rupiah, -20_350_000)).toBeNull();
    expect(totalsAfterDelta(rupiah, -30_000_000)).toBeNull();
  });
});

describe("What the items do not explain", () => {
  it("is the gap between the total and the sum of items", () => {
    expect(itemsRemainder(1_500, [600, 800])).toBe(100);
    expect(itemsRemainder(1_400, [600, 800])).toBe(0);
  });

  it("is zero when there are no items", () => {
    expect(itemsRemainder(1_500, [])).toBe(0);
  });
});
