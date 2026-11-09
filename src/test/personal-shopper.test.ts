import { describe, expect, it } from "vitest";
import {
  ADMIN_NEXT,
  DEFAULT_SHOPPER_CONFIG,
  DEFAULT_SHOPPER_FILTERS,
  bestSellerProducts,
  brandEnabled,
  canAdminCancel,
  countryEnabled,
  filterShopperProducts,
  mapStoreItem,
  normalizeShopperConfig,
  parseShopperConfig,
  quoteShopperOrder,
  soldLabel,
  trendingProducts,
  validateShopperAddress,
  type ShopperProduct,
} from "@/lib/personal-shopper";

const product = (over: Partial<ShopperProduct>): ShopperProduct => ({
  id: "p",
  brand: "uniqlo",
  code: "E1",
  name: "ヒートテックUネックT",
  nameId: null,
  category: "Inner",
  price: 1290,
  originalPrice: null,
  imageUrl: null,
  productUrl: "https://www.uniqlo.com/jp/ja/products/E1/00",
  rating: 4.5,
  ratingCount: 100,
  trend: 50,
  sold: 0,
  isNew: false,
  sizes: ["M"],
  colors: [],
  gallery: [],
  ...over,
});

describe("shopper config", () => {
  it("starts switched off, Japan only, Uniqlo and GU", () => {
    expect(DEFAULT_SHOPPER_CONFIG.enabled).toBe(false);
    expect(countryEnabled(DEFAULT_SHOPPER_CONFIG, "JP")).toBe(false);
    const on = parseShopperConfig({ enabled: true });
    expect(countryEnabled(on, "JP")).toBe(true);
    expect(countryEnabled(on, "KR")).toBe(false);
    expect(brandEnabled(on, "uniqlo")).toBe(true);
    expect(brandEnabled(on, "muji")).toBe(false);
  });
  it("never enables a brand without an adapter", () => {
    const on = parseShopperConfig({ enabled: true, brands: { muji: true } });
    expect(brandEnabled(on, "muji")).toBe(false);
  });
  it("rejects bad values and falls back on read", () => {
    expect(() => parseShopperConfig({ feePercent: 80 })).toThrow();
    expect(() => parseShopperConfig({ rates: { JPY: -1 } })).toThrow();
    expect(() => parseShopperConfig({ shippingIdr: 1.5 })).toThrow();
    expect(normalizeShopperConfig({ feePercent: 80 })).toEqual(DEFAULT_SHOPPER_CONFIG);
  });
});

describe("shopper pricing", () => {
  it("adds the fee (rounded up to Rp 100) and one shipping charge", () => {
    const q = quoteShopperOrder([{ unitMinor: 1290, quantity: 1 }], 105, {
      feePercent: 10,
      shippingIdr: 60000,
    });
    expect(q.subtotalIdr).toBe(135450);
    expect(q.feeIdr).toBe(13600);
    expect(q.shippingIdr).toBe(60000);
    expect(q.totalIdr).toBe(135450 + 13600 + 60000);
  });
  it("charges nothing for an empty cart", () => {
    expect(quoteShopperOrder([], 105, { feePercent: 10, shippingIdr: 60000 }).totalIdr).toBe(0);
  });
  it("multiplies by quantity", () => {
    const q = quoteShopperOrder([{ unitMinor: 1000, quantity: 3 }], 100, {
      feePercent: 0,
      shippingIdr: 0,
    });
    expect(q.totalIdr).toBe(300000);
  });
});

describe("shopper catalog rules", () => {
  const list = [
    product({ id: "a", name: "A", trend: 90, ratingCount: 10, price: 3000 }),
    product({
      id: "b",
      name: "B",
      trend: 70,
      sold: 5,
      price: 1000,
      brand: "gu",
      category: "Atasan",
    }),
    product({ id: "c", name: "C", trend: 60, originalPrice: 5000, price: 2000, isNew: true }),
  ];
  it("filters by brand, category, price and sale", () => {
    expect(
      filterShopperProducts(list, { ...DEFAULT_SHOPPER_FILTERS, brand: "gu" }).map((p) => p.id),
    ).toEqual(["b"]);
    expect(
      filterShopperProducts(list, { ...DEFAULT_SHOPPER_FILTERS, maxPrice: 2000 }).map((p) => p.id),
    ).toEqual(["b", "c"]);
    expect(
      filterShopperProducts(list, { ...DEFAULT_SHOPPER_FILTERS, onlySale: true }).map((p) => p.id),
    ).toEqual(["c"]);
    expect(
      filterShopperProducts(list, { ...DEFAULT_SHOPPER_FILTERS, category: "Atasan" }).map(
        (p) => p.id,
      ),
    ).toEqual(["b"]);
  });
  it("sorts by popularity, sales, price and newness", () => {
    const ids = (sort: "pop" | "best" | "low" | "high" | "new") =>
      filterShopperProducts(list, { ...DEFAULT_SHOPPER_FILTERS, sort }).map((p) => p.id);
    expect(ids("pop")).toEqual(["a", "b", "c"]);
    expect(ids("best")[0]).toBe("b");
    expect(ids("low")).toEqual(["b", "c", "a"]);
    expect(ids("high")).toEqual(["a", "c", "b"]);
    expect(ids("new")[0]).toBe("c");
  });
  it("finds Japanese names from English or Indonesian words", () => {
    const hits = (query: string) =>
      filterShopperProducts(
        [product({ id: "h" }), product({ id: "x", name: "フリースジャケット" })],
        { ...DEFAULT_SHOPPER_FILTERS, query },
      ).map((p) => p.id);
    expect(hits("heattech")).toEqual(["h"]);
    expect(hits("fleece")).toEqual(["x"]);
    expect(hits("jaket")).toEqual(["x"]);
    expect(hits("zzz")).toEqual([]);
  });
  it("builds the rails and never invents sales", () => {
    expect(trendingProducts(list, 2).map((p) => p.id)).toEqual(["a", "b"]);
    expect(bestSellerProducts(list, 1).map((p) => p.id)).toEqual(["b"]);
    expect(soldLabel({ sold: 5, ratingCount: 10 })).toBe("5 terjual");
    expect(soldLabel({ sold: 0, ratingCount: 1200 })).toBe("1,2rb ulasan");
    expect(soldLabel({ sold: 0, ratingCount: 0 })).toBe("Baru di katalog");
  });
});

