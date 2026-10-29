import { describe, expect, it } from "vitest";
import { checkoutSellabilityDecision, isPackageSellable } from "@/lib/sellability";

describe("checkout affordability boundary", () => {
  const pkg = { packageCode: "p-1", providerPriceUnits: 100_000 };

  it("does not advertise a package when an unknown balance cannot prove affordability", () => {
    expect(
      isPackageSellable(pkg, { balanceUnits: null, capturedAtMs: null, source: "unknown" }),
    ).toBe(false);
  });

  it("requires a known balance before the provider-cost threshold can be evaluated", () => {
    const unknown = { balanceUnits: null, capturedAtMs: null, source: "unknown" as const };
    expect(checkoutSellabilityDecision(pkg, unknown)).toEqual({
      ok: false,
      reason: "balance_unknown",
    });
  });

  it("blocks a known balance that cannot cover provider cost plus headroom", () => {
    expect(
      checkoutSellabilityDecision(pkg, { balanceUnits: 1, capturedAtMs: 1, source: "live" }),
    ).toEqual({ ok: false, reason: "provider_cost_unaffordable" });
  });
});
