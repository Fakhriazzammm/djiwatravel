import { describe, expect, it } from "vitest";
import { countryBoundsFor, COUNTRY_BOUNDS_CODES } from "@/lib/trip-country-bounds";
import { TRIP_COUNTRIES } from "@/lib/trip-countries";

const contains = (box: readonly number[], lng: number, lat: number) =>
  lng >= box[0]! && lng <= box[2]! && lat >= box[1]! && lat <= box[3]!;

describe("country framing boxes", () => {
  it("has a box for every country a traveller can pick", () => {
    const missing = TRIP_COUNTRIES.filter((c) => !countryBoundsFor(c.code)).map((c) => c.code);
    expect(missing).toEqual([]);
  });

  it("keeps every box a valid, non-empty longitude/latitude rectangle", () => {
    for (const code of COUNTRY_BOUNDS_CODES) {
      const [w, s, e, n] = countryBoundsFor(code)!;
      expect(w, code).toBeLessThan(e);
      expect(s, code).toBeLessThan(n);
      expect(w, code).toBeGreaterThanOrEqual(-180);
      expect(e, code).toBeLessThanOrEqual(180);
      expect(s, code).toBeGreaterThanOrEqual(-90);
      expect(n, code).toBeLessThanOrEqual(90);
    }
  });

  it("frames a whole archipelago: Japan from Hokkaido to Okinawa", () => {
    const japan = countryBoundsFor("JP")!;
    expect(contains(japan, 139.69, 35.69)).toBe(true); // Tokyo
    expect(contains(japan, 141.35, 43.06)).toBe(true); // Sapporo
    expect(contains(japan, 127.68, 26.21)).toBe(true); // Naha
    expect(contains(japan, 106.85, -6.2)).toBe(false); // Jakarta is not in Japan
  });

  it("frames Indonesia from Jakarta to Papua", () => {
    const indonesia = countryBoundsFor("ID")!;
    expect(contains(indonesia, 106.85, -6.2)).toBe(true);
    expect(contains(indonesia, 140.7, -2.53)).toBe(true);
  });

  it("keeps the mainland for countries with far overseas parts", () => {
    const france = countryBoundsFor("FR")!;
    expect(contains(france, 2.35, 48.86)).toBe(true); // Paris
    expect(contains(france, -54.0, 4.0)).toBe(false); // French Guiana is not framed
  });

  it("matches codes in any case and ignores anything that is not a country", () => {
    expect(countryBoundsFor("jp")).toEqual(countryBoundsFor("JP"));
    expect(countryBoundsFor(" JP ")).toEqual(countryBoundsFor("JP"));
    expect(countryBoundsFor("GLOBAL")).toBeNull();
    expect(countryBoundsFor("")).toBeNull();
    expect(countryBoundsFor(null)).toBeNull();
    expect(countryBoundsFor(undefined)).toBeNull();
    expect(countryBoundsFor("TOSTRING")).toBeNull();
  });
});
