export type MarginRow = {
  country: string;
  packageCode: string;
  sellingPriceIdr: number;
  providerCostIdr: number;
  fxRateIdr: number;
  fxBaselineIdr: number;
};
export type MarginSummary = {
  key: string;
  country: string;
  packageCode: string;
  salesIdr: number;
  providerCostIdr: number;
  marginIdr: number;
  marginPercent: number;
  fxImpactIdr: number;
};

export function summarizeMargin(rows: MarginRow[]): MarginSummary[] {
  const grouped = new Map<string, MarginSummary>();
  for (const row of rows) {
    const key = `${row.country}:${row.packageCode}`;
    const current = grouped.get(key) ?? {
      key,
      country: row.country,
      packageCode: row.packageCode,
      salesIdr: 0,
      providerCostIdr: 0,
      marginIdr: 0,
      marginPercent: 0,
      fxImpactIdr: 0,
    };
    current.salesIdr += row.sellingPriceIdr;
    current.providerCostIdr += row.providerCostIdr;
    current.marginIdr = current.salesIdr - current.providerCostIdr;
    current.marginPercent = current.salesIdr ? (current.marginIdr / current.salesIdr) * 100 : 0;
    current.fxImpactIdr += Math.round(
      (row.fxRateIdr - row.fxBaselineIdr) * (row.providerCostIdr / Math.max(row.fxRateIdr, 1)),
    );
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => a.marginIdr - b.marginIdr);
}

export type PaymentSortKey = "createdAt" | "updatedAt" | "amount" | "status";
export const MAX_PAYMENT_PAGE = 1000;

export type PaymentQuery = {
  query: string;
  status: string;
  sort: PaymentSortKey;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
};

export function normalizePaymentQuery(input: Partial<PaymentQuery> = {}): PaymentQuery {
  const allowedSort: PaymentSortKey[] = ["createdAt", "updatedAt", "amount", "status"];
  const sort = allowedSort.includes(input.sort as PaymentSortKey)
    ? (input.sort as PaymentSortKey)
    : "updatedAt";
  const page =
    Number.isInteger(input.page) && (input.page as number) >= 0
      ? Math.min(input.page as number, MAX_PAYMENT_PAGE)
      : 0;
  const pageSize =
    Number.isInteger(input.pageSize) && (input.pageSize as number) > 0
      ? Math.min(input.pageSize as number, 50)
      : 50;
  return {
    query: typeof input.query === "string" ? input.query.trim().slice(0, 100) : "",
    status: typeof input.status === "string" && input.status.length <= 80 ? input.status : "ALL",
    sort,
    dir: input.dir === "asc" ? "asc" : "desc",
    page,
    pageSize,
  };
}

export function periodDateRange(
  period: "daily" | "weekly" | "monthly",
  now: Date,
): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
  const day = new Date(
    Date.UTC(Number(parts["year"]), Number(parts["month"]) - 1, Number(parts["day"])),
  );
  let startDay: Date;
  if (period === "monthly")
    startDay = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
  else if (period === "weekly") {
    const mondayDelta = (day.getUTCDay() + 6) % 7;
    startDay = new Date(day.getTime() - mondayDelta * 86400000);
  } else startDay = day;
  const endDay =
    period === "daily"
      ? new Date(startDay.getTime() + 86400000)
      : period === "weekly"
        ? new Date(startDay.getTime() + 7 * 86400000)
        : new Date(Date.UTC(startDay.getUTCFullYear(), startDay.getUTCMonth() + 1, 1));
  const offsetMs = 7 * 60 * 60 * 1000;
  return {
    start: new Date(startDay.getTime() - offsetMs),
    end: new Date(endDay.getTime() - offsetMs),
  };
}
