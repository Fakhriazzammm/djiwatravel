export type MayarSnapshot = {
  invoiceId?: string;
  transactionId?: string;
  paymentUrl?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Reads the Mayar invoice reference out of an order price snapshot.
 *
 * The invoice step stores it nested under `mayar` (invoiceId/transactionId/
 * paymentUrl). Older rows used flat keys, so both shapes are accepted — reading
 * the nested object is what lets a returning customer still see their payment
 * link after a page reload.
 */
export function readMayarSnapshot(priceSnapshot: unknown): MayarSnapshot {
  const snapshot = asRecord(priceSnapshot);
  const nested = asRecord(snapshot["mayar"]);
  const invoiceId = readString(nested, "invoiceId") ?? readString(snapshot, "mayarInvoiceId");
  const transactionId =
    readString(nested, "transactionId") ?? readString(snapshot, "mayarTransactionId");
  const paymentUrl =
    readString(nested, "paymentUrl") ??
    readString(snapshot, "mayarPaymentUrl") ??
    readString(snapshot, "paymentUrl");
  return {
    ...(invoiceId ? { invoiceId } : {}),
    ...(transactionId ? { transactionId } : {}),
    ...(paymentUrl ? { paymentUrl } : {}),
  };
}

/**
 * Normalizes a provider timestamp into an ISO string.
 *
 * Mayar returns epoch milliseconds (for example 1791635715057) for
 * createdAt/updatedAt, which must never be handed to a timestamptz cast as a
 * bare number string; string timestamps are accepted as-is when parseable.
 */
export function toIsoTimestamp(value: unknown, fallback = new Date()): string {
  const fromNumber = (input: number) => {
    const ms = input > 1e11 ? input : input * 1000;
    const date = new Date(ms);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  };
  if (typeof value === "number" && Number.isFinite(value)) {
    return fromNumber(value) ?? fallback.toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback.toISOString();
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return fromNumber(numeric) ?? fallback.toISOString();
  }
  return fallback.toISOString();
}
