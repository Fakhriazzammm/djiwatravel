import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HmacPaymentWebhookVerifier } from "@/lib/payment-gateway";

describe("payment webhook boundary", () => {
  it("verifies a signed event and rejects tampering", () => {
    const body = JSON.stringify({ eventId: "evt-1", orderId: "order-1", status: "PAID", amountIdr: 125000, occurredAt: "2026-10-04T00:00:00Z" });
    const signature = createHmac("sha256", "test-secret").update(body).digest("hex");
    const verifier = new HmacPaymentWebhookVerifier("test-secret");
    expect(verifier.verifyWebhook(body, signature).status).toBe("PAID");
    expect(() => verifier.verifyWebhook(body + " ", signature)).toThrow("tidak valid");
  });

  it("never accepts an unsigned webhook", () => {
    expect(() => new HmacPaymentWebhookVerifier("test-secret").verifyWebhook("{}", "")).toThrow();
  });
});
