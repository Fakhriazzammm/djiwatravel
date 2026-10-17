import { createServerFn } from "@tanstack/react-start";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminEmail } from "@/lib/admin-guard.server";
import {
  buildAdminCatalogRows,
  filterAdminCatalogRows,
  type AdminCatalogRow,
} from "@/lib/admin-catalog-view";
import {
  MAX_BATCH_PACKAGES,
  planBulkScopes,
  priceRuleDefaults,
  previewPriceRule,
  validatePriceRuleInput,
  type PricePreviewRow,
  type PricePreviewSummary,
  type PriceRule,
  type PriceRuleMarkupType,
  type PriceRuleScope,
} from "@/lib/price-rules";
import {
  getPriceRuleSnapshot,
  isPriceRuleSnapshotLoaded,
  priceRuleSnapshotAgeMs,
  setPriceRuleSnapshot,
} from "@/lib/price-rules-snapshot";
import { RESELLER_CONFIG } from "@/lib/reseller-config";
import { clearResellerCatalogCache, getResellerCatalog } from "@/lib/reseller-catalog-cache";
import { getBalanceSnapshot } from "@/lib/sellability.server";

/**
 * Persistence for the catalogue price policy plus the two write paths the operator uses:
 * a single-package edit and a bulk action. Both go through the same transaction and the same
 * append-only event log, and both refresh the in-process rule snapshot and drop the catalogue
 * cache so the price a customer sees can never lag the price an operator set.
 */

type Row = Record<string, unknown>;