describe("store item mapping", () => {
  const raw = {
    productId: "E469740-000",
    name: "ヒートテックUネックT/8分袖",
    priceGroup: "00",
    prices: { base: { currency: { code: "JPY" }, value: 1290 }, promo: null },
    colors: [
      { displayCode: "68", name: "BLUE" },
      { displayCode: "09", name: "BLACK" },
    ],
    images: {
      main: {
        "68": {
          image:
            "https://image.uniqlo.com/UQ/ST3/jp/imagesgoods/469740/item/jpgoods_68_469740_3x4.jpg",
        },
      },
    },
    representativeColorDisplayCode: "68",
    sizes: [{ name: "S" }, { name: "M" }],
    rating: { average: 4.5, count: 3114 },
    representative: { flags: { productFlags: [{ code: "newArrival" }] } },
  };
  it("maps a store item", () => {
    const row = mapStoreItem(raw, "uniqlo", "Inner", 0, 24)!;
    expect(row.productCode).toBe("E469740-000");
    expect(row.priceMinor).toBe(1290);
    expect(row.originalMinor).toBeNull();
    expect(row.productUrl).toBe("https://www.uniqlo.com/jp/ja/products/E469740-000/00");
    expect(row.sizes).toEqual(["S", "M"]);
    expect(row.colors).toHaveLength(2);
    expect(row.imageUrl).toContain("image.uniqlo.com");
    expect(row.isNew).toBe(true);
    expect(row.trendScore).toBeGreaterThan(90);
  });
  it("uses the promo price and keeps the base as the original", () => {
    const row = mapStoreItem(
      {
        ...raw,
        prices: { base: { currency: { code: "JPY" }, value: 3990 }, promo: { value: 2990 } },
      },
      "gu",
      "Jaket",
      5,
      24,
    )!;
    expect(row.priceMinor).toBe(2990);
    expect(row.originalMinor).toBe(3990);
  });
  it("drops anything it cannot sell safely", () => {
    expect(mapStoreItem(null, "uniqlo", "Inner", 0, 1)).toBeNull();
    expect(mapStoreItem({ ...raw, productId: "" }, "uniqlo", "Inner", 0, 1)).toBeNull();
    expect(
      mapStoreItem(
        { ...raw, prices: { base: { currency: { code: "USD" }, value: 10 } } },
        "uniqlo",
        "Inner",
        0,
        1,
      ),
    ).toBeNull();
    expect(
      mapStoreItem(
        { ...raw, images: { main: { "68": { image: "http://evil.example/x.jpg" } } } },
        "uniqlo",
        "Inner",
        0,
        1,
      )?.imageUrl,
    ).toBeNull();
  });
});

describe("order lifecycle and address", () => {
  it("moves one step at a time and cancels only before shipping", () => {
    expect(ADMIN_NEXT["PAID"]).toBe("PURCHASED");
    expect(ADMIN_NEXT["DELIVERED"]).toBeUndefined();
    expect(canAdminCancel("PAID")).toBe(true);
    expect(canAdminCancel("SHIPPED")).toBe(false);
  });
  it("validates the delivery address", () => {
    const ok = {
      recipientName: "Budi",
      whatsapp: "628123456789",
      addressLine: "Jl. Mawar No. 5",
      city: "Jakarta",
      postalCode: "12345",
    };
    expect(validateShopperAddress(ok)).toEqual({});
    expect(
      Object.keys(validateShopperAddress({ ...ok, whatsapp: "0812", postalCode: "12" })).sort(),
    ).toEqual(["postalCode", "whatsapp"]);
  });
});
