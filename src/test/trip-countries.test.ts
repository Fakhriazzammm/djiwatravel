import { describe, expect, it } from "vitest";
import { flagFor, searchCountries, TRIP_COUNTRIES, tripCurrencyFor } from "@/lib/trip-countries";

describe("trip country list", () => {
  it("lists many countries with Indonesian names and flags", () => {
    expect(TRIP_COUNTRIES.length).toBeGreaterThan(200);
    const jp = TRIP_COUNTRIES.find((c) => c.code === "JP");
    expect(jp?.name).toBe("Jepang");
    expect(jp?.flag).toBe("🇯🇵");
    expect(flagFor("TH")).toBe("🇹🇭");
  });

  it("searches by Indonesian name, substring and code, case-insensitively", () => {
    expect(searchCountries("jep").map((c) => c.code)).toContain("JP");
    expect(searchCountries("SINGA").map((c) => c.code)).toContain("SG");
    expect(searchCountries("th").length).toBeGreaterThan(0);
    expect(searchCountries("zzzz")).toHaveLength(0);
  });

  it("keeps the server-accepted currency for known countries and IDR otherwise", () => {
    expect(tripCurrencyFor("JP")).toBe("JPY");
    expect(tripCurrencyFor("TH")).toBe("IDR");
  });
});
