/**
 * Single source of truth for recommendation tuning.
 *
 * Values are defaults only: every knob can be overridden from the server
 * environment so ranking can be re-tuned without editing logic. Unknown or
 * invalid overrides are ignored instead of silently changing behaviour.
 *
 * Environment overrides:
 * - RECOMMENDATION_WEIGHTS_JSON           e.g. {"destination":0.3,"price":0.2}
 * - RECOMMENDATION_TARGET_LOW_BYTES       low data need target
 * - RECOMMENDATION_TARGET_MEDIUM_BYTES    medium data need target
 * - RECOMMENDATION_TARGET_HIGH_BYTES      high data need target
 * - RECOMMENDATION_BUDGET_CEILING_FACTOR  allowed multiple of the customer budget
 * - RECOMMENDATION_LIMIT                  default number of recommendations
 */

export const RECOMMENDATION_WEIGHT_KEYS = [
  "destination",
  "duration",
  "data",
  "price",
  "valuePerGb",
  "valuePerDay",
  "features",
  "reliability",
] as const;

export type RecommendationWeightKey = (typeof RECOMMENDATION_WEIGHT_KEYS)[number];
export type RecommendationWeights = Record<RecommendationWeightKey, number>;
export type DataNeedTargets = { low: number; medium: number; high: number };

const DEFAULT_WEIGHTS: RecommendationWeights = {
  destination: 0.3,
  duration: 0.15,
  data: 0.2,
  price: 0.1,
  valuePerGb: 0.1,
  valuePerDay: 0.05,
  features: 0.05,
  reliability: 0.05,
};

/** Approximate bytes a traveller needs per data-need level. */
const DEFAULT_DATA_NEED_TARGETS: DataNeedTargets = {
  low: 1e9,
  medium: 3e9,
  high: 10e9,
};

/** Budget is a hard cap by default; the factor exists so it can be widened per deployment. */
const DEFAULT_BUDGET_CEILING_FACTOR = 1;
const DEFAULT_LIMIT = 8;

function readEnv(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function readPositiveNumber(name: string): number | undefined {
  const raw = readEnv(name);
  if (raw == null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function isValidWeights(value: unknown): value is RecommendationWeights {
  if (typeof value !== "object" || value == null) return false;
  const candidate = value as Record<string, unknown>;
  const resolved = RECOMMENDATION_WEIGHT_KEYS.map((key) => candidate[key]);
  const sum = resolved.reduce(
    (total, item) => total + (typeof item === "number" && Number.isFinite(item) ? item : 0),
    0,
  );
  return (
    sum > 0 &&
    resolved.every(
      (item) => typeof item === "number" && Number.isFinite(item) && item >= 0,
    )
  );
}

function resolveWeights(): RecommendationWeights {
  const raw = readEnv("RECOMMENDATION_WEIGHTS_JSON");
  if (!raw) return DEFAULT_WEIGHTS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isValidWeights(parsed)) return parsed;
  } catch {
    // Fall through to defaults rather than failing a customer request.
  }
  return DEFAULT_WEIGHTS;
}

function resolveTarget(need: keyof DataNeedTargets): number {
  return (
    readPositiveNumber(`RECOMMENDATION_TARGET_${need.toUpperCase()}_BYTES`) ??
    DEFAULT_DATA_NEED_TARGETS[need]
  );
}

export const RECOMMENDATION_CONFIG = {
  weights: resolveWeights(),
  dataNeedTargets: {
    low: resolveTarget("low"),
    medium: resolveTarget("medium"),
    high: resolveTarget("high"),
  } satisfies DataNeedTargets,
  budgetCeilingFactor:
    readPositiveNumber("RECOMMENDATION_BUDGET_CEILING_FACTOR") ??
    DEFAULT_BUDGET_CEILING_FACTOR,
  defaultLimit: readPositiveNumber("RECOMMENDATION_LIMIT") ?? DEFAULT_LIMIT,
} as const;

/** Unlimited has no finite byte target: it is satisfied by an explicit unlimited signal. */
export const UNLIMITED_TARGET_BYTES = Number.POSITIVE_INFINITY;
