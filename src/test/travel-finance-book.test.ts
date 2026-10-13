import { describe, expect, it } from "vitest";

import {
  parseTravelFinanceReport,
  travelBookUrl,
  travelExpenseInputSchema,
} from "@/lib/travel-finance-book.server";

const VALID_REPORT = {
  ok: true,
  days: 30,
  truncated: false,
  totals: { income: 15000, expense: 12500, net: 2500, incomeCount: 1, expenseCount: 1 },
  byCategory: [
    { category: "Penjualan", txType: "income", amount: 15000, count: 1 },
    { category: "QA probe", txType: "expense", amount: 12500, count: 1 },
  ],
  daily: [
    { day: "2026-10-13", income: 0, expense: 12500 },
    { day: "2026-10-12", income: 15000, expense: 0 },
  ],
  recent: [
    {
      sourceId: "trav_exp_qa",
      txType: "expense",
      amount: 12500,
      category: "QA probe",
      merchant: "qa",
      description: "Uji jalur pengeluaran",
      txDateMs: 1791824761610,
      status: "completed",
    },
  ],
};

describe("travel book url", () => {
  it("derives the ledger endpoint from the settlement url", () => {
    expect(travelBookUrl("https://supabase.yumme.id/functions/v1/travel-finance-settlement")).toBe(
      "https://supabase.yumme.id/functions/v1/travel-finance-ledger",
    );
  });

  it("refuses a url that is not the settlement endpoint", () => {
    expect(() => travelBookUrl("https://supabase.yumme.id/functions/v1/other")).toThrow();
  });
});

describe("parseTravelFinanceReport", () => {
  it("accepts a well-formed gateway report", () => {
    const report = parseTravelFinanceReport(VALID_REPORT);
    expect(report.totals).toEqual({ income: 15000, expense: 12500, net: 2500, incomeCount: 1, expenseCount: 1 });
    expect(report.recent[0]).toMatchObject({ sourceId: "trav_exp_qa", txType: "expense", amount: 12500 });
    expect(report.daily[0]?.day).toBe("2026-10-13");
  });

  it("rejects a report that is not ok, so the page never renders a wrong book", () => {
    expect(() => parseTravelFinanceReport({ ok: false })).toThrow();
    expect(() => parseTravelFinanceReport(null)).toThrow();
    expect(() => parseTravelFinanceReport({ ok: true, totals: { income: 1 } })).toThrow();
  });

  it("drops unknown transaction types instead of inventing them", () => {
    expect(() =>
      parseTravelFinanceReport({
        ...VALID_REPORT,
        recent: [{ sourceId: "x", txType: "refund", amount: 10, txDateMs: 1 }],
      }),
    ).toThrow();
  });
});

describe("travelExpenseInputSchema", () => {
  const base = { externalId: "0f9a1b2c-3d4e", amount: 150000, category: "Top-up", description: "Isi saldo" };

  it("accepts a normal admin expense", () => {
    expect(travelExpenseInputSchema.parse(base).amount).toBe(150000);
  });

  it("rejects zero, negative and oversized amounts", () => {
    expect(() => travelExpenseInputSchema.parse({ ...base, amount: 0 })).toThrow();
    expect(() => travelExpenseInputSchema.parse({ ...base, amount: -1 })).toThrow();
    expect(() => travelExpenseInputSchema.parse({ ...base, amount: 2_000_000_000 })).toThrow();
  });

  it("rejects a missing or malformed idempotency key", () => {
    expect(() => travelExpenseInputSchema.parse({ ...base, externalId: "short" })).toThrow();
    expect(() => travelExpenseInputSchema.parse({ ...base, externalId: "bad id with spaces" })).toThrow();
  });
});
