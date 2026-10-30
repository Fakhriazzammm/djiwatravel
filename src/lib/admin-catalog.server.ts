import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin-guard";
import {
  buildAdminCatalogRows,
  filterAdminCatalogRows,
  paginateAdminCatalogRows,
  sortAdminCatalogRows,
  summarizeActiveRules,
  summarizeAdminCatalog,
  type AdminCatalogKpi,
  type AdminCatalogRuleSummary,
  type AdminCatalogSlice,
  type AdminCatalogSortDir,
  type AdminCatalogSortKey,
} from "@/lib/admin-catalog-view";
import { MAX_BATCH_PACKAGES } from "@/lib/price-rules";
import { getActivePriceRules } from "@/lib/price-rules.server";
import { RESELLER_CONFIG } from "@/lib/reseller-config";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";
import { affordableCeilingUsd } from "@/lib/sellability";
import { getBalanceSnapshot } from "@/lib/sellability.server";

/**
 * Read model behind /admin/catalog.
 *
 * One server function returns the whole first screen: the page of rows, the KPIs over every
 * package, the balance, and the rule summary. Packages come from the same canonical provider
 * loader the customer storefront uses — there is no second admin-only catalogue — while the price
 * rules and the balance stay on the server and are resolved per row here.
 */

export type AdminCatalogBalanceView = {
  state: "ok" | "unavailable";
  usd: number | null;
  idrReference: number | null;
  fxRateIdr: number;
  source: "live" | "cache" | "last-known" | "unknown";
  capturedAt: string | null;
  sellableCeilingUsd: number | null;
  sellabilityMode: "off" | "shadow" | "on";
};

export type AdminCatalogRuleView = {
  id: string;
  scopeType: "global" | "country" | "package";
  scopeKey: string | null;
  markupType: "percentage" | "fixed";
  markupValue: number;
  version: number;
  createdBy: string | null;
  reason: string | null;
  effectiveFrom: string;
  batchId: string | null;
};

export type AdminCatalogPayload = {
  slice: AdminCatalogSlice;
  kpi: AdminCatalogKpi;
  ruleSummary: AdminCatalogRuleSummary;
  rules: AdminCatalogRuleView[];
  balance: AdminCatalogBalanceView;
  meta: {
    source: "provider" | "cache";
    syncedAt: string | null;
    stale: boolean;
    generatedAt: string;
    freshnessAgeSeconds: number | null;
  };
  defaults: {
    markupPercent: number;
    fixedMarkupIdr: number;
    usdToIdr: number;
    roundingIdr: number;
  };
  maxBatch: number;
};

const filterSchema = z.object({
  q: z.string().max(80).default(""),
  status: z.enum(["all", "unaffordable", "affordable"]).default("all"),
});

const readSchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.union([z.literal(50), z.literal(100), z.literal(200)]).default(50),
  filter: filterSchema.default({ q: "", status: "all" }),
  sortKey: z
    .enum(["name", "providerCost", "sellingPrice", "marginPercent", "durationDays", "volumeBytes"])
    .default("providerCost"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export type AdminCatalogReadInput = {
  page?: number;
  pageSize?: 50 | 100 | 200;
  filter?: { q?: string; status?: "all" | "unaffordable" | "affordable" };
  sortKey?: AdminCatalogSortKey;
  sortDir?: AdminCatalogSortDir;
};

export const readAdminCatalogPageInput = (data: unknown) => readSchema.parse(data ?? {});
export const readAdminCatalogPageHandler = async ({
  data,
}: {
  data: ReturnType<typeof readAdminCatalogPageInput>;
}): Promise<AdminCatalogPayload> => {
  await requireAdmin();
  const [catalog, rules, snapshot] = await Promise.all([
    getResellerCatalog(),
    getActivePriceRules(),
    getBalanceSnapshot(),
  ]);

  const rows = buildAdminCatalogRows(catalog.packages, {
    rules,
    balanceUnits: snapshot.balanceUnits,
    usdToIdr: RESELLER_CONFIG.usdToIdr,
  });
  const filtered = filterAdminCatalogRows(rows, data.filter);
  const sorted = sortAdminCatalogRows(filtered, data.sortKey, data.sortDir);
  const slice = paginateAdminCatalogRows(sorted, data.page, data.pageSize, rows.length);

  const usd = snapshot.balanceUnits === null ? null : snapshot.balanceUnits / 10_000;
  const generatedAt = Date.now();

  return {
    slice,
    kpi: summarizeAdminCatalog(rows, filtered.length),
    ruleSummary: summarizeActiveRules(rules),
    rules: rules.map((rule) => ({
      id: rule.id,
      scopeType: rule.scopeType,
      scopeKey: rule.scopeKey,
      markupType: rule.markupType,
      markupValue: rule.markupValue,
      version: rule.version,
      createdBy: rule.createdBy,
      reason: rule.reason,
      effectiveFrom: rule.effectiveFrom,
      batchId: rule.batchId ?? null,
    })),
    balance: {
      state: snapshot.balanceUnits === null ? "unavailable" : "ok",
      usd,
      idrReference: usd === null ? null : Math.round(usd * RESELLER_CONFIG.usdToIdr),
      fxRateIdr: RESELLER_CONFIG.usdToIdr,
      source: snapshot.source,
      capturedAt:
        snapshot.capturedAtMs === null ? null : new Date(snapshot.capturedAtMs).toISOString(),
      sellableCeilingUsd: affordableCeilingUsd(snapshot),
      sellabilityMode:
        process.env["TRAVEL_SELLABILITY_MODE"] === "on"
          ? "on"
          : process.env["TRAVEL_SELLABILITY_MODE"] === "shadow"
            ? "shadow"
            : "off",
    },
    meta: {
      source: catalog.source,
      syncedAt: catalog.syncedAt === null ? null : new Date(catalog.syncedAt).toISOString(),
      stale: catalog.stale,
      generatedAt: new Date(generatedAt).toISOString(),
      freshnessAgeSeconds:
        catalog.syncedAt === null
          ? null
          : Math.max(0, Math.round((generatedAt - catalog.syncedAt) / 1000)),
    },
    defaults: {
      markupPercent: RESELLER_CONFIG.markupPercent,
      fixedMarkupIdr: RESELLER_CONFIG.fixedMarkupIdr,
      usdToIdr: RESELLER_CONFIG.usdToIdr,
      roundingIdr: RESELLER_CONFIG.roundingIdr,
    },
    maxBatch: MAX_BATCH_PACKAGES,
  };
};

export const readAdminCatalogPage = createServerFn({ method: "POST" })
  .validator((data: unknown) => readSchema.parse(data ?? {}))
  .handler(readAdminCatalogPageHandler);
