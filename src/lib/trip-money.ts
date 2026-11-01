/**
 * Money for trip screens. Trip rows can carry an empty or malformed currency code, and
 * `Intl.NumberFormat` throws on those, which takes the whole trip page down. Any value that is
 * not a three-letter code falls back to IDR, the trip default.
 */
export function tripCurrencyCode(value: unknown): string {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(code) ? code : "IDR";
}

export function formatTripMoney(amountMinor: unknown, currency: unknown): string {
  const amount = Number(amountMinor ?? 0) / 100;
  const safe = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: tripCurrencyCode(currency),
      maximumFractionDigits: 0,
    }).format(safe);
  } catch {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(safe);
  }
}
