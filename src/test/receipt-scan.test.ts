import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECEIPT_SCAN_CONFIG,
  cleanReceiptRead,
  convertToTripMinor,
  estimateCostIdr,
  formatReceiptAmount,
  jakartaDayStart,
  normalizeReceiptScanConfig,
  parseReceiptScanConfig,
  validateReceipt,
  type ReceiptRead,
} from "@/lib/receipt-scan";
import { validateAdminSetting } from "@/lib/admin-settings";

const read = (over: Partial<ReceiptRead> = {}): ReceiptRead => ({
  isReceipt: true,
  readable: true,
  merchant: "Fuglen Tokyo",
  date: "2026-11-04",
  currency: "JPY",
  total: 1480,
  items: [
    { name: "Cold brew", amount: 680 },
    { name: "Cheesecake", amount: 800 },
  ],
  categoryGuess: "Food & Drinks",
  uncertain: [],
  region: null,
  reason: null,
  ...over,
});

describe("receipt validation", () => {
  it("is ready when the items add up to the total", () => {
    const v = validateReceipt(read(), "2026-11-04");
    expect(v).toMatchObject({ matches: true, status: "ready", difference: 0, itemsSum: 1480 });
    expect(v.issues).toEqual([]);
  });

  it("flags a difference so a missed item is seen before saving", () => {
    const v = validateReceipt(
      read({
        total: 1290,
        items: [
          { name: "Ramen", amount: 890 },
          { name: "Telur", amount: 280 },
        ],
      }),
      "2026-11-04",
    );
    expect(v).toMatchObject({ matches: false, status: "check", difference: 120 });
    expect(v.issues).toContain("Jumlah item tidak sama dengan total");
  });

  it("does not compare when the receipt has no item lines", () => {
    expect(validateReceipt(read({ items: [] }), "2026-11-04")).toMatchObject({
      matches: null,
      status: "ready",
    });
  });

  it("flags missing or doubtful fields and implausible dates", () => {
    expect(validateReceipt(read({ total: null }), "2026-11-04").issues).toContain(
      "Total tidak terbaca",
    );
    expect(validateReceipt(read({ merchant: null }), "2026-11-04").status).toBe("check");
    expect(validateReceipt(read({ date: "2026-12-30" }), "2026-11-04").issues).toContain(
      "Tanggal di masa depan",
    );
    expect(validateReceipt(read({ date: "2024-01-01" }), "2026-11-04").issues).toContain(
      "Tanggal terlalu lama",
    );
    expect(validateReceipt(read({ currency: null }), "2026-11-04").status).toBe("check");
    expect(validateReceipt(read({ uncertain: ["total"] }), "2026-11-04").status).toBe("check");
  });

  it("tolerates a one-cent rounding gap on decimal currencies", () => {
    const v = validateReceipt(
      read({
        currency: "USD",
        total: 12.5,
        items: [
          { name: "a", amount: 6.25 },
          { name: "b", amount: 6.249 },
        ],
      }),
      "2026-11-04",
    );
    expect(v.matches).toBe(true);
  });
});

describe("reading the model's answer", () => {
  it("cleans a good answer", () => {
    const clean = cleanReceiptRead({
      is_receipt: true,
      readable: true,
      merchant: " Lawson ",
      date: "2026-11-04",
      currency: "jpy",
      total: "¥1,480",
      items: [
        { name: "Onigiri", amount: "220" },
        { name: "", amount: 1 },
        { name: "x", amount: "n/a" },
      ],
      category_guess: "Food & Drinks",
      uncertain: ["total", 3],
      region: { x: 0.1, y: 0.2, width: 0.5, height: 0.1 },
      reason: null,
    });
    expect(clean).toMatchObject({
      merchant: "Lawson",
      currency: "JPY",
      total: 1480,
      items: [{ name: "Onigiri", amount: 220 }],
      uncertain: ["total"],
      region: { x: 0.1, y: 0.2, width: 0.5, height: 0.1 },
    });
  });

  it("drops invalid fields instead of throwing", () => {
    const clean = cleanReceiptRead({
      date: "4 Nov",
      currency: "yen",
      total: "abc",
      region: { x: 2, y: 0, width: 1, height: 1 },
    });
    expect(clean).toMatchObject({
      date: null,
      currency: null,
      total: null,
      region: null,
      items: [],
    });
    expect(cleanReceiptRead(null)).toBeNull();
    expect(cleanReceiptRead({ is_receipt: false })?.isReceipt).toBe(false);
  });
});

describe("amounts, quota day and cost", () => {
  it("formats amounts the way the app shows them", () => {
    expect(formatReceiptAmount(1480, "JPY")).toBe("¥1.480");
    expect(formatReceiptAmount(149480, "IDR")).toMatch(/Rp\s?149\.480/);
  });

  it("converts to trip minor units", () => {
    expect(convertToTripMinor(1480, 101)).toBe(14_948_000);
    expect(convertToTripMinor(0.001, 1)).toBe(1);
  });

  it("starts the daily quota at midnight in Jakarta", () => {
    expect(jakartaDayStart(new Date("2026-11-04T10:00:00Z"))).toBe("2026-11-03T17:00:00.000Z");
    expect(jakartaDayStart(new Date("2026-11-04T18:00:00Z"))).toBe("2026-11-04T17:00:00.000Z");
  });

  it("estimates the AI cost per receipt in rupiah", () => {
    const cost = estimateCostIdr("glm-5.3-flash", { input: 2500, output: 600 });
    expect(cost).toBeCloseTo(12.0, 0);
    expect(estimateCostIdr("unknown-model", { input: 1, output: 1 })).toBe(0);
  });
});

describe("Admin setting", () => {
  it("has the agreed defaults", () => {
    expect(DEFAULT_RECEIPT_SCAN_CONFIG).toMatchObject({
      enabled: true,
      savePhoto: true,
      dailyLimit: 30,
      maxPhotos: 10,
      model: "glm-5.3-flash",
      strongModel: "glm-5.3-flashx",
    });
  });

  it("validates ranges, models and types", () => {
    expect(
      parseReceiptScanConfig({ dailyLimit: 50, maxPhotos: 5, savePhoto: false }),
    ).toMatchObject({
      dailyLimit: 50,
      maxPhotos: 5,
      savePhoto: false,
    });
    expect(() => parseReceiptScanConfig({ dailyLimit: 0 })).toThrow();
    expect(() => parseReceiptScanConfig({ maxPhotos: 99 })).toThrow();
    expect(() => parseReceiptScanConfig({ enabled: "yes" })).toThrow();
    expect(() => parseReceiptScanConfig({ model: "gpt-unknown" })).toThrow();
    expect(normalizeReceiptScanConfig({ dailyLimit: -1 })).toEqual(DEFAULT_RECEIPT_SCAN_CONFIG);
  });

  it("is accepted as an Admin setting key", () => {
    expect(validateAdminSetting("receiptScan", { enabled: false })).toBe(true);
    expect(() => validateAdminSetting("receiptScan", { enabled: 1 })).toThrow();
  });
});

describe("guessCategoryName", () => {
  it("guesses from the store name when the model gave no category", async () => {
    const { guessCategoryName } = await import("../lib/receipt-scan");
    expect(guessCategoryName("Alfamart DR. Sukarjo 49", [])).toBe("Shopping");
    expect(guessCategoryName("Ichiran Shibuya", ["Ramen"])).toBe("Food & Drinks");
    expect(guessCategoryName("Grab", [])).toBe("Transportation");
    expect(guessCategoryName("Xyz", [])).toBeNull();
  });
});
