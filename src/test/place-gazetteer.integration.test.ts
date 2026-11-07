import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs the real SQL against a real PostgreSQL. Opt-in: set GEONAMES_TEST_DATABASE_URL to a
// dedicated, empty test database. The rows it writes are deleted and replaced on every run.
const url = process.env["GEONAMES_TEST_DATABASE_URL"];

describe.skipIf(!url)("gazetteer against PostgreSQL", () => {
  let search: typeof import("@/lib/place-gazetteer.server");
  let close: () => Promise<void> = async () => undefined;

  beforeAll(async () => {
    process.env["DATABASE_URL"] = url;
    search = await import("@/lib/place-gazetteer.server");
    const { pool } = await import("@/db/client.server");
    close = () => pool.end();
    await pool.query(
      readFileSync(join(process.cwd(), "migrations/047_geonames_places.sql"), "utf8"),
    );
    await pool.query("delete from public.geo_places; delete from public.geo_admin1;");
    await pool.query(`
      insert into public.geo_admin1 (code, name, ascii_name) values
        ('JP.13', 'Tokyo', 'Tokyo'), ('ID.03', 'Jakarta', 'Jakarta');
      insert into public.geo_places
        (geoname_id, name, ascii_name, latitude, longitude, feature_code, country_code, admin1_code, population)
      values
        (1, 'Ueno', 'Ueno', 35.7148, 139.7770, 'PPLX', 'JP', '13', 3710),
        (2, 'Uenohara', 'Uenohara', 35.6, 139.0, 'PPL', 'JP', '13', 23158),
        (3, 'Taito', 'Taito', 35.7125, 139.7800, 'PPLA2', 'JP', '13', 200000),
        (4, 'Jakarta', 'Jakarta', -6.2, 106.8, 'PPLC', 'ID', '03', 10000000);
    `);
  });

  afterAll(async () => {
    await close();
  });

  it("ranks an exact name first, then the bigger place, with the province and country", async () => {
    const places = await search.gazetteerSearch("ueno", 8);
    expect(places.map((p) => p.label)).toEqual(["Ueno", "Uenohara"]);
    expect(places[0]).toEqual({
      label: "Ueno",
      subtitle: "Tokyo, Jepang",
      lat: 35.7148,
      lng: 139.777,
    });
  });

  it("treats a typed % or _ as a plain character", async () => {
    expect(await search.gazetteerSearch("ueno%", 8)).toEqual([]);
  });

  it("finds an Indonesian city by its name", async () => {
    const places = await search.gazetteerSearch("jakarta", 8);
    expect(places[0]).toMatchObject({ label: "Jakarta", subtitle: "Indonesia" });
  });

  it("returns no places for an unknown name once data is loaded", async () => {
    expect(await search.gazetteerSearch("seizeriya", 8)).toEqual([]);
  });

  it("names a point from the nearest populated place inside the window", async () => {
    const place = await search.gazetteerNearest({ lat: 35.7148, lng: 139.777 });
    expect(place?.label).toBe("Ueno");
    expect(await search.gazetteerNearest({ lat: -30, lng: 150 })).toBeNull();
  });

  it("counts the loaded places", async () => {
    expect(await search.countGazetteerPlaces()).toBe(4);
  });
});
