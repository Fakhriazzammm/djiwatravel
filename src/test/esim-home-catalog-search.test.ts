import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResellerCatalogPackage } from "@/lib/esim-access-catalog";
import { searchHomeEsimCatalogHandler } from "@/lib/esim-home-catalog.server";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";
import { getSellabilityState } from "@/lib/sellability.server";

vi.mock("@/lib/reseller-catalog-cache", () => ({ getResellerCatalog: vi.fn() }));
vi.mock("@/lib/sellability.server", () => ({ getSellabilityState: vi.fn() }));

const japan = {
  provider: "esimaccess",
  packageCode: "JP-5GB-7D",
  slug: "jp-5gb",
  name: "Japan 5GB 7Days",
  locationCodes: ["JP"],
  volumeBytes: 5_000_000_000,
  durationDays: 7,
  providerPriceUnits: 7000,
  sellingPrice: {
    providerCostIdr: 11900,
    markupIdr: 2975,
    sellingPriceIdr: 15000,
    currency: "IDR",
    configSnapshot: {},
  },
  supportsTopUp: false,
  providerSnapshot: { packageCode: "JP-5GB-7D", price: 7000 },
} as ResellerCatalogPackage;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getResellerCatalog).mockResolvedValue({
    packages: [japan],
    syncedAt: 1,
    source: "cache",
    stale: false,
  });
  vi.mocked(getSellabilityState).mockResolvedValue({
    mode: "on",
    snapshot: { balanceUnits: 100_000, capturedAtMs: 1, source: "cache" },
    hidden: new Set(),
    hiddenCount: 0,
    sellableCount: 1,
  });
});

describe("home eSIM catalog search", () => {
  it("finds an English-named package by Indonesian destination and data amount without leaking provider costs", async () => {
    const result = await searchHomeEsimCatalogHandler("jepang 5 gb");

    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]).toMatchObject({ packageCode: "JP-5GB-7D", priceIdr: 15000 });
    expect(JSON.stringify(result)).not.toMatch(
      /providerPriceUnits|providerSnapshot|providerCostIdr|markupIdr/,
    );
  });

  it("does not offer packages hidden by the sellability check", async () => {
    vi.mocked(getSellabilityState).mockResolvedValueOnce({
      mode: "on",
      snapshot: { balanceUnits: 1, capturedAtMs: 1, source: "cache" },
      hidden: new Set([japan.packageCode]),
      hiddenCount: 1,
      sellableCount: 0,
    });
    expect((await searchHomeEsimCatalogHandler("Jepang")).packages).toEqual([]);
  });

  it("does not offer packages when sellability is required but unknown", async () => {
    vi.mocked(getSellabilityState).mockResolvedValueOnce({
      mode: "on",
      snapshot: { balanceUnits: null, capturedAtMs: null, source: "unknown" },
      hidden: new Set(),
      hiddenCount: 0,
      sellableCount: 1,
    });
    await expect(searchHomeEsimCatalogHandler("Jepang")).rejects.toThrow(
      "Ketersediaan paket belum dapat dipastikan",
    );
  });
});
