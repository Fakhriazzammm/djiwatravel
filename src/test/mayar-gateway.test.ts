import { describe, expect, it } from "vitest";
import { buildMayarInvoicePayload, canRetryMayarIntent } from "../lib/mayar-gateway";

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
