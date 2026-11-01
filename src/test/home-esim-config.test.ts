import { describe, expect, it } from "vitest";
import { buildSettingAudit, validateAdminSetting } from "../lib/admin-settings";
import {
  DEFAULT_HOME_ESIM_CONFIG,
  activeHomePromo,
  normalizeHomeEsimConfig,
  orderHomeDestinations,
  parseHomeEsimConfig,
  type HomeEsimConfig,
} from "../lib/home-esim-config";
import { usageView } from "../lib/travel-journey";
import { buildEsimHomeSummary } from "../lib/esim-home-summary";

const valid: HomeEsimConfig = {
  quickBuyEnabled: true,
  myTripsWidgetEnabled: true,
  destinationOrder: ["KR", "JP"],
  lowQuotaPercent: 30,
  promo: { enabled: true, text: "Promo Jepang", destinationCode: "jp" },
};

describe("home eSIM config", () => {
  it("normalizes codes and accepts a valid record", () => {
    const parsed = parseHomeEsimConfig(valid);
    expect(parsed.promo.destinationCode).toBe("JP");
    expect(parsed.destinationOrder).toEqual(["KR", "JP"]);
  });

  it("defaults the My Trips widget on for records saved before it existed, and rejects non-booleans", () => {
    const { myTripsWidgetEnabled: _omit, ...legacy } = valid;
    expect(parseHomeEsimConfig(legacy).myTripsWidgetEnabled).toBe(true);
    expect(
      parseHomeEsimConfig({ ...valid, myTripsWidgetEnabled: false }).myTripsWidgetEnabled,
    ).toBe(false);
    expect(() => parseHomeEsimConfig({ ...valid, myTripsWidgetEnabled: "no" })).toThrow();
    expect(DEFAULT_HOME_ESIM_CONFIG.myTripsWidgetEnabled).toBe(true);
  });

  it.each([
    [{ ...valid, lowQuotaPercent: 2 }],
    [{ ...valid, lowQuotaPercent: 41 }],
    [{ ...valid, destinationOrder: ["JP", "jp"] }],
    [{ ...valid, destinationOrder: ["<b>"] }],
    [{ ...valid, promo: { enabled: true, text: "" } }],
    [{ ...valid, promo: { enabled: true, text: "<script>" } }],
    [{ ...valid, promo: { enabled: true, text: "x".repeat(81) } }],
    [
      {
        ...valid,
        promo: {
          enabled: true,
          text: "ok",
          startsAt: "2026-11-02T00:00:00Z",
          endsAt: "2026-11-01T00:00:00Z",
        },
      },
    ],
  ])("rejects an invalid admin write", (value) => {
    expect(() => parseHomeEsimConfig(value)).toThrow();
  });

  it("falls back to safe defaults for customers when the record is bad", () => {
    expect(normalizeHomeEsimConfig({ nonsense: true })).toEqual(DEFAULT_HOME_ESIM_CONFIG);
    expect(DEFAULT_HOME_ESIM_CONFIG.quickBuyEnabled).toBe(true);
    expect(DEFAULT_HOME_ESIM_CONFIG.lowQuotaPercent).toBe(20);
    expect(activeHomePromo(DEFAULT_HOME_ESIM_CONFIG, Date.now())).toBeNull();
  });

  it("judges the promo schedule by the clock it is given", () => {
    const config = parseHomeEsimConfig({
      ...valid,
      promo: {
        enabled: true,
        text: "Promo",
        startsAt: "2026-11-02T00:00:00Z",
        endsAt: "2026-11-05T00:00:00Z",
      },
    });
    expect(activeHomePromo(config, Date.parse("2026-11-01T00:00:00Z"))).toBeNull();
    expect(activeHomePromo(config, Date.parse("2026-11-03T00:00:00Z"))?.text).toBe("Promo");
    expect(activeHomePromo(config, Date.parse("2026-11-05T00:00:00Z"))).toBeNull();
  });

  it("pins admin-ordered destinations first and ignores unknown codes", () => {
    const list = [{ code: "SG" }, { code: "JP" }, { code: "KR" }];
    expect(orderHomeDestinations(list, ["KR", "XX", "JP"]).map((d) => d.code)).toEqual([
      "KR",
      "JP",
      "SG",
    ]);
  });

  it("is governed by the shared admin settings validation and audit", () => {
    expect(validateAdminSetting("homeEsim", valid)).toBe(true);
    expect(() => validateAdminSetting("homeEsim", { ...valid, lowQuotaPercent: 1 })).toThrow();
    expect(
      buildSettingAudit("homeEsim", null, valid, "admin@example.com", "pin Jepang").entityId,
    ).toBe("homeEsim");
  });

  it("drives the low-quota threshold everywhere through one input", () => {
    const base = { volumeBytes: 5_000_000_000, usedGb: 3.5, active: true };
    expect(usageView(base).low).toBe(false);
    expect(usageView({ ...base, lowPercent: 30 }).low).toBe(true);
    expect(usageView({ ...base, lowPercent: 30 }).lowThreshold).toBe(30);

    const order = {
      id: "o1",
      packageId: "JP",
      locationCodes: ["JP"],
      volumeBytes: 5_000_000_000,
      usedGb: 3.5,
      amount: 1,
      method: "qris" as const,
      status: "INSTALLED" as const,
      createdAt: Date.now(),
    };
    expect(buildEsimHomeSummary([order]).kind).toBe("active");
    expect(buildEsimHomeSummary([order], Date.now(), 30).kind).toBe("low");
  });
});
