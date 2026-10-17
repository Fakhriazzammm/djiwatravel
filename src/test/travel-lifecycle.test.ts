import { describe, expect, it } from "vitest";
import {
  MAX_PROVISIONING_ATTEMPTS,
  TRAVEL_LIFECYCLE_COPY,
  isSettledLifecycle,
  toTravelLifecycle,
} from "@/lib/travel-state-machine";

describe("travel lifecycle", () => {
  it("keeps payment expiry separate from activation expiry", () => {
    expect(toTravelLifecycle("WAITING_PAYMENT", { paymentExpired: true })).toBe("EXPIRED");
    // A paid order is never expired by the payment window.
    expect(toTravelLifecycle("READY", { paymentExpired: true })).toBe("READY");
    expect(toTravelLifecycle("PROVISIONING", { paymentExpired: true })).toBe("PROVISIONING");
  });

  it("still accepts the legacy positional boolean", () => {
    expect(toTravelLifecycle("ORDER_CREATED", true)).toBe("EXPIRED");
    expect(toTravelLifecycle("ORDER_CREATED", false)).toBe("PAYMENT_PENDING");
  });

  it("maps unpaid, paid and ready states", () => {
    expect(toTravelLifecycle("ORDER_CREATED")).toBe("PAYMENT_PENDING");
    expect(toTravelLifecycle("WAITING_PAYMENT")).toBe("PAYMENT_PENDING");
    expect(toTravelLifecycle("PAID")).toBe("PAYMENT_CONFIRMED");
    expect(toTravelLifecycle("PROVISIONING")).toBe("PROVISIONING");
    expect(toTravelLifecycle("READY")).toBe("READY");
    expect(toTravelLifecycle("INSTALLED")).toBe("READY");
  });

  it("distinguishes a self-healing retry from a support case", () => {
    expect(toTravelLifecycle("PROVISIONING_FAILED", { attemptCount: 1 })).toBe("RETRYING");
    expect(
      toTravelLifecycle("PROVISIONING_FAILED", { attemptCount: MAX_PROVISIONING_ATTEMPTS }),
    ).toBe("FAILED_REVIEW");
    expect(
      toTravelLifecycle("PROVISIONING_FAILED", {
        attemptCount: 1,
        provisioningStatus: "REVIEW_REQUIRED",
      }),
    ).toBe("FAILED_REVIEW");
  });

  it("promises no second payment in every settled non-ready state", () => {
    for (const state of ["PAYMENT_CONFIRMED", "PROVISIONING", "RETRYING"] as const) {
      expect(isSettledLifecycle(state)).toBe(true);
      expect(TRAVEL_LIFECYCLE_COPY[state].action.length).toBeGreaterThan(0);
    }
    expect(isSettledLifecycle("PAYMENT_PENDING")).toBe(false);
    expect(isSettledLifecycle("EXPIRED")).toBe(false);
  });

  it("gives every lifecycle state actionable copy", () => {
    for (const [state, copy] of Object.entries(TRAVEL_LIFECYCLE_COPY)) {
      expect(copy.title, state).toBeTruthy();
      expect(copy.action, state).toBeTruthy();
    }
  });

  it("never tells a paid customer that provisioning is not enabled", () => {
    for (const copy of Object.values(TRAVEL_LIFECYCLE_COPY)) {
      expect(copy.title).not.toMatch(/belum diaktifkan/i);
      expect(copy.action).not.toMatch(/belum diaktifkan/i);
    }
  });
});
