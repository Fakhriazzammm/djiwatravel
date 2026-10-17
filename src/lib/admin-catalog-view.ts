import { RESELLER_CONFIG } from "./reseller-config";
import { requiredUnits, SELLABILITY_BUFFER } from "./sellability";
import {
  priceRuleDefaults,
  resolvePricingRule,
  type PriceRule,
  type PricingDefaults,
} from "./price-rules";

/**
 * Pure catalogue-table model: rows, filters, sorting, pagination, and KPIs.
 *
 * Kept free of database and provider access so the workspace rules ("never claim completeness",
 * "filtered vs total", "margin from this row's own cost") can be unit-tested and so the server
 * function and the table agree on one implementation.
 */

export type CatalogRowSource = {
  packageCode: string;
  name: string;
  slug?: string;
  locationCodes: readonly string[];
  volumeBytes: number;
  durationDays: number;
  providerPriceUnits: number;
  sellingPrice: { sellingPriceIdr: number };
};

export type AdminCatalogRow = {
  packageCode: string;
  name: string;
  locationCodes: string[];
  volumeBytes: number;
  durationDays: number;
  providerPriceUnits: number;
  providerCostIdr: number;
  markupPercent: number;
  fixedMarkupIdr: number;
  pricingSource: "package" | "country" | "global" | "default";
  sellingPriceIdr: number;
  markupIdr: number;
  marginIdr: number;
  marginPercent: number;
  /** Balance we must hold to sell it (provider cost + headroom). */
  requiredUnitsNeeded: number;
  /** null while the provider balance is unknown: availability is neither claimed nor denied. */
  affordable: boolean | null;
};

export type AdminCatalogStatusFilter = "all" | "unaffordable" | "affordable";
export type AdminCatalogFilter = { q: string; status: AdminCatalogStatusFilter };
export type AdminCatalogSortKey =
  "name" | "providerCost" | "sellingPrice" | "marginPercent" | "durationDays" | "volumeBytes";
export type AdminCatalogSortDir = "asc" | "desc";

export type BuildRowsOptions = {
  rules: readonly PriceRule[];
  defaults?: PricingDefaults;
  balanceUnits: number | null;
  buffer?: number;
  /** FX rate used for display; never hardcoded here so admin and checkout agree. */
  usdToIdr?: number;
};

export function buildAdminCatalogRows(
  packages: readonly CatalogRowSource[],
  options: BuildRowsOptions,
): AdminCatalogRow[] {
  const defaults = options.defaults ?? priceRuleDefaults();
  const buffer = options.buffer ?? SELLABILITY_BUFFER;
  const usdToIdr = options.usdToIdr ?? RESELLER_CONFIG.usdToIdr;
  return packages.map((pkg) => {
    const pricing = resolvePricingRule(
      { packageCode: pkg.packageCode, locationCodes: pkg.locationCodes },
      options.rules,
      defaults,
    );
    const providerCostIdr = Math.round((pkg.providerPriceUnits / 10_000) * usdToIdr);
    const sellingPriceIdr = pkg.sellingPrice.sellingPriceIdr;
    const marginIdr = sellingPriceIdr - providerCostIdr;
    return {
      packageCode: pkg.packageCode,
      name: pkg.name,
      locationCodes: [...pkg.locationCodes],
      volumeBytes: pkg.volumeBytes,
      durationDays: pkg.durationDays,
      providerPriceUnits: pkg.providerPriceUnits,
      providerCostIdr,
      markupPercent: pricing.markupPercent,
      fixedMarkupIdr: pricing.fixedMarkupIdr,
      pricingSource: pricing.source,
      sellingPriceIdr,
      markupIdr: sellingPriceIdr - providerCostIdr,
      marginIdr,
      marginPercent: providerCostIdr > 0 ? (marginIdr / providerCostIdr) * 100 : 0,
      requiredUnitsNeeded: requiredUnits(pkg.providerPriceUnits, buffer),
      affordable:
        options.balanceUnits === null
          ? null
          : options.balanceUnits >= requiredUnits(pkg.providerPriceUnits, buffer),
    } satisfies AdminCatalogRow;
  });
}

function matchesQuery(row: AdminCatalogRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    row.packageCode.toLowerCase().includes(needle) ||
    row.name.toLowerCase().includes(needle) ||
    row.locationCodes.some((code) => code.toLowerCase().includes(needle))
  );
}

