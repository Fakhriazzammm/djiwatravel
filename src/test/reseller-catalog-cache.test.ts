import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResellerCatalogPackage } from "@/lib/esim-access-catalog";

const { loadResellerCatalog } = vi.hoisted(() => ({ loadResellerCatalog: vi.fn() }));
vi.mock("@/lib/esim-access-catalog", () => ({ loadResellerCatalog }));

import {
  configureResellerCatalogCache,
  getResellerCatalog,
  getResellerCatalogMetrics,
  getResellerPackage,
  prewarmResellerCatalog,
  resetResellerCatalogCacheConfiguration,
} from "@/lib/reseller-catalog-cache";

const pkg = {
  provider: "esimaccess",
  packageCode: "TH-1",
  slug: "th-1",
  name: "Thailand 1",
  locationCodes: ["TH"],
  volumeBytes: 1_000_000,
  durationDays: 7,
  providerPriceUnits: 100,
  sellingPrice: {
    providerCostIdr: 10_000,
    markupIdr: 2_000,
    sellingPriceIdr: 12_000,
    configSnapshot: {},
  },
  supportsTopUp: false,
  providerSnapshot: { packageCode: "TH-1", price: 100 },
} as unknown as ResellerCatalogPackage;

beforeEach(() => {
  resetResellerCatalogCacheConfiguration();
  loadResellerCatalog.mockReset();
});

describe("reseller catalog cache", () => {
  it("uses a targeted provider query for a fresh checkout read", async () => {
    loadResellerCatalog.mockResolvedValue([pkg]);

    const result = await getResellerPackage(" TH-1 ", { fresh: true });

    expect(result.pkg).toBe(pkg);
    expect(loadResellerCatalog).toHaveBeenCalledWith({ packageCode: "TH-1" });
  });

  it("normalizes location keys and serves stale data while revalidating once", async () => {
    let now = 1_000;
    configureResellerCatalogCache({ now: () => now, ttlMs: 100, maxStaleMs: 500 });
    loadResellerCatalog.mockResolvedValue([pkg]);
    await getResellerCatalog(" th ");
    now = 1_150;

    const firstPromise = getResellerCatalog("TH");
    const secondPromise = getResellerCatalog(" th ");
    const first = await firstPromise;
    const second = await secondPromise;

    expect(first.stale).toBe(true);
    expect(second.stale).toBe(true);
    expect(loadResellerCatalog).toHaveBeenCalledTimes(2);
    expect(loadResellerCatalog).toHaveBeenNthCalledWith(1, { locationCode: "TH" });
    expect(loadResellerCatalog).toHaveBeenNthCalledWith(2, { locationCode: "TH" });
  });

  it("fails closed after the bounded stale window", async () => {
    let now = 1_000;
    configureResellerCatalogCache({ now: () => now, ttlMs: 100, maxStaleMs: 500 });
    loadResellerCatalog.mockResolvedValueOnce([pkg]).mockRejectedValueOnce(new Error("offline"));
    await getResellerCatalog();
    now = 1_600;

    await expect(getResellerCatalog()).rejects.toThrow("offline");
  });

  it("supports an injected store without requiring persistence or a migration", async () => {
    const entries = new Map<string, { packages: ResellerCatalogPackage[]; syncedAt: number }>();
    configureResellerCatalogCache({
      store: {
        get: (key) => entries.get(key),
        set: (key, value) => entries.set(key, value),
        clear: () => entries.clear(),
      },
      now: () => 1_000,
    });
    loadResellerCatalog.mockResolvedValue([pkg]);
    await getResellerCatalog();
    configureResellerCatalogCache({
      store: {
        get: (key) => entries.get(key),
        set: (key, value) => entries.set(key, value),
        clear: () => entries.clear(),
      },
      now: () => 1_001,
    });

    expect((await getResellerCatalog()).source).toBe("cache");
    expect(loadResellerCatalog).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent package lookups", async () => {
    let resolve!: (packages: ResellerCatalogPackage[]) => void;
    loadResellerCatalog.mockReturnValue(
      new Promise<ResellerCatalogPackage[]>((r) => {
        resolve = r;
      }),
    );
    const first = getResellerPackage("TH-1", { fresh: true });
    const second = getResellerPackage("TH-1", { fresh: true });
    resolve([pkg]);

    const results = await Promise.all([first, second]);
    expect(results[0].pkg).toBe(pkg);
    expect(results[1].pkg).toBe(pkg);
    expect(loadResellerCatalog).toHaveBeenCalledTimes(1);
  });

  it("prewarms without changing the read contract", async () => {
    loadResellerCatalog.mockResolvedValue([pkg]);
    await prewarmResellerCatalog(" th ");

    expect(loadResellerCatalog).toHaveBeenCalledWith({ locationCode: "TH" });
    expect((await getResellerCatalog("TH")).source).toBe("cache");
  });

  it("records cache, stale, provider latency, and snapshot age diagnostics", async () => {
    let now = 1_000;
    configureResellerCatalogCache({ now: () => now, ttlMs: 100, maxStaleMs: 500 });
    loadResellerCatalog.mockResolvedValue([pkg]);
    await getResellerCatalog();
    await getResellerCatalog();
    now = 1_150;
    await getResellerCatalog();

    const metrics = getResellerCatalogMetrics();
    expect(metrics.misses).toBe(1);
    expect(metrics.hits).toBe(1);
    expect(metrics.staleServed).toBe(1);
    await vi.waitFor(() => expect(getResellerCatalogMetrics().providerRequests).toBe(2));
    expect(metrics.providerLatencyMs).toBeGreaterThanOrEqual(0);
    expect(metrics.snapshotAgeMs).toBe(150);
  });

  it("times out provider reads and does not return a stale snapshot past the window", async () => {
    let now = 1_000;
    configureResellerCatalogCache({ now: () => now, providerTimeoutMs: 10 });
    loadResellerCatalog.mockReturnValue(new Promise(() => undefined));
    const pending = getResellerCatalog().catch((error) => error as Error);
    await vi.waitFor(() => expect(getResellerCatalogMetrics().providerTimeouts).toBe(1), {
      timeout: 100,
    });
    await expect(pending).resolves.toMatchObject({ message: "Katalog provider timeout" });
  });
});