const text = (row: Row, key: string): string | null => {
  const value = row[key];
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : String(value);
};
const num = (row: Row, key: string): number => {
  const value = row[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function toPriceRule(row: Row): PriceRule {
  return {
    id: text(row, "id") ?? "",
    scopeType: (text(row, "scope_type") ?? "global") as PriceRule["scopeType"],
    scopeKey: text(row, "scope_key"),
    markupType: (text(row, "markup_type") ?? "percentage") as PriceRule["markupType"],
    markupValue: num(row, "markup_value"),
    currencyCode: text(row, "currency_code") ?? "IDR",
    active: row["active"] !== false,
    effectiveFrom: text(row, "effective_from") ?? new Date(0).toISOString(),
    effectiveUntil: text(row, "effective_until"),
    version: num(row, "version") || 1,
    createdBy: text(row, "created_by"),
    reason: text(row, "reason"),
    batchId: text(row, "batch_id"),
  };
}

const RULE_COLUMNS = sql`
  id::text as id, scope_type, scope_key, markup_type, markup_value::text as markup_value,
  currency_code, active, effective_from::text as effective_from, effective_until::text as effective_until,
  coalesce(version, 1)::int as version, created_by, reason, batch_id::text as batch_id
`;

export async function loadActivePriceRules(): Promise<PriceRule[]> {
  const result = await db.execute(
    sql`select ${RULE_COLUMNS} from esim_price_rules
        where provider = 'esimaccess' and active and effective_from <= now()
          and (effective_until is null or effective_until > now())
        order by case scope_type when 'package' then 1 when 'country' then 2 else 3 end, effective_from desc`,
  );
  return (result.rows as Row[]).map(toPriceRule);
}

export async function refreshPriceRuleSnapshot(): Promise<PriceRule[]> {
  const rules = await loadActivePriceRules();
  setPriceRuleSnapshot(rules);
  return rules;
}

/** Rules for catalogue normalisation: the snapshot while it is fresh, a database read otherwise. */
export async function getActivePriceRules(): Promise<PriceRule[]> {
  if (isPriceRuleSnapshotLoaded() && priceRuleSnapshotAgeMs() < 30_000)
    return [...getPriceRuleSnapshot()];
  return refreshPriceRuleSnapshot();
}

async function currentActor(): Promise<string> {
  try {
    return (await getAdminEmail()) ?? "unknown-admin";
  } catch {
    return "unknown-admin";
  }
}

const selectionSchema = z.union([
  z.object({
    mode: z.literal("codes"),
    packageCodes: z.array(z.string().trim().min(1).max(120)).min(1).max(MAX_BATCH_PACKAGES),
  }),
  z.object({
    mode: z.literal("filter"),
    filter: z.object({
      q: z.string().max(80).default(""),
      status: z.enum(["all", "unaffordable", "affordable"]).default("all"),
    }),
  }),
]);

const markupSchema = z.object({
  markupPercent: z.number().min(0).max(500).nullable(),
  fixedMarkupIdr: z.number().min(0).max(100_000_000).nullable(),
});

const applySchema = z.object({
  selection: selectionSchema,
  markup: markupSchema,
  scopeTarget: z.enum(["auto", "country", "package"]).default("auto"),
  reason: z.string().trim().min(4).max(200),
  allowLoss: z.boolean().default(false),
});

export type PricingSelection = z.infer<typeof selectionSchema>;
export type PricingMarkup = z.infer<typeof markupSchema>;

async function resolveSelection(
  selection: PricingSelection,
  rules: readonly PriceRule[],
  balanceUnits: number | null,
): Promise<{ targets: AdminCatalogRow[]; allRows: AdminCatalogRow[] }> {
  const catalog = await getResellerCatalog();
  const allRows = buildAdminCatalogRows(catalog.packages, {
    rules,
    balanceUnits,
    usdToIdr: RESELLER_CONFIG.usdToIdr,
  });
  if (selection.mode === "filter") {
    const targets = filterAdminCatalogRows(allRows, selection.filter);
    if (targets.length === 0) throw new Error("Tidak ada paket yang cocok dengan filter ini.");
    if (targets.length > MAX_BATCH_PACKAGES) {
      throw new Error(
        `Filter ini menyentuh ${targets.length} paket, melebihi batas ${MAX_BATCH_PACKAGES} per aksi. Persempit filter dulu.`,
      );
    }
    return { targets, allRows };
  }
  const byCode = new Map(allRows.map((row) => [row.packageCode.toUpperCase(), row]));
  const missing: string[] = [];
  const targets: AdminCatalogRow[] = [];
  for (const code of selection.packageCodes) {
    const match = byCode.get(code.trim().toUpperCase());
    if (!match) {
      missing.push(code);
      continue;
    }
    targets.push(match);
  }
  if (missing.length > 0) {
    throw new Error(`Paket tidak ditemukan di katalog provider: ${missing.slice(0, 5).join(", ")}`);
  }
  return { targets, allRows };
}

export type PricingPreviewResult = {
  summary: PricePreviewSummary;
  sample: PricePreviewRow[];
  sampled: number;
  scopes: { country: number; package: number };
  usdToIdr: number;
  roundingIdr: number;
  balanceUnitsKnown: boolean;
};

export const previewCataloguePricing = createServerFn({ method: "POST" })
  .validator((data: unknown) => applySchema.omit({ allowLoss: true, reason: true }).parse(data))
  .handler(async ({ data }): Promise<PricingPreviewResult> => {
    await requireAdmin();
    const rules = await getActivePriceRules();
    const snapshot = await getBalanceSnapshot();
    const { targets, allRows } = await resolveSelection(
      data.selection,
      rules,
      snapshot.balanceUnits,
    );

    const preview = previewPriceRule({
      rows: targets.map((row) => ({
        packageCode: row.packageCode,
        name: row.name,
        providerPriceUnits: row.providerPriceUnits,
        sellingPriceIdr: row.sellingPriceIdr,
      })),
      markupPercent: data.markup.markupPercent,
      fixedMarkupIdr: data.markup.fixedMarkupIdr,
      usdToIdr: RESELLER_CONFIG.usdToIdr,
      roundingIdr: RESELLER_CONFIG.roundingIdr,
      balanceUnits: snapshot.balanceUnits,
    });
    const scopes = planBulkScopes(targets, allRows, data.scopeTarget);

    return {
      summary: preview.summary,
      sample: preview.rows.slice(0, 50),
      sampled: Math.min(50, preview.rows.length),
      scopes: { country: scopes.countryScopes.length, package: scopes.packageScopes.length },
      usdToIdr: RESELLER_CONFIG.usdToIdr,
      roundingIdr: RESELLER_CONFIG.roundingIdr,
      balanceUnitsKnown: snapshot.balanceUnits !== null,
    };
  });

async function writeScopeRule(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: {
    scopeType: PriceRuleScope;
    scopeKey: string | null;
    markupType: PriceRuleMarkupType;
    markupValue: number;
    actor: string;
    reason: string;
    batchId: string;
    batchMode: "single" | "bulk";
  },
): Promise<string> {
  const scopeKey = params.scopeKey;
  const previous = await tx.execute(
    sql`select id::text as id, coalesce(version, 1)::int as version, markup_value::text as markup_value
        from esim_price_rules
        where provider = 'esimaccess' and active
          and scope_type = ${params.scopeType} and coalesce(scope_key, '*') = ${scopeKey ?? "*"}
          and markup_type = ${params.markupType}
        order by effective_from desc limit 1`,
  );
  const previousRow = (previous.rows as Row[])[0];
  const beforeJson = previousRow ? JSON.stringify(toPriceRule(previousRow)) : null;

  await tx.execute(
    sql`update esim_price_rules set active = false, effective_until = now()
        where provider = 'esimaccess' and active
          and scope_type = ${params.scopeType} and coalesce(scope_key, '*') = ${scopeKey ?? "*"}
          and markup_type = ${params.markupType}`,
  );

  const inserted = await tx.execute(
    sql`insert into esim_price_rules
          (provider, scope_type, scope_key, markup_type, markup_value, currency_code, active,
           effective_from, created_by, reason, version, batch_id, supersedes_id)
        values ('esimaccess', ${params.scopeType}, ${scopeKey}, ${params.markupType}, ${params.markupValue}, 'IDR', true,
           now(), ${params.actor}, ${params.reason}, ${previousRow ? num(previousRow, "version") + 1 : 1}, ${params.batchId},
           ${previousRow ? text(previousRow, "id") : null})
        returning id::text as id`,
  );
  const ruleId = text((inserted.rows as Row[])[0] ?? {}, "id") ?? "";

  await tx.execute(
    sql`insert into esim_price_rule_events
          (rule_id, action, scope_type, scope_key, markup_type, before_json, after_json, actor_id, reason, batch_id)
        values (${ruleId || null}, ${params.batchMode === "bulk" ? "bulk_applied" : previousRow ? "updated" : "created"},
          ${params.scopeType}, ${scopeKey}, ${params.markupType}, ${beforeJson}::jsonb,
          ${JSON.stringify({ scopeType: params.scopeType, scopeKey, markupType: params.markupType, markupValue: params.markupValue })}::jsonb,
          ${params.actor}, ${params.reason}, ${params.batchId})`,
  );
  return ruleId;
}

export type PricingApplyResult = {
  batchId: string;
  affectedPackages: number;
  countryRules: number;
  packageRules: number;
  fields: string[];
  catalogueCacheCleared: boolean;
  snapshotRules: number;
};

export const applyCataloguePricing = createServerFn({ method: "POST" })
  .validator((data: unknown) => applySchema.parse(data))
  .handler(async ({ data }): Promise<PricingApplyResult> => {
    await requireAdmin();
    const problems = validatePriceRuleInput({
      markupPercent: data.markup.markupPercent,
      fixedMarkupIdr: data.markup.fixedMarkupIdr,
    });
    if (problems.length > 0) throw new Error(problems.join(" "));

    const actor = await currentActor();
    const rules = await getActivePriceRules();
    const snapshot = await getBalanceSnapshot();
    const { targets, allRows } = await resolveSelection(
      data.selection,
      rules,
      snapshot.balanceUnits,
    );

    // Money guardrail: a bulk action must never silently sell below our own provider cost.
    const preview = previewPriceRule({
      rows: targets.map((row) => ({
        packageCode: row.packageCode,
        name: row.name,
        providerPriceUnits: row.providerPriceUnits,
        sellingPriceIdr: row.sellingPriceIdr,
      })),
      markupPercent: data.markup.markupPercent,
      fixedMarkupIdr: data.markup.fixedMarkupIdr,
      usdToIdr: RESELLER_CONFIG.usdToIdr,
      roundingIdr: RESELLER_CONFIG.roundingIdr,
      balanceUnits: snapshot.balanceUnits,
    });
    if (preview.summary.lossMaking > 0 && !data.allowLoss) {
      throw new Error(
        `${preview.summary.lossMaking} paket akan dijual di bawah harga provider (rugi). Perbaiki profit atau ulangi dengan izin rugi.`,
      );
    }

    const scopes = planBulkScopes(targets, allRows, data.scopeTarget);
    const fields: { markupType: PriceRuleMarkupType; value: number }[] = [];
    if (data.markup.markupPercent !== null)
      fields.push({ markupType: "percentage", value: data.markup.markupPercent });
    if (data.markup.fixedMarkupIdr !== null)
      fields.push({ markupType: "fixed", value: data.markup.fixedMarkupIdr });

    const batchId = globalThis.crypto.randomUUID();
    const batchMode =
      scopes.countryScopes.length + scopes.packageScopes.length > 1 || targets.length > 1
        ? "bulk"
        : "single";

    await db.transaction(async (tx) => {
      const groups: { scopeType: PriceRuleScope; keys: (string | null)[] }[] = [
        { scopeType: "country", keys: scopes.countryScopes },
        { scopeType: "package", keys: scopes.packageScopes },
      ];
      for (const group of groups) {
        for (const key of group.keys) {
          for (const field of fields) {
            await writeScopeRule(tx, {
              scopeType: group.scopeType,
              scopeKey: key,
              markupType: field.markupType,
              markupValue: field.value,
              actor,
              reason: data.reason,
              batchId,
              batchMode,
            });
          }
        }
      }
    });

    clearResellerCatalogCache();
    const refreshed = await refreshPriceRuleSnapshot();

    return {
      batchId,
      affectedPackages: targets.length,
      countryRules: scopes.countryScopes.length,
      packageRules: scopes.packageScopes.length,
      fields: fields.map((field) =>
        field.markupType === "percentage" ? `profit ${field.value}%` : `profit Rp${field.value}`,
      ),
      catalogueCacheCleared: true,
      snapshotRules: refreshed.length,
    };
  });

export const rollbackPricingBatch = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ batchId: z.string().uuid(), reason: z.string().trim().min(4).max(200) }).parse(data),
  )
  .handler(async ({ data }): Promise<{ rolledBack: number; restored: number }> => {
    await requireAdmin();
    const actor = await currentActor();

    const result = await db.transaction(async (tx) => {
      const active = await tx.execute(
        sql`select ${RULE_COLUMNS} from esim_price_rules where batch_id = ${data.batchId}::uuid and active`,
      );
      const rulesToRollback = (active.rows as Row[]).map(toPriceRule);
      let restored = 0;
      for (const rule of rulesToRollback) {
        await tx.execute(
          sql`update esim_price_rules set active = false, effective_until = now() where id = ${rule.id}::uuid`,
        );
        await tx.execute(
          sql`insert into esim_price_rule_events
                (rule_id, action, scope_type, scope_key, markup_type, before_json, after_json, actor_id, reason, batch_id)
              values (${rule.id}::uuid, 'rolled_back', ${rule.scopeType}, ${rule.scopeKey}, ${rule.markupType},
                ${JSON.stringify({ markupValue: rule.markupValue, version: rule.version })}::jsonb, null,
                ${actor}, ${data.reason}, ${data.batchId}::uuid)`,
        );
        const superseded = await tx.execute(
          sql`select id::text as id from esim_price_rules
              where supersedes_id is null and id = (
                select supersedes_id from esim_price_rules where id = ${rule.id}::uuid
              ) and active = false`,
        );
        const target = (superseded.rows as Row[])[0];
        if (target) {
          await tx.execute(
            sql`update esim_price_rules set active = true, effective_until = null where id = ${text(target, "id")}::uuid`,
          );
          restored += 1;
        }
      }
      return { rolledBack: rulesToRollback.length, restored };
    });

    clearResellerCatalogCache();
    await refreshPriceRuleSnapshot();
    return result;
  });

