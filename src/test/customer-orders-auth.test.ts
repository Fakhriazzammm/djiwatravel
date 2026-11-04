import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
  profile: null as null | Record<string, unknown>,
  existing: [] as Array<Record<string, unknown>>,
  inserted: [] as Array<{ table: string; values: Record<string, unknown> }>,
  packages: [] as Array<Record<string, unknown>>,
  fulfillmentMode: "instant" as "instant" | "preorder",
}));

vi.mock("../lib/customer-session.fn", () => ({
  getAuthenticatedUser: vi.fn(async () => {
    if (!state.user) throw new Error("Sesi tidak valid");
    return state.user;
  }),
}));

vi.mock("../lib/customer-profile.server", () => ({
  readCustomerProfile: vi.fn(async () => state.profile),
}));

vi.mock("../lib/esim-access-catalog", () => ({
  loadLiveResellerPackage: vi.fn(async () => null),
}));

vi.mock("../lib/reseller-catalog-cache", () => ({
  getResellerCatalog: vi.fn(async () => ({ packages: state.packages })),
}));

vi.mock("../lib/sellability.server", () => ({
  resolveOrderFulfillment: vi.fn(async () => state.fulfillmentMode),
}));

vi.mock("../db/client.server", () => {
  const select = () => ({
    from: () => ({
      where: () => ({
        limit: async () => {
          if (state.existing.length) return state.existing.slice(0, 1);
          // After the transaction, the handler re-reads the row it just inserted.
          return state.inserted
            .filter((row) => row.table === "customer_orders")
            .map((row) => ({ ...row.values }));
        },
      }),
    }),
  });
  const tx = {
    insert: (table: { _tableName?: string }) => ({
      values: async (values: Record<string, unknown>) => {
        state.inserted.push({ table: String(table?._tableName ?? "unknown"), values });
      },
    }),
  };
  return {
    db: {
      select,
      transaction: async (cb: (t: typeof tx) => Promise<void>) => cb(tx),
    },
  };
});

vi.mock("../../drizzle/schema", () => ({
  customerOrders: {
    _tableName: "customer_orders",
    id: "id",
    idempotencyKey: "idempotencyKey",
    status: "status",
    totalAmount: "totalAmount",
    customerAuthSubject: "customerAuthSubject",
    createdAt: "createdAt",
    paymentExpiresAt: "paymentExpiresAt",
    fulfillmentMode: "fulfillmentMode",
    preorderStatus: "preorderStatus",
    preorderDeadlineAt: "preorderDeadlineAt",
  },
  customerOrderItems: { _tableName: "customer_order_items" },
  customerOrderPaymentDetails: { _tableName: "customer_order_payment_details" },
}));

import {
  createAuthenticatedOrderDraftHandler,
  createAuthenticatedOrderInput,
} from "../lib/customer-orders.server";

const KEY = "11111111-1111-4111-8111-111111111111";
const PACKAGE = {
  packageCode: "PKG-1",
  name: "Japan 1GB",
  locationCodes: ["JP"],
  volumeBytes: 1_000_000_000,
  durationDays: 7,
  supportsTopUp: false,
  providerPriceUnits: 100,
  sellingPrice: { providerCostIdr: 20_000, markupIdr: 5_000, sellingPriceIdr: 25_000 },
};

const completeProfile = {
  email: "owner@example.com",
  whatsapp: "+6281234567890",
  displayName: "Owner",
  nationality: "ID",
  dateOfBirth: "1990-01-01",
  gender: "unspecified",
};

describe("createAuthenticatedOrderInput", () => {
  it("rejects owner, contact, or token fields smuggled from the browser", () => {
    expect(() =>
      createAuthenticatedOrderInput({
        packageCode: "PKG-1",
        paymentMethod: "qris",
        idempotencyKey: KEY,
        email: "attacker@example.com",
      }),
    ).not.toThrow();
    const parsed = createAuthenticatedOrderInput({
      packageCode: "PKG-1",
      paymentMethod: "qris",
      idempotencyKey: KEY,
      email: "attacker@example.com",
      customerAuthSubject: "someone-else",
    });
    expect(parsed).not.toHaveProperty("email");
    expect(parsed).not.toHaveProperty("customerAuthSubject");
  });

  it("refuses payment methods outside qris and djiwa_pay", () => {
    expect(() =>
      createAuthenticatedOrderInput({
        packageCode: "PKG-1",
        paymentMethod: "va",
        idempotencyKey: KEY,
      }),
    ).toThrow();
  });
});

