/** Default share of the total budget per category, by category_key. */
const DEFAULT_SHARES: Record<string, number> = {
  penerbangan: 30,
  akomodasi: 25,
  "makan-&-minum": 15,
  transportasi: 8,
  aktivitas: 8,
  belanja: 6,
  "esim-&-internet": 2,
  visa: 2,
  asuransi: 2,
  darurat: 2,
};

/** Splits what is still unallocated over the categories that have no limit yet. */
export function autoSplit(
  rows: Array<{ id: string; key: string; limit: number }>,
  budget: number,
  unit: number,
): Record<string, number> {
  const free = budget - rows.reduce((sum, row) => sum + row.limit, 0);
  const targets = rows.filter((row) => row.limit === 0 && (DEFAULT_SHARES[row.key] ?? 0) > 0);
  const weight = targets.reduce((sum, row) => sum + (DEFAULT_SHARES[row.key] ?? 0), 0);
  if (free <= 0 || weight === 0 || unit <= 0) return {};
  const out: Record<string, number> = {};
  let given = 0;
  for (const row of targets) {
    const raw = (free * (DEFAULT_SHARES[row.key] ?? 0)) / weight;
    out[row.id] = Math.floor(raw / unit) * unit;
    given += out[row.id] ?? 0;
  }
  const first = targets[0];
  if (first) out[first.id] = (out[first.id] ?? 0) + Math.floor((free - given) / unit) * unit;
  return out;
}
