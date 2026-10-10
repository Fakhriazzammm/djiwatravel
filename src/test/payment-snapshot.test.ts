import { describe, expect, it } from "vitest";
import { readMayarSnapshot, toIsoTimestamp } from "../lib/payment-snapshot";

describe("readMayarSnapshot", () => {
  it("reads the nested mayar reference stored by the invoice step", () => {
    expect(
      readMayarSnapshot({
        markupPercent: 25,
        mayar: {
          invoiceId: "inv-1",
          transactionId: "trx-1",
          paymentUrl: "https://zantara.myr.id/invoices/abc",
        },
      }),
    ).toEqual({
      invoiceId: "inv-1",
      transactionId: "trx-1",
      paymentUrl: "https://zantara.myr.id/invoices/abc",
    });
  });

  it("still reads flat legacy keys and ignores empty or malformed values", () => {
    expect(
      readMayarSnapshot({ mayarPaymentUrl: "https://zantara.myr.id/invoices/legacy" }),
    ).toEqual({ paymentUrl: "https://zantara.myr.id/invoices/legacy" });
    expect(readMayarSnapshot({ mayar: { invoiceId: "", paymentUrl: 42 } })).toEqual({});
    expect(readMayarSnapshot(null)).toEqual({});
    expect(readMayarSnapshot("not-an-object")).toEqual({});
  });
});

describe("toIsoTimestamp", () => {
  it("converts Mayar epoch milliseconds instead of casting a bare number", () => {
    expect(toIsoTimestamp(1791635715057)).toBe("2026-10-10T12:35:15.057Z");
    expect(toIsoTimestamp("1791635715057")).toBe("2026-10-10T12:35:15.057Z");
  });

  it("accepts ISO strings and falls back for unusable values", () => {
    expect(toIsoTimestamp("2026-10-10T12:00:00.000Z")).toBe("2026-10-10T12:00:00.000Z");
    const fallback = new Date("2026-01-01T00:00:00.000Z");
    expect(toIsoTimestamp(undefined, fallback)).toBe("2026-01-01T00:00:00.000Z");
    expect(toIsoTimestamp("", fallback)).toBe("2026-01-01T00:00:00.000Z");
  });
});
