import { describe, expect, it } from "vitest";

import { loadExploreAvailability } from "@/routes/explore";
import type { ResellerCatalogPackage } from "@/lib/esim-access-catalog";

const packageFixture: ResellerCatalogPackage = {
  provider: "esimaccess",
  packageCode: "jp-test",
  slug: "jp-test",
  name: "Japan test",
  locationCodes: ["JP"],
  volumeBytes: 1_000_000,
  durationDays: 7,
  providerPriceUnits: 1,
  sellingPrice: {
    providerPriceIdr: 1,
    marginIdr: 1,
    sellingPriceIdr: 2,
  },
  supportsTopUp: false,
  providerSnapshot: { packageCode: "jp-test" },
};

const catalog = {
  packages: [packageFixture],
  syncedAt: Date.now(),
  stale: false,
  source: "provider" as const,
};

describe("Explore loader reliability", () => {
  it("keeps catalog destinations visible when balance lookup times out", async () => {
    const state = await loadExploreAvailability({
      getCatalog: async () => catalog,
      getSellability: () => new Promise<never>(() => {}),
      balanceDeadlineMs: 5,
    });

    expect(state.source).toBe("live");
    expect(state.destinations.some((destination) => destination.code === "JP")).toBe(true);
  });

  it("returns the explicit error state when catalog loading fails", async () => {
    const state = await loadExploreAvailability({
      getCatalog: async () => {
        throw new Error("provider unavailable");
      },
      catalogDeadlineMs: 5,
    });

    expect(state).toEqual({
      source: "error",
      destinations: [],
      errorMessage: "Katalog belum dapat dimuat.",
    });
  });
});
