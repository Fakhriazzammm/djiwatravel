import { describe, expect, it } from "vitest";
import {
  canonicalDirectPurchases,
  groupWalletHistory,
  travelDirectPurchases,
} from "@/lib/customer-wallet-view";

describe("travelDirectPurchases", () => {
  const base = {
    id: "o1",
    publicOrderCode: "CODE1",
    amount: 154000,
    createdAtMs: 2,
    paymentMethod: "qris",
    paymentProvider: "mayar",
    packageSnapshot: { name: "Middle East 5GB" },
  };
  it("lists paid QRIS purchases, newest first, with a read-only label", () => {
    const rows = travelDirectPurchases([
      { ...base, status: "READY" },
      { ...base, id: "o2", createdAtMs: 5, status: "PROVISIONING" },
    ]);
    expect(rows.map((row) => row.id)).toEqual(["o2", "o1"]);
    expect(rows[1]).toMatchObject({ title: "eSIM Middle East 5GB", statusLabel: "eSIM siap" });
  });
  it("skips unpaid orders and wallet-paid orders already in the ledger", () => {
    const rows = travelDirectPurchases([
      { ...base, id: "a", status: "WAITING_PAYMENT" },
      { ...base, id: "b", status: "EXPIRED" },
      { ...base, id: "c", status: "READY", paymentMethod: "djiwa_pay" },
      { ...base, id: "d", status: "READY", paymentProvider: null },
    ]);
    expect(rows).toEqual([]);
  });
});

describe("groupWalletHistory", () => {
  const ledger = (id: number, created_at: string) => ({
    id,
    amount: 1000,
    direction: "credit" as const,
    balance_after: 1000,
    status: "completed",
    transaction_type: "topup_completed",
    reference_type: null,
    reference_id: null,
    note: null,
    created_at,
  });
  const purchase = (id: string, createdAtMs: number) => ({
    id,
    title: "eSIM X",
    reference: "C",
    createdAtMs,
    amount: 1,
    statusLabel: "eSIM siap",
    methodLabel: "QRIS",
  });
  it("merges ledger rows and purchases newest first within a month", () => {
    const groups = groupWalletHistory(
      [ledger(1, "2026-10-27T04:00:00Z"), ledger(2, "2026-10-20T04:00:00Z")],
      [purchase("p1", Date.parse("2026-10-30T10:00:00Z"))],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((item) => item.kind)).toEqual(["purchase", "ledger", "ledger"]);
  });
  it("splits months and handles an empty history", () => {
    const groups = groupWalletHistory(
      [ledger(1, "2026-10-27T04:00:00Z")],
      [purchase("p1", Date.parse("2026-11-02T10:00:00Z"))],
    );
    expect(groups.map((group) => group.key)).toEqual(["2026-11", "2026-10"]);
    expect(groupWalletHistory([], [])).toEqual([]);
  });
});

describe("canonicalDirectPurchases", () => {
  it("maps other-app gateway orders into read-only history rows", () => {
    const rows = canonicalDirectPurchases([
      {
        source_id: "order_1",
        order_number: "ORD-1",
        total_amount: 8000,
        created_at: 1792843122848,
        payment_method: "qris",
        status: "completed",
        brand_slug: "djiwatentram",
        source_app: null,
      },
    ]);
    expect(rows).toEqual([
      {
        id: "pay-order_1",
        title: "Pesanan Djiwa Tentram #ORD-1",
        reference: "ORD-1",
        createdAtMs: 1792843122848,
        amount: 8000,
        statusLabel: "Berhasil",
        methodLabel: "QRIS",
      },
    ]);
  });
});
