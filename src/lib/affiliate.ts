/** Pure affiliate rules shared by the customer page, admin console and server handlers. */

export const AFFILIATE_COOKIE = "djiwa_ref";
export const AFFILIATE_SETTING_KEY = "affiliate";

export type AffiliateConfig = {
  enabled: boolean;
  /** Percent of the order's markup (margin), never of the selling price. */
  commissionPercent: number;
  /** Days a commission stays pending before it can be approved. */
  holdDays: number;
  minPayoutIdr: number;
  cookieDays: number;
};

export const DEFAULT_AFFILIATE_CONFIG: AffiliateConfig = {
  enabled: true,
  commissionPercent: 10,
  holdDays: 14,
  minPayoutIdr: 50_000,
  cookieDays: 30,
};

const num = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** Customer-safe: unknown or malformed input falls back to the defaults field by field. */
export function normalizeAffiliateConfig(value: unknown): AffiliateConfig {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const d = DEFAULT_AFFILIATE_CONFIG;
  return {
    enabled: typeof raw["enabled"] === "boolean" ? raw["enabled"] : d.enabled,
    commissionPercent: num(raw["commissionPercent"], d.commissionPercent, 0, 100),
    holdDays: Math.round(num(raw["holdDays"], d.holdDays, 0, 90)),
    minPayoutIdr: Math.round(num(raw["minPayoutIdr"], d.minPayoutIdr, 0, 100_000_000)),
    cookieDays: Math.round(num(raw["cookieDays"], d.cookieDays, 1, 180)),
  };
}

/** Admin write: strict, so a bad value is rejected instead of silently replaced. */
export function parseAffiliateConfig(value: unknown): AffiliateConfig {
  if (!value || typeof value !== "object") throw new Error("Konfigurasi affiliate tidak valid");
  const raw = value as Record<string, unknown>;
  if (typeof raw["enabled"] !== "boolean") throw new Error("enabled harus boolean");
  const strict = (key: string, min: number, max: number, integer: boolean) => {
    const n = Number(raw[key]);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n)))
      throw new Error(`${key} harus ${integer ? "bilangan bulat " : ""}${min}-${max}`);
    return n;
  };
  return {
    enabled: raw["enabled"],
    commissionPercent: strict("commissionPercent", 0, 100, false),
    holdDays: strict("holdDays", 0, 90, true),
    minPayoutIdr: strict("minPayoutIdr", 0, 100_000_000, true),
    cookieDays: strict("cookieDays", 1, 180, true),
  };
}

/** Commission on the margin, rounded down to whole rupiah. */
export function computeCommissionIdr(markupAmount: number, percent: number): number {
  if (!Number.isFinite(markupAmount) || !Number.isFinite(percent)) return 0;
  if (markupAmount <= 0 || percent <= 0) return 0;
  return Math.floor((markupAmount * Math.min(percent, 100)) / 100);
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const AFFILIATE_CODE_PATTERN = /^[A-Z0-9-]{4,24}$/;
const RESERVED = new Set(["ADMIN", "DJIWA", "SUPPORT", "TEST", "NULL", "UNDEFINED", "STAFF"]);

export function normalizeAffiliateCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return AFFILIATE_CODE_PATTERN.test(code) ? code : null;
}

/** Custom slug chosen by the member: letters/digits only, 4-16 chars, not reserved. */
export function validateCustomCode(value: unknown): string {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{4,16}$/.test(code)) throw new Error("Kode harus 4-16 huruf atau angka");
  if (RESERVED.has(code)) throw new Error("Kode ini tidak tersedia");
  return code;
}

export function generateAffiliateCode(random: (max: number) => number): string {
  let suffix = "";
  for (let i = 0; i < 5; i += 1) suffix += CODE_ALPHABET[random(CODE_ALPHABET.length)];
  return `DJIWA-${suffix}`;
}

export function affiliateLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/?ref=${encodeURIComponent(code)}`;
}

export type CommissionStatus = "pending" | "approved" | "reversed" | "paid";
export type PayoutStatus = "requested" | "approved" | "paid" | "rejected";

export const COMMISSION_LABEL: Record<CommissionStatus, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  reversed: "Dibatalkan",
  paid: "Dicairkan",
};
export const PAYOUT_LABEL: Record<PayoutStatus, string> = {
  requested: "Diajukan",
  approved: "Disetujui",
  paid: "Dibayar",
  rejected: "Ditolak",
};

export type BankDestination = { bankName: string; accountName: string; accountNumber: string };

export function parseBankDestination(value: unknown): BankDestination {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const bankName = String(raw["bankName"] ?? "").trim();
  const accountName = String(raw["accountName"] ?? "").trim();
  const accountNumber = String(raw["accountNumber"] ?? "").replace(/\s+/g, "");
  if (bankName.length < 2 || bankName.length > 60) throw new Error("Nama bank wajib diisi");
  if (accountName.length < 2 || accountName.length > 100)
    throw new Error("Nama pemilik rekening wajib diisi");
  if (!/^[0-9]{5,24}$/.test(accountNumber)) throw new Error("Nomor rekening harus 5-24 digit");
  return { bankName, accountName, accountNumber };
}

/** Shows only the tail of an account number; the full value never leaves the admin payout row. */
export function maskAccountNumber(value: string): string {
  return value.length <= 4
    ? "••••"
    : `${"•".repeat(Math.min(6, value.length - 4))}${value.slice(-4)}`;
}

/** "Rina Aulia" → "Rina A."; falls back to a neutral label so no identity leaks. */
export function maskedReferee(displayName: string | null | undefined): string {
  const parts = (displayName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Teman";
  const first = parts[0]!;
  const initial = parts[1]?.[0];
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}
