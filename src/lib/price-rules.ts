import { calculateSellingPrice } from "./reseller-pricing";
import { RESELLER_CONFIG } from "./reseller-config";
import { requiredUnits, SELLABILITY_BUFFER } from "./sellability";

/**
 * Catalogue price rules: the operator-facing profit policy.
 *
 * The same numbers the admin workspace shows are the numbers the customer pays, so resolution and
 * preview are pure functions here — no database, no AI, no hidden arithmetic. Money is always
 * computed from the package's own provider cost.
 */

export type PriceRuleScope = "global" | "country" | "package";
export type PriceRuleMarkupType = "percentage" | "fixed";

export type PriceRule = {
  id: string;
  scopeType: PriceRuleScope;
  scopeKey: string | null;
  markupType: PriceRuleMarkupType;
  markupValue: number;
  currencyCode: string;
  active: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
  version: number;
  createdBy: string | null;
  reason: string | null;
  batchId?: string | null;
};

export type PricingTarget = { packageCode: string; locationCodes: readonly string[] };

export type ResolvedPricing = {
  /** Most specific scope that contributed a rule; `default` means the reseller fallback answered. */
  source: PriceRuleScope | "default";
  ruleIds: string[];
  markupPercent: number;
  fixedMarkupIdr: number;
};

export type PricingDefaults = { markupPercent: number; fixedMarkupIdr: number };

export const PRICE_RULE_PERCENT_MAX = 500;
/** One bulk action may touch at most this many packages; larger selections must be narrowed. */
export const MAX_BATCH_PACKAGES = 500;

const SCOPE_ORDER: readonly PriceRuleScope[] = ["package", "country", "global"];
const RESELLER_DEFAULTS: PricingDefaults = {
  markupPercent: RESELLER_CONFIG.markupPercent,
  fixedMarkupIdr: RESELLER_CONFIG.fixedMarkupIdr,
};

export function priceRuleDefaults(): PricingDefaults {
  return { ...RESELLER_DEFAULTS };
}

export function normalizeScopeKey(scopeType: PriceRuleScope, scopeKey: string | null): string | null {
  if (scopeType === "global") return null;
  const value = (scopeKey ?? "").trim().toUpperCase();
  return value === "" ? null : value;
}

export function isPriceRuleActiveAt(rule: PriceRule, atMs: number): boolean {
  if (!rule.active) return false;
  const from = Date.parse(rule.effectiveFrom);
  if (Number.isFinite(from) && from > atMs) return false;
  if (rule.effectiveUntil) {
    const until = Date.parse(rule.effectiveUntil);
    if (Number.isFinite(until) && until <= atMs) return false;
  }
  return true;
}

function ruleMatchesTarget(rule: PriceRule, target: PricingTarget): boolean {
  if (rule.scopeType === "global") return true;
  const key = normalizeScopeKey(rule.scopeType, rule.scopeKey);
  if (!key) return false;
  if (rule.scopeType === "package") return target.packageCode.trim().toUpperCase() === key;
  return target.locationCodes.some((code) => code.trim().toUpperCase() === key);
}

/**
 * Field-by-field resolution, most specific scope first: a package-level percentage rule beats a
 * country-level percentage rule, and a global nominal rule still applies when no closer nominal
 * rule exists. Missing fields fall back to the reseller defaults, which is exactly what the app
 * used before price rules existed.
 */
