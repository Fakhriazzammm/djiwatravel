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

import { parseItemsNote } from "@/lib/expense-items";

describe("Reading the items out of an older scan note", () => {
  it("reads a real rupiah note, tax line included, and the amounts add up to the total", () => {
    const items = parseItemsNote(
      "Dari scan struk: Black Ice Rp25.000, Latte Ice Rp25.000, Cranberry Cheese Rp35.000, Poured Tiramisu Rp45.000, Carbonara Rp55.000, Tax (10%) Rp18.500",
      "IDR",
    );
    expect(items).toHaveLength(6);
    expect(items?.[0]).toEqual({ name: "Black Ice", amountMinor: 2_500_000 });
    expect(items?.[5]).toEqual({ name: "Tax (10%)", amountMinor: 1_850_000 });
    expect(items?.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(20_350_000);
  });

  it("keeps digits and apostrophes inside a name", () => {
    const items = parseItemsNote(
      "Dari scan struk: Air Mineral 600ml Rp7.000, Tisu Wajah 200's Rp12.900",
      "IDR",
    );
    expect(items?.map((item) => item.name)).toEqual(["Air Mineral 600ml", "Tisu Wajah 200's"]);
    expect(items?.map((item) => item.amountMinor)).toEqual([700_000, 1_290_000]);
  });

  it("reads yen without decimals and euro with a decimal comma", () => {
    expect(parseItemsNote("Dari scan struk: Cold brew ¥680, Cheesecake ¥800", "JPY")).toEqual([
      { name: "Cold brew", amountMinor: 68_000 },
      { name: "Cheesecake", amountMinor: 80_000 },
    ]);
    expect(parseItemsNote("Dari scan struk: Kaffee €3,50", "EUR")).toEqual([
      { name: "Kaffee", amountMinor: 350 },
    ]);
  });

  it("leaves a note alone unless every part reads cleanly", () => {
    expect(parseItemsNote("Dari scan struk: Latte Rp25.000, ???", "IDR")).toBeNull();
    expect(parseItemsNote("Dari scan struk", "IDR")).toBeNull();
    expect(parseItemsNote("Beli oleh-oleh untuk ibu Rp50.000", "IDR")).toBeNull();
    expect(parseItemsNote(null, "IDR")).toBeNull();
  });
});
