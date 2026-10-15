/**
 * Balance-aware sellability.
 *
 * A package we cannot pay the provider for is a package we must not sell: the customer would pay
 * and provisioning would fail. Packages whose provider price exceeds our balance are therefore
 * shown as "Habis" instead of being sold.
 *
 * Only booleans derived from the rule travel to the browser; the balance and our cost basis stay
 * on the server.
 */

/** Price headroom. Provider prices move, and checkout reprices against the live catalogue. */
export const SELLABILITY_BUFFER = 0.15;

export type SellabilityMode = "off" | "shadow" | "on";

/**
 * Production must explicitly set TRAVEL_SELLABILITY_MODE=on in the server runtime. The source
 * default remains `off` for previews and rollback safety; `shadow` computes and logs the decision
 * without changing what is shown.
 */
export function sellabilityMode(raw: string | undefined = process.env["TRAVEL_SELLABILITY_MODE"]): SellabilityMode {
  const value = (raw ?? "").trim().toLowerCase();
  return value === "on" || value === "shadow" ? value : "off";
}

export type BalanceSnapshot = {
  /** null means the balance is unknown right now. */
  balanceUnits: number | null;
  capturedAtMs: number | null;
  source: "live" | "cache" | "last-known" | "unknown";
};

export type SellablePackage = { packageCode: string; providerPriceUnits: number };

export type CheckoutSellabilityDecision =
  | { ok: true }
  | { ok: false; reason: "balance_unknown" | "provider_cost_unaffordable" | "provider_cost_invalid" };

/** Strict checkout decision; unlike catalog display, unknown balance is never sellable. */
export function checkoutSellabilityDecision(
  pkg: SellablePackage,
  snapshot: BalanceSnapshot,
  buffer = SELLABILITY_BUFFER,
): CheckoutSellabilityDecision {
  if (snapshot.balanceUnits === null || !Number.isFinite(snapshot.balanceUnits)) return { ok: false, reason: "balance_unknown" };
  if (!Number.isFinite(pkg.providerPriceUnits) || pkg.providerPriceUnits <= 0) return { ok: false, reason: "provider_cost_invalid" };
  return snapshot.balanceUnits >= requiredUnits(pkg.providerPriceUnits, buffer)
    ? { ok: true }
    : { ok: false, reason: "provider_cost_unaffordable" };
}

/** Balance we must hold to sell this package, including price headroom. */
export function requiredUnits(providerPriceUnits: number, buffer = SELLABILITY_BUFFER): number {
  return Math.ceil(providerPriceUnits * (1 + buffer));
}

/**
 * Fail-open by design: an unreadable balance must never empty the whole store. The checkout gate
 * re-checks against the same snapshot, so an unknown balance cannot turn into a paid order we
 * cannot deliver.
 */
export function isPackageSellable(
  pkg: SellablePackage,
  snapshot: BalanceSnapshot,
  buffer = SELLABILITY_BUFFER,
): boolean {
  // A package without a usable price is a catalogue problem, not an affordability verdict.
  if (!Number.isFinite(pkg.providerPriceUnits) || pkg.providerPriceUnits <= 0) return true;
  if (snapshot.balanceUnits === null || !Number.isFinite(snapshot.balanceUnits)) return true;
  return snapshot.balanceUnits >= requiredUnits(pkg.providerPriceUnits, buffer);
}

export type SellabilityPartition = {
  hidden: Set<string>;
  hiddenCount: number;
  sellableCount: number;
};

export function partitionSellability<T extends SellablePackage>(
  packages: readonly T[],
  snapshot: BalanceSnapshot,
  buffer = SELLABILITY_BUFFER,
): SellabilityPartition {
  const hidden = new Set<string>();
  let hiddenCount = 0;
  for (const pkg of packages) {
    if (isPackageSellable(pkg, snapshot, buffer)) continue;
    hidden.add(pkg.packageCode);
    hiddenCount += 1;
  }
  return { hidden, hiddenCount, sellableCount: packages.length - hiddenCount };
}

/** Highest price we can still sell at the current balance — the number admins act on. */
export function affordableCeilingUsd(snapshot: BalanceSnapshot, buffer = SELLABILITY_BUFFER): number | null {
  if (snapshot.balanceUnits === null || !Number.isFinite(snapshot.balanceUnits)) return null;
  return snapshot.balanceUnits / 10_000 / (1 + buffer);
}