export function resolvePricingRule(
  target: PricingTarget,
  rules: readonly PriceRule[],
  defaults: PricingDefaults = RESELLER_DEFAULTS,
  atMs: number = Date.now(),
): ResolvedPricing {
  const active = rules.filter((rule) => isPriceRuleActiveAt(rule, atMs));
  let percentRule: PriceRule | undefined;
  let fixedRule: PriceRule | undefined;
  let source: PriceRuleScope | "default" = "default";

  for (const scope of SCOPE_ORDER) {
    for (const rule of active) {
      if (rule.scopeType !== scope || !ruleMatchesTarget(rule, target)) continue;
      if (rule.markupType === "percentage" && !percentRule) {
        percentRule = rule;
        if (source === "default" || SCOPE_ORDER.indexOf(scope) < SCOPE_ORDER.indexOf(source as PriceRuleScope)) {
          source = scope;
        }
        continue;
      }
      if (rule.markupType === "fixed" && !fixedRule) {
        fixedRule = rule;
        if (source === "default" || SCOPE_ORDER.indexOf(scope) < SCOPE_ORDER.indexOf(source as PriceRuleScope)) {
          source = scope;
        }
      }
    }
  }

  return {
    source,
    ruleIds: [percentRule?.id, fixedRule?.id].filter((id): id is string => typeof id === "string"),
    markupPercent: percentRule?.markupValue ?? defaults.markupPercent,
    fixedMarkupIdr: fixedRule?.markupValue ?? defaults.fixedMarkupIdr,
  };
}

export type PriceRuleWrite = { markupPercent: number | null; fixedMarkupIdr: number | null };

/** Returns human-readable Indonesian problems; an empty array means the input may be applied. */
export function validatePriceRuleInput(input: PriceRuleWrite): string[] {
  const errors: string[] = [];
  if (input.markupPercent === null && input.fixedMarkupIdr === null) {
    errors.push("Isi minimal satu: profit persen atau profit nominal.");
  }
  if (input.markupPercent !== null) {
    if (!Number.isFinite(input.markupPercent) || input.markupPercent < 0) {
      errors.push("Profit persen harus angka ≥ 0.");
    } else if (input.markupPercent > PRICE_RULE_PERCENT_MAX) {
      errors.push(`Profit persen maksimal ${PRICE_RULE_PERCENT_MAX}%.`);
    }
  }
  if (input.fixedMarkupIdr !== null) {
    if (!Number.isFinite(input.fixedMarkupIdr) || input.fixedMarkupIdr < 0) {
      errors.push("Profit nominal harus angka ≥ 0.");
    }
  }
  return errors;
}

export type PreviewSourceRow = {
  packageCode: string;
  name: string;
  providerPriceUnits: number;
  /** Price currently shown to the customer for this package (already rule-resolved). */
  sellingPriceIdr: number;
};

export type PricePreviewRow = {
  packageCode: string;
  name: string;
  providerCostIdr: number;
  beforePriceIdr: number;
  afterPriceIdr: number;
  beforeMarginIdr: number;
  afterMarginIdr: number;
  beforeMarginPercent: number;
  afterMarginPercent: number;
  /** True when the new price would not even cover our provider cost. */
  lossMaking: boolean;
  /** null when the provider balance is unknown right now. */
  affordableAfter: boolean | null;
};

export type PricePreviewSummary = {
  affected: number;
  increased: number;
  decreased: number;
  unchanged: number;
  lossMaking: number;
  becomesUnaffordable: number;
  marginIdrDelta: number;
  averageAfterMarginPercent: number;
};

export type PricePreviewInput = {
  rows: readonly PreviewSourceRow[];
  markupPercent: number | null;
  fixedMarkupIdr: number | null;
  usdToIdr?: number;
  roundingIdr?: number;
  balanceUnits: number | null;
  buffer?: number;
};

/**
 * The diff an operator must see before applying: old price, new price, margin movement, and which
 * packages would stop being sellable. Rows are computed one by one from their own provider cost.
 */
