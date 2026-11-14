import { describe, expect, it } from "vitest";
import {
  CONSENT_LABEL,
  CONSENT_PURPOSES,
  ONE_TAP_PURPOSES,
  computeNeedsPrompt,
  consentRequiredMessage,
  isConsentPurpose,
} from "@/lib/consent";

describe("data consent rules", () => {
  it("one tap never bundles promo", () => {
    expect(ONE_TAP_PURPOSES).toEqual(["community", "ai", "personalization"]);
    expect(ONE_TAP_PURPOSES).not.toContain("promo");
    for (const purpose of ONE_TAP_PURPOSES) expect(CONSENT_PURPOSES).toContain(purpose);
  });

  it("asks until answered, and not while snoozed", () => {
    const now = Date.parse("2026-11-14T10:00:00Z");
    expect(computeNeedsPrompt(false, null, now)).toBe(true);
    expect(computeNeedsPrompt(true, null, now)).toBe(false);
    expect(computeNeedsPrompt(false, "2026-11-21T10:00:00Z", now)).toBe(false);
    expect(computeNeedsPrompt(false, "2026-11-10T10:00:00Z", now)).toBe(true);
  });

  it("tells the member where to turn a consent on", () => {
    expect(consentRequiredMessage("ai")).toBe(
      "Aktifkan “Asisten Travo (AI)” di Profil › Privasi & data untuk memakai fitur ini.",
    );
    expect(Object.keys(CONSENT_LABEL).sort()).toEqual([...CONSENT_PURPOSES].sort());
  });

  it("only knows the stored purposes (analytics is a device choice)", () => {
    expect(isConsentPurpose("ai")).toBe(true);
    expect(isConsentPurpose("analytics")).toBe(false);
  });
});
