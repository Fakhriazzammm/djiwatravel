import { describe, expect, it, vi } from "vitest";
import { reconcileProviderOrder, withRetry } from "../lib/esim-reconciliation";
import { effectiveOrderStatus } from "../lib/esim-status";
import { maskSensitive } from "../lib/sensitive-data";

describe("eSIM operational lifecycle", () => {
  it("masks sensitive profile values", () => {
    expect(maskSensitive("898821234567890")).toBe(`8988${"•".repeat(7)}7890`);
    expect(maskSensitive("abc")).toBe("••••");
  });
  it("marks ready profiles expired after expiry", () => {
    expect(effectiveOrderStatus("READY", 100, 101)).toBe("EXPIRED");
    expect(effectiveOrderStatus("PROVISIONING", 100, 101)).toBe("PROVISIONING");
  });
  it("retries provider timeouts and reconciles status", async () => {
    let calls = 0;
    const result = await reconcileProviderOrder({
      currentStatus: "RELEASED",
      attempts: 3,
      sleep: vi.fn(async () => undefined),
      query: async () => { calls += 1; if (calls < 3) throw new Error("timeout"); return { orderNo: "P-1", iccid: "8988", status: "ENABLED" }; },
    });
    expect(calls).toBe(3);
    expect(result).toMatchObject({ status: "ENABLED", providerOrderNo: "P-1", iccid: "8988", attempts: 3, changed: true });
  });
  it("fails closed after retry budget", async () => {
    await expect(withRetry(async () => { throw new Error("timeout"); }, { attempts: 2, sleep: async () => undefined })).rejects.toThrow("Provider tidak merespons");
  });
});
