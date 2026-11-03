import { formatTripMoney, tripCurrencyCode } from "@/lib/trip-money";

/** "3 jt" / "750 rb" for Rupiah; full formatting for other currencies. */
export function compactMoney(minor: number, currency: string) {
  if (tripCurrencyCode(currency) !== "IDR") return formatTripMoney(minor, currency);
  const value = minor / 100;
  const trim = (n: number) => String(Number(n.toFixed(1))).replace(".", ",");
  if (value >= 1_000_000) return `${trim(value / 1_000_000)} jt`;
  if (value >= 1_000) return `${trim(value / 1_000)} rb`;
  return String(Math.round(value));
}

/** One stepper press, in whole currency units (not minor). */
export const stepFor = (currency: string) =>
  ({ IDR: 100_000, KRW: 100_000, JPY: 10_000, USD: 50, SGD: 50 })[tripCurrencyCode(currency)] ??
  100_000;
