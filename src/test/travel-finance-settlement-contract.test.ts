import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTravelFinanceGatewayPayload,
  parseTravelFinanceGatewayResponse,
  postTravelFinanceSettlement,
} from "@/lib/mayar-settlement.server";

const migration = readFileSync(
  resolve(process.cwd(), "migrations/010_mayar_travel_finance_ledger.sql"),
  "utf8",
);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Travel Mayar finance settlement contract", () => {
  it("does not require the unavailable pos schema or local RPC", () => {
    expect(migration).not.toContain("pos.financial_transactions");
    expect(migration).not.toContain("create or replace function public.settle_mayar_travel_payment");
    expect(migration).toContain("drop function if exists public.settle_mayar_travel_payment");
  });

  it("fails closed when gateway configuration is missing", async () => {
    await expect(postTravelFinanceSettlement(buildTravelFinanceGatewayPayload({
      orderId: "order-1",
      orderNumber: "TRV-1",
      amount: 125000,
      paidAt: 1791635715057,
      transactionId: "tx-1",
    }))).rejects.toThrow("not configured");
  });

  it("enforces HTTPS before making a request", async () => {
    vi.stubEnv("DJIWA_TRAVEL_FINANCE_SETTLEMENT_URL", "http://finance.internal/settle");
    vi.stubEnv("DJIWA_TRAVEL_SETTLEMENT_SECRET", "test-secret");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(postTravelFinanceSettlement(buildTravelFinanceGatewayPayload({
      orderId: "order-1",
      orderNumber: "TRV-1",
      amount: 125000,
      paidAt: 1791635715057,
      transactionId: "tx-1",
    }))).rejects.toThrow("HTTPS");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds only the sanitized canonical payload", () => {
    expect(buildTravelFinanceGatewayPayload({
      orderId: "order-1",
      orderNumber: "TRV-1",
      amount: 125000,
      paidAt: 1791635715057,
      transactionId: "tx-1",
      invoiceId: "inv-1",
      customerName: null,
    })).toEqual({
      orderId: "order-1",
      orderNumber: "TRV-1",
      amount: 125000,
      paidAt: 1791635715057,
      paymentGateway: { provider: "mayar", status: "paid", invoiceId: "inv-1", transactionId: "tx-1" },
    });
  });

  it("accepts a duplicate response and rejects malformed responses", () => {
    expect(parseTravelFinanceGatewayResponse({ ok: true, dedup: true, sourceId: "src-1" })).toEqual({ ok: true, dedup: true, sourceId: "src-1" });
    expect(() => parseTravelFinanceGatewayResponse({ ok: true })).toThrow("invalid");
  });

  it("fails closed on remote non-2xx responses without exposing the body", async () => {
    vi.stubEnv("DJIWA_TRAVEL_FINANCE_SETTLEMENT_URL", "https://finance.internal/settle");
    vi.stubEnv("DJIWA_TRAVEL_SETTLEMENT_SECRET", "test-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("raw callback qr/lpa", { status: 503 })));
    await expect(postTravelFinanceSettlement(buildTravelFinanceGatewayPayload({
      orderId: "order-1",
      orderNumber: "TRV-1",
      amount: 125000,
      paidAt: 1791635715057,
      transactionId: "tx-1",
    }))).rejects.toThrow("rejected");
  });
});
