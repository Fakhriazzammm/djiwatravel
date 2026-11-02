import { describe, expect, it } from "vitest";
import { travelDirectPurchases } from "@/lib/customer-wallet-view";

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
