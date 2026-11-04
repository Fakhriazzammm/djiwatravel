/**
 * Scan struk pengeluaran. Pure helpers shared by the browser, the server and tests: the Admin
 * setting, the AI answer contract, the "does the sum of items match the total" check that keeps
 * misread receipts from being saved silently, and quota/cost arithmetic.
 */

export const RECEIPT_SCAN_SETTING_KEY = "receiptScan";

/** Models that can read images through the Helipod AI Gateway, cheapest first. */
export const RECEIPT_VISION_MODELS = [
  "glm-5.3-flash",
  "deepseek-v4.1-flash",
  "glm-5.3-flashx",
  "netra/deepseek-v4.1-flash",
] as const;

/** IDR per 1M tokens (input / output) from the gateway price list checked on 2026-11-04. */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "glm-5.3-flash": { input: 2670, output: 8900 },
  "glm-5.3-flashx": { input: 6586, output: 22250 },
  "deepseek-v4.1-flash": { input: 5340, output: 21360 },
  "netra/deepseek-v4.1-flash": { input: 6230, output: 26700 },
};

export type ReceiptScanConfig = {
  /** Kill switch: false hides "Scan struk"; manual expenses keep working. */
  enabled: boolean;
  /** Lets the traveler attach the receipt photo to the expense. */
  savePhoto: boolean;
  /** Read again with the stronger model when the items do not add up to the total. */
  retryStrongModel: boolean;
  /** Scans per customer per day (Asia/Jakarta). */
  dailyLimit: number;
  /** Photos per scan session. */
  maxPhotos: number;
  /** Largest accepted photo after compression, in MB. */
  maxMb: number;
  model: string;
  strongModel: string;
};

export const DEFAULT_RECEIPT_SCAN_CONFIG: ReceiptScanConfig = {
  enabled: true,
  savePhoto: true,
  retryStrongModel: true,
  dailyLimit: 30,
  maxPhotos: 10,
  maxMb: 6,
  model: "glm-5.3-flash",
  strongModel: "glm-5.3-flashx",
};

const intInRange = (value: unknown, min: number, max: number, label: string) => {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max)
    throw new Error(`receiptScan.${label} harus bilangan bulat ${min}-${max}`);
  return value as number;
};

export function parseReceiptScanConfig(value: unknown): ReceiptScanConfig {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("receiptScan harus berupa objek");
  const raw = value as Record<string, unknown>;
  for (const key of ["enabled", "savePhoto", "retryStrongModel"] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== "boolean")
      throw new Error(`receiptScan.${key} harus boolean`);
  }
  const d = DEFAULT_RECEIPT_SCAN_CONFIG;
  const model = raw["model"] === undefined ? d.model : raw["model"];
  const strongModel = raw["strongModel"] === undefined ? d.strongModel : raw["strongModel"];
  for (const [label, name] of [
    ["model", model],
    ["strongModel", strongModel],
  ] as const) {
    if (typeof name !== "string" || !(RECEIPT_VISION_MODELS as readonly string[]).includes(name))
      throw new Error(`receiptScan.${label} harus salah satu: ${RECEIPT_VISION_MODELS.join(", ")}`);
  }
  return {
    enabled: (raw["enabled"] as boolean | undefined) ?? d.enabled,
    savePhoto: (raw["savePhoto"] as boolean | undefined) ?? d.savePhoto,
    retryStrongModel: (raw["retryStrongModel"] as boolean | undefined) ?? d.retryStrongModel,
    dailyLimit:
      raw["dailyLimit"] === undefined
        ? d.dailyLimit
        : intInRange(raw["dailyLimit"], 1, 500, "dailyLimit"),
    maxPhotos:
      raw["maxPhotos"] === undefined
        ? d.maxPhotos
        : intInRange(raw["maxPhotos"], 1, 20, "maxPhotos"),
    maxMb: raw["maxMb"] === undefined ? d.maxMb : intInRange(raw["maxMb"], 1, 15, "maxMb"),
    model: model as string,
    strongModel: strongModel as string,
  };
}

