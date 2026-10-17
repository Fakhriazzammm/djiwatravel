import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createResellerCatalogFileStore } from "@/lib/reseller-catalog-file-store.server";

const entry = { packages: [], syncedAt: 123 };

describe("reseller catalog file store", () => {
  it("persists atomically and reloads a private snapshot", () => {
    const directory = mkdtempSync(join(tmpdir(), "djiwa-catalog-"));
    const filePath = join(directory, "catalog.json");
    const first = createResellerCatalogFileStore(filePath);
    expect(first).toBeDefined();
    first?.set("*", entry);
    expect(JSON.parse(readFileSync(filePath, "utf8"))["*"]).toEqual(entry);

    const second = createResellerCatalogFileStore(filePath);
    expect(second?.get("*")).toEqual(entry);
  });

  it("falls back to an empty store when the snapshot is invalid", () => {
    const directory = mkdtempSync(join(tmpdir(), "djiwa-catalog-"));
    const filePath = join(directory, "catalog.json");
    const first = createResellerCatalogFileStore(filePath);
    expect(first).toBeDefined();
    first?.set("*", entry);
    writeFileSync(filePath, "invalid");
    expect(createResellerCatalogFileStore(filePath)?.get("*")).toBeUndefined();
  });
});
