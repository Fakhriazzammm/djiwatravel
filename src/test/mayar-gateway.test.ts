import { describe, expect, it } from "vitest";
import { buildMayarInvoicePayload } from "../lib/mayar-gateway";

describe("Mayar gateway payload", () => {
  it("correlates invoice with immutable order id", () => {
    const payload = buildMayarInvoicePayload({ orderId: "DJ-1", amountIdr: 34000, customerName: "Fakhri", customerEmail: "fakhri@example.com", customerMobile: "08123456789", description: "eSIM Spain 3GB", redirectUrl: "https://www.djiwatravel.com/order/DJ-1" });
    expect(payload.extraData).toEqual({ orderId: "DJ-1" });
    expect(payload.items[0]).toEqual({ quantity: 1, rate: 34000, description: "eSIM Spain 3GB" });
  });
});
