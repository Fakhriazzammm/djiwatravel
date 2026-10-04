import { loadResellerCatalog, type ResellerCatalogPackage } from "./esim-access-catalog";

type CacheEntry = { packages: ResellerCatalogPackage[]; syncedAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

export type CatalogRead = { packages: ResellerCatalogPackage[]; syncedAt: number | null; stale: boolean; source: "provider" | "cache" };

export async function getResellerCatalog(locationCode?: string): Promise<CatalogRead> {
  const key = (locationCode ?? "*").toUpperCase();
  const current = cache.get(key);
  if (current && Date.now() - current.syncedAt < TTL_MS) return { ...current, stale: false, source: "cache" };
  try {
    const packages = await loadResellerCatalog(locationCode ? { locationCode } : {});
    const entry = { packages, syncedAt: Date.now() };
    cache.set(key, entry);
    return { ...entry, stale: false, source: "provider" };
  } catch (error) {
    if (current) return { ...current, stale: true, source: "cache" };
    throw error;
  }
}

export function clearResellerCatalogCache() { cache.clear(); }
