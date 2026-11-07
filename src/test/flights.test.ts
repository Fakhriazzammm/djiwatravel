import { describe, expect, it } from "vitest";
import { validateAdminSetting } from "@/lib/admin-settings";
import {
  DEFAULT_FLIGHTS_CONFIG,
  googleFlightsUrl,
  normalizeFlightsConfig,
  parseFlightsConfig,
  showGoogleFlights,
  travelpayoutsScriptSrc,
} from "@/lib/flights";

describe("flights config", () => {
  it("ships the Travelpayouts script and marker as defaults", () => {
    expect(travelpayoutsScriptSrc(DEFAULT_FLIGHTS_CONFIG)).toBe(
      "https://emrldtp.cc/NTk3MDMw.js?t=597030",
    );
    expect(DEFAULT_FLIGHTS_CONFIG.waitForConsent).toBe(true);
  });

  it("rejects ids that could break out of the script URL", () => {
    const bad = { ...DEFAULT_FLIGHTS_CONFIG, scriptId: 'x"><script>' };
    expect(() => parseFlightsConfig(bad)).toThrow(/scriptId/);
    expect(() => parseFlightsConfig({ ...DEFAULT_FLIGHTS_CONFIG, partnerId: "59 7" })).toThrow(
      /partnerId/,
    );
    expect(() => parseFlightsConfig({ ...DEFAULT_FLIGHTS_CONFIG, enabled: "yes" })).toThrow();
  });

  it("falls back to the default for a malformed stored value", () => {
    expect(normalizeFlightsConfig({ enabled: 1 })).toEqual(DEFAULT_FLIGHTS_CONFIG);
  });

  it("turns the script and link off with the switches", () => {
    expect(travelpayoutsScriptSrc({ ...DEFAULT_FLIGHTS_CONFIG, enabled: false })).toBeNull();
    expect(travelpayoutsScriptSrc({ ...DEFAULT_FLIGHTS_CONFIG, travelpayouts: false })).toBeNull();
    expect(showGoogleFlights({ ...DEFAULT_FLIGHTS_CONFIG, googleFlights: false })).toBe(false);
  });

  it("is a valid Admin setting", () => {
    expect(() => validateAdminSetting("flights", DEFAULT_FLIGHTS_CONFIG)).not.toThrow();
  });
});

describe("googleFlightsUrl", () => {
  it("builds a round-trip search from the trip", () => {
    const url = new URL(
      googleFlightsUrl({
        destination: "Bali",
        departureDate: "2026-12-20",
        returnDate: "2026-12-27",
      })!,
    );
    expect(url.origin + url.pathname).toBe("https://www.google.com/travel/flights");
    expect(url.searchParams.get("q")).toBe("Flights to Bali on 2026-12-20 through 2026-12-27");
  });

  it("drops a return date before departure and ignores bad dates", () => {
    const q = (trip: Parameters<typeof googleFlightsUrl>[0]) =>
      new URL(googleFlightsUrl(trip)!).searchParams.get("q");
    expect(q({ destination: "Tokyo", departureDate: "2026-12-20", returnDate: "2026-12-01" })).toBe(
      "Flights to Tokyo on 2026-12-20",
    );
    expect(q({ destination: "Tokyo", departureDate: "besok" })).toBe("Flights to Tokyo");
  });

  it("returns null without a destination and encodes special characters", () => {
    expect(googleFlightsUrl({ destination: "  " })).toBeNull();
    expect(googleFlightsUrl({ destination: "A&B=C" })).toContain("A%26B%3DC");
  });
});