export type PriceRuleEventView = {
  id: string;
  action: string;
  scopeType: string;
  scopeKey: string | null;
  markupType: string | null;
  beforeValue: number | null;
  afterValue: number | null;
  actorId: string;
  reason: string;
  batchId: string | null;
  createdAt: string;
};

export const readPriceRuleHistory = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ limit: z.number().int().min(1).max(50).default(12) }).parse(data ?? {}),
  )
  .handler(async ({ data }): Promise<PriceRuleEventView[]> => {
    await requireAdmin();
    const result = await db.execute(
      sql`select id::text as id, action, scope_type, scope_key, markup_type,
                 before_json, after_json, actor_id, reason, batch_id::text as batch_id, created_at::text as created_at
          from esim_price_rule_events
          order by created_at desc
          limit ${data.limit}`,
    );
    return (result.rows as Row[]).map((row) => {
      const after = (row["after_json"] ?? null) as { markupValue?: unknown } | null;
      const before = (row["before_json"] ?? null) as { markupValue?: unknown } | null;
      return {
        id: text(row, "id") ?? "",
        action: text(row, "action") ?? "updated",
        scopeType: text(row, "scope_type") ?? "global",
        scopeKey: text(row, "scope_key"),
        markupType: text(row, "markup_type"),
        beforeValue:
          before && Number.isFinite(Number(before.markupValue)) ? Number(before.markupValue) : null,
        afterValue:
          after && Number.isFinite(Number(after.markupValue)) ? Number(after.markupValue) : null,
        actorId: text(row, "actor_id") ?? "unknown",
        reason: text(row, "reason") ?? "",
        batchId: text(row, "batch_id"),
        createdAt: text(row, "created_at") ?? "",
      };
    });
  });

