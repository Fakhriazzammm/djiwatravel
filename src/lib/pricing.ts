// Djiwa pricing engine: supplier USD → IDR selling price. Configurable rules.
export const pricingConfig = {
  fxRate: 16500,
  fxBuffer: 0.03,
  paymentFeePct: 0.007,
  defaultMarkupPct: 0.35,
  minMarginIdr: 15000,
  countryMarkup: {} as Record<string, number>,
};

// Psychological rounding: Rp97.400 → Rp99.000, Rp143.200 → Rp149.000
export function roundPsych(n: number) {
  const k = Math.ceil(n / 1000);
  const last = k % 10;
  const up = last === 9 ? k : k - last + 9;
  // For larger amounts, allow a ...5 ending when it's closer
  const five = k - last + 5;
  return (last <= 5 && k >= 100 && five >= k ? five : up) * 1000;
}

export function sellingPrice(supplierUsd: number, country: string) {
  const c = pricingConfig;
  const base = supplierUsd * c.fxRate * (1 + c.fxBuffer);
  const markup = c.countryMarkup[country] ?? c.defaultMarkupPct;
  const withMargin = Math.max(base * (1 + markup), base + c.minMarginIdr);
  return roundPsych(withMargin / (1 - c.paymentFeePct));
}

export const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");
