import { describe, expect, it } from "vitest";
import {
  GEONAMES_ATTRIBUTION,
  countryNameFor,
  escapeLikePattern,
  gazetteerSubtitle,
  mapGazetteerRows,
} from "@/lib/place-gazetteer";
import { parseAdmin1, parseCities } from "../../scripts/import-geonames.mjs";

describe("gazetteer helpers", () => {
  it("escapes LIKE wildcards and the escape character itself", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("c:\\x")).toBe("c:\\\\x");
  });

  it("names countries in Indonesian and falls back to the code", () => {
    expect(countryNameFor("JP")).toBe("Jepang");
    expect(countryNameFor("id")).toBe("Indonesia");
    expect(countryNameFor("ZZ").length).toBeGreaterThan(0);
  });

  it("builds the subtitle from the province and the country, without repeating the name", () => {
    expect(gazetteerSubtitle({ name: "Ueno", country_code: "JP", admin1_name: "Tokyo" })).toBe(
      "Tokyo, Jepang",
    );
    expect(gazetteerSubtitle({ name: "Jakarta", country_code: "ID", admin1_name: "Jakarta" })).toBe(
      "Indonesia",
    );
    expect(gazetteerSubtitle({ name: "Monaco", country_code: "MC", admin1_name: null })).toBe(
      "Monako",
    );
  });

  it("maps rows to places and drops rows without a valid point or name", () => {
    const places = mapGazetteerRows([
      {
        name: "Ueno",
        country_code: "JP",
        latitude: 35.7148,
        longitude: 139.77,
        admin1_name: "Tokyo",
      },
      { name: "  ", country_code: "JP", latitude: 35.7, longitude: 139.7, admin1_name: "Tokyo" },
      { name: "Nowhere", country_code: "JP", latitude: 500, longitude: 139.7, admin1_name: null },
      { name: "NoPoint", country_code: "JP", admin1_name: null },
    ]);
    expect(places).toEqual([
      { label: "Ueno", subtitle: "Tokyo, Jepang", lat: 35.7148, lng: 139.77 },
    ]);
  });

  it("keeps the attribution GeoNames asks for", () => {
    expect(GEONAMES_ATTRIBUTION).toContain("GeoNames");
    expect(GEONAMES_ATTRIBUTION).toContain("CC BY 4.0");
  });
});

describe("GeoNames import parsing", () => {
  // Columns follow cities500.txt: id, name, asciiname, alternatenames, lat, lng, class, code,
  // country, cc2, admin1, admin2, admin3, admin4, population, elevation, dem, timezone, modified.
  const line = (cols: Record<number, string>) =>
    Array.from({ length: 19 }, (_, i) => cols[i] ?? "").join("\t");

  it("keeps good rows and skips the ones the database would reject", () => {
    const text = [
      line({
        0: "1850144",
        1: "Tōkyō",
        2: "Tokyo",
        4: "35.6895",
        5: "139.69171",
        7: "PPLC",
        8: "JP",
        10: "13",
        14: "8336599",
      }),
      line({ 0: "2", 1: "NoCountry", 2: "NoCountry", 4: "1", 5: "1", 7: "PPL", 8: "" }),
      line({ 0: "3", 1: "BadLat", 2: "BadLat", 4: "95", 5: "1", 7: "PPL", 8: "XX" }),
      line({ 0: "4", 1: "NoAscii", 4: "10", 5: "20", 7: "PPL", 8: "ID", 10: "", 14: "5" }),
    ].join("\n");
    const rows = parseCities(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 1850144,
      name: "Tōkyō",
      asciiName: "Tokyo",
      countryCode: "JP",
      admin1: "13",
      population: 8336599,
    });
    // An empty ASCII name falls back to the name, so search still finds the place.
    expect(rows[1]).toMatchObject({ name: "NoAscii", asciiName: "NoAscii", admin1: "" });
  });

  it("reads the admin1 names keyed by country and code", () => {
    const rows = parseAdmin1(
      "JP.13\tTokyo\tTokyo\t1850147\nbad line\nID.01\tAceh\tAceh\t1214575\n",
    );
    expect(rows).toEqual([
      { code: "JP.13", name: "Tokyo", asciiName: "Tokyo" },
      { code: "ID.01", name: "Aceh", asciiName: "Aceh" },
    ]);
  });
});
