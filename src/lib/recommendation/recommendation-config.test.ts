import { describe, expect, it } from "vitest";
import {
  RECOMMENDATION_CONFIG,
  RECOMMENDATION_WEIGHT_KEYS,
  UNLIMITED_TARGET_BYTES,
} from "./recommendation-config";
import { RECOMMENDATION_WEIGHTS } from "./package-ranker";

describe("recommendation configuration", () => {
  it("keeps every weight in one validated, non-hardcoded place", () => {
    expect(Object.keys(RECOMMENDATION_CONFIG.weights).sort()).toEqual(
      [...RECOMMENDATION_WEIGHT_KEYS].sort(),
    );
    for (const key of RECOMMENDATION_WEIGHT_KEYS) {
      const weight = RECOMMENDATION_CONFIG.weights[key];
      expect(Number.isFinite(weight)).toBe(true);
      expect(weight).toBeGreaterThanOrEqual(0);
    }
    expect(RECOMMENDATION_WEIGHTS).toBe(RECOMMENDATION_CONFIG.weights);
  });

  it("exposes ordered data-need targets, a budget ceiling factor and a limit", () => {
    const { low, medium, high } = RECOMMENDATION_CONFIG.dataNeedTargets;
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(medium);
    expect(medium).toBeLessThan(high);
    expect(Number.isFinite(RECOMMENDATION_CONFIG.budgetCeilingFactor)).toBe(true);
    expect(RECOMMENDATION_CONFIG.budgetCeilingFactor).toBeGreaterThan(0);
    expect(Number.isInteger(RECOMMENDATION_CONFIG.defaultLimit)).toBe(true);
    expect(RECOMMENDATION_CONFIG.defaultLimit).toBeGreaterThan(0);
    expect(UNLIMITED_TARGET_BYTES).toBe(Number.POSITIVE_INFINITY);
  });
});