export function previewPriceRule(input: PricePreviewInput): {
  rows: PricePreviewRow[];
  summary: PricePreviewSummary;
} {
  const usdToIdr = input.usdToIdr ?? RESELLER_CONFIG.usdToIdr;
  const roundingIdr = input.roundingIdr ?? RESELLER_CONFIG.roundingIdr;
  const buffer = input.buffer ?? SELLABILITY_BUFFER;
  const percent = input.markupPercent;
  const fixed = input.fixedMarkupIdr;

  const rows = input.rows.map((row) => {
    const providerCostIdr = Math.round((row.providerPriceUnits / 10_000) * usdToIdr);
    const beforePriceIdr = row.sellingPriceIdr;
    const proposed = calculateSellingPrice({
      providerPriceUnits: row.providerPriceUnits,
      ...(percent === null ? {} : { markupPercent: percent }),
      ...(fixed === null ? {} : { fixedMarkupIdr: fixed }),
      usdToIdr,
      roundingIdr,
    });
    const afterPriceIdr = proposed.sellingPriceIdr;
    const beforeMarginIdr = beforePriceIdr - providerCostIdr;
    const afterMarginIdr = afterPriceIdr - providerCostIdr;
    return {
      packageCode: row.packageCode,
      name: row.name,
      providerCostIdr,
      beforePriceIdr,
      afterPriceIdr,
      beforeMarginIdr,
      afterMarginIdr,
      beforeMarginPercent: providerCostIdr > 0 ? (beforeMarginIdr / providerCostIdr) * 100 : 0,
      afterMarginPercent: providerCostIdr > 0 ? (afterMarginIdr / providerCostIdr) * 100 : 0,
      lossMaking: afterPriceIdr <= providerCostIdr,
      affordableAfter:
        input.balanceUnits === null ? null : input.balanceUnits >= requiredUnits(row.providerPriceUnits, buffer),
    } satisfies PricePreviewRow;
  });

  const summary: PricePreviewSummary = {
    affected: rows.length,
    increased: rows.filter((row) => row.afterPriceIdr > row.beforePriceIdr).length,
    decreased: rows.filter((row) => row.afterPriceIdr < row.beforePriceIdr).length,
    unchanged: rows.filter((row) => row.afterPriceIdr === row.beforePriceIdr).length,
    lossMaking: rows.filter((row) => row.lossMaking).length,
    becomesUnaffordable: rows.filter((row) => row.affordableAfter === false).length,
    marginIdrDelta: rows.reduce((total, row) => total + (row.afterMarginIdr - row.beforeMarginIdr), 0),
    averageAfterMarginPercent:
      rows.length === 0 ? 0 : rows.reduce((total, row) => total + row.afterMarginPercent, 0) / rows.length,
  };

  return { rows, summary };
}

/** Scope a bulk action should write, given the packages it targets. */
export function planBulkScopes(
  targets: readonly { packageCode: string; locationCodes: readonly string[] }[],
  allCatalogue: readonly { packageCode: string; locationCodes: readonly string[] }[],
  scopeTarget: "auto" | "country" | "package",
): { countryScopes: string[]; packageScopes: string[] } {
  if (scopeTarget === "package") {
    return { countryScopes: [], packageScopes: targets.map((pkg) => pkg.packageCode) };
  }

  const targetCodes = new Set(targets.map((pkg) => pkg.packageCode));
  const codesPerCountry = new Map<string, Set<string>>();
  for (const pkg of allCatalogue) {
    for (const code of pkg.locationCodes) {
      const key = code.trim().toUpperCase();
      if (!key) continue;
      const bucket = codesPerCountry.get(key) ?? new Set<string>();
      bucket.add(pkg.packageCode);
      codesPerCountry.set(key, bucket);
    }
  }

  const countryScopes: string[] = [];
  const covered = new Set<string>();
  for (const [country, codes] of codesPerCountry) {
    if (codes.size === 0) continue;
    const fullySelected = [...codes].every((code) => targetCodes.has(code));
    if (!fullySelected) continue;
    countryScopes.push(country);
    for (const code of codes) covered.add(code);
  }
  const packageScopes = targets.map((pkg) => pkg.packageCode).filter((code) => !covered.has(code));
  return { countryScopes, packageScopes };
}
