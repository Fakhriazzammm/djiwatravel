import { describe, expect, it } from "vitest";
import { toTravelLifecycle, TRAVEL_LIFECYCLE_COPY } from "@/lib/travel-state-machine";

describe("travel lifecycle contract", () => {
  it("keeps payment expiry separate from activation expiry", () => {
    expect(toTravelLifecycle("WAITING_PAYMENT", true)).toBe("EXPIRED");
    expect(toTravelLifecycle("READY", true)).toBe("READY");
  });
  it("maps paid and retryable states to actionable copy", () => {
    expect(toTravelLifecycle("PAID")).toBe("PAYMENT_CONFIRMED");
    expect(TRAVEL_LIFECYCLE_COPY.PROVISIONING.action).toMatch(/Tidak perlu membayar lagi/);
  });
});
