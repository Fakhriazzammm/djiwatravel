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

export const INSIGHT_TABS = [
  "pengguna",
  "funnel",
  "pendapatan",
  "destinasi",
  "fitur",
  "operasional",
] as const;
export type InsightTab = (typeof INSIGHT_TABS)[number];
export const INSIGHT_TAB_LABEL: Record<InsightTab, string> = {
  pengguna: "Pengguna",
  funnel: "Funnel",
  pendapatan: "Pendapatan",
  destinasi: "Destinasi",
  fitur: "Fitur",
  operasional: "Operasional",
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
  range: string;
  /** The resolved window the numbers cover (WIB), for captions and charts. */
  window: {
    label: string;
    from: string;
    to: string;
    granularity: "hour" | "day";
    fromDay: string;
    toDay: string;
  };
  tab: InsightTab;
  updatedAt: string;
  since: string;
  users?: InsightResult<UsersInsight>;
  funnel?: InsightResult<FunnelInsight>;
  revenue?: InsightResult<RevenueInsight>;
  destinations?: InsightResult<DestinationInsight>;
  features?: InsightResult<FeaturesInsight>;
  operations?: InsightResult<OperationsInsight>;
  alerts: InsightAlert[];
};

// ---------------------------------------------------------------- features (phase 4)

export type FeaturesInsight = {
  travo: {
    conversations: number;
    previousConversations: number;
    activeUsers: number;
    userMessages: number;
    assistantMessages: number;
    messagesPerConversation: number | null;
    byScope: Named[];
    daily: Point[];
  };
  trips: {
    created: number;
    previousCreated: number;
    users: number;
    expenses: number;
    shares: number;
    receiptScans: number;
    daily: Point[];
  };
  shopping: {
    requests: number;
    previousRequests: number;
    funnel: FunnelStep[];
    medianFirstReplyMinutes: number | null;
    answeredWithinDuePct: number | null;
    waitingNow: number;
    overdueNow: number;
    byStatus: Named[];
  };
  feeds: {
    posts: number;
    comments: number;
    likes: number;
    byKind: Named[];
    byStatus: Named[];
    reportsOpen: number;
    reportsActioned: number;
    oldestPendingHours: number | null;
  };
  notifications: {
    created: number;
    readRatePct: number | null;
    byType: Named[];
    pushActive: number;
    delivery: Named[];
    pwa: Named[];
  };
};

// ---------------------------------------------------------------- operations (phase 5)

export type OperationsInsight = {
  support: {
    opened: number;
    previousOpened: number;
    openNow: number;
    medianFirstReplyMinutes: number | null;
    medianResolutionHours: number | null;
    oldestOpenDays: number | null;
    byCategory: Named[];
    byStatus: Named[];
    aging: Named[];
  };
  provisioning: {
    paid: number;
    ready: number;
    failed: number;
    failureRatePct: number | null;
    stuck: number;
    medianMinutesToReady: number | null;
    refundsOpen: number;
  };
  system: {
    workers: {
      name: string;
      ageMinutes: number | null;
      lastError: string | null;
      stale: boolean;
    }[];
    webhooks: Named[];
    deadLetters: number;
    emailQueued: number;
    emailFailed: number;
    paymentsUnknown: number;
  };
  team: { label: string; value: number }[];
};

// ---------------------------------------------------------------- alerts (phase 5)

export type AlertSeverity = "critical" | "warning" | "info";
export type InsightAlert = {
  key: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  href: string;
};

export type AlertInput = {
  revenue: number;
  previousRevenue: number;
  orders: number;
  previousOrders: number;
  refundCount: number;
  paidOrders: number;
  failedProvisioning: number;
  stuckProvisioning: number;
  deadLetters: number;
  staleWorkers: string[];
  emailFailed: number;
  preorderOverdue: number;
  preorderNear: number;
  supportOpenOver3d: number;
  shoppingOverdue: number;
  feedReportsOpen: number;
  paymentsUnknown: number;
};

/** Fixed, documented thresholds. Compared against the last 7 days vs the 7 days before. */
export const ALERT_RULES = {
  revenueDropPct: -30,
  minOrdersForTrend: 5,
  refundRatePct: 10,
  failureRatePct: 8,
} as const;

