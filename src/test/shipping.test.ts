import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHIPPING_CONFIG,
  JAPAN_PREFECTURES,
  SHIPPING_ADMIN_NEXT,
  SHIPPING_STEPS,
  adminCanBill,
  adminCanCancel,
  adminCanReject,
  billedWeightKg,
  customerCanCancel,
  dropDeadline,
  estimateShippingIdr,
  formatKg,
  normalizeJapanPhone,
  normalizeJapanPostal,
  mapsSearchUrl,
  normalizeShippingConfig,
  parseShippingConfig,
  quoteShipping,
  shippingCodeFrom,
  shippingCountryEnabled,
  shippingIsDead,
  shippingIsPaid,
  shippingMarginIdr,
  validateShippingGoods,
  validateShippingInbound,
  validateShippingRecipient,
} from "../lib/shipping";

const rule = { minKg: 1, roundKg: 0.5 };

describe("shipping price", () => {
  it("rounds the scale weight up to the next half kilogram and bills the tariff", () => {
    expect(billedWeightKg(2.4, rule)).toBe(2.5);
    expect(billedWeightKg(2.5, rule)).toBe(2.5);
    expect(billedWeightKg(2.51, rule)).toBe(3);
    const quote = quoteShipping({ weighedKg: 2.4, rateIdrPerKg: 150_000, ...rule });
    expect(quote).toEqual({ billedKg: 2.5, freightIdr: 375_000, totalIdr: 375_000 });
  });

  it("never bills below the minimum and adds the packing charge", () => {
    expect(billedWeightKg(0.3, rule)).toBe(1);
    const quote = quoteShipping({
      weighedKg: 0.3,
      rateIdrPerKg: 150_000,
      ...rule,
      packingIdr: 25_000,
    });
    expect(quote.totalIdr).toBe(175_000);
  });

  it("does not drift on floating point steps", () => {
    expect(billedWeightKg(1.1 + 0.4, rule)).toBe(1.5);
    expect(billedWeightKg(0.1 + 0.2 + 1.2, rule)).toBe(1.5);
  });

  it("estimates the same way the bill is computed", () => {
    expect(estimateShippingIdr(2, rule, 150_000)).toBe(300_000);
  });

  it("works out the margin against the partner price", () => {
    expect(shippingMarginIdr({ totalIdr: 375_000, billedKg: 2.5, partnerIdrPerKg: 100_000 })).toBe(
      125_000,
    );
    expect(
      shippingMarginIdr({ totalIdr: null, billedKg: null, partnerIdrPerKg: 100_000 }),
    ).toBeNull();
  });

  it("formats kilograms the Indonesian way", () => {
    expect(formatKg(2.5)).toBe("2,5 kg");
    expect(formatKg(2)).toBe("2 kg");
  });
});

describe("shipping config", () => {
  it("ships off with the agreed Japan tariff, partner price, drop point and windows", () => {
    const d = DEFAULT_SHIPPING_CONFIG;
    expect(d.enabled).toBe(false);
    expect(d.countries.JP).toEqual({
      enabled: true,
      rateIdrPerKg: 150_000,
      partnerCostIdrPerKg: 100_000,
    });
    expect(d.dropPoint.address).toContain("Jl. Bojong Tengah No. 34");
    expect(d.dropPoint.address).toContain("Tasikmalaya");
    expect(d.dropPoint.hours).toBe("09.00 sampai 17.00 WIB");
    expect(d.dropDeadlineDays).toBe(7);
    expect(d.paymentWindowHours).toBe(48);
  });

  it("only opens the service when the master switch and the country are on", () => {
    expect(shippingCountryEnabled(DEFAULT_SHIPPING_CONFIG, "JP")).toBe(false);
    expect(shippingCountryEnabled({ ...DEFAULT_SHIPPING_CONFIG, enabled: true }, "JP")).toBe(true);
  });

  it("parses a partial value over the defaults and rejects bad numbers", () => {
    const parsed = parseShippingConfig({
      enabled: true,
      countries: { JP: { rateIdrPerKg: 160_000 } },
    });
    expect(parsed.enabled).toBe(true);
    expect(parsed.countries.JP.rateIdrPerKg).toBe(160_000);
    expect(parsed.countries.JP.partnerCostIdrPerKg).toBe(100_000);
    expect(() => parseShippingConfig({ countries: { JP: { rateIdrPerKg: 5 } } })).toThrow();
    expect(() => parseShippingConfig({ minKg: 5, maxKg: 2 })).toThrow();
    expect(() => parseShippingConfig({ couriers: [] })).toThrow();
    expect(() => parseShippingConfig({ dropPoint: { mapUrl: "http://x.example/a" } })).toThrow();
  });

  it("falls back to the defaults when a stored value no longer validates", () => {
    expect(normalizeShippingConfig({ dropDeadlineDays: 0 })).toEqual(DEFAULT_SHIPPING_CONFIG);
    expect(normalizeShippingConfig(null)).toEqual(DEFAULT_SHIPPING_CONFIG);
  });
});

