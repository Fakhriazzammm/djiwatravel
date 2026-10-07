import { describe, expect, it } from "vitest";
import {
  filterPackagesByDestination,
  getCatalogPreviewProfit,
  getCatalogPreviewSellingPrice,
} from "../lib/reseller-catalog-view";

describe("filterPackagesByDestination", () => {
  it("matches destination codes exactly, case-insensitively, and preserves order", () => {
    const japan = { packageCode: "jp-a", locationCodes: ["JP"] };
    const asia = { packageCode: "asia", locationCodes: ["ASIA"] };
    const japanRegional = { packageCode: "jp-b", locationCodes: ["JP", "KR"] };
    expect(filterPackagesByDestination([japan, asia, japanRegional], "jp")).toEqual([
      japan,
      japanRegional,
    ]);
  });

  it("returns no packages for an empty destination code", () => {
    expect(filterPackagesByDestination([{ locationCodes: ["JP"] }], "  ")).toEqual([]);
  });
});

describe("catalog pricing preview", () => {
  const pkg = {
    packageCode: "TH-1",
    sellingPrice: { providerCostIdr: 10000, sellingPriceIdr: 15000 },
  };

  it("uses the current selling price unless a browser preview override exists", () => {
    expect(getCatalogPreviewSellingPrice(pkg, {})).toBe(15000);
    expect(getCatalogPreviewSellingPrice(pkg, { "TH-1": 19000 })).toBe(19000);
  });

  it("calculates preview profit from the provider cost and effective selling price", () => {
    expect(getCatalogPreviewProfit(pkg, { "TH-1": 19000 })).toBe(9000);
  });
});
