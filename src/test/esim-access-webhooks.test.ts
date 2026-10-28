import { describe, expect, it } from "vitest";
import {
  InMemoryWebhookDedupe,
  mapProviderStatus,
  normalizeUsagePayload,
  normalizeProviderWebhook,
  shouldApplyProfileStatus,
  webhookFingerprint,
} from "@/lib/esim-access-webhooks";

describe("eSIM Access webhook infrastructure", () => {
  it("accepts the provider health probe and preserves documented identifiers", () => {
    expect(
      normalizeProviderWebhook(
        {
          notifyType: "CHECK_HEALTH",
          notifyId: "health-1",
          eventGenerateTime: "2026-04-22T17:16:34Z",
          content: {},
        },
        "webhook-secret",
      ),
    ).toEqual({
      notifyId: "health-1",
      notifyType: "CHECK_HEALTH",
      eventGenerateTime: "2026-04-22T17:16:34Z",
      content: {},
    });
  });

  it("keeps provider identifiers needed for lifecycle reconciliation while hashing ICCID", () => {
    const event = normalizeProviderWebhook(
      {
        notifyType: "SMDP_EVENT",
        notifyId: "smdp-1",
        content: {
          iccid: "8910300000059824319",
          esimTranNo: "26042216320015",
          orderNo: "B26042216320015",
          transactionId: "txn-1",
          eid: "89049032005008882600050326403713",
          smdpStatus: "ENABLED",
          esimStatus: "IN_USE",
          timestamp: "2026-04-22T17:29:40Z",
          seqNumber: 113,
          notifyStatus: "Executed-Success",
        },
      },
      "webhook-secret",
    );
    expect(event?.content).toMatchObject({
      esimTranNo: "26042216320015",
      orderNo: "B26042216320015",
      transactionId: "txn-1",
      eid: "89049032005008882600050326403713",
      smdpStatus: "ENABLED",
      esimStatus: "IN_USE",
      timestamp: "2026-04-22T17:29:40Z",
      seqNumber: 113,
      notifyStatus: "Executed-Success",
    });
    expect(event?.content).not.toHaveProperty("iccid");
    expect(event?.content?.iccidHash).toMatch(/^[a-f0-9]{64}$/);
  });

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
        remainVolume: "750000",
        remainThreshold: 0.1,
        lastUpdateTime: "2026-02-01T00:00:00Z",
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
    expect(mapProviderStatus("GOT_RESOURCE")).toBe("RELEASED");
    expect(mapProviderStatus("USED_EXPIRED")).toBe("EXPIRED");
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
