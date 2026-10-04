import { describe, expect, it } from "vitest";
import { InMemoryWebhookDedupe, mapProviderStatus, shouldApplyProfileStatus, webhookFingerprint } from "@/lib/esim-access-webhooks";

describe("eSIM Access webhook infrastructure", () => {
  it("creates the same fingerprint regardless of object key order", () => {
    expect(webhookFingerprint({ notifyId: "n1", notifyType: "ESIM_STATUS", content: { b: 2, a: 1 } })).toBe(webhookFingerprint({ notifyType: "ESIM_STATUS", notifyId: "n1", content: { a: 1, b: 2 } }));
  });
  it("deduplicates an event", () => {
    const event = { notifyId: "n1", notifyType: "ORDER_STATUS" };
    const dedupe = new InMemoryWebhookDedupe();
    expect(dedupe.has(event)).toBe(false); dedupe.remember(event); expect(dedupe.has(event)).toBe(true);
  });
  it("prevents unknown or regressive status updates", () => {
    expect(mapProviderStatus("IN_USE")).toBe("IN_USE");
    expect(shouldApplyProfileStatus("IN_USE", "ENABLED")).toBe(false);
    expect(shouldApplyProfileStatus("IN_USE", "USED_UP")).toBe(true);
  });
});
