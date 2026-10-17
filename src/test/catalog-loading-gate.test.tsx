import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { exploreAvailability, exploreErrorState } from "@/lib/explore-availability";
import { destinations } from "@/lib/catalog";
import { toViewPackage } from "@/lib/package-view";

const routeSource = (name: string) =>
  readFileSync(join(process.cwd(), "src/routes", name), "utf8");

describe("customer catalog loading gate", () => {
  it("defines the canonical pending surface without mounting package content", () => {
    const loading = routeSource("../components/route-loading.tsx");
    expect(loading).toContain('data-testid="route-pending"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Menyiapkan paket internet…");
    expect(loading).toContain("Memastikan katalog dan ketersediaan paket terbaru.");
    expect(loading).not.toContain("Lihat detail");
  });

  it("keeps the loaded state package-backed rather than inventing destinations", () => {
    const loaded = exploreAvailability(destinations.slice(0, 1), "live");
    expect(loaded.source).toBe("live");
    expect(loaded.destinations).toHaveLength(1);
  });

  it("preserves non-sellable packages as Habis instead of making them purchasable", () => {
    const view = toViewPackage(
      {
        packageCode: "test-package",
        name: "Test package",
        locationCodes: ["JP"],
        volumeBytes: 1_000_000_000,
        durationDays: 7,
        sellingPrice: {
          providerCostIdr: 1,
          markupIdr: 1,
          sellingPriceIdr: 2,
          currency: "IDR",
          configSnapshot: { markupPercent: 25, usdToIdr: 17_000, roundingIdr: 1_000 },
        },
      },
      false,
    );
    expect(view.sellable).toBe(false);
    expect(routeSource("destination.$code.tsx")).toContain("Habis");
    expect(routeSource("checkout.$id.tsx")).toContain('"Habis"');
  });

  it("renders an actionable error/retry contract without fabricated catalog data", () => {
    const failed = exploreErrorState();
    expect(failed).toMatchObject({ source: "error", destinations: [] });
    const explore = routeSource("explore.tsx");
    expect(explore).toContain("Coba lagi");
    expect(explore).toContain("router.invalidate()");
  });

  it.each(["explore.tsx", "destination.$code.tsx", "checkout.$id.tsx"])(
    "uses the canonical pending gate for %s",
    (name) => {
      const source = routeSource(name);
      expect(source).toContain("pendingMs: 0");
      expect(source).toContain("pendingMinMs: 320");
      expect(source).toContain("pendingComponent: CatalogRoutePending");
    },
  );
});
