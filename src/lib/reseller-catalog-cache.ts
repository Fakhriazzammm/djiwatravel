import { loadResellerCatalog, type ResellerCatalogPackage } from "./esim-access-catalog";
import { recordCatalogMetric, resetResellerCatalogMetrics } from "./reseller-catalog-metrics";

export { getResellerCatalogMetrics } from "./reseller-catalog-metrics";

export type ResellerCatalogCacheEntry = {
  packages: ResellerCatalogPackage[];
  syncedAt: number;
};

export type ResellerCatalogCacheStore = {
  get(key: string): ResellerCatalogCacheEntry | undefined;
  set(key: string, entry: ResellerCatalogCacheEntry): void;
  clear(): void;
};

export type ResellerCatalogCacheOptions = {
  store?: ResellerCatalogCacheStore;
  now?: () => number;
  ttlMs?: number;
  maxStaleMs?: number;
  providerTimeoutMs?: number;
};

export type ResellerPackageLookupOptions = { fresh?: boolean };

const defaultEntries = new Map<string, ResellerCatalogCacheEntry>();
const defaultStore: ResellerCatalogCacheStore = {
  get: (key) => defaultEntries.get(key),
  set: (key, entry) => defaultEntries.set(key, entry),
  clear: () => defaultEntries.clear(),
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_STALE_MS = 15 * 60 * 1000;
const DEFAULT_PROVIDER_TIMEOUT_MS = 8_000;
const SHARED_STORE_KEY = "__djiwa_reseller_catalog_store__";

type SharedCatalogGlobal = typeof globalThis & {
  [SHARED_STORE_KEY]?: ResellerCatalogCacheStore;
};

let configured = {
  store: defaultStore,
  now: () => Date.now(),
  ttlMs: DEFAULT_TTL_MS,
  maxStaleMs: DEFAULT_MAX_STALE_MS,
  providerTimeoutMs: DEFAULT_PROVIDER_TIMEOUT_MS,
};
const inflight = new Map<string, Promise<ResellerCatalogCacheEntry>>();

export type CatalogRead = {
  packages: ResellerCatalogPackage[];
  syncedAt: number | null;
  stale: boolean;
  source: "provider" | "cache";
};

export type CatalogPackageRead = {
  pkg: ResellerCatalogPackage;
  syncedAt: number;
  stale: boolean;
  source: "provider" | "cache";
};

function keyForLocation(locationCode?: string) {
  return locationCode?.trim().toUpperCase() || "*";
}

function queryForLocation(locationCode?: string) {
  const normalized = locationCode?.trim().toUpperCase();
  return normalized ? { locationCode: normalized } : {};
}

function packageKey(packageCode: string) {
  return `package:${packageCode.trim()}`;
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      recordCatalogMetric("providerTimeouts");
      reject(new Error("Katalog provider timeout"));
    }, configured.providerTimeoutMs);
    promise.then(resolve, reject);
  }).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function freshness(entry: ResellerCatalogCacheEntry | undefined) {
  if (!entry) return { age: Infinity, fresh: false, staleAllowed: false };
  const age = Math.max(0, configured.now() - entry.syncedAt);
  return {
    age,
    fresh: age < configured.ttlMs,
    staleAllowed: age < configured.maxStaleMs,
  };
}

function findPackage(entry: ResellerCatalogCacheEntry | undefined, code: string) {
  return entry?.packages.find((pkg) => pkg.packageCode === code);
}

function adoptSharedStore() {
  const shared = (globalThis as SharedCatalogGlobal)[SHARED_STORE_KEY];
  if (shared && configured.store === defaultStore) configured.store = shared;
}

function refresh(key: string, loader: () => Promise<ResellerCatalogPackage[]>) {
  const current = inflight.get(key);
  if (current) return current;
  const startedAt = configured.now();
  const pending: Promise<ResellerCatalogCacheEntry> = withTimeout(loader())
    .then((packages) => {
      const entry = { packages, syncedAt: configured.now() };
      configured.store.set(key, entry);
      recordCatalogMetric("providerRequests");
      recordCatalogMetric("providerLatencyMs", Math.max(0, configured.now() - startedAt));
      return entry;
    })
    .catch((error) => {
      recordCatalogMetric("providerErrors");
      throw error;
    })
    .finally(() => {
      if (inflight.get(key) === pending) inflight.delete(key);
    });
  inflight.set(key, pending);
  return pending;
}

