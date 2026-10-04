import { describe, expect, it } from "vitest";
import { calculateSellingPrice } from "@/lib/reseller-pricing";
import { assertTransition, buildProviderTransactionId, canTransition } from "@/lib/reseller-order";

describe("reseller infrastructure", () => {
  it("calculates IDR cost, markup, and rounding", () => {
    expect(calculateSellingPrice({ providerPriceUnits: 10_000 })).toMatchObject({ providerCostIdr: 17_000, markupIdr: 4_250, sellingPriceIdr: 22_000 });
  });
  it("blocks provisioning before payment confirmation", () => {
    expect(canTransition("PAYMENT_PENDING", "PROVISIONING")).toBe(false);
    expect(() => assertTransition("PAYMENT_PENDING", "PROVISIONING")).toThrow();
    expect(canTransition("PAYMENT_CONFIRMED", "PROVISIONING")).toBe(true);
  });
  it("creates a stable provider transaction id", () => { expect(buildProviderTransactionId("order/123")).toBe("DJIWA-order123"); });
});
