import { describe, expect, it } from "vitest";
import {
  InMemoryWebhookDedupe,
  mapProviderStatus,
  normalizeUsagePayload,
  shouldApplyProfileStatus,
  webhookFingerprint,
} from "@/lib/esim-access-webhooks";

describe("eSIM Access webhook infrastructure", () => {
  it("creates the same fingerprint regardless of object key order", () => {
    expect(
      webhookFingerprint({ notifyId: "n1", notifyType: "ESIM_STATUS", content: { b: 2, a: 1 } }),
    ).toBe(
      webhookFingerprint({ notifyType: "ESIM_STATUS", notifyId: "n1", content: { a: 1, b: 2 } }),
    );
  });
  it("deduplicates an event", () => {
    const event = { notifyId: "n1", notifyType: "ORDER_STATUS" };
    const dedupe = new InMemoryWebhookDedupe();
    expect(dedupe.has(event)).toBe(false);
    dedupe.remember(event);
    expect(dedupe.has(event)).toBe(true);
  });
  it("normalizes DATA_USAGE and VALIDITY_USAGE without treating them as profile status", () => {
    expect(
      normalizeUsagePayload("DATA_USAGE", {
        totalVolume: "1000000",
        orderUsage: 250000,
        remain: "750000",
      }),
    ).toEqual({ dataUsage: { totalVolume: 1000000, orderUsage: 250000, remain: 750000 } });
    expect(
      normalizeUsagePayload("VALIDITY_USAGE", {
        totalDuration: "30",
        expiredTime: "2026-02-01T00:00:00Z",
        remain: 12,
      }),
    ).toEqual({
      validityUsage: { totalDuration: 30, expiredTime: "2026-02-01T00:00:00.000Z", remain: 12 },
    });
    expect(mapProviderStatus(undefined)).toBe("UNKNOWN");
  });

  it("deduplicates duplicate usage events by fingerprint", () => {
    const event = { notifyId: "usage-1", notifyType: "DATA_USAGE", content: { remain: 1 } };
    const dedupe = new InMemoryWebhookDedupe();
    dedupe.remember(event);
    expect(dedupe.has({ ...event, content: { remain: 1 } })).toBe(true);
  });

  it("prevents unknown or regressive status updates", () => {
    expect(mapProviderStatus("IN_USE")).toBe("IN_USE");
    expect(shouldApplyProfileStatus("IN_USE", "ENABLED")).toBe(false);
    expect(shouldApplyProfileStatus("IN_USE", "USED_UP")).toBe(true);
  });
});