export function filterAdminCatalogRows(
  rows: readonly AdminCatalogRow[],
  filter: AdminCatalogFilter,
): AdminCatalogRow[] {
  return rows.filter((row) => {
    if (!matchesQuery(row, filter.q)) return false;
    if (filter.status === "unaffordable") return row.affordable === false;
    if (filter.status === "affordable") return row.affordable === true;
    return true;
  });
}

/** Sort keys are UI/URL names; they do not have to match the row field names. */
const SORT_FIELDS: Record<AdminCatalogSortKey, keyof AdminCatalogRow> = {
  name: "name",
  providerCost: "providerCostIdr",
  sellingPrice: "sellingPriceIdr",
  marginPercent: "marginPercent",
  durationDays: "durationDays",
  volumeBytes: "volumeBytes",
};

export function sortAdminCatalogRows(
  rows: readonly AdminCatalogRow[],
  key: AdminCatalogSortKey,
  dir: AdminCatalogSortDir,
): AdminCatalogRow[] {
  const factor = dir === "asc" ? 1 : -1;
  const field = SORT_FIELDS[key];
  return [...rows].sort((a, b) => {
    if (field === "name") return factor * a.name.localeCompare(b.name, "id");
    return factor * (Number(a[field]) - Number(b[field]));
  });
}

export type AdminCatalogSlice = {
  rows: AdminCatalogRow[];
  page: number;
  pageSize: number;
  pageCount: number;
  /** Rows matching the current filter, before pagination. */
  filteredCount: number;
  /** Every package in the catalogue, filter ignored. */
  totalCount: number;
};

export function paginateAdminCatalogRows(
  rows: readonly AdminCatalogRow[],
  page: number,
  pageSize: number,
  totalCount: number,
): AdminCatalogSlice {
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 50;
  const pageCount = Math.max(1, Math.ceil(rows.length / safePageSize));
  const safePage = Math.min(Math.max(1, Math.floor(Number.isFinite(page) ? page : 1)), pageCount);
  const start = (safePage - 1) * safePageSize;
  return {
    rows: rows.slice(start, start + safePageSize),
    page: safePage,
    pageSize: safePageSize,
    pageCount,
    filteredCount: rows.length,
    totalCount,
  };
}

export type AdminCatalogRuleSummary = {
  globalPercent: number | null;
  globalFixedIdr: number | null;
  countryCount: number;
  packageCount: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

export function summarizeActiveRules(
  rules: readonly PriceRule[],
  defaults: PricingDefaults = priceRuleDefaults(),
): AdminCatalogRuleSummary {
  const global = rules.filter((rule) => rule.scopeType === "global");
  const newest =
    [...rules].sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))[0] ?? null;
  return {
    globalPercent:
      global.find((rule) => rule.markupType === "percentage")?.markupValue ??
      defaults.markupPercent,
    globalFixedIdr:
      global.find((rule) => rule.markupType === "fixed")?.markupValue ?? defaults.fixedMarkupIdr,
    countryCount: rules.filter((rule) => rule.scopeType === "country").length,
    packageCount: rules.filter((rule) => rule.scopeType === "package").length,
    updatedAt: newest?.effectiveFrom ?? null,
    updatedBy: newest?.createdBy ?? null,
  };
}

export type AdminCatalogKpi = {
  totalPackages: number;
  filteredPackages: number;
  unaffordableCount: number;
  affordableCount: number;
  unknownBalanceCount: number;
  averageMarginPercent: number | null;
  cheapestSellingPriceIdr: number | null;
  priciestSellingPriceIdr: number | null;
};

export function summarizeAdminCatalog(
  allRows: readonly AdminCatalogRow[],
  filteredCount: number,
): AdminCatalogKpi {
  const margins = allRows.map((row) => row.marginPercent);
  const prices = allRows.map((row) => row.sellingPriceIdr);
  return {
    totalPackages: allRows.length,
    filteredPackages: filteredCount,
    unaffordableCount: allRows.filter((row) => row.affordable === false).length,
    affordableCount: allRows.filter((row) => row.affordable === true).length,
    unknownBalanceCount: allRows.filter((row) => row.affordable === null).length,
    averageMarginPercent:
      margins.length === 0
        ? null
        : margins.reduce((total, value) => total + value, 0) / margins.length,
    cheapestSellingPriceIdr: prices.length === 0 ? null : Math.min(...prices),
    priciestSellingPriceIdr: prices.length === 0 ? null : Math.max(...prices),
  };
}
