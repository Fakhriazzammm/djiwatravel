import { describe, expect, it } from "vitest";
import {
  classifyOrderFulfillment,
  customerPreorderState,
  isPreorderExpired,
  preorderDeadline,
} from "@/lib/esim-preorder";
import { defaultPackage } from "@/lib/package-picker";
import type { ViewPackage } from "@/lib/package-view";

describe("eSIM preorder decisions", () => {
  it("keeps an available package on the instant fulfillment path", () => {
    expect(
      classifyOrderFulfillment({ requestedPreorder: true, sellable: true, balanceKnown: true }),
    ).toEqual({ mode: "instant" });
  });

  it("accepts a preorder only when the balance is known and insufficient", () => {
    expect(
      classifyOrderFulfillment({ requestedPreorder: true, sellable: false, balanceKnown: true }),
    ).toEqual({ mode: "preorder" });
  });

  it("does not promise preorder when provider balance is unknown", () => {
    expect(
      classifyOrderFulfillment({ requestedPreorder: true, sellable: false, balanceKnown: false }),
    ).toEqual({ mode: "unavailable", reason: "balance_unknown" });
  });

  it("rejects a sold-out package when the customer did not select preorder", () => {
    expect(
      classifyOrderFulfillment({ requestedPreorder: false, sellable: false, balanceKnown: true }),
    ).toEqual({ mode: "unavailable", reason: "package_unaffordable" });
  });

  it("never turns an invalid provider price into a preorder", () => {
    expect(
      classifyOrderFulfillment({
        requestedPreorder: true,
        sellable: false,
        balanceKnown: true,
        packageValid: false,
      }),
    ).toEqual({ mode: "unavailable", reason: "package_invalid" });
  });

  it("sets the expiry to exactly 72 hours after payment", () => {
    expect(preorderDeadline("2026-11-04T12:00:00.000Z")).toBe("2026-11-07T12:00:00.000Z");
  });

  it("shows a paid preorder as waiting, not failed", () => {
    expect(
      customerPreorderState({
        fulfillmentMode: "preorder",
        preorderStatus: "pending",
        orderStatus: "PROVISIONING_FAILED",
      }),
    ).toBe("awaiting_balance");
  });

  it("does not start the three-day window before payment settles", () => {
    expect(
      customerPreorderState({
        fulfillmentMode: "preorder",
        preorderStatus: "pending_payment",
        orderStatus: "PAYMENT_PENDING",
      }),
    ).toBe("awaiting_payment");
  });

  it("shows the admin review state after the deadline", () => {
    expect(
      customerPreorderState({
        fulfillmentMode: "preorder",
        preorderStatus: "refund_review",
        orderStatus: "PROVISIONING_FAILED",
      }),
    ).toBe("refund_review");
  });

  it("expires paid preorders that have reached their deadline but not review or fulfilled orders", () => {
    const deadlineAt = "2026-11-07T12:00:00.000Z";
    expect(
      isPreorderExpired({
        fulfillmentMode: "preorder",
        preorderStatus: "pending",
        deadlineAt,
        nowMs: Date.parse(deadlineAt),
      }),
    ).toBe(true);
    expect(
      isPreorderExpired({
        fulfillmentMode: "preorder",
        preorderStatus: "processing",
        deadlineAt,
        nowMs: Date.parse(deadlineAt),
      }),
    ).toBe(true);
    expect(
      isPreorderExpired({
        fulfillmentMode: "preorder",
        preorderStatus: "refund_review",
        deadlineAt,
        nowMs: Date.parse(deadlineAt),
      }),
    ).toBe(false);
  });

  it("preselects a preorder when a duration bucket has no sellable package", () => {
    const preorder = {
      packageCode: "high-cost",
      name: "Japan 10GB",
      locationCodes: ["JP"],
      volumeBytes: 10_000_000_000,
      unlimited: false,
      durationDays: 10,
      priceIdr: 100_000,
      sellable: false,
      preorderAvailable: true,
    } satisfies ViewPackage;
    expect(defaultPackage([preorder])?.packageCode).toBe("high-cost");
  });
});
