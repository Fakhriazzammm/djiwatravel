import { describe, expect, it } from "vitest";
import { ABANDONED_DRAFT_GRACE_MS, EXPIRY_SCAN_SQL, expiryDecision } from "@/lib/order-expiry";

const now = Date.parse("2026-10-15T12:00:00.000Z");

describe("order expiry", () => {
  it("expires an unpaid order after its payment window", () => {
    expect(expiryDecision({ status: "WAITING_PAYMENT", paymentExpiresAt: now - 1 }, now)).toEqual({
      expire: true,
      reason: "payment_window_elapsed",
    });
    expect(expiryDecision({ status: "WAITING_PAYMENT", paymentExpiresAt: now + 1 }, now)).toEqual({
      expire: false,
      reason: "not_due",
    });
  });

  it("never expires a settled order, even when the payment window has passed", () => {
    for (const status of ["PAYMENT_CONFIRMED", "PROVISIONING", "PROVISIONING_FAILED", "READY", "INSTALLED"]) {
      expect(expiryDecision({ status, paymentExpiresAt: now - 1 }, now), status).toEqual({
        expire: false,
        reason: "settled",
      });
    }
  });

  it("leaves already-resolved orders alone", () => {
    for (const status of ["CANCELLED", "REFUNDED", "EXPIRED"]) {
      expect(expiryDecision({ status, paymentExpiresAt: now - 1 }, now).reason, status).toBe("terminal");
    }
  });

  it("sweeps an abandoned draft with no payment window", () => {
    expect(expiryDecision({ status: "DRAFT" }, now, now - ABANDONED_DRAFT_GRACE_MS - 1)).toEqual({
      expire: true,
      reason: "draft_abandoned",
    });
    expect(expiryDecision({ status: "DRAFT" }, now, now - 1_000).expire).toBe(false);
  });

  it("refuses to expire on an unparseable window", () => {
    expect(expiryDecision({ status: "DRAFT", paymentExpiresAt: "not-a-date" }, now).reason).toBe("no_window");
  });

  it("scans only unpaid orders with an elapsed window", () => {
    expect(EXPIRY_SCAN_SQL).toContain("DRAFT");
    expect(EXPIRY_SCAN_SQL).toContain("PAYMENT_PENDING");
    expect(EXPIRY_SCAN_SQL).toContain("payment_expires_at <= now()");
    expect(EXPIRY_SCAN_SQL).not.toContain("PROVISIONING");
    expect(EXPIRY_SCAN_SQL).not.toContain("READY");
  });
});
