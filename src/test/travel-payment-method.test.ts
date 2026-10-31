import { describe, expect, it } from "vitest";
import {
  newCheckoutPaymentMethodSchema,
  djiwaPayOrderOwnedBy,
  mayarOrderPaymentAllowed,
  storedPaymentMethod,
  walletPaymentAvailability,
  walletPaymentInputSchema,
} from "../lib/travel-payment-method";

describe("Travel checkout payment methods", () => {
  it("accepts QRIS and Djiwa Pay while rejecting VA for new checkout", () => {
    expect(newCheckoutPaymentMethodSchema.safeParse("qris").success).toBe(true);
    expect(newCheckoutPaymentMethodSchema.safeParse("djiwa_pay").success).toBe(true);
    expect(newCheckoutPaymentMethodSchema.safeParse("va").success).toBe(false);
  });

  it("keeps historical VA readable and recognizes Djiwa Pay", () => {
    expect(storedPaymentMethod("va")).toBe("va");
    expect(storedPaymentMethod("djiwa_pay")).toBe("djiwa_pay");
    expect(storedPaymentMethod("unknown-provider-value")).toBe("qris");
  });

  it("keeps Mayar available for QRIS and historical VA but blocks Djiwa Pay orders", () => {
    expect(mayarOrderPaymentAllowed("qris")).toBe(true);
    expect(mayarOrderPaymentAllowed("va")).toBe(true);
    expect(mayarOrderPaymentAllowed("djiwa_pay")).toBe(false);
  });

  it("requires an enabled bridge, a signed-in member, and a complete profile", () => {
    expect(walletPaymentAvailability({ enabled: true, authenticated: false, profileComplete: false })).toBe("sign_in");
    expect(walletPaymentAvailability({ enabled: true, authenticated: true, profileComplete: false })).toBe("complete_profile");
    expect(walletPaymentAvailability({ enabled: false, authenticated: true, profileComplete: true })).toBe("unconfigured");
    expect(walletPaymentAvailability({ enabled: true, authenticated: true, profileComplete: true })).toBe("available");
  });

  it("accepts only an order ID for a wallet charge", () => {
    expect(walletPaymentInputSchema.safeParse({ orderId: "2f7fb843-fdd1-49e6-9ad8-e0a2dabba028" }).success).toBe(true);
    expect(walletPaymentInputSchema.safeParse({
      orderId: "2f7fb843-fdd1-49e6-9ad8-e0a2dabba028",
      amount: 1,
      customerId: "forged-owner",
    }).success).toBe(false);
  });

  it("refuses wallet payment for a guest order or another member's order", () => {
    expect(djiwaPayOrderOwnedBy({ paymentMethod: "djiwa_pay", customerAuthSubject: null }, "member-1")).toBe(false);
    expect(djiwaPayOrderOwnedBy({ paymentMethod: "djiwa_pay", customerAuthSubject: "member-2" }, "member-1")).toBe(false);
    expect(djiwaPayOrderOwnedBy({ paymentMethod: "djiwa_pay", customerAuthSubject: "member-1" }, "member-1")).toBe(true);
    expect(djiwaPayOrderOwnedBy({ paymentMethod: "qris", customerAuthSubject: "member-1" }, "member-1")).toBe(false);
  });
});