/** Read path: a bad stored value falls back to the default instead of breaking the page. */
export function normalizeReceiptScanConfig(value: unknown): ReceiptScanConfig {
  try {
    return parseReceiptScanConfig(value);
  } catch {
    return DEFAULT_RECEIPT_SCAN_CONFIG;
  }
}

/* --------------------------------------------------------------------- reading a receipt */

export type ReceiptItem = { name: string; amount: number };
export type ReceiptRegion = { x: number; y: number; width: number; height: number };

/** What the AI read from the photo, cleaned. Amounts are in major units (¥1480, Rp 25000, $12.5). */
export type ReceiptRead = {
  isReceipt: boolean;
  readable: boolean;
  merchant: string | null;
  /** YYYY-MM-DD */
  date: string | null;
  /** ISO 4217, uppercase */
  currency: string | null;
  total: number | null;
  items: ReceiptItem[];
  /** The name of one of the trip's budget categories, when one fits. */
  categoryGuess: string | null;
  /** Fields the model was not sure about: merchant, date, total, currency, items. */
  uncertain: string[];
  /** Where the doubtful part is on the photo, 0..1 of the image. */
  region: ReceiptRegion | null;
  reason: string | null;
};

const text = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const number = (value: unknown) => {
  if (typeof value === "string") {
    const digits = value.replace(/[^\d.-]/g, "");
    if (!/\d/.test(digits)) return null;
    const n = Number(digits);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value !== "number") return null;
  return Number.isFinite(value) ? value : null;
};

let knownCurrencies: Set<string> | null = null;
/** True for a real ISO 4217 code (JPY), false for "yen" or "RP". */
const isCurrencyCode = (code: string) => {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  if (!knownCurrencies) {
    try {
      knownCurrencies = new Set(
        (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf(
          "currency",
        ),
      );
    } catch {
      knownCurrencies = new Set();
    }
  }
  return knownCurrencies.size === 0 || knownCurrencies.has(code);
};

/** Reads the model's JSON defensively: bad fields become null/empty, never an exception. */
export function cleanReceiptRead(raw: unknown): ReceiptRead | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const date = text(r["date"], 10);
  const currencyRaw = text(r["currency"], 8)?.toUpperCase() ?? null;
  const currency = currencyRaw && isCurrencyCode(currencyRaw) ? currencyRaw : null;
  const items = (Array.isArray(r["items"]) ? r["items"] : [])
    .map((item) => {
      const i = item as Record<string, unknown>;
      const name = text(i?.["name"], 120);
      const amount = number(i?.["amount"]);
      return name && amount !== null ? { name, amount } : null;
    })
    .filter((item): item is ReceiptItem => item !== null)
    .slice(0, 80);
  const regionRaw = r["region"] as Record<string, unknown> | null | undefined;
  const region = regionRaw
    ? {
        x: number(regionRaw["x"]),
        y: number(regionRaw["y"]),
        width: number(regionRaw["width"]),
        height: number(regionRaw["height"]),
      }
    : null;
  const validRegion =
    region &&
    [region.x, region.y, region.width, region.height].every(
      (n) => n !== null && n >= 0 && n <= 1,
    ) &&
    region.width! > 0 &&
    region.height! > 0
      ? (region as ReceiptRegion)
      : null;
  return {
    isReceipt: r["is_receipt"] !== false,
    readable: r["readable"] !== false,
    merchant: text(r["merchant"], 120),
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    currency,
    total: number(r["total"]),
    items,
    categoryGuess: text(r["category_guess"], 80),
    uncertain: (Array.isArray(r["uncertain"]) ? r["uncertain"] : [])
      .filter((f): f is string => typeof f === "string")
      .slice(0, 8),
    region: validRegion,
    reason: text(r["reason"], 200),
  };
}

/** The app keeps money as minor units (x100) for every currency. */
export const toMinor = (amount: number) => Math.round(amount * 100);

export type ReceiptValidation = {
  itemsSum: number;
  /** total - itemsSum, in major units (0 when they match). */
  difference: number;
  /** null when there are no items to compare. */
  matches: boolean | null;
  issues: string[];
  /** "ready" = safe to review quickly; "check" = a person should look. */
  status: "ready" | "check";
};

