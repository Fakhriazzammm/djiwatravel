import { describe, expect, it } from "vitest";
import {
  classifyBundle,
  isMultiCountry,
  packagesForBundleGroup,
  summarizeBundleGroups,
} from "@/lib/multi-country";
import { DEFAULT_HOME_ESIM_CONFIG, parseHomeEsimConfig } from "@/lib/home-esim-config";

describe("provider multi-country bundles", () => {
  it("treats only multi-code provider packages as bundles", () => {
    expect(isMultiCountry({ locationCodes: ["JP"] })).toBe(false);
    expect(isMultiCountry({ locationCodes: ["JP", "jp"] })).toBe(false);
    expect(isMultiCountry({ locationCodes: ["JP", "KR"] })).toBe(true);
  });
  it("classifies by the provider country list", () => {
    expect(classifyBundle(["JP", "KR", "TH"])).toBe("ASIA");
    expect(classifyBundle(["DE", "FR", "IT"])).toBe("EU");
    expect(classifyBundle(["JP", "DE", "US"])).toBe("GLOBAL");
    expect(classifyBundle(Array.from({ length: 40 }, (_, i) => `X${i}`))).toBe("GLOBAL");
  });
  it("groups, counts and prices bundles, skipping single-country packages", () => {
    const groups = summarizeBundleGroups([
      { locationCodes: ["JP"], priceIdr: 10 },
      { locationCodes: ["JP", "KR"], priceIdr: 90 },
      { locationCodes: ["TH", "SG", "JP"], priceIdr: 70 },
      { locationCodes: ["DE", "FR"], priceIdr: 120 },
    ]);
    expect(groups.map((g) => g.code)).toEqual(["ASIA", "EU"]);
    expect(groups[0]).toMatchObject({ packageCount: 2, countryCount: 4, fromPriceIdr: 70 });
    expect(packagesForBundleGroup([{ locationCodes: ["JP"] }], "ASIA")).toEqual([]);
  });
  it("Admin switch defaults on and must be boolean", () => {
    expect(DEFAULT_HOME_ESIM_CONFIG.multiCountryEnabled).toBe(true);
    const base = { ...DEFAULT_HOME_ESIM_CONFIG };
    expect(
      parseHomeEsimConfig({ ...base, multiCountryEnabled: undefined }).multiCountryEnabled,
    ).toBe(true);
    expect(parseHomeEsimConfig({ ...base, multiCountryEnabled: false }).multiCountryEnabled).toBe(
      false,
    );
    expect(() => parseHomeEsimConfig({ ...base, multiCountryEnabled: "no" })).toThrow();
  });
});
