import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseProductReference,
  productPhotoMime,
  discoveryOfferSchema,
  offerTotal,
} from "@/lib/shopper-discovery";
const mock = vi.hoisted(() => ({ query: vi.fn(), pay: vi.fn(), admin: vi.fn(), user: vi.fn() }));
vi.mock("@/db/client.server", () => ({
  pool: { query: mock.query, connect: async () => ({ query: mock.query, release: vi.fn() }) },
}));
vi.mock("@/lib/customer-session.fn", () => ({ getAuthenticatedUser: mock.user }));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: mock.admin }));
vi.mock("@/lib/admin-guard.server", () => ({
  getAdminEmailHandler: async () => "admin@example.test",
}));
vi.mock("@/lib/push.server", () => ({ createCustomerNotification: async () => ({}) }));
vi.mock("@/lib/personal-shopper.server", () => ({
  getShopperConfig: async () => ({
    enabled: true,
    countries: { JP: true },
    rates: { JPY: 114 },
    paymentWindowMinutes: 60,
  }),
  payShoppingOrderHandler: mock.pay,
  discoverCatalogProducts: async () => [],
}));
import {
  acceptDiscoveryOffer,
  adminDiscoveryAction,
  customerDiscoveryAction,
} from "@/lib/shopper-discovery.server";
const offer = {
  name: "Used wool jacket",
  merchant: "Mercari seller",
  productUrl: "https://jp.mercari.com/item/m123",
  condition: "Bekas; noda kecil di lengan",
  variant: "M / hitam",
  quantity: 2,
  unitJpy: 1000,
  rateIdr: 114,
  unitIdr: 114000,
  domesticIdr: 20000,
  feeIdr: 30000,
  shippingIdr: 60000,
  note: "Periksa kondisi pada foto",
};
const address = {
  recipientName: "Test Customer",
  whatsapp: "628123456789",
  addressLine: "Jalan Contoh Nomor 10",
  city: "Bandung",
  postalCode: "40111",
};
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let row: Record<string, unknown>, orders: unknown[][];
beforeEach(() => {
  vi.clearAllMocks();
  mock.user.mockResolvedValue({ id: "owner", email: "owner@example.test" });
  mock.admin.mockResolvedValue(undefined);
  mock.pay.mockResolvedValue({ paymentUrl: "https://payment.example.test/invoice" });
  row = {
    id,
    customer_auth_subject: "owner",
    status: "OFFERED",
    version: 3,
    offer,
    offer_expires_at: new Date(Date.now() + 3600000),
    order_id: null,
  };
  orders = [];
  mock.query.mockImplementation(async (sql: string, args: unknown[] = []) => {
    if (sql.includes("select value_json")) return { rows: [] };
    if (sql.includes("select * from shopping_discovery_requests"))
      return {
        rows: args.length < 2 || args[1] === row["customer_auth_subject"] ? [{ ...row }] : [],
      };
    if (sql.includes("set status=$2,offer=")) {
      row["status"] = args[1];
      row["offer"] = JSON.parse(String(args[2]));
      row["version"] = Number(row["version"]) + 1;
      return { rows: [{ ...row }] };
    }
    if (sql.includes("select count(*)")) return { rows: [{ n: 0 }] };
    if (sql.includes("insert into shopping_orders(")) orders.push(args);
    if (sql.includes("set status='ORDERED'")) {
      row["order_id"] = args[1];
      row["status"] = "ORDERED";
      row["version"] = 4;
    }
    return { rows: [] };
  });
});
describe("discovery references and uploads", () => {
  it("resolves only exact Japanese official product paths", () => {
    expect(
      parseProductReference("https://www.uniqlo.com/jp/ja/products/E471809-000/00"),
    ).toMatchObject({ brand: "uniqlo", code: "471809" });
    expect(parseProductReference("https://jp.mercari.com/item/m123").brand).toBeNull();
    expect(
      parseProductReference("https://www.uniqlo.com.evil.test/jp/ja/products/E471809-000").brand,
    ).toBeNull();
    expect(
      parseProductReference("https://www.uniqlo.com/id/products/E471809-000").brand,
    ).toBeNull();
  });
  it.each([
    "http://localhost/item",
    "https://127.0.0.1/item",
    "https://user:password@shop.example/item",
    "javascript:alert(1)",
    "https://server.local/item",
    "https://[::1]/item",
  ])("rejects unsafe reference %s", (url) => expect(() => parseProductReference(url)).toThrow());
  it("checks image signatures and size rather than extensions", () => {
    expect(productPhotoMime(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]))).toBe(
      "image/png",
    );
    expect(productPhotoMime(new TextEncoder().encode('<svg onload="alert(1)"></svg>'))).toBeNull();
    expect(productPhotoMime(new Uint8Array(5242881))).toBeNull();
  });
  it("totals all approved fees and rejects fractional prices", () => {
    expect(offerTotal(discoveryOfferSchema.parse(offer))).toBe(338000);
    expect(() => discoveryOfferSchema.parse({ ...offer, unitIdr: 1.2 })).toThrow();
  });
});
describe("owner, version and payment contract", () => {
  it("denies acceptance of another customer's request", async () => {
    mock.user.mockResolvedValue({ id: "intruder", email: "intruder@example.test" });
    await expect(acceptDiscoveryOffer({ id, expectedVersion: 3, address })).rejects.toThrow(
      "tidak ditemukan",
    );
    expect(orders).toHaveLength(0);
    expect(mock.pay).not.toHaveBeenCalled();
  });
  it("rejects a stale or expired offer before creating an order", async () => {
    await expect(acceptDiscoveryOffer({ id, expectedVersion: 2, address })).rejects.toThrow(
      "berubah",
    );
    row["offer_expires_at"] = new Date(0);
    await expect(acceptDiscoveryOffer({ id, expectedVersion: 3, address })).rejects.toThrow(
      "kedaluwarsa",
    );
    expect(orders).toHaveLength(0);
  });
  it("creates one order, freezes the quote amounts, and adopts it on a retry", async () => {
    const a = await acceptDiscoveryOffer({ id, expectedVersion: 3, address });
    const b = await acceptDiscoveryOffer({ id, expectedVersion: 3, address });
    expect(a.orderId).toBe(b.orderId);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.at(-1)).toBe(20000);
    expect(orders[0]?.slice(3, 8)).toEqual([114, 228000, 30000, 60000, 338000]);
  });
  it("keeps the order available when invoice creation fails", async () => {
    mock.pay.mockRejectedValue(new Error("provider timeout"));
    const a = await acceptDiscoveryOffer({ id, expectedVersion: 3, address });
    expect(a.orderId).toBeTruthy();
    expect(a.paymentUrl).toBeNull();
    expect(a.error).toContain("detail pesanan");
    await acceptDiscoveryOffer({ id, expectedVersion: 3, address });
    expect(orders).toHaveLength(1);
  });
  it("checks admin authorization before modifying an offer", async () => {
    mock.admin.mockRejectedValue(new Error("forbidden"));
    await expect(
      adminDiscoveryAction({
        id,
        expectedVersion: 3,
        action: "offer",
        note: "Ready",
        offer,
        expiresHours: 24,
        verifiedJapan: true,
      }),
    ).rejects.toThrow("forbidden");
    expect(mock.query).not.toHaveBeenCalled();
  });
  it("publishes a server-calculated offer and blocks stale exchange rates", async () => {
    const corrected = { ...offer, unitIdr: 1 };
    await adminDiscoveryAction({
      id,
      expectedVersion: 3,
      action: "offer",
      note: "Barang sudah diperiksa",
      offer: corrected,
      expiresHours: 24,
      verifiedJapan: true,
    });
    expect((row["offer"] as typeof offer).unitIdr).toBe(114000);
    expect(row["version"]).toBe(4);
    await expect(
      adminDiscoveryAction({
        id,
        expectedVersion: 4,
        action: "offer",
        note: "Revisi",
        offer: { ...offer, rateIdr: 100 },
        expiresHours: 24,
        verifiedJapan: true,
      }),
    ).rejects.toThrow("Kurs berubah");
  });
  it("treats repeated submission as the same already submitted request", async () => {
    row["status"] = "SEARCHING";
    row["version"] = 3;
    await expect(
      customerDiscoveryAction({ id, expectedVersion: 1, action: "submit", note: "" }),
    ).resolves.toEqual({ ok: true });
    expect(
      mock.query.mock.calls.some((c) =>
        String(c[0]).includes("insert into shopping_discovery_events"),
      ),
    ).toBe(false);
  });
  it("allows the owner to request a fresh offer after expiry", async () => {
    row["offer_expires_at"] = new Date(0);
    await expect(
      customerDiscoveryAction({ id, expectedVersion: 3, action: "refresh_offer", note: "" }),
    ).resolves.toEqual({ ok: true });
    expect(
      mock.query.mock.calls.find((c) => String(c[0]).includes("set status=$2,note="))?.[1]?.[1],
    ).toBe("SUBMITTED");
  });
  it("rejects stale owner updates", async () => {
    await expect(
      customerDiscoveryAction({ id, expectedVersion: 1, action: "decline", note: "" }),
    ).rejects.toThrow("berubah");
  });
});
