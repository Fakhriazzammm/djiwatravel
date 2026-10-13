import { describe, expect, it } from "vitest";

import { toViewPackage, toViewPackages } from "@/lib/package-view";
import type { ResellerCatalogPackage } from "@/lib/esim-access-catalog";

const full = {
  provider: "esimaccess",
  packageCode: "JC063",
  slug: "JP_1_7",
  name: "Japan 1GB 7Days",
  locationCodes: ["JP"],
  volumeBytes: 1073741824,
  durationDays: 7,
  providerPriceUnits: 7000,
  sellingPrice: {
    providerCostIdr: 11900,
    markupIdr: 2975,
    sellingPriceIdr: 15000,
    currency: "IDR",
    configSnapshot: { markupPercent: 25, fixedMarkupIdr: 0, usdToIdr: 17000, roundingIdr: 1000 },
  },
  supportsTopUp: true,
  providerSnapshot: { packageCode: "JC063", price: 7000 },
} as unknown as ResellerCatalogPackage;

// The cost basis must never reach the browser: it leaked margins into the page source and
// bloated the SSR payload.
describe("toViewPackage", () => {
  it("keeps only the fields a card needs", () => {
    expect(toViewPackage(full)).toEqual({
      packageCode: "JC063",
      name: "Japan 1GB 7Days",
      locationCodes: ["JP"],
      volumeBytes: 1073741824,
      unlimited: false,
      durationDays: 7,
      priceIdr: 15000,
      // Sellability is a server decision; only the resulting boolean crosses over.
      sellable: true,
    });
  });

  it("drops the cost basis, markup snapshot and provider payload", () => {
    const serialised = JSON.stringify(toViewPackage(full));
    for (const secret of [
      "providerCostIdr",
      "markupIdr",
      "providerCost",
      "configSnapshot",
      "usdToIdr",
      "markupPercent",
      "providerSnapshot",
      "providerPriceUnits",
    ]) {
      expect(serialised).not.toContain(secret);
    }
  });

  it("flags unlimited packages", () => {
    const unlimited = { ...full, unlimited: true } as ResellerCatalogPackage;
    expect(toViewPackage(unlimited).unlimited).toBe(true);
  });

  it("maps a whole list", () => {
    expect(toViewPackages([full, full])).toHaveLength(2);
  });
});
