export type MarginRow = { country: string; packageCode: string; sellingPriceIdr: number; providerCostIdr: number; fxRateIdr: number; fxBaselineIdr: number };
export type MarginSummary = { key: string; country: string; packageCode: string; salesIdr: number; providerCostIdr: number; marginIdr: number; marginPercent: number; fxImpactIdr: number };

export function summarizeMargin(rows: MarginRow[]): MarginSummary[] {
  const grouped = new Map<string, MarginSummary>();
  for (const row of rows) {
    const key = `${row.country}:${row.packageCode}`;
    const current = grouped.get(key) ?? { key, country: row.country, packageCode: row.packageCode, salesIdr: 0, providerCostIdr: 0, marginIdr: 0, marginPercent: 0, fxImpactIdr: 0 };
    current.salesIdr += row.sellingPriceIdr;
    current.providerCostIdr += row.providerCostIdr;
    current.marginIdr = current.salesIdr - current.providerCostIdr;
    current.marginPercent = current.salesIdr ? (current.marginIdr / current.salesIdr) * 100 : 0;
    current.fxImpactIdr += Math.round((row.fxRateIdr - row.fxBaselineIdr) * (row.providerCostIdr / Math.max(row.fxRateIdr, 1)));
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => a.marginIdr - b.marginIdr);
}
