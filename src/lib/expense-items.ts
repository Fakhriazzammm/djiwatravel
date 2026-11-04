/** Pure rules for editing the line items of an expense. No I/O, so they are easy to test. */

export type ExpenseTotals = {
  originalMinor: number;
  convertedMinor: number;
  /** Rate stored with the expense (original → trip currency), when it was in another currency. */
  rate: number | null;
  sameCurrency: boolean;
};

/**
 * Totals after one item changes by `delta` (original minor units). The rest of the receipt (tax,
 * service, rounding) is kept as it was, so removing an item lowers the total by exactly that item.
 * Returns null when the total would no longer be positive.
 */
export function totalsAfterDelta(totals: ExpenseTotals, delta: number) {
  const originalMinor = totals.originalMinor + delta;
  if (!Number.isFinite(originalMinor) || originalMinor <= 0) return null;
  const convertedMinor = totals.sameCurrency
    ? originalMinor
    : totals.rate && totals.rate > 0
      ? Math.max(1, Math.round(originalMinor * totals.rate))
      : Math.max(1, Math.round((totals.convertedMinor * originalMinor) / totals.originalMinor));
  return { originalMinor, convertedMinor };
}

/** What the items do not explain (tax, service, rounding): total minus the sum of items. */
export function itemsRemainder(totalMinor: number, itemAmounts: readonly number[]) {
  if (!itemAmounts.length) return 0;
  return totalMinor - itemAmounts.reduce((sum, amount) => sum + amount, 0);
}

export type ExpenseItem = { id: string; name: string; amountMinor: number; position: number };

export type ExpenseDetail = {
  id: string;
  tripId: string;
  description: string;
  transactionDate: string;
  categoryId: string | null;
  categoryName: string | null;
  originalCurrency: string;
  originalAmountMinor: number;
  convertedCurrency: string;
  convertedAmountMinor: number;
  exchangeRate: number | null;
  notes: string | null;
  receiptScanId: string | null;
  items: ExpenseItem[];
};

const NOTE_PREFIX = "Dari scan struk: ";
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "IDR", "CLP", "ISK", "HUF"]);

/** "25.000" or "12,50" (id-ID grouping) to minor units; null when it is not an amount. */
function amountToMinor(text: string, currency: string) {
  if (!/^\d[\d.,]*$/.test(text)) return null;
  const major = ZERO_DECIMAL.has(currency)
    ? Number(text.replace(/[.,]/g, ""))
    : Number(text.replace(/\./g, "").replace(",", "."));
  const minor = Math.round(major * 100);
  return Number.isFinite(minor) && minor > 0 ? minor : null;
}

/**
 * Older scanned expenses only kept their lines as text ("Dari scan struk: Latte Rp25.000, Tax Rp18.500").
 * This turns that note back into items. It returns null unless every part reads cleanly, so a
 * note that cannot be understood is left alone instead of guessed.
 */
export function parseItemsNote(notes: string | null | undefined, currency: string) {
  if (!notes?.startsWith(NOTE_PREFIX)) return null;
  const body = notes.slice(NOTE_PREFIX.length).trim();
  if (!body) return null;
  // Amounts end in a digit, so a comma-space after a digit separates two items.
  const parts = body.split(/(?<=\d), (?=\S)/);
  const items: Array<{ name: string; amountMinor: number }> = [];
  for (const part of parts) {
    const match = part.trim().match(/^(.+?)\s+(?:[A-Za-z]{3}\s|[^\s\d.,]{1,3}\s?)?(\d[\d.,]*)$/);
    const name = match?.[1]?.trim();
    const amountMinor = match?.[2] ? amountToMinor(match[2], currency) : null;
    if (!name || name.length > 160 || amountMinor === null) return null;
    items.push({ name, amountMinor });
  }
  return items.length && items.length <= 100 ? items : null;
}
