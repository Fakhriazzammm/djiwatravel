#!/usr/bin/env node
// Loads the offline place gazetteer used by Agenda place search (see migration 047).
//
//   DATABASE_URL=... node scripts/import-geonames.mjs [--dir <scratch dir>]
//
// Source: GeoNames cities500.zip and admin1CodesASCII.txt, licensed CC BY 4.0. The whole dataset is
// replaced in one transaction, so searches keep reading the old rows until the commit. Run it once
// after the migration, and again when a fresher GeoNames dump is wanted.

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const CITIES_URL = "https://download.geonames.org/export/dump/cities500.zip";
export const ADMIN1_URL = "https://download.geonames.org/export/dump/admin1CodesASCII.txt";
const BATCH_SIZE = 2000;

/** Parses cities500.txt (tab separated, 19 columns). Rows with bad coordinates or codes are skipped. */
export function parseCities(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const cols = line.split("\t");
    const id = Number(cols[0]);
    const name = (cols[1] ?? "").trim().slice(0, 200);
    const asciiName = (cols[2] ?? "").trim().slice(0, 200) || name;
    const lat = Number(cols[4]);
    const lng = Number(cols[5]);
    const featureCode = (cols[7] ?? "").trim();
    const countryCode = (cols[8] ?? "").trim().toUpperCase();
    const admin1 = (cols[10] ?? "").trim();
    const population = Number(cols[14]) || 0;
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    if (!name || !featureCode) continue;
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) continue;
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) continue;
    if (!/^[A-Z]{2}$/.test(countryCode)) continue;
    rows.push({ id, name, asciiName, lat, lng, featureCode, countryCode, admin1, population });
  }
  return rows;
}

/** Parses admin1CodesASCII.txt: "JP.13<TAB>Tokyo<TAB>Tokyo<TAB>1850147". */
export function parseAdmin1(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    const cols = line.split("\t");
    const code = (cols[0] ?? "").trim();
    const name = (cols[1] ?? "").trim().slice(0, 200);
    const asciiName = (cols[2] ?? "").trim().slice(0, 200) || name;
    if (!/^[A-Z]{2}\.[^.\s]+$/.test(code) || !name) continue;
    rows.push({ code, name, asciiName });
  }
  return rows;
}

async function download(url, file) {
  const response = await fetch(url, {
    headers: { "User-Agent": "DjiwaTravel/1.0 (https://djiwatravel.com)" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`download ${url} failed with HTTP ${response.status}`);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
}

async function loadIntoDatabase(pg, cities, admin1) {
  const client = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("delete from public.geo_places");
    await client.query("delete from public.geo_admin1");
    for (let start = 0; start < admin1.length; start += BATCH_SIZE) {
      const batch = admin1.slice(start, start + BATCH_SIZE);
      await client.query(
        `insert into public.geo_admin1 (code, name, ascii_name)
         select * from unnest($1::text[], $2::text[], $3::text[])`,
        [batch.map((r) => r.code), batch.map((r) => r.name), batch.map((r) => r.asciiName)],
      );
    }
    for (let start = 0; start < cities.length; start += BATCH_SIZE) {
      const batch = cities.slice(start, start + BATCH_SIZE);
      await client.query(
        `insert into public.geo_places
           (geoname_id, name, ascii_name, latitude, longitude, feature_code, country_code,
            admin1_code, population)
         select id, name, ascii_name, lat, lng, feature_code, country_code,
                nullif(admin1, ''), population
         from unnest($1::bigint[], $2::text[], $3::text[], $4::float8[], $5::float8[],
                     $6::text[], $7::text[], $8::text[], $9::bigint[])
           as t(id, name, ascii_name, lat, lng, feature_code, country_code, admin1, population)`,
        [
          batch.map((r) => r.id),
          batch.map((r) => r.name),
          batch.map((r) => r.asciiName),
          batch.map((r) => r.lat),
          batch.map((r) => r.lng),
          batch.map((r) => r.featureCode),
          batch.map((r) => r.countryCode),
          batch.map((r) => r.admin1),
          batch.map((r) => r.population),
        ],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

export async function main(argv = process.argv.slice(2)) {
  if (!process.env["DATABASE_URL"]) throw new Error("DATABASE_URL is required");
  const dirFlag = argv.indexOf("--dir");
  const dir =
    dirFlag >= 0 && argv[dirFlag + 1] ? argv[dirFlag + 1] : join(tmpdir(), "djiwa-geonames");
  await mkdir(dir, { recursive: true });

  const zip = join(dir, "cities500.zip");
  const admin1File = join(dir, "admin1CodesASCII.txt");
  console.log("download cities500.zip");
  await download(CITIES_URL, zip);
  console.log("download admin1CodesASCII.txt");
  await download(ADMIN1_URL, admin1File);
  await execFileAsync("unzip", ["-o", "-q", zip, "cities500.txt", "-d", dir]);

  const cities = parseCities(await readFile(join(dir, "cities500.txt"), "utf8"));
  const admin1 = parseAdmin1(await readFile(admin1File, "utf8"));
  console.log(`parsed ${cities.length} places and ${admin1.length} admin1 names`);
  if (cities.length < 100_000) throw new Error("too few places parsed; the source format changed?");

  const pg = (await import("pg")).default;
  await loadIntoDatabase(pg, cities, admin1);
  console.log("loaded into geo_places and geo_admin1");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("import-geonames failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
