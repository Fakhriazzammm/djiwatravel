import { loadResellerCatalog, type ResellerCatalogPackage } from "./esim-access-catalog";

type CacheEntry = { packages: ResellerCatalogPackage[]; syncedAt: number };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ResellerCatalogPackage[]>>();
const TTL_MS = 5 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Katalog provider timeout")), timeoutMs);
    promise.then(resolve, reject);
  }).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export type CatalogRead = {
  packages: ResellerCatalogPackage[];
  syncedAt: number | null;
  stale: boolean;
  source: "provider" | "cache";
};

export async function getResellerCatalog(locationCode?: string): Promise<CatalogRead> {
  const key = (locationCode ?? "*").toUpperCase();
  const current = cache.get(key);
  if (current && Date.now() - current.syncedAt < TTL_MS)
    return { ...current, stale: false, source: "cache" };
  let request = inflight.get(key);
  if (!request) {
    request = withTimeout(
      loadResellerCatalog(locationCode ? { locationCode } : {}),
      PROVIDER_TIMEOUT_MS,
    ).finally(() => inflight.delete(key));
    inflight.set(key, request);
  }
  try {
    const packages = await request;
    const entry = { packages, syncedAt: Date.now() };
    cache.set(key, entry);
    return { ...entry, stale: false, source: "provider" };
  } catch (error) {
    if (current) return { ...current, stale: true, source: "cache" };
    throw error;
  }
}

export function clearResellerCatalogCache() {
  cache.clear();
}
