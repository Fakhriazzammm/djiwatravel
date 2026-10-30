import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  ResellerCatalogCacheEntry,
  ResellerCatalogCacheStore,
} from "./reseller-catalog-cache";

type SnapshotFile = Record<string, ResellerCatalogCacheEntry>;

/**
 * Optional private snapshot persistence for the server catalog cache.
 * The file is never served publicly and writes are atomic.
 */
export function createResellerCatalogFileStore(
  filePath =
    process.env["RESELLER_CATALOG_CACHE_FILE"] ??
    (process.env["NODE_ENV"] === "production"
      ? join(process.cwd(), ".data", "reseller-catalog.json")
      : undefined),
): ResellerCatalogCacheStore | undefined {
  if (!filePath) return undefined;

  let entries = readSnapshot(filePath);
  const persist = () => {
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    const temporary = `${filePath}.tmp-${process.pid}`;
    writeFileSync(temporary, JSON.stringify(entries), { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, filePath);
    chmodSync(filePath, 0o600);
  };

  return {
    get: (key) => entries[key],
    set: (key, entry) => {
      entries = { ...entries, [key]: entry };
      persist();
    },
    clear: () => {
      entries = {};
      persist();
    },
  };
}

function readSnapshot(filePath: string): SnapshotFile {
  try {
    const value = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as SnapshotFile;
  } catch {
    return {};
  }
}
