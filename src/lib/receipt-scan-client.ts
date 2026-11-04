/**
 * Client-side model of the scan flow: one queued photo with its editable reading, and the pure
 * helpers the review screens use (validation while editing, totals, what gets saved). No browser
 * APIs here, so it is unit tested directly.
 */
import {
  convertToTripMinor,
  formatReceiptAmount,
  toMinor,
  validateReceipt,
  type ReceiptRead,
  type ReceiptRegion,
  type ReceiptValidation,
} from "./receipt-scan";

export type ScanItemStatus =
  "sending" | "ready" | "check" | "unreadable" | "not_receipt" | "failed" | "offline" | "limit";

export type ScanEdit = {
  merchant: string;
  date: string;
  currency: string;
  /** Major units as typed, e.g. "1480" or "12.5". */
  total: string;
  items: { name: string; amount: string }[];
  categoryId: string;
  rate: number | null;
  rateDate: string | null;
  rateSource: string | null;
  /** The traveler typed the rate by hand. */
  rateManual: boolean;
  /** Anything was changed after the AI read it. */
  edited: boolean;
};

export type ScanItem = {
  id: string;
  /** Object URL of the compressed photo, for thumbnails and the check screen. */
  url: string;
  status: ScanItemStatus;
  message?: string;
  scanId?: string;
  edit?: ScanEdit;
  /** Where the doubtful part is on the photo. */
  region?: ReceiptRegion | null;
  photoStored?: boolean;
  skipped: boolean;
};

export const parseAmount = (value: string) => {
  const n = Number(value.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && /\d/.test(value) ? n : null;
};

export function makeEdit(
  read: ReceiptRead | null,
  categoryId: string | null,
  tripCurrency: string,
  today: string,
): ScanEdit {
  return {
    merchant: read?.merchant ?? "",
    date: read?.date ?? today,
    currency: read?.currency ?? tripCurrency,
    total: read?.total !== null && read?.total !== undefined ? String(read.total) : "",
    items: (read?.items ?? []).map((item) => ({ name: item.name, amount: String(item.amount) })),
    categoryId: categoryId ?? "",
    rate: null,
    rateDate: null,
    rateSource: null,
    rateManual: false,
    edited: false,
  };
}

/** The edited fields as a ReceiptRead again, so the same validation runs while the traveler types. */
export function editToRead(edit: ScanEdit): ReceiptRead {
  return {
    isReceipt: true,
    readable: true,
    merchant: edit.merchant.trim() || null,
    date: edit.date || null,
    currency: edit.currency || null,
    total: parseAmount(edit.total),
    items: edit.items.flatMap((item) => {
      const amount = parseAmount(item.amount);
      return item.name.trim() && amount !== null ? [{ name: item.name.trim(), amount }] : [];
    }),
    categoryGuess: null,
    uncertain: [],
    region: null,
    reason: null,
  };
}

export const editedValidation = (edit: ScanEdit, today: string): ReceiptValidation =>
  validateReceipt(editToRead(edit), today);

/** "¥680 + ¥800 = ¥1.480" when the items match the total, else the gap. */
export function matchLine(edit: ScanEdit, validation: ReceiptValidation) {
  const currency = edit.currency;
  const parts = editToRead(edit).items.map((item) => formatReceiptAmount(item.amount, currency));
  const total = parseAmount(edit.total);
  if (validation.matches === true && total !== null)
    return {
      ok: true as const,
      text: `${parts.join(" + ")} = ${formatReceiptAmount(total, currency)}, cocok dengan total`,
    };
  if (validation.matches === false && total !== null)
    return {
      ok: false as const,
      text: `Item ${formatReceiptAmount(validation.itemsSum, currency)}, total ${formatReceiptAmount(total, currency)}. Selisih ${formatReceiptAmount(Math.abs(validation.difference), currency)}, mungkin ada yang terlewat.`,
    };
  return null;
}

/** Amount in the trip currency (minor units) or null while the rate is unknown. */
export function convertedMinor(edit: ScanEdit, tripCurrency: string) {
  const total = parseAmount(edit.total);
  if (total === null || total <= 0) return null;
  if (edit.currency === tripCurrency) return toMinor(total);
  if (!edit.rate) return null;
  return convertToTripMinor(total, edit.rate);
}

/** Why a reviewed receipt cannot be saved yet, or null when it can. */
export function saveBlocker(edit: ScanEdit, tripCurrency: string, today: string) {
  const v = editedValidation(edit, today);
  if (!edit.merchant.trim()) return "Isi nama toko";
  if (parseAmount(edit.total) === null || (parseAmount(edit.total) ?? 0) <= 0) return "Isi total";
  if (!edit.date) return "Isi tanggal";
  if (edit.currency !== tripCurrency && !edit.rate) return "Isi kurs";
  if (v.issues.includes("Tanggal di masa depan")) return "Tanggal di masa depan";
  return null;
}

/** The receipt's lines as structured items (original currency, minor units), kept so each can be edited later. */
export const editLineItems = (edit: ScanEdit) =>
  editToRead(edit)
    .items.filter((item) => item.amount > 0)
    .slice(0, 100)
    .map((item) => ({ name: item.name.slice(0, 160), amountMinor: toMinor(item.amount) }));

export const itemsNote = (edit: ScanEdit) => {
  const lines = editToRead(edit)
    .items.map((item) => `${item.name} ${formatReceiptAmount(item.amount, edit.currency)}`)
    .join(", ");
  return `Dari scan struk${lines ? `: ${lines}` : ""}`.slice(0, 2000);
};

/** Items still counted in the batch: read successfully and not skipped. */
export const reviewable = (items: ScanItem[]) =>
  items.filter((item) => (item.status === "ready" || item.status === "check") && item.edit);
export const includedForSave = (items: ScanItem[]) =>
  reviewable(items).filter((item) => !item.skipped);

export function batchTotalMinor(items: ScanItem[], tripCurrency: string) {
  return includedForSave(items).reduce(
    (sum, item) => sum + (item.edit ? (convertedMinor(item.edit, tripCurrency) ?? 0) : 0),
    0,
  );
}
