import { describe, expect, it } from "vitest";
import { normalizeEsimAccessPackage } from "../lib/esim-access-catalog";

// The provider refused an order whose `price` no longer matched its catalogue, so the price we
// derive must always be a pure function of the price the provider reports right now.
describe("reseller price follows the provider price", () => {
  const providerPackage = (price: number) => ({
    packageCode: "JC063",
    name: "Japan 1GB 7Days",
    price,
    volume: 1073741824,
    duration: 7,
    location: "JP",
  });

  it("keeps the provider price and derives the customer price from it", () => {
    const pkg = normalizeEsimAccessPackage(providerPackage(7000));
    expect(pkg.providerPriceUnits).toBe(7000);
    // 7000 units are 1/10,000 USD each: 0.7 USD at the configured rate.
    expect(pkg.sellingPrice.providerCostIdr).toBe(Math.round((7000 / 10_000) * 17_000));
    expect(pkg.sellingPrice.sellingPriceIdr).toBe(15_000);
  });

  it("moves with the provider when the provider changes its price", () => {
    const cheaper = normalizeEsimAccessPackage(providerPackage(5000));
    const pricier = normalizeEsimAccessPackage(providerPackage(9000));
    expect(pricier.providerPriceUnits).toBe(9000);
    expect(pricier.sellingPrice.providerCostIdr).toBeGreaterThan(cheaper.sellingPrice.providerCostIdr);
    expect(pricier.sellingPrice.sellingPriceIdr).toBeGreaterThan(cheaper.sellingPrice.sellingPriceIdr);
  });

  it("never invents a price from a missing provider price", () => {
    const pkg = normalizeEsimAccessPackage({ packageCode: "JC063", name: "Japan", volume: 1, duration: 7, location: "JP" });
    expect(pkg.providerPriceUnits).toBe(0);
    expect(pkg.sellingPrice.providerCostIdr).toBe(0);
  });
});
