import type { PriceRule } from "./price-rules";

/**
 * In-process snapshot of the active price rules.
 *
 * Catalogue normalisation is synchronous, so the rules it needs must be available without a
 * database round trip. This module is deliberately pure data: the database-backed refresher lives
 * in `price-rules.server.ts` and fills the snapshot on boot, on every admin read, and right after
 * every write. With no rules loaded the price falls back to the reseller defaults — the same
 * numbers the app used before the pricing workspace existed.
 */

let snapshot: readonly PriceRule[] = [];
let loadedAtMs = 0;

export function setPriceRuleSnapshot(rules: readonly PriceRule[], atMs: number = Date.now()): void {
  snapshot = [...rules];
  loadedAtMs = atMs;
}

export function getPriceRuleSnapshot(): readonly PriceRule[] {
  return snapshot;
}

export function isPriceRuleSnapshotLoaded(): boolean {
  return loadedAtMs > 0;
}

export function priceRuleSnapshotAgeMs(now: number = Date.now()): number {
  return loadedAtMs === 0 ? Number.POSITIVE_INFINITY : now - loadedAtMs;
}

export function priceRuleSnapshotLoadedAt(): number | null {
  return loadedAtMs === 0 ? null : loadedAtMs;
}