export function evaluateAlerts(i: AlertInput): InsightAlert[] {
  const out: InsightAlert[] = [];
  const add = (a: InsightAlert) => out.push(a);
  if (i.preorderOverdue > 0)
    add({
      key: "preorder-overdue",
      severity: "critical",
      title: `${i.preorderOverdue} preorder lewat tenggat`,
      detail: "Wajib dipenuhi atau ditinjau manual; tidak ada refund otomatis.",
      href: "/admin/preorders",
    });
  if (i.deadLetters > 0)
    add({
      key: "dead-letter",
      severity: "critical",
      title: `${i.deadLetters} webhook gagal permanen`,
      detail: "Kotak masuk webhook berisi dead letter yang perlu ditangani.",
      href: "/admin/settings",
    });
  if (i.staleWorkers.length > 0)
    add({
      key: "worker-stale",
      severity: "critical",
      title: `Worker tidak berdenyut: ${i.staleWorkers.join(", ")}`,
      detail: "Tidak ada denyut lebih dari 15 menit; antrean mungkin berhenti.",
      href: "/admin/settings",
    });
  if (i.paymentsUnknown > 0)
    add({
      key: "payment-unknown",
      severity: "warning",
      title: `${i.paymentsUnknown} pembayaran berstatus tidak pasti`,
      detail: "Perlu rekonsiliasi dengan provider pembayaran.",
      href: "/admin/payments",
    });
  if (i.stuckProvisioning > 0)
    add({
      key: "provisioning-stuck",
      severity: "warning",
      title: `${i.stuckProvisioning} eSIM tertahan di provisioning > 30 menit`,
      detail: "Periksa saldo provider dan log provisioning.",
      href: "/admin/provisioning",
    });
  const failRate = pctOf(i.failedProvisioning, Math.max(i.paidOrders, 1));
  if (
    i.paidOrders >= ALERT_RULES.minOrdersForTrend &&
    (failRate ?? 0) >= ALERT_RULES.failureRatePct
  )
    add({
      key: "provisioning-failure-rate",
      severity: "warning",
      title: `Tingkat gagal provisioning ${failRate}%`,
      detail: `Ambang ${ALERT_RULES.failureRatePct}% dari pesanan dibayar (7 hari).`,
      href: "/admin/provisioning",
    });
  const refundRate = pctOf(i.refundCount, Math.max(i.orders, 1));
  if (i.orders >= ALERT_RULES.minOrdersForTrend && (refundRate ?? 0) >= ALERT_RULES.refundRatePct)
    add({
      key: "refund-rate",
      severity: "warning",
      title: `Tingkat refund ${refundRate}%`,
      detail: `Ambang ${ALERT_RULES.refundRatePct}% dari pesanan (7 hari).`,
      href: "/admin/refunds",
    });
  const drop = deltaPct(i.revenue, i.previousRevenue);
  if (
    i.previousOrders >= ALERT_RULES.minOrdersForTrend &&
    drop !== null &&
    drop <= ALERT_RULES.revenueDropPct
  )
    add({
      key: "revenue-drop",
      severity: "warning",
      title: `Pendapatan turun ${Math.abs(drop)}%`,
      detail: "Dibandingkan 7 hari sebelumnya.",
      href: "/admin/analytics?tab=pendapatan&range=7h",
    });
  if (i.preorderNear > 0)
    add({
      key: "preorder-near",
      severity: "warning",
      title: `${i.preorderNear} preorder jatuh tempo < 1 hari`,
      detail: "Segera penuhi sebelum tenggat tiga hari.",
      href: "/admin/preorders",
    });
  if (i.supportOpenOver3d > 0)
    add({
      key: "support-aging",
      severity: "warning",
      title: `${i.supportOpenOver3d} tiket bantuan terbuka > 3 hari`,
      detail: "Selesaikan atau beri tanggapan.",
      href: "/admin/support",
    });
  if (i.shoppingOverdue > 0)
    add({
      key: "shopping-overdue",
      severity: "warning",
      title: `${i.shoppingOverdue} chat Titip Belanja lewat target balas`,
      detail: "Pelanggan menunggu balasan tim.",
      href: "/admin/shopping#requests",
    });
  if (i.emailFailed > 0)
    add({
      key: "email-failed",
      severity: "info",
      title: `${i.emailFailed} email transaksional gagal terkirim`,
      detail: "Periksa konfigurasi Helipod Email.",
      href: "/admin/settings",
    });
  if (i.feedReportsOpen > 0)
    add({
      key: "feed-reports",
      severity: "info",
      title: `${i.feedReportsOpen} laporan Feeds belum ditinjau`,
      detail: "Moderasi konten komunitas.",
      href: "/admin/feeds#reports",
    });
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ---------------------------------------------------------------- weekly report

export type ReportInput = {
  periodLabel: string;
  revenue: number;
  previousRevenue: number;
  orders: number;
  previousOrders: number;
  newMembers: number;
  topDestinations: { code: string; revenue: number; orders: number }[];
  alerts: InsightAlert[];
  baseUrl: string;
};

const rupiah = (v: number) => `Rp${Math.round(v).toLocaleString("id-ID")}`;
const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const arrow = (d: number | null) =>
  d === null ? "baru" : `${d < 0 ? "turun" : "naik"} ${Math.abs(d)}%`;

export function buildWeeklyReport(r: ReportInput): { subject: string; html: string; text: string } {
  const rev = deltaPct(r.revenue, r.previousRevenue);
  const ord = deltaPct(r.orders, r.previousOrders);
  const lines = [
    `Ringkasan Djiwa Travel — ${r.periodLabel}`,
    "",
    `Pendapatan: ${rupiah(r.revenue)} (${arrow(rev)} vs minggu lalu)`,
    `Pesanan dibayar: ${r.orders} (${arrow(ord)})`,
    `Member baru: ${r.newMembers}`,
    "",
    "Destinasi teratas:",
    ...(r.topDestinations.length
      ? r.topDestinations.map(
          (d, i) =>
            `${i + 1}. ${d.code.toUpperCase()} — ${rupiah(d.revenue)} (${d.orders} pesanan)`,
        )
      : ["Belum ada penjualan terlacak."]),
    "",
    r.alerts.length ? `Perlu perhatian (${r.alerts.length}):` : "Tidak ada peringatan aktif.",
    ...r.alerts.map((a) => `- [${a.severity}] ${a.title}`),
    "",
    `Detail: ${r.baseUrl}/admin/analytics`,
  ];
  const li = (s: string) => `<li style="margin:2px 0">${esc(s)}</li>`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#111;max-width:560px">
<h2 style="margin:0 0 8px">Ringkasan Djiwa Travel</h2><p style="margin:0 0 12px;color:#555">${esc(r.periodLabel)}</p>
<table style="border-collapse:collapse;margin-bottom:12px">
<tr><td style="padding:2px 12px 2px 0">Pendapatan</td><td><b>${esc(rupiah(r.revenue))}</b> (${esc(arrow(rev))})</td></tr>
<tr><td style="padding:2px 12px 2px 0">Pesanan dibayar</td><td><b>${r.orders}</b> (${esc(arrow(ord))})</td></tr>
<tr><td style="padding:2px 12px 2px 0">Member baru</td><td><b>${r.newMembers}</b></td></tr></table>
<h3 style="margin:12px 0 4px">Destinasi teratas</h3><ol style="margin:0;padding-left:20px">${
    r.topDestinations.length
      ? r.topDestinations
          .map((d) => li(`${d.code.toUpperCase()} — ${rupiah(d.revenue)} (${d.orders} pesanan)`))
          .join("")
      : li("Belum ada penjualan terlacak.")
  }</ol>
<h3 style="margin:12px 0 4px">Perlu perhatian</h3><ul style="margin:0;padding-left:20px">${
    r.alerts.length
      ? r.alerts.map((a) => li(`${a.title}`)).join("")
      : li("Tidak ada peringatan aktif.")
  }</ul>
<p style="margin-top:16px"><a href="${esc(r.baseUrl)}/admin/analytics">Buka Analitik</a></p></div>`;
  return {
    subject: `Ringkasan mingguan Djiwa Travel · ${r.periodLabel}`,
    html,
    text: lines.join("\n"),
  };
}
