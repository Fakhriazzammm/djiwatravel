import { describe, expect, it } from "vitest";
import { decidePaymentAuthority, verificationFromTransaction } from "@/lib/payment-verification";

describe("payment authority", () => {
  it("settles only when the provider confirms an exactly matching amount", () => {
    expect(
      decidePaymentAuthority({ amount: 250_000 }, { state: "verified", amount: 250_000 }),
    ).toEqual({
      settle: true,
      authority: "provider_direct",
    });
  });

  it("refuses to settle when the provider reports a different amount", () => {
    const decision = decidePaymentAuthority(
      { amount: 250_000 },
      { state: "verified", amount: 100 },
    );
    expect(decision.settle).toBe(false);
  });

  it("refuses to settle when the provider contradicts the callback", () => {
    for (const reason of [
      "not_paid",
      "unknown_transaction",
      "amount_mismatch",
      "invalid_amount",
    ] as const) {
      const decision = decidePaymentAuthority({ amount: 1 }, { state: "rejected", reason });
      expect(decision.settle, reason).toBe(false);
    }
  });

  it("fails open on an unreadable provider but records that the callback was the evidence", () => {
    const decision = decidePaymentAuthority(
      { amount: 250_000 },
      { state: "unavailable", reason: "timeout" },
    );
    expect(decision.settle).toBe(true);
    if (decision.settle) expect(decision.authority).toBe("signed_callback");
  });

  it("rejects a verified amount that is not a positive safe integer", () => {
    expect(decidePaymentAuthority({ amount: 1 }, { state: "verified", amount: 0 }).settle).toBe(
      false,
    );
    expect(decidePaymentAuthority({ amount: 1 }, { state: "verified", amount: 1.5 }).settle).toBe(
      false,
    );
  });

  it("derives verification from the provider transaction record", () => {
    expect(verificationFromTransaction({ status: "paid", amount: 250_000 })).toEqual({
      state: "verified",
      amount: 250_000,
    });
    expect(verificationFromTransaction({ status: "unpaid", amount: 250_000 })).toEqual({
      state: "rejected",
      reason: "not_paid",
    });
    expect(verificationFromTransaction({ status: "paid", amount: 0 })).toEqual({
      state: "rejected",
      reason: "invalid_amount",
    });
    expect(verificationFromTransaction(null)).toEqual({
      state: "rejected",
      reason: "unknown_transaction",
    });
  });
});