export function configureResellerCatalogCache(options: ResellerCatalogCacheOptions = {}) {
  configured = {
    store: options.store ?? defaultStore,
    now: options.now ?? (() => Date.now()),
    ttlMs: options.ttlMs ?? DEFAULT_TTL_MS,
    maxStaleMs: options.maxStaleMs ?? DEFAULT_MAX_STALE_MS,
    providerTimeoutMs: options.providerTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
  };
  inflight.clear();
}

export async function getResellerCatalog(locationCode?: string): Promise<CatalogRead> {
  adoptSharedStore();
  const key = keyForLocation(locationCode);
  const current = configured.store.get(key);
  const state = freshness(current);
  if (current && state.fresh) {
    recordCatalogMetric("hits");
    recordCatalogMetric("snapshotAgeMs", state.age);
    return { ...current, stale: false, source: "cache" };
  }
  if (current && state.staleAllowed) {
    recordCatalogMetric("staleServed");
    recordCatalogMetric("snapshotAgeMs", state.age);
    void refresh(key, () => loadResellerCatalog(queryForLocation(locationCode))).catch(
      () => undefined,
    );
    return { ...current, stale: true, source: "cache" };
  }
  recordCatalogMetric("misses");
  const entry = await refresh(key, () => loadResellerCatalog(queryForLocation(locationCode)));
  return { ...entry, stale: false, source: "provider" };
}

export function prewarmResellerCatalog(locationCode?: string) {
  const key = keyForLocation(locationCode);
  const current = configured.store.get(key);
  if (current && freshness(current).fresh) return Promise.resolve();
  return getResellerCatalog(locationCode)
    .then(() => undefined)
    .catch(() => undefined);
}

export async function getResellerPackage(
  packageCode: string,
  options: ResellerPackageLookupOptions = {},
): Promise<CatalogPackageRead> {
  adoptSharedStore();
  const normalizedCode = packageCode.trim();
  const key = packageKey(normalizedCode);
  if (options.fresh) {
    const entry = await refresh(key, () => loadResellerCatalog({ packageCode: normalizedCode }));
    const pkg = findPackage(entry, normalizedCode);
    if (!pkg) throw new Error("Paket eSIM tidak ditemukan atau sudah tidak tersedia");
    return { pkg, syncedAt: entry.syncedAt, stale: false, source: "provider" };
  }
  const catalog = configured.store.get("*");
  const targeted = configured.store.get(key);
  const pkg = findPackage(catalog, normalizedCode) ?? findPackage(targeted, normalizedCode);
  const syncedAt = findPackage(catalog, normalizedCode) ? catalog?.syncedAt : targeted?.syncedAt;
  const state = freshness(syncedAt == null ? undefined : { packages: [pkg!], syncedAt });
  if (pkg && syncedAt != null && state.fresh) {
    recordCatalogMetric("hits");
    recordCatalogMetric("snapshotAgeMs", state.age);
    return { pkg, syncedAt, stale: false, source: "cache" };
  }
  if (pkg && syncedAt != null && state.staleAllowed) {
    recordCatalogMetric("staleServed");
    void refresh(key, () => loadResellerCatalog({ packageCode: normalizedCode })).catch(
      () => undefined,
    );
    return { pkg, syncedAt, stale: true, source: "cache" };
  }
  recordCatalogMetric("misses");
  const entry = await refresh(key, () => loadResellerCatalog({ packageCode: normalizedCode }));
  const fresh = findPackage(entry, normalizedCode);
  if (!fresh) throw new Error("Paket eSIM tidak ditemukan atau sudah tidak tersedia");
  return { pkg: fresh, syncedAt: entry.syncedAt, stale: false, source: "provider" };
}

export function clearResellerCatalogCache() {
  configured.store.clear();
  inflight.clear();
}

export function resetResellerCatalogCacheConfiguration() {
  clearResellerCatalogCache();
  resetResellerCatalogMetrics();
  configureResellerCatalogCache();
}
