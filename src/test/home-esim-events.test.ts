import { describe, expect, it } from "vitest";
import { funnelRates, homeEsimEventInput, isHomeEsimEvent } from "../lib/home-esim-events";
import { readFileSync } from "node:fs";

describe("home eSIM funnel events", () => {
  it("accepts only anonymous, allow-listed fields", () => {
    expect(homeEsimEventInput.parse({ name: "home_esim_chip_tap", destination: "jp" })).toEqual({
      name: "home_esim_chip_tap",
      destination: "JP",
    });
    expect(() => homeEsimEventInput.parse({ name: "page_view" })).toThrow();
    expect(() =>
      homeEsimEventInput.parse({ name: "home_esim_chip_tap", destination: "<x>" }),
    ).toThrow();
    expect(() =>
      homeEsimEventInput.parse({ name: "home_esim_chip_tap", source: "email" }),
    ).toThrow();
    expect(
      homeEsimEventInput.parse({ name: "home_esim_chip_tap", email: "a@b.c" }),
    ).not.toHaveProperty("email");
    expect(isHomeEsimEvent("home_esim_promo_tap")).toBe(true);
    expect(isHomeEsimEvent("checkout_start")).toBe(false);
  });

  it("never invents a rate from zero taps", () => {
    expect(funnelRates({ chipTaps: 0, sheetOpens: 3 }).chipToSheet).toBeNull();
    expect(funnelRates({ chipTaps: 4, sheetOpens: 3 }).chipToSheet).toBe(75);
  });

  it("routes home events to the first-party sink and has a migration for it", () => {
    expect(readFileSync("src/lib/analytics.ts", "utf8")).toContain("/api/home-esim-events");
    expect(readFileSync("migrations/026_home_esim_events.sql", "utf8")).toContain(
      "home_esim_events",
    );
    expect(readFileSync("src/routes/admin.analytics.tsx", "utf8")).toContain("getHomeEsimFunnel");
  });
});
