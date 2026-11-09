import type { Named } from "./traffic-dashboard";

export { formatAdminDateTime } from "./admin-display";

/** Share of the total, for a list that should read as percentages. */
export function channelPercent(rows: Named[]): number[] {
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  return rows.map((r) => (total > 0 ? Math.round((r.value / total) * 100) : 0));
}
