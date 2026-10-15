import { describe, expect, it } from "vitest";
import { canSendLifecycleMessage, messageDeduplicationKey, normalizeCampaignAttribution, referralRewardEligibility } from "@/lib/growth-loops";

describe("Wave 8 growth safety contracts", () => {
  it("deduplicates lifecycle messages by order and event", () => {
    expect(messageDeduplicationKey("o1", "esim_ready")).toBe("travel:o1:esim_ready");
    expect(canSendLifecycleMessage({ lifecycle: true, marketing: false }, "esim_ready")).toBe(true);
    expect(canSendLifecycleMessage({ lifecycle: false, marketing: true }, "esim_ready")).toBe(false);
  });
  it("bounds attribution and keeps only allowlisted fields", () => {
    const result = normalizeCampaignAttribution({ utm_source: "seo", email: "secret", landing_path: "/esim-jepang", utm_campaign: "x".repeat(200) });
    expect(result).toEqual({ utm_source: "seo", utm_campaign: "x".repeat(100), landing_path: "/esim-jepang" });
    expect(result).not.toHaveProperty("email");
  });
  it("requires installation, fraud clearance, and an enabled ledger before rewards", () => {
    expect(referralRewardEligibility({ installationConfirmed: true, fraudHold: false, rewardLedgerEnabled: false }).eligible).toBe(false);
    expect(referralRewardEligibility({ installationConfirmed: false, fraudHold: false, rewardLedgerEnabled: true }).eligible).toBe(false);
    expect(referralRewardEligibility({ installationConfirmed: true, fraudHold: true, rewardLedgerEnabled: true }).eligible).toBe(false);
    expect(referralRewardEligibility({ installationConfirmed: true, fraudHold: false, rewardLedgerEnabled: true })).toEqual({ eligible: true, reason: "eligible" });
  });
});
