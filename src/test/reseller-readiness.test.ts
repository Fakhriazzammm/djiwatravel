import { describe, expect, it } from "vitest";
import { getResellerReadiness, isResellerReady } from "@/lib/reseller-readiness";

describe("reseller readiness", () => {
  it("does not expose secrets and reports selected blockers", () => {
    const items = getResellerReadiness({
      ESIM_ACCESS_CODE: "x",
      ESIM_ACCESS_SECRET_KEY: "y",
      ESIM_PROFILE_ENCRYPTION_KEY: "z",
      CUSTOMER_AUTH_SECRET: "12345678901234567890123456789012",
    });
    expect(items.some((item) => item.name === "Payment webhook" && !item.ready)).toBe(true);
    expect(items.every((item) => !item.detail.includes("secret-value"))).toBe(true);
    expect(isResellerReady({})).toBe(false);
  });
});
