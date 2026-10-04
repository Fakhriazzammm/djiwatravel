// Djiwa pricing engine: supplier USD → IDR selling price. Configurable rules.
export const pricingConfig = {
  fxRate: 16500,
  fxBuffer: 0.03,
  paymentFeePct: 0.007,
  defaultMarkupPct: 0.35,
  minMarginIdr: 15000,
  countryMarkup: {} as Record<string, number>,
};

export function roundPsych(n: number) {
  // Rp97.400 → Rp99.000, Rp143.200 → Rp149.000
  const k = Math.ceil(n / 1000);
  const tens = Math.floor(k / 10) * 10;
  const last = k % 10;
  const end = last === 0 ? 0 : last <= 5 && k > 100 ? 5 : 9;
  const v = (end === 0 ? tens : tens + end) * 1000 - (end === 0 ? 1000 : 0);
  return Math.max(v, Math.ceil(n / 1000) * 1000 - 1000 > v ? Math.ceil(n / 1000) * 1000 : v) || k * 1000;
}

export function sellingPrice(supplierUsd: number, country: string) {
  const c = pricingConfig;
  const base = supplierUsd * c.fxRate * (1 + c.fxBuffer);
  const markup = c.countryMarkup[country] ?? c.defaultMarkupPct;
  const withMargin = Math.max(base * (1 + markup), base + c.minMarginIdr);
  const total = withMargin / (1 - c.paymentFeePct);
  const r = roundPsych(total);
  return r < total ? Math.ceil(total / 1000) * 1000 : r;
}

export const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");