describe("createAuthenticatedOrderDraftHandler", () => {
  beforeEach(() => {
    state.user = { id: "subject-a", email: "owner@example.com" };
    state.profile = completeProfile;
    state.existing = [];
    state.inserted = [];
    state.packages = [PACKAGE];
    state.fulfillmentMode = "instant";
  });

  it("creates nothing without a verified session", async () => {
    state.user = null;
    await expect(
      createAuthenticatedOrderDraftHandler({
        data: { packageCode: "PKG-1", paymentMethod: "qris", idempotencyKey: KEY },
      }),
    ).rejects.toThrow("Sesi tidak valid");
    expect(state.inserted).toHaveLength(0);
  });

  it("refuses checkout until the profile has email and WhatsApp", async () => {
    state.profile = { ...completeProfile, whatsapp: "" };
    await expect(
      createAuthenticatedOrderDraftHandler({
        data: { packageCode: "PKG-1", paymentMethod: "qris", idempotencyKey: KEY },
      }),
    ).rejects.toThrow("Profil belum lengkap");
    expect(state.inserted).toHaveLength(0);
  });

  it("writes the owner and profile contacts server-side, never from the request", async () => {
    await createAuthenticatedOrderDraftHandler({
      data: { packageCode: "PKG-1", paymentMethod: "djiwa_pay", idempotencyKey: KEY },
    });
    const order = state.inserted.find((row) => row.table === "customer_orders");
    const details = state.inserted.find((row) => row.table === "customer_order_payment_details");
    expect(order?.values["customerAuthSubject"]).toBe("subject-a");
    expect(order?.values["totalAmount"]).toBe("25000");
    expect(details?.values).toMatchObject({
      email: completeProfile.email,
      whatsapp: completeProfile.whatsapp,
      paymentMethod: "djiwa_pay",
    });
  });

  it("records preorder intent only after the server classifies it as preorder", async () => {
    state.fulfillmentMode = "preorder";
    await createAuthenticatedOrderDraftHandler({
      data: {
        packageCode: "PKG-1",
        paymentMethod: "qris",
        idempotencyKey: KEY,
        preorderRequested: true,
      },
    });
    const order = state.inserted.find((row) => row.table === "customer_orders");
    expect(order?.values).toMatchObject({
      fulfillmentMode: "preorder",
      preorderStatus: "pending_payment",
    });
    expect(order?.values).not.toHaveProperty("preorderDeadlineAt");
  });

  it("returns the existing order for the same subject on retry", async () => {
    state.existing = [
      {
        id: "order-1",
        publicOrderCode: "ABC",
        status: "ORDER_CREATED",
        totalAmount: "25000",
        customerAuthSubject: "subject-a",
      },
    ];
    const result = await createAuthenticatedOrderDraftHandler({
      data: { packageCode: "PKG-1", paymentMethod: "qris", idempotencyKey: KEY },
    });
    expect(result.id).toBe("order-1");
    expect(state.inserted).toHaveLength(0);
  });

  it("refuses an idempotency key already owned by another account", async () => {
    state.existing = [
      {
        id: "order-1",
        publicOrderCode: "ABC",
        status: "ORDER_CREATED",
        totalAmount: "25000",
        customerAuthSubject: "subject-b",
      },
    ];
    await expect(
      createAuthenticatedOrderDraftHandler({
        data: { packageCode: "PKG-1", paymentMethod: "qris", idempotencyKey: KEY },
      }),
    ).rejects.toThrow("sudah digunakan akun lain");
    expect(state.inserted).toHaveLength(0);
  });
});
