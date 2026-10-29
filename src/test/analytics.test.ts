import { beforeEach, describe, expect, it } from "vitest";
import { buildAnalyticsEvent, isAnalyticsPublicPath } from "@/lib/analytics";

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(
    {},
    "",
    "/explore?utm_source=newsletter&utm_medium=email&utm_campaign=october",
  );
});

describe("privacy-safe analytics attribution", () => {
  it("captures bounded UTM/referrer attribution without contact or payment fields", () => {
    const event = buildAnalyticsEvent("page_view", "/explore");
    expect(event).not.toBeNull();
    expect(event?.attribution).toMatchObject({
      source: "newsletter",
      medium: "email",
      campaign: "october",
    });
    expect(event).not.toHaveProperty("email");
    expect(event).not.toHaveProperty("whatsapp");
    expect(event).not.toHaveProperty("payment");
  });

  it("rejects account, order, checkout, and eSIM paths", () => {
    for (const path of [
      "/profile",
      "/wallet",
      "/order/order-1",
      "/checkout/pkg-1",
      "/my-esim/pkg-1",
    ]) {
      expect(isAnalyticsPublicPath(path)).toBe(false);
      expect(buildAnalyticsEvent("page_view", path)).toBeNull();
    }
  });

  it("keeps attribution stable for a session", () => {
    const first = buildAnalyticsEvent("page_view", "/explore");
    window.history.replaceState({}, "", "/explore?utm_source=other&utm_medium=paid");
    const second = buildAnalyticsEvent("finder_submit", "/esim/finder", { durationDays: 7 });
    expect(second?.sessionId).toBe(first?.sessionId);
    expect(second?.attribution).toEqual(first?.attribution);
  });
});
