import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  tokenRows: [] as Array<Record<string, unknown>>,
  sessionRows: [] as Array<Record<string, unknown>>,
  queries: [] as string[],
}));

vi.mock("../lib/customer-session.fn", () => ({
  getAuthenticatedUser: vi.fn(async () => {
    if (!state.user) throw new Error("Sesi tidak valid");
    return state.user;
  }),
}));

vi.mock("../lib/guest-order-access.server", () => ({
  hashGuestAccessToken: (token: string) => `hash:${token}`,
}));

vi.mock("../db/client.server", () => {
  // The token branch joins guest_order_access; the session branch joins payment details.
  // Telling them apart by the joined table keeps each branch's rows independent.
  const db = {
    select: () => ({
      from: () => ({
        innerJoin: (table: { _tableName?: string }) => ({
          where: () => ({
            limit: async () => {
              const name = String(table?._tableName ?? "");
              state.queries.push(name);
              return name === "guest_order_access" ? state.tokenRows : state.sessionRows;
            },
          }),
        }),
      }),
    }),
  };
  return { db };
});

vi.mock("../../drizzle/schema", () => ({
  customerOrders: { id: "id", customerAuthSubject: "customerAuthSubject", $inferSelect: {} },
  customerOrderPaymentDetails: { _tableName: "customer_order_payment_details", orderId: "orderId" },
  guestOrderAccess: { _tableName: "guest_order_access", orderId: "orderId" },
}));

import { resolveOrderAccess } from "../lib/order-access.server";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "t".repeat(40);

describe("resolveOrderAccess", () => {
  beforeEach(() => {
    state.user = { id: "subject-a" };
    state.tokenRows = [];
    state.sessionRows = [];
    state.queries = [];
  });

  it("uses the guest token for a legacy order and returns its stored contacts", async () => {
    state.tokenRows = [
      {
        order: { id: ORDER_ID },
        access: { paymentMethod: "qris", email: "g@example.com", whatsapp: "+6281" },
      },
    ];
    const row = await resolveOrderAccess({ orderId: ORDER_ID, accessToken: TOKEN });
    expect(row).toMatchObject({ paymentMethod: "qris", email: "g@example.com" });
    expect(state.queries).toEqual(["guest_order_access"]);
  });

  it("does not fall back to the session when a supplied token does not match", async () => {
    state.user = { id: "subject-a" };
    state.sessionRows = [
      {
        order: { id: ORDER_ID },
        details: { paymentMethod: "qris", email: "a@example.com", whatsapp: "+6281" },
      },
    ];
    await expect(resolveOrderAccess({ orderId: ORDER_ID, accessToken: TOKEN })).rejects.toThrow(
      "Pesanan tidak ditemukan",
    );
    expect(state.queries).toEqual(["guest_order_access"]);
  });

  it("resolves an account order only for its owning session", async () => {
    state.sessionRows = [
      {
        order: { id: ORDER_ID },
        details: { paymentMethod: "djiwa_pay", email: "a@example.com", whatsapp: "+6281" },
      },
    ];
    const row = await resolveOrderAccess({ orderId: ORDER_ID });
    expect(row).toMatchObject({ paymentMethod: "djiwa_pay", email: "a@example.com" });
  });

  it("returns not-found for another account's order, without leaking its existence", async () => {
    state.user = { id: "subject-b" };
    state.sessionRows = [];
    await expect(resolveOrderAccess({ orderId: ORDER_ID })).rejects.toThrow(
      "Pesanan tidak ditemukan",
    );
  });

  it("refuses an anonymous request with no token", async () => {
    state.user = null;
    await expect(resolveOrderAccess({ orderId: ORDER_ID })).rejects.toThrow("Masuk untuk");
    expect(state.queries).toEqual([]);
  });
});