describe("shipping validation", () => {
  const ok = {
    recipientName: "Rina Tanaka",
    phone: "+81 90 1234 5678",
    postalCode: "150-0002",
    prefecture: "Tokyo",
    city: "Shibuya-ku",
    addressLine: "2-21-1 Shibuya, Apt 302",
  };

  it("accepts a complete Japan recipient", () => {
    expect(validateShippingRecipient(ok)).toEqual({});
    expect(JAPAN_PREFECTURES).toHaveLength(47);
  });

  it("normalizes Japan phone numbers and postal codes", () => {
    expect(normalizeJapanPhone("+81 90-1234-5678")).toBe("+819012345678");
    expect(normalizeJapanPhone("090 1234 5678")).toBe("+819012345678");
    expect(normalizeJapanPhone("0812345678")).toBe("+81812345678");
    expect(normalizeJapanPhone("+62 812 3456 7890")).toBeNull();
    expect(normalizeJapanPostal("1500002")).toBe("150-0002");
    expect(normalizeJapanPostal("150-0002")).toBe("150-0002");
    expect(normalizeJapanPostal("15000")).toBeNull();
  });

  it("reports each bad recipient field", () => {
    const errors = validateShippingRecipient({
      recipientName: "田中",
      phone: "12",
      postalCode: "1",
      prefecture: "Atlantis",
      city: "渋谷",
      addressLine: "x",
    });
    expect(Object.keys(errors).sort()).toEqual(
      ["addressLine", "city", "phone", "postalCode", "prefecture", "recipientName"].sort(),
    );
  });

  it("checks goods, weight limits and the rules agreement", () => {
    const goods = {
      category: "Makanan kering",
      contents: "Keripik, kopi bubuk",
      declaredValueIdr: 650_000,
      estimatedKg: 2,
      acceptedRules: true,
    };
    const limits = { minKg: 1, maxKg: 30, roundKg: 0.5 };
    expect(validateShippingGoods(goods, limits)).toEqual({});
    expect(validateShippingGoods({ ...goods, acceptedRules: false }, limits)).toHaveProperty(
      "acceptedRules",
    );
    expect(validateShippingGoods({ ...goods, estimatedKg: 31 }, limits)).toHaveProperty(
      "estimatedKg",
    );
    expect(validateShippingGoods({ ...goods, category: "Senjata" }, limits)).toHaveProperty(
      "category",
    );
  });

  it("asks for a courier and a receipt number only when the parcel comes by courier", () => {
    expect(validateShippingInbound({ mode: "SELF", courier: "", tracking: "" })).toEqual({});
    expect(
      Object.keys(validateShippingInbound({ mode: "COURIER", courier: "", tracking: "" })),
    ).toEqual(["inboundCourier", "inboundTracking"]);
  });
});

describe("shipping lifecycle", () => {
  it("numbers codes like the prototype and sets the drop deadline", () => {
    expect(shippingCodeFrom(42)).toBe("DJW-KR-0042");
    expect(dropDeadline(new Date("2026-11-18T00:00:00Z"), 7).toISOString()).toBe(
      "2026-11-25T00:00:00.000Z",
    );
  });

  it("moves forward one step at a time and splits reject from cancel by payment", () => {
    expect(SHIPPING_ADMIN_NEXT.AWAITING_DROP).toBe("RECEIVED");
    expect(SHIPPING_ADMIN_NEXT.PAID).toBe("SHIPPED");
    expect(SHIPPING_ADMIN_NEXT.RECEIVED).toBeUndefined(); // billing is its own action
    expect(adminCanBill("RECEIVED")).toBe(true);
    expect(adminCanBill("PAID")).toBe(false);
    expect(adminCanReject("RECEIVED")).toBe(true);
    expect(adminCanReject("PAID")).toBe(false);
    expect(adminCanCancel("PAID")).toBe(true);
    expect(adminCanCancel("SHIPPED")).toBe(false);
    expect(customerCanCancel("AWAITING_DROP")).toBe(true);
    expect(customerCanCancel("RECEIVED")).toBe(false);
  });

  it("knows which statuses are paid and which are over", () => {
    expect(shippingIsPaid("PAID")).toBe(true);
    expect(shippingIsPaid("PAYMENT_PENDING")).toBe(false);
    expect(shippingIsPaid("CANCELLED")).toBe(false);
    expect(shippingIsDead("REJECTED")).toBe(true);
    expect(shippingIsDead("DELIVERED")).toBe(false);
    expect(SHIPPING_STEPS[0]).toBe("AWAITING_DROP");
    expect(SHIPPING_STEPS.at(-1)).toBe("DELIVERED");
  });
});

describe("drop point map link", () => {
  it("searches Google Maps for the drop point name and address", () => {
    const url = new URL(mapsSearchUrl(DEFAULT_SHIPPING_CONFIG.dropPoint));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/search/");
    expect(url.searchParams.get("query")).toBe(
      "Djiwa Tasikmalaya, Jl. Bojong Tengah No. 34, Kec. Cipedes, Tasikmalaya, Jawa Barat",
    );
  });
});
