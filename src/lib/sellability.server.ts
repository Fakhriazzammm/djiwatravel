import { fetchEsimAccessBalanceServer } from "./esim-access";
import {
  affordableCeilingUsd,
  partitionSellability,
  sellabilityMode,
  type BalanceSnapshot,
  type SellabilityMode,
  type SellablePackage,
} from "./sellability";

/**
 * Server side of balance-aware sellability: one cached balance read shared by every catalogue page,
 * plus the checkout gate that makes the rule authoritative.
 */

const CACHE_TTL_MS = 30_000;
/** Fail-open window: a balance we read within the hour is still good enough to decide with. */
const LAST_KNOWN_MAX_AGE_MS = 60 * 60 * 1000;
const SHADOW_LOG_INTERVAL_MS = 60_000;

let lastKnown: { units: number; at: number } | null = null;
let inflight: Promise<number> | null = null;
let lastShadowLogAt = 0;

/** Single-flight so a burst of catalogue page loads cannot stampede the provider. */
async function readProviderBalance(): Promise<number> {
  if (!inflight) {
    inflight = fetchEsimAccessBalanceServer()
      .then((balance) => balance.balanceUnits)
      .finally(() => {
        inflight = null;
      });
  }
  try {
    const units = await inflight;
    lastKnown = { units, at: Date.now() };
    return units;
  } catch (error) {
    throw error instanceof Error ? error : new Error("Saldo provider tidak terbaca");
  }
}

export async function getBalanceSnapshot(): Promise<BalanceSnapshot> {
  const now = Date.now();
  if (lastKnown && now - lastKnown.at < CACHE_TTL_MS) {
    return { balanceUnits: lastKnown.units, capturedAtMs: lastKnown.at, source: "cache" };
  }
  try {
    const units = await readProviderBalance();
    return { balanceUnits: units, capturedAtMs: lastKnown?.at ?? now, source: "live" };
  } catch (error) {
    if (lastKnown && now - lastKnown.at <= LAST_KNOWN_MAX_AGE_MS) {
      return { balanceUnits: lastKnown.units, capturedAtMs: lastKnown.at, source: "last-known" };
    }
    console.warn("[travel] saldo provider tidak terbaca, kelayakan jual dilewati (fail-open)", {
      reason: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
    return { balanceUnits: null, capturedAtMs: null, source: "unknown" };
  }
}

export type SellabilityState = {
  mode: SellabilityMode;
  snapshot: BalanceSnapshot;
  hidden: Set<string>;
  hiddenCount: number;
  sellableCount: number;
};

/**
 * Sellability for one catalogue page. In `shadow` the answer is logged but the caller still shows
 * everything, so the rule can be validated against real traffic before it is enforced.
 */
export async function getSellabilityState<T extends SellablePackage>(
  packages: readonly T[],
): Promise<SellabilityState> {
  const mode = sellabilityMode();
  if (mode === "off") {
    return {
      mode,
      snapshot: { balanceUnits: null, capturedAtMs: null, source: "unknown" },
      hidden: new Set<string>(),
      hiddenCount: 0,
      sellableCount: packages.length,
    };
  }

  const snapshot = await getBalanceSnapshot();
  const partition = partitionSellability(packages, snapshot);
  if (mode === "shadow") {
    const now = Date.now();
    if (partition.hiddenCount > 0 && now - lastShadowLogAt > SHADOW_LOG_INTERVAL_MS) {
      lastShadowLogAt = now;
      console.info("[travel] sellability shadow", {
        balanceUnits: snapshot.balanceUnits,
        balanceSource: snapshot.source,
        ceilingUsd: affordableCeilingUsd(snapshot),
        listed: packages.length,
        wouldHide: partition.hiddenCount,
      });
    }
    return { mode, snapshot, hidden: new Set<string>(), hiddenCount: partition.hiddenCount, sellableCount: packages.length };
  }

  return {
    mode,
    snapshot,
    hidden: partition.hidden,
    hiddenCount: partition.hiddenCount,
    sellableCount: partition.sellableCount,
  };
}

/**
 * The authoritative check, run right before an order is created. A customer must never pay for a
 * package whose provider price we cannot cover.
 */
export async function assertPackageSellableForOrder(pkg: SellablePackage): Promise<void> {
  const state = await getSellabilityState([pkg]);
  if (state.mode === "shadow") {
    if (state.hiddenCount > 0) {
      console.warn("[travel] sellability shadow: order yang akan diblokir", {
        packageCode: pkg.packageCode,
        balanceUnits: state.snapshot.balanceUnits,
        balanceSource: state.snapshot.source,
      });
    }
    return;
  }
  if (state.hiddenCount > 0) {
    console.warn("[travel] paket diblokir karena saldo provider tidak cukup", {
      packageCode: pkg.packageCode,
      balanceUnits: state.snapshot.balanceUnits,
      balanceSource: state.snapshot.source,
    });
    throw new Error("Paket ini sedang habis (sold out). Silakan pilih paket lain.");
  }
}