const dayNumber = (key: string) => Math.round(Date.parse(`${key}T00:00:00Z`) / 86_400_000);

/**
 * Cross-checks a read: sum of items vs total, a believable date and a known currency. A receipt
 * that fails any check is marked "check" so the traveler sees it before saving.
 */
export function validateReceipt(read: ReceiptRead, today: string): ReceiptValidation {
  const issues: string[] = [];
  const total = read.total;
  const itemsSum = read.items.reduce((sum, item) => sum + item.amount, 0);
  const sumMinor = toMinor(itemsSum);
  const diffMinor = total === null ? 0 : toMinor(total) - sumMinor;
  const matches = read.items.length && total !== null ? Math.abs(diffMinor) <= 1 : null;
  if (total === null || total <= 0) issues.push("Total tidak terbaca");
  if (matches === false) issues.push("Jumlah item tidak sama dengan total");
  if (!read.merchant) issues.push("Nama toko tidak terbaca");
  if (!read.date) issues.push("Tanggal tidak terbaca");
  else if (dayNumber(read.date) - dayNumber(today) > 1) issues.push("Tanggal di masa depan");
  else if (dayNumber(today) - dayNumber(read.date) > 400) issues.push("Tanggal terlalu lama");
  if (!read.currency) issues.push("Mata uang tidak dikenali");
  if (read.uncertain.length) issues.push("Sebagian tulisan kurang jelas");
  return {
    itemsSum,
    difference: matches === false ? diffMinor / 100 : 0,
    matches,
    issues,
    status: issues.length ? "check" : "ready",
  };
}

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "IDR", "CLP", "ISK", "HUF"]);

/** "¥1.480", "Rp 25.000", "$12,50" with the app's id-ID grouping. */
export function formatReceiptAmount(amount: number, currency: string) {
  const fractionDigits = ZERO_DECIMAL.has(currency) ? 0 : 2;
  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })
      .format(amount)
      .replace(/\s/g, " ");
  } catch {
    return `${currency} ${amount}`;
  }
}

/** "¥", "Rp", "$": the symbol shown before an amount in this currency. */
export function currencySymbol(currency: string) {
  try {
    return (
      new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
      })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value ?? currency
    );
  } catch {
    return currency;
  }
}

/** Start of "today" in Asia/Jakarta as an ISO instant, the window the daily quota counts in. */
export function jakartaDayStart(now: Date = new Date()) {
  const shifted = new Date(now.getTime() + 7 * 3_600_000);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(start - 7 * 3_600_000).toISOString();
}

export function estimateCostIdr(model: string, usage: { input: number; output: number }) {
  const price = MODEL_PRICES[model];
  if (!price) return 0;
  return (usage.input * price.input + usage.output * price.output) / 1_000_000;
}

/** Converts an amount to the trip currency; returns the minor units to store. */
export function convertToTripMinor(amount: number, rate: number) {
  return Math.max(1, Math.round(amount * rate * 100));
}

/* ------------------------------------------------------------------------ API contract */

export type ReceiptScanStatus = {
  /** Admin switch on AND the AI key is configured on the server. */
  available: boolean;
  savePhoto: boolean;
  maxPhotos: number;
  maxMb: number;
  dailyLimit: number;
  remaining: number;
};

export const UNAVAILABLE_RECEIPT_SCAN: ReceiptScanStatus = {
  available: false,
  savePhoto: false,
  maxPhotos: 10,
  maxMb: 6,
  dailyLimit: 0,
  remaining: 0,
};

export type ReceiptScanFailure = "limit" | "disabled" | "too_large" | "bad_image" | "unavailable";

export type ReceiptScanResponse =
  | {
      ok: true;
      scanId: string;
      status: "ready" | "check" | "unreadable" | "not_receipt";
      read: ReceiptRead | null;
      validation: ReceiptValidation | null;
      /** Matched id of one of the trip's budget categories. */
      categoryId: string | null;
      photoStored: boolean;
      escalated: boolean;
      remaining: number;
    }
  | { ok: false; code: ReceiptScanFailure; message: string; remaining?: number };
