import { describe, expect, it } from "vitest";

import {
  buildAdminCatalogRows,
  filterAdminCatalogRows,
  paginateAdminCatalogRows,
  sortAdminCatalogRows,
  summarizeAdminCatalog,
  summarizeActiveRules,
  type CatalogRowSource,
} from "@/lib/admin-catalog-view";
import type { PriceRule } from "@/lib/price-rules";

function pkg(
  code: string,
  providerPriceUnits: number,
  priceIdr: number,
  locationCodes: string[],
): CatalogRowSource {
  return {
    packageCode: code,
    name: `Paket ${code}`,
    locationCodes,
    volumeBytes: 1024 ** 3,
    durationDays: 7,
    providerPriceUnits,
    sellingPrice: { sellingPriceIdr: priceIdr },
  };
}

const catalogue = [
  pkg("JC181", 420_000, 893_000, ["JP"]),
  pkg("JC183", 3_600, 77_000, ["JP"]),
  pkg("KR001", 9_000, 190_000, ["KR"]),
];

const BALANCE_UNITS = 193_000;

describe("buildAdminCatalogRows", () => {
  it("keeps every package and derives margin and affordability from its own cost", () => {
    const rows = buildAdminCatalogRows(catalogue, { rules: [], balanceUnits: BALANCE_UNITS });
    expect(rows).toHaveLength(3);
    const expensive = rows[0]!;
    expect(expensive.providerCostIdr).toBe(714_000);
    expect(expensive.marginIdr).toBe(179_000);
    expect(expensive.marginPercent).toBeCloseTo(25.07, 1);
    expect(expensive.affordable).toBe(false);
    expect(expensive.pricingSource).toBe("default");
    expect(rows[1]!.affordable).toBe(true);
  });

  it("marks affordability unknown instead of claiming availability when the balance is unreadable", () => {
    const rows = buildAdminCatalogRows(catalogue, { rules: [], balanceUnits: null });
    expect(rows.every((row) => row.affordable === null)).toBe(true);
  });

  it("applies the most specific rule per package", () => {
    const rules: PriceRule[] = [
      {
        id: "jp",
        scopeType: "country",
        scopeKey: "JP",
        markupType: "percentage",
        markupValue: 30,
        currencyCode: "IDR",
        active: true,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveUntil: null,
        version: 1,
        createdBy: "owner@example.com",
        reason: "seed",
      },
    ];
    const rows = buildAdminCatalogRows(catalogue, { rules, balanceUnits: BALANCE_UNITS });
    expect(rows[0]!.markupPercent).toBe(30);
    expect(rows[0]!.pricingSource).toBe("country");
    expect(rows[2]!.markupPercent).toBe(25);
    expect(rows[2]!.pricingSource).toBe("default");
  });
});

describe("filtering and sorting", () => {
  const rows = buildAdminCatalogRows(catalogue, { rules: [], balanceUnits: BALANCE_UNITS });

  it("searches code, name, and location", () => {
    expect(filterAdminCatalogRows(rows, { q: "jc18", status: "all" })).toHaveLength(2);
    expect(filterAdminCatalogRows(rows, { q: "kr", status: "all" })).toHaveLength(1);
  });

  it("filters by the balance verdict without hiding unknown rows from 'all'", () => {
    expect(filterAdminCatalogRows(rows, { q: "", status: "unaffordable" })).toHaveLength(1);
    expect(filterAdminCatalogRows(rows, { q: "", status: "affordable" })).toHaveLength(2);
    expect(filterAdminCatalogRows(rows, { q: "", status: "all" })).toHaveLength(3);
  });

  it("sorts numerically and by name in both directions", () => {
    const desc = sortAdminCatalogRows(rows, "sellingPrice", "desc").map((row) => row.packageCode);
    expect(desc).toEqual(["JC181", "KR001", "JC183"]);
    const asc = sortAdminCatalogRows(rows, "name", "asc").map((row) => row.packageCode);
    expect(asc).toEqual(["JC181", "JC183", "KR001"]);
  });
});

describe("pagination", () => {
  const rows = buildAdminCatalogRows(catalogue, { rules: [], balanceUnits: BALANCE_UNITS });

  it("never claims completeness: filtered count and total count are both reported", () => {
    const slice = paginateAdminCatalogRows(rows, 1, 2, rows.length);
    expect(slice.rows).toHaveLength(2);
    expect(slice.pageCount).toBe(2);
    expect(slice.filteredCount).toBe(3);
    expect(slice.totalCount).toBe(3);
  });

  it("clamps an out-of-range page to the last page", () => {
    const slice = paginateAdminCatalogRows(rows, 99, 2, rows.length);
    expect(slice.page).toBe(2);
    expect(slice.rows).toHaveLength(1);
  });

  it("reports the filter result count, not the page size", () => {
    const filtered = filterAdminCatalogRows(rows, { q: "jc", status: "all" });
    const slice = paginateAdminCatalogRows(filtered, 1, 50, rows.length);
    expect(slice.filteredCount).toBe(2);
    expect(slice.totalCount).toBe(3);
  });
});

describe("summaries", () => {
  it("counts affordability across the whole catalogue, not just the page", () => {
    const rows = buildAdminCatalogRows(catalogue, { rules: [], balanceUnits: BALANCE_UNITS });
    const kpi = summarizeAdminCatalog(rows, 1);
    expect(kpi.totalPackages).toBe(3);
    expect(kpi.unaffordableCount).toBe(1);
    expect(kpi.affordableCount).toBe(2);
    expect(kpi.unknownBalanceCount).toBe(0);
    expect(kpi.averageMarginPercent).toBeGreaterThan(0);
  });

  it("falls back to the reseller defaults in the rule summary", () => {
    const summary = summarizeActiveRules([]);
    expect(summary.globalPercent).toBe(25);
    expect(summary.globalFixedIdr).toBe(0);
    expect(summary.countryCount).toBe(0);
    expect(summary.packageCount).toBe(0);
  });
});
