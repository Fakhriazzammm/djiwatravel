import { describe, expect, it } from "vitest";

import {
  planBulkScopes,
  previewPriceRule,
  resolvePricingRule,
  validatePriceRuleInput,
  type PriceRule,
} from "@/lib/price-rules";

function rule(overrides: Partial<PriceRule>): PriceRule {
  return {
    id: "rule",
    scopeType: "global",
    scopeKey: null,
    markupType: "percentage",
    markupValue: 25,
    currencyCode: "IDR",
    active: true,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: null,
    version: 1,
    createdBy: "owner@example.com",
    reason: "seed",
    batchId: null,
    ...overrides,
  };
}

const NOW = Date.parse("2026-10-15T12:00:00.000Z");

describe("resolvePricingRule", () => {
  it("falls back to the reseller defaults when no rule exists", () => {
    const resolved = resolvePricingRule(
      { packageCode: "JC181", locationCodes: ["JP"] },
      [],
      undefined,
      NOW,
    );
    expect(resolved.source).toBe("default");
    expect(resolved.markupPercent).toBe(25);
    expect(resolved.fixedMarkupIdr).toBe(0);
    expect(resolved.ruleIds).toEqual([]);
  });

  it("prefers the package rule over country and global for the same field", () => {
    const resolved = resolvePricingRule(
      { packageCode: "JC181", locationCodes: ["JP"] },
      [
        rule({ id: "global", scopeType: "global", markupType: "percentage", markupValue: 25 }),
        rule({
          id: "country",
          scopeType: "country",
          scopeKey: "JP",
          markupType: "percentage",
          markupValue: 30,
        }),
        rule({
          id: "package",
          scopeType: "package",
          scopeKey: "JC181",
          markupType: "percentage",
          markupValue: 40,
        }),
      ],
      undefined,
      NOW,
    );
    expect(resolved.markupPercent).toBe(40);
    expect(resolved.source).toBe("package");
    expect(resolved.ruleIds).toEqual(["package"]);
  });

  it("combines a percentage rule with a nominal rule from a different scope", () => {
    const resolved = resolvePricingRule(
      { packageCode: "JC181", locationCodes: ["JP"] },
      [
        rule({
          id: "global-percent",
          scopeType: "global",
          markupType: "percentage",
          markupValue: 20,
        }),
        rule({
          id: "country-fixed",
          scopeType: "country",
          scopeKey: "JP",
          markupType: "fixed",
          markupValue: 20_000,
        }),
      ],
      undefined,
      NOW,
    );
    expect(resolved.markupPercent).toBe(20);
    expect(resolved.fixedMarkupIdr).toBe(20_000);
    expect(resolved.source).toBe("country");
    expect(resolved.ruleIds).toEqual(["global-percent", "country-fixed"]);
  });

  it("ignores inactive, future dated, and expired rules", () => {
    const resolved = resolvePricingRule(
      { packageCode: "JC181", locationCodes: ["JP"] },
      [
        rule({ id: "inactive", active: false, markupValue: 99 }),
        rule({ id: "future", effectiveFrom: "2026-12-01T00:00:00.000Z", markupValue: 88 }),
        rule({ id: "expired", effectiveUntil: "2026-10-01T00:00:00.000Z", markupValue: 77 }),
      ],
      undefined,
      NOW,
    );
    expect(resolved.markupPercent).toBe(25);
    expect(resolved.source).toBe("default");
  });

  it("matches a country rule against any of the package location codes", () => {
    const resolved = resolvePricingRule(
      { packageCode: "ASIA-20", locationCodes: ["HK", "MO", "JP"] },
      [rule({ id: "jp", scopeType: "country", scopeKey: "JP", markupValue: 33 })],
      undefined,
      NOW,
    );
    expect(resolved.markupPercent).toBe(33);
    expect(resolved.source).toBe("country");
  });
});

describe("validatePriceRuleInput", () => {
  it("requires at least one field", () => {
    expect(validatePriceRuleInput({ markupPercent: null, fixedMarkupIdr: null })).toHaveLength(1);
  });

  it("rejects out-of-range and negative values", () => {
    expect(
      validatePriceRuleInput({ markupPercent: 800, fixedMarkupIdr: null }).length,
    ).toBeGreaterThan(0);
    expect(
      validatePriceRuleInput({ markupPercent: null, fixedMarkupIdr: -1 }).length,
    ).toBeGreaterThan(0);
  });

  it("accepts a valid percentage plus nominal pair", () => {
    expect(validatePriceRuleInput({ markupPercent: 30, fixedMarkupIdr: 5_000 })).toEqual([]);
  });
});

describe("previewPriceRule", () => {
  const row = {
    packageCode: "JC181",
    name: "Asia-20 20GB",
    providerPriceUnits: 420_000,
    sellingPriceIdr: 893_000,
  };

  it("computes the new price and margin from that row's own provider cost", () => {
    const { rows, summary } = previewPriceRule({
      rows: [row],
      markupPercent: 30,
      fixedMarkupIdr: null,
      balanceUnits: 193_000,
    });
    expect(rows[0]?.providerCostIdr).toBe(714_000);
    expect(rows[0]?.beforePriceIdr).toBe(893_000);
    expect(rows[0]?.afterPriceIdr).toBe(929_000);
    expect(rows[0]?.beforeMarginIdr).toBe(179_000);
    expect(rows[0]?.afterMarginIdr).toBe(215_000);
    expect(summary.increased).toBe(1);
    expect(summary.unchanged).toBe(0);
    expect(summary.averageAfterMarginPercent).toBeCloseTo(30.11, 1);
  });

  it("flags a loss-making price and a package that would exceed the balance", () => {
    const { rows, summary } = previewPriceRule({
      rows: [row],
      markupPercent: 0,
      fixedMarkupIdr: 0,
      balanceUnits: 193_000,
    });
    expect(rows[0]?.lossMaking).toBe(true);
    expect(rows[0]?.affordableAfter).toBe(false);
    expect(summary.lossMaking).toBe(1);
    expect(summary.becomesUnaffordable).toBe(1);
  });

  it("leaves affordability unknown when the balance is unknown", () => {
    const { rows, summary } = previewPriceRule({
      rows: [row],
      markupPercent: 30,
      fixedMarkupIdr: null,
      balanceUnits: null,
    });
    expect(rows[0]?.affordableAfter).toBeNull();
    expect(summary.becomesUnaffordable).toBe(0);
  });
});

describe("planBulkScopes", () => {
  const catalogue = [
    { packageCode: "A", locationCodes: ["JP"] },
    { packageCode: "B", locationCodes: ["JP"] },
    { packageCode: "C", locationCodes: ["KR"] },
  ];

  it("uses one country rule when every package of that country is selected", () => {
    const plan = planBulkScopes(catalogue, catalogue, "auto");
    expect(plan.countryScopes.sort()).toEqual(["JP", "KR"]);
    expect(plan.packageScopes).toEqual([]);
  });

  it("falls back to package rules for a partial country selection", () => {
    const plan = planBulkScopes([catalogue[0]!], catalogue, "auto");
    expect(plan.countryScopes).toEqual([]);
    expect(plan.packageScopes).toEqual(["A"]);
  });

  it("honours an explicit package scope request", () => {
    const plan = planBulkScopes(catalogue, catalogue, "package");
    expect(plan.countryScopes).toEqual([]);
    expect(plan.packageScopes.sort()).toEqual(["A", "B", "C"]);
  });
});
