import { describe, expect, it } from "vitest";
import {
  buildMayarInvoicePayload,
  canReclaimStaleMayarIntent,
  canRetryMayarIntent,
  findMayarInvoiceRecord,
} from "../lib/mayar-gateway";

// A live 400 "extraData Validation Error" from Mayar meant every checkout died at the invoice
// step, so this pins the exact payload shape the provider accepts.
describe("Mayar gateway payload", () => {
  const input = {
    orderId: "DJ-1",
    amountIdr: 34000,
    customerName: "Fakhri",
    customerEmail: "fakhri@example.com",
    customerMobile: "08123456789",
    description: "eSIM Spain 3GB",
    redirectUrl: "https://www.djiwatravel.com/order/DJ-1",
  };

  it("never sends extraData, which the provider rejects", () => {
    const payload = buildMayarInvoicePayload(input);
    expect("extraData" in payload).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("extraData");
  });

  it("allows retrying a provider-rejected intent with no provider identifiers", () => {
    expect(canRetryMayarIntent({ status: "FAILED" })).toBe(true);
  });

  it("keeps provider-ambiguous intents fail-closed", () => {
    expect(canRetryMayarIntent({ status: "REQUESTING" })).toBe(false);
    expect(canRetryMayarIntent({ status: "UNKNOWN" })).toBe(false);
    expect(canRetryMayarIntent({ status: "FAILED", provider_invoice_id: "inv_123" })).toBe(false);
  });

  it("sends the amount as an invoice item", () => {
    const payload = buildMayarInvoicePayload(input);
    expect(payload.items).toEqual([{ quantity: 1, rate: 34000, description: "eSIM Spain 3GB" }]);
  });

  it("sends redirectUrl so paying returns the customer to our order page", () => {
    const payload = buildMayarInvoicePayload(input);
    expect(payload.redirectUrl).toBe("https://www.djiwatravel.com/order/DJ-1");
    expect(payload.name).toBe("Fakhri");
    expect(payload.email).toBe("fakhri@example.com");
    expect(payload.mobile).toBe("08123456789");
    expect(payload.description).toBe("eSIM Spain 3GB");
  });
});

// A dropped connection used to leave a checkout permanently unpayable: the intent went UNKNOWN with
// no provider identifier and nothing in the app ever reconciled it. These pin the recovery policy.
describe("Mayar intent reconciliation", () => {
  const description = "Djiwa Travel 8C5EFFC96D2436C18089F14A";
  const list = [
    { id: "inv-other", description: "Djiwa Travel OTHERORDERCODE" },
    { id: "inv-match", description },
  ];

  it("finds the invoice that belongs to this order by exact description", () => {
    expect(findMayarInvoiceRecord(list, description)?.id).toBe("inv-match");
  });

  it("ignores surrounding whitespace when matching", () => {
    expect(
      findMayarInvoiceRecord([{ id: "inv-pad", description: `  ${description} ` }], description)
        ?.id,
    ).toBe("inv-pad");
  });

  it("never matches another order or an empty description", () => {
    expect(findMayarInvoiceRecord(list, "Djiwa Travel SOMETHINGELSE")).toBeNull();
    expect(findMayarInvoiceRecord([{ id: "inv" }], description)).toBeNull();
    expect(findMayarInvoiceRecord(list, "   ")).toBeNull();
  });

  const now = Date.parse("2026-10-12T08:00:00Z");

  it("reclaims a stale UNKNOWN intent that has no provider identifier", () => {
    expect(
      canReclaimStaleMayarIntent(
        { status: "UNKNOWN", attempt_count: 1, next_reconcile_at: "2026-10-12T07:59:00Z" },
        now,
      ),
    ).toBe(true);
    expect(
      canReclaimStaleMayarIntent(
        { status: "UNKNOWN", attempt_count: 0, next_reconcile_at: null },
        now,
      ),
    ).toBe(true);
  });

  it("waits for the reconcile window before reclaiming", () => {
    expect(
      canReclaimStaleMayarIntent(
        { status: "UNKNOWN", attempt_count: 1, next_reconcile_at: "2026-10-12T08:01:00Z" },
        now,
      ),
    ).toBe(false);
  });

  it("stays fail-closed when the provider may already know the invoice", () => {
    expect(
      canReclaimStaleMayarIntent({ status: "UNKNOWN", provider_invoice_id: "inv_1" }, now),
    ).toBe(false);
    expect(
      canReclaimStaleMayarIntent({ status: "UNKNOWN", provider_transaction_id: "trx_1" }, now),
    ).toBe(false);
    expect(
      canReclaimStaleMayarIntent(
        { status: "UNKNOWN", payment_url: "https://zantara.myr.id/invoices/x" },
        now,
      ),
    ).toBe(false);
    expect(canReclaimStaleMayarIntent({ status: "REQUESTING" }, now)).toBe(false);
    expect(canReclaimStaleMayarIntent({ status: "FAILED" }, now)).toBe(false);
  });

  it("stops reclaiming once the attempt budget is exhausted", () => {
    expect(
      canReclaimStaleMayarIntent(
        { status: "UNKNOWN", attempt_count: 5, next_reconcile_at: null },
        now,
      ),
    ).toBe(false);
    expect(
      canReclaimStaleMayarIntent(
        { status: "UNKNOWN", attempt_count: 5, next_reconcile_at: null },
        now,
        6,
      ),
    ).toBe(true);
  });
});
