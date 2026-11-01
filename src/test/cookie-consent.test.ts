import { beforeEach, describe, expect, it } from "vitest";
import { CONSENT_COOKIE, analyticsConsentGranted, readConsent, saveConsent } from "@/lib/cookie-consent";

describe("cookie consent", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
  });

  it("is unanswered by default and remembers one answer", () => {
    expect(readConsent()).toBeNull();
    expect(analyticsConsentGranted()).toBe(false);
    saveConsent("essential");
    expect(readConsent()).toBe("essential");
    expect(analyticsConsentGranted()).toBe(false);
  });

  it("grants analytics only after Setuju and survives cleared localStorage via the cookie", () => {
    saveConsent("all");
    expect(analyticsConsentGranted()).toBe(true);
    window.localStorage.clear();
    expect(readConsent()).toBe("all");
  });
});
