/**
 * Wallet history scope.
 *
 * Provenance of a wallet ledger row belongs to the canonical customer-wallet
 * service: Djiwa Travel may *request* an allow-listed app scope and project the
 * returned rows fail-closed, but it never mints provenance for a row and never
 * accepts a scope value from the browser.
 */

/** The only app identifier Djiwa Travel may attribute to itself. */
export const DJIWA_TRAVEL_SOURCE_APP = "djiwa-travel";

/** Request scopes Djiwa Travel can ask the canonical wallet for. */
export const WALLET_SCOPES = ["all", DJIWA_TRAVEL_SOURCE_APP] as const;
export type WalletScope = (typeof WALLET_SCOPES)[number];

export const WALLET_SCOPE_LABELS: Record<WalletScope, string> = {
  all: "Semua transaksi",
  [DJIWA_TRAVEL_SOURCE_APP]: "Djiwa Travel",
};

export function isWalletScope(value: unknown): value is WalletScope {
  return typeof value === "string" && (WALLET_SCOPES as readonly string[]).includes(value);
}

/**
 * Fail closed: only the known scopes pass, everything else (including a
 * browser-supplied free-form value) is rejected instead of widened.
 */
export function parseWalletScope(value: unknown): WalletScope {
  if (value === undefined || value === null || value === "") return "all";
  if (!isWalletScope(value)) throw new Error("Filter riwayat Wallet tidak dikenal");
  return value;
}

/**
 * Canonical `source_app` is nullable and may be absent on historical rows.
 * Blank or non-string values are unattributed (null), never guessed.
 */
export function normalizeSourceApp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function isDjiwaTravelSourceApp(value: unknown): boolean {
  return normalizeSourceApp(value) === DJIWA_TRAVEL_SOURCE_APP;
}

function readSourceApp(entry: unknown): unknown {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    return (entry as Record<string, unknown>)["source_app"];
  }
  return null;
}

/**
 * "all" keeps the canonical ledger untouched (current behaviour preserved).
 * The Djiwa Travel scope keeps only rows the canonical service explicitly
 * attributed to Djiwa Travel, so unknown/NULL rows are never silently included.
 * The element type is untouched so the caller keeps its full ledger shape.
 */
export function filterLedgerByScope<T>(entries: readonly T[], scope: WalletScope): T[] {
  if (scope === "all") return [...entries];
  return entries.filter((entry) => isDjiwaTravelSourceApp(readSourceApp(entry)));
}