const inlinePriceSchema = z.object({
  packageCode: z.string().trim().min(1).max(120),
  mode: z.enum(["percent", "price"]),
  value: z.number().finite(),
});

export type InlinePriceResult = {
  packageCode: string;
  beforePriceIdr: number;
  afterPriceIdr: number;
  pinned: { markupPercent: number; fixedMarkupIdr: number };
  batchId: string;
};

/**
 * Direct in-row price edit: "make this package's selling price exactly this".
 *
 * Both markup fields are pinned for the package so the result cannot be moved by a country or
 * global rule: a percentage edit also writes a nominal 0, and a price edit also writes a
 * percentage 0. Without that, a leftover country-level nominal rule would silently add to the
 * price the operator just typed. The audit reason is generated with the before/after values, so a
 * quick edit still leaves a reviewable trail.
 */
export const setPackagePriceInline = createServerFn({ method: "POST" })
  .validator((data: unknown) => inlinePriceSchema.parse(data))
  .handler(async ({ data }): Promise<InlinePriceResult> => {
    await requireAdmin();
    const actor = await currentActor();
    const rules = await getActivePriceRules();
    const snapshot = await getBalanceSnapshot();
    const catalog = await getResellerCatalog();
    const row = buildAdminCatalogRows(catalog.packages, {
      rules,
      balanceUnits: snapshot.balanceUnits,
      usdToIdr: RESELLER_CONFIG.usdToIdr,
    }).find(
      (candidate) => candidate.packageCode.toUpperCase() === data.packageCode.trim().toUpperCase(),
    );
    if (!row) throw new Error(`Paket ${data.packageCode} tidak ditemukan di katalog provider.`);

    let pinned: { markupPercent: number; fixedMarkupIdr: number };
    if (data.mode === "percent") {
      if (!Number.isFinite(data.value) || data.value < 0 || data.value > 500) {
        throw new Error("Profit persen harus angka 0–500.");
      }
      pinned = { markupPercent: Math.round(data.value * 100) / 100, fixedMarkupIdr: 0 };
    } else {
      if (!Number.isFinite(data.value) || data.value <= 0)
        throw new Error("Harga jual harus angka lebih dari 0.");
      const fixed = Math.round(data.value) - row.providerCostIdr;
      if (fixed < 0) {
        throw new Error(
          `Harga jual ${Math.round(data.value)} di bawah harga provider (${row.providerCostIdr}).`,
        );
      }
      pinned = { markupPercent: 0, fixedMarkupIdr: fixed };
    }

    const proposal = previewPriceRule({
      rows: [
        {
          packageCode: row.packageCode,
          name: row.name,
          providerPriceUnits: row.providerPriceUnits,
          sellingPriceIdr: row.sellingPriceIdr,
        },
      ],
      markupPercent: pinned.markupPercent,
      fixedMarkupIdr: pinned.fixedMarkupIdr,
      usdToIdr: RESELLER_CONFIG.usdToIdr,
      roundingIdr: RESELLER_CONFIG.roundingIdr,
      balanceUnits: snapshot.balanceUnits,
    });
    if (proposal.summary.lossMaking > 0)
      throw new Error("Harga jual tidak boleh di bawah harga provider.");
    const afterPriceIdr = proposal.rows[0]?.afterPriceIdr ?? row.sellingPriceIdr;

    const batchId = globalThis.crypto.randomUUID();
    const reason = `Edit cepat ${row.packageCode}: harga ${row.sellingPriceIdr} → ${afterPriceIdr} (${pinned.markupPercent}% + ${pinned.fixedMarkupIdr})`;

    await db.transaction(async (tx) => {
      await writeScopeRule(tx, {
        scopeType: "package",
        scopeKey: row.packageCode,
        markupType: "percentage",
        markupValue: pinned.markupPercent,
        actor,
        reason,
        batchId,
        batchMode: "single",
      });
      await writeScopeRule(tx, {
        scopeType: "package",
        scopeKey: row.packageCode,
        markupType: "fixed",
        markupValue: pinned.fixedMarkupIdr,
        actor,
        reason,
        batchId,
        batchMode: "single",
      });
    });

    clearResellerCatalogCache();
    await refreshPriceRuleSnapshot();

    return {
      packageCode: row.packageCode,
      beforePriceIdr: row.sellingPriceIdr,
      afterPriceIdr,
      pinned,
      batchId,
    };
  });

export { priceRuleDefaults };
