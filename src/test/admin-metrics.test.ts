import { describe, expect, it } from "vitest";
import { summarizeMargin } from "../lib/admin-metrics";

describe("admin margin and FX metrics", () => {
  it("aggregates by country/package and exposes FX impact", () => {
    const [row] = summarizeMargin([{ country: "Spain", packageCode: "ES-3GB", sellingPriceIdr: 34000, providerCostIdr: 27000, fxRateIdr: 17500, fxBaselineIdr: 17000 }, { country: "Spain", packageCode: "ES-3GB", sellingPriceIdr: 34000, providerCostIdr: 27000, fxRateIdr: 17500, fxBaselineIdr: 17000 }]);
    expect(row).toMatchObject({ country: "Spain", packageCode: "ES-3GB", salesIdr: 68000, providerCostIdr: 54000, marginIdr: 14000 });
    expect(row!.fxImpactIdr).toBeGreaterThan(0);
  });
});
