import { describe, expect, it } from "vitest";
import {
  DEFAULT_ESIM_SHARING_CONFIG,
  normalizeEsimSharingConfig,
  parseEsimSharingConfig,
  shareEligibility,
  shareMessage,
  shareUrl,
} from "@/lib/esim-share";

const now = Date.parse("2026-11-02T10:00:00.000Z");
const future = now + 86_400_000;
const past = now - 1;

describe("eSIM sharing config", () => {
  it("defaults to enabled and accepts an explicit boolean", () => {
    expect(parseEsimSharingConfig({})).toEqual({ enabled: true });
    expect(parseEsimSharingConfig({ enabled: false })).toEqual({ enabled: false });
  });

  it("rejects malformed admin values but keeps reads resilient", () => {
    expect(() => parseEsimSharingConfig(null)).toThrow();
    expect(() => parseEsimSharingConfig([])).toThrow();
    expect(() => parseEsimSharingConfig({ enabled: "yes" })).toThrow();
    expect(normalizeEsimSharingConfig({ enabled: "yes" })).toEqual(DEFAULT_ESIM_SHARING_CONFIG);
  });
});

describe("eSIM share eligibility", () => {
  it("allows a ready or installed profile until the package ends", () => {
    expect(
      shareEligibility({
        status: "READY",
        expiresAtMs: future,
        hasProfile: true,
        now,
      }),
    ).toBe("ok");
    expect(
      shareEligibility({
        status: "INSTALLED",
        profileStatus: "IN_USE",
        expiresAtMs: future,
        hasProfile: true,
        now,
      }),
    ).toBe("ok");
  });

  it("ends the link when the package, order, or profile ends", () => {
    for (const status of ["EXPIRED", "REFUNDED", "CANCELLED", "PROVISIONING_FAILED"]) {
      expect(shareEligibility({ status, expiresAtMs: future, hasProfile: true, now })).toBe(
        "ended",
      );
    }
    expect(
      shareEligibility({
        status: "READY",
        profileStatus: "USED_UP",
        expiresAtMs: future,
        hasProfile: true,
        now,
      }),
    ).toBe("ended");
    expect(shareEligibility({ status: "READY", expiresAtMs: past, hasProfile: true, now })).toBe(
      "ended",
    );
  });

  it("does not offer a link before the profile is installable", () => {
    expect(
      shareEligibility({
        status: "PAYMENT_CONFIRMED",
        expiresAtMs: future,
        hasProfile: false,
        now,
      }),
    ).toBe("not_ready");
    expect(
      shareEligibility({ status: "PROVISIONING", expiresAtMs: future, hasProfile: true, now }),
    ).toBe("not_ready");
    expect(shareEligibility({ status: "READY", expiresAtMs: future, hasProfile: false, now })).toBe(
      "not_ready",
    );
  });

  it("keeps an activated package valid when the provider did not send an expiry", () => {
    expect(shareEligibility({ status: "READY", expiresAtMs: null, hasProfile: true, now })).toBe(
      "ok",
    );
  });
});

describe("eSIM share copy", () => {
  it("builds an absolute claim URL under /e/", () => {
    expect(shareUrl("https://djiwatravel.com", "abc123")).toBe("https://djiwatravel.com/e/abc123");
  });

  it("tells the recipient to open the link on the phone that will use the eSIM", () => {
    const message = shareMessage("Jepang 10GB", "https://djiwatravel.com/e/abc123");
    expect(message).toContain("Jepang 10GB");
    expect(message).toContain("https://djiwatravel.com/e/abc123");
    expect(message).toContain("Wi-Fi");
    expect(message).toContain("HP");
  });
});
