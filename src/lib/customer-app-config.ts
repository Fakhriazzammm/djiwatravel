import { WALLET_ACTIONS, type WalletQuickAction } from "./wallet-quick-actions";

/**
 * Storefront configuration that operations may need to change without a redeploy.
 *
 * The parsers and defaults live here (plain module) so both the server and the wallet screen can
 * read them; the browser-callable accessor lives in `customer-app-config.server.ts`.
 *
 * Top-up presets and which Djiwa Pay quick actions are live used to be literals inside the UI, so
 * changing a preset meant shipping a build. They now come from the server, which reads environment
 * overrides and falls back to the same defaults the app shipped with — with nothing configured the
 * UI behaves exactly as before.
 */

/** Presets the app shipped with; used whenever no valid override is configured. */
export const DEFAULT_TOPUP_PRESETS: readonly number[] = [50_000, 100_000, 500_000, 1_000_000];
export const DEFAULT_MINIMUM_TOPUP = 1_000;
const MAX_PRESETS = 8;

export type CustomerAppConfig = {
  topup: {
    presets: number[];
    minimum: number;
  };
  walletActions: WalletQuickAction[];
};

/**
 * Parses `DJIWA_TOPUP_PRESETS` ("50000,100000"). Invalid or unusable input falls back to the
 * shipped presets rather than producing an empty selector in production.
 */
export function parseTopupPresets(raw: string | undefined | null): number[] {
  if (!raw) return [...DEFAULT_TOPUP_PRESETS];
  const parsed = raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isSafeInteger(value) && value >= DEFAULT_MINIMUM_TOPUP);
  const unique = [...new Set(parsed)].sort((a, b) => a - b).slice(0, MAX_PRESETS);
  return unique.length > 0 ? unique : [...DEFAULT_TOPUP_PRESETS];
}

export function parseMinimumTopup(raw: string | undefined | null): number {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= DEFAULT_MINIMUM_TOPUP
    ? value
    : DEFAULT_MINIMUM_TOPUP;
}

/**
 * Parses `DJIWA_WALLET_ACTIONS_ENABLED` ("Isi Saldo,Riwayat,Bantuan").
 *
 * Unset means "keep the shipped support flags"; an explicit list turns exactly those actions on, so
 * operations can stage a launch without editing the UI.
 */
export function resolveWalletActions(raw: string | undefined | null): WalletQuickAction[] {
  if (raw === undefined || raw === null || raw.trim() === "") return [...WALLET_ACTIONS];
  const enabled = new Set(
    raw
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
  return WALLET_ACTIONS.map((action) => ({
    ...action,
    supported: enabled.has(action.label.toLowerCase()),
  }));
}

export function readCustomerAppConfig(env: Record<string, string | undefined>): CustomerAppConfig {
  return {
    topup: {
      presets: parseTopupPresets(env["DJIWA_TOPUP_PRESETS"]),
      minimum: parseMinimumTopup(env["DJIWA_TOPUP_MINIMUM"]),
    },
    walletActions: resolveWalletActions(env["DJIWA_WALLET_ACTIONS_ENABLED"]),
  };
}
