/**
 * Admin analytics: shared types and the pure calculations behind the Pengguna, Funnel, Pendapatan
 * and Destinasi tabs. Nothing here touches the database, so every rule is unit-tested.
 */

export const INSIGHT_RANGES = ["7h", "30h", "90h", "365h"] as const;
export type InsightRange = (typeof INSIGHT_RANGES)[number];
export const INSIGHT_RANGE_DAYS: Record<InsightRange, number> = {
  "7h": 7,
  "30h": 30,
  "90h": 90,
  "365h": 365,
};
export const INSIGHT_RANGE_LABEL: Record<InsightRange, string> = {
  "7h": "7 hari",
  "30h": "30 hari",
  "90h": "90 hari",
  "365h": "1 tahun",
};

export const INSIGHT_TABS = ["pengguna", "funnel", "pendapatan", "destinasi"] as const;
export type InsightTab = (typeof INSIGHT_TABS)[number];
export const INSIGHT_TAB_LABEL: Record<InsightTab, string> = {
  pengguna: "Pengguna",
  funnel: "Funnel",
  pendapatan: "Pendapatan",
  destinasi: "Destinasi",
};

/** Segments below this size are hidden from group breakdowns so a single person is never exposed. */
export const MIN_GROUP_SIZE = 3;

export type Named = { label: string; value: number };
export type Point = { label: string; value: number };

// ---------------------------------------------------------------- RFM segments

export type RfmSegment =
  "champion" | "loyal" | "new" | "at_risk" | "sleeping" | "lost" | "prospect";

export const RFM_LABEL: Record<RfmSegment, string> = {
  champion: "Juara",
  loyal: "Setia",
  new: "Baru",
  at_risk: "Berisiko",
  sleeping: "Tidur",
  lost: "Hilang",
  prospect: "Calon (belum beli)",
};

export const RFM_HINT: Record<RfmSegment, string> = {
  champion: "3+ pembelian, aktif dalam 60 hari",
  loyal: "2+ pembelian, aktif dalam 120 hari",
  new: "Pembelian pertama dalam 30 hari",
  at_risk: "Pernah sering beli, sepi 60–180 hari",
  sleeping: "Terakhir beli 90–365 hari lalu",
  lost: "Terakhir beli lebih dari 365 hari lalu",
  prospect: "Punya akun tetapi belum pernah membayar",
};

export const RFM_ORDER: RfmSegment[] = [
  "champion",
  "loyal",
  "new",
  "at_risk",
  "sleeping",
  "lost",
  "prospect",
];

/** Assigns exactly one segment from purchase count and days since the last paid purchase. */
export function rfmSegment(paidOrders: number, daysSinceLast: number | null): RfmSegment {
  if (paidOrders <= 0 || daysSinceLast === null) return "prospect";
  if (daysSinceLast > 365) return "lost";
  if (paidOrders >= 3 && daysSinceLast <= 60) return "champion";
  if (paidOrders >= 2 && daysSinceLast <= 120) return "loyal";
  if (paidOrders === 1 && daysSinceLast <= 30) return "new";
  if (paidOrders >= 2 && daysSinceLast > 120 && daysSinceLast <= 365) return "at_risk";
  if (daysSinceLast > 90) return "sleeping";
  return paidOrders >= 2 ? "loyal" : "new";
}

// ---------------------------------------------------------------- health score

export type HealthInput = {
  paidOrders: number;
  daysSinceLast: number | null;
  openSupport: number;
  refunds: number;
  failedOrders: number;
};

export type HealthBand = "sehat" | "perlu_perhatian" | "berisiko";

/** 0–100. Recency and repeat purchases lift it; open cases, refunds and failures lower it. */
export function healthScore(input: HealthInput): { score: number; band: HealthBand } {
  let score = 50;
  if (input.daysSinceLast !== null) {
    if (input.daysSinceLast <= 30) score += 25;
    else if (input.daysSinceLast <= 90) score += 10;
    else if (input.daysSinceLast > 180) score -= 20;
  } else {
    score -= 10;
  }
  score += Math.min(input.paidOrders, 4) * 5;
  score -= Math.min(input.openSupport, 3) * 10;
  score -= Math.min(input.refunds, 2) * 15;
  score -= Math.min(input.failedOrders, 3) * 8;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, band: score >= 65 ? "sehat" : score >= 40 ? "perlu_perhatian" : "berisiko" };
}

export const HEALTH_LABEL: Record<HealthBand, string> = {
  sehat: "Sehat",
  perlu_perhatian: "Perlu perhatian",
  berisiko: "Berisiko",
};

// ---------------------------------------------------------------- cohorts

export type CohortRow = {
  /** ISO date of the first day of the cohort week. */
  cohort: string;
  size: number;
  /** retained[i] = people from the cohort who bought again i weeks after their first purchase. */
  retained: number[];
};

/**
 * Builds cohort rows from each buyer's first-purchase week and the weeks (since first purchase)
 * in which they bought. Week 0 is the acquisition week and always equals the cohort size.
 */
