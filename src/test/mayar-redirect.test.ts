import { describe, expect, it } from "vitest";
import { mayarRedirectUrl } from "../lib/travel-payment-method";

describe("Mayar checkout redirect", () => {
  it("returns the exact payment URL created for QRIS", () => {
    const paymentUrl = "https://mayar.id/pay/invoice/abc?source=travel";
    expect(mayarRedirectUrl("qris", paymentUrl)).toBe(paymentUrl);
  });

  it("does not send direct Djiwa Pay wallet orders to Mayar", () => {
    expect(mayarRedirectUrl("djiwa_pay", "https://mayar.id/pay/should-not-redirect")).toBeNull();
  });
});