export function buildCohorts(
  buyers: { firstWeek: string; weeksActive: number[] }[],
  maxWeeks: number,
  currentWeekIndexByCohort: (cohort: string) => number,
): CohortRow[] {
  const map = new Map<string, CohortRow>();
  for (const b of buyers) {
    const row = map.get(b.firstWeek) ?? {
      cohort: b.firstWeek,
      size: 0,
      retained: Array.from({ length: maxWeeks + 1 }, () => 0),
    };
    row.size += 1;
    const seen = new Set<number>([0, ...b.weeksActive]);
    for (const w of seen) if (w >= 0 && w <= maxWeeks) row.retained[w] = (row.retained[w] ?? 0) + 1;
    map.set(b.firstWeek, row);
  }
  return [...map.values()]
    .sort((a, b) => a.cohort.localeCompare(b.cohort))
    .map((row) => {
      const reach = currentWeekIndexByCohort(row.cohort);
      // Weeks that have not happened yet stay empty instead of looking like 0% retention.
      return { ...row, retained: row.retained.map((v, i) => (i <= reach ? v : -1)) };
    });
}

/** Percent (0–100, one decimal) or null when the cell is in the future or the cohort is empty. */
export function retentionPct(size: number, retained: number): number | null {
  if (retained < 0 || size <= 0) return null;
  return Math.round((retained / size) * 1000) / 10;
}

// ---------------------------------------------------------------- funnel

export type FunnelStep = { key: string; label: string; value: number };
export type FunnelStepView = FunnelStep & {
  /** Share of the first step. */
  ofTop: number | null;
  /** Share of the previous step. */
  ofPrev: number | null;
  dropped: number;
};

export function funnelView(steps: FunnelStep[]): FunnelStepView[] {
  const top = steps[0]?.value ?? 0;
  return steps.map((s, i) => {
    const prev = i === 0 ? s.value : (steps[i - 1]?.value ?? 0);
    return {
      ...s,
      ofTop: top > 0 ? Math.round((s.value / top) * 1000) / 10 : null,
      ofPrev: prev > 0 ? Math.round((s.value / prev) * 1000) / 10 : null,
      dropped: i === 0 ? 0 : Math.max(0, prev - s.value),
    };
  });
}

/** The step with the largest relative loss, ignoring the first step. */
export function biggestLeak(view: FunnelStepView[]): FunnelStepView | null {
  let worst: FunnelStepView | null = null;
  for (const s of view.slice(1)) {
    if (s.ofPrev === null) continue;
    if (!worst || (s.ofPrev ?? 100) < (worst.ofPrev ?? 100)) worst = s;
  }
  return worst && (worst.ofPrev ?? 100) < 100 ? worst : null;
}

// ---------------------------------------------------------------- shared formatting

export function pctOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

export function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Plain CSV with a UTF-8 BOM so Excel opens Indonesian text correctly. Formula cells are neutralised. */
export function toCsv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    let s = v === null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `\uFEFF${rows.map((r) => r.map(cell).join(",")).join("\r\n")}`;
}

// ---------------------------------------------------------------- payload types

export type UsersInsight = {
  totals: {
    members: number;
    guests: number;
    newMembers: number;
    previousNewMembers: number;
    buyers: number;
    repeatBuyers: number;
    repeatRatePct: number | null;
    avgOrdersPerBuyer: number | null;
    avgLtvIdr: number | null;
    medianDaysBetweenOrders: number | null;
  };
  signups: Point[];
  segments: { segment: RfmSegment; label: string; hint: string; count: number; revenue: number }[];
  cohorts: CohortRow[];
  activation: FunnelStep[];
  devices: Named[];
  hours: Point[];
  weekdays: Point[];
  sources: Named[];
  topCustomers: {
    subject: string;
    name: string;
    orders: number;
    revenue: number;
    lastOrderAt: string | null;
    segment: RfmSegment;
    health: { score: number; band: HealthBand };
    customerId: string | null;
  }[];
  atRisk: {
    subject: string;
    name: string;
    orders: number;
    revenue: number;
    daysSinceLast: number;
    customerId: string | null;
  }[];
};

export type FunnelInsight = {
  steps: FunnelStep[];
  previous: FunnelStep[];
  byDevice: { label: string; steps: FunnelStep[] }[];
  byChannel: { label: string; steps: FunnelStep[] }[];
  abandoned: { count: number; valueIdr: number };
  payment: {
    paid: number;
    pending: number;
    expired: number;
    failed: number;
    avgMinutesToPay: number | null;
    byProvider: { label: string; paid: number; total: number }[];
  };
  daily: { label: string; visitors: number; checkout: number; paid: number }[];
};

export type RevenueInsight = {
  gross: number;
  previousGross: number;
  orders: number;
  previousOrders: number;
  aov: number;
  cost: number | null;
  margin: number | null;
  refundCount: number;
  refundRatePct: number | null;
  series: Point[];
  previousSeries: Point[];
  byProduct: (Named & { orders: number })[];
  byChannel: (Named & { orders: number })[];
  byWeekday: Point[];
  byHour: Point[];
  newVsReturning: {
    newCustomers: number;
    returning: number;
    newRevenue: number;
    returningRevenue: number;
  };
  preorder: { open: number; nearDeadline: number; overdue: number };
};

export type DestinationInsight = {
  rows: {
    code: string;
    views: number;
    visitors: number;
    orders: number;
    revenue: number;
    conversionPct: number | null;
  }[];
  opportunity: { code: string; views: number; visitors: number }[];
  searches: Named[];
  packages: { label: string; orders: number; revenue: number; quantity: number }[];
  unlimitedShare: { unlimited: number; limited: number };
};

export type InsightResult<T> = { data: T | null; error: string | null };

export type AnalyticsInsights = {
  range: InsightRange;
  tab: InsightTab;
  updatedAt: string;
  since: string;
  users?: InsightResult<UsersInsight>;
  funnel?: InsightResult<FunnelInsight>;
  revenue?: InsightResult<RevenueInsight>;
  destinations?: InsightResult<DestinationInsight>;
};
