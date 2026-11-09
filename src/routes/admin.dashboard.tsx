import { AlertTriangle, ArrowRight, CheckCircle2, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminDashboard } from "@/lib/admin-read-model.fn";
import { getHomeEsimFunnel } from "@/lib/home-esim-events.fn";
import { funnelRates } from "@/lib/home-esim-events";
import { getSiteTraffic } from "@/lib/site-events.fn";
import { getTrafficDashboard } from "@/lib/traffic-dashboard.fn";
import { TRAFFIC_RANGES } from "@/lib/traffic-dashboard";
import { TrafficPanel } from "@/components/admin-traffic-panel";
import {
  ageFrom,
  formatAdminDateTime,
  humanizeAdminStatus,
  maskSensitiveValue,
  projectAdminCustomer,
  projectAdminIdentifier,
  projectAdminTitle,
} from "@/lib/admin-display";
import {
  averageOrderValue,
  formatRupiah,
  barPercent,
  percentChange,
  sharePercent,
} from "@/lib/admin-dashboard-metrics";
import { bounceRate, pagesPerSession } from "@/lib/site-events";
import { AdminShell, AdminSurface, StatusPill } from "@/components/admin-shell";
import { BarChart, CardTitle, Kpi, ShareRow, type ChartPoint } from "@/components/admin-charts";

export const Route = createFileRoute("/admin/dashboard")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: z.object({
    period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
    range: z.enum(TRAFFIC_RANGES).default("24j"),
  }),
  loaderDeps: ({ search }) => ({ period: search.period, range: search.range }),
  loader: async ({ deps }) => {
    const [dashboard, traffic, homeFunnel, census] = await Promise.all([
      getAdminDashboard({ data: { period: deps.period } }),
      getSiteTraffic({ data: { period: deps.period } }),
      getHomeEsimFunnel(),
      getTrafficDashboard({ data: { range: deps.range } }),
    ]);
    return { ...dashboard, traffic, homeFunnel, census };
  },
  component: AdminDashboard,
});

type Period = "daily" | "weekly" | "monthly";
const PERIOD_LABEL: Record<Period, string> = {
  daily: "hari ini",
  weekly: "minggu ini",
  monthly: "bulan ini",
};
const LOW_BALANCE_USD = 5;

/** Signed change chip. Colour is never the only signal: the arrow and sign carry direction. */
function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[10px] text-muted-foreground">baru</span>;
  if (value === 0) return <span className="text-[10px] text-muted-foreground">▬ 0%</span>;
  const up = value > 0;
  return (
    <span
      className={`text-[10px] font-semibold tabular-nums ${up ? "text-success" : "text-brand-red"}`}
    >
      {up ? "▲" : "▼"} {Math.abs(value)}%
    </span>
  );
}

function AdminDashboard() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const period = data.period;
  const { range } = Route.useSearch();
  const [metric, setMetric] = useState<"orders" | "revenue" | "visitors" | "clicks">("visitors");
  const [privateMode, setPrivateMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const series = useMemo(() => data.daily, [data.daily]);
  const count = (v: number) => maskSensitiveValue(v, privateMode);
  const id = (v: string | null | undefined) => projectAdminIdentifier(v, privateMode);
  const amount = (v: number | null) => (v === null ? "—" : privateMode ? "••••" : formatRupiah(v));
  const provider = data.providerBalance;
  const balance =
    provider.state !== "ok" || provider.usd === null
      ? "—"
      : privateMode
        ? "••••"
        : `US$${provider.usd.toFixed(2)}`;
  const low = provider.state === "ok" && provider.usd !== null && provider.usd < LOW_BALANCE_USD;
  const actions = data.items.slice(0, 6);

  const total = data.counts.total;
  const paid = data.counts.paid;
  const paidNotReady = data.counts.paidNotReady;
  const provisioningReady = data.counts.provisioningReady;
  const provisioningFailed = data.counts.provisioningFailed;
  const grossIdr = data.counts.grossIdr;
  const previous = data.previous;
  const ordersDelta = percentChange(total, previous.total);
  const paidDelta = percentChange(paid, previous.paid);
  const grossDelta = grossIdr === null ? null : percentChange(grossIdr, previous.grossIdr);
  const conversion = sharePercent(paid, total);
  const aov = averageOrderValue(grossIdr, paid);

  // Everything that needs a human decision, in one list, most urgent first.
  const alerts: { key: string; text: string; href: string; tone: "danger" | "warn" }[] = [];
  if (provisioningFailed > 0)
    alerts.push({
      key: "failed",
      text: `${count(provisioningFailed)} provisioning gagal`,
      href: "/admin/provisioning",
      tone: "danger",
    });
  if (provider.state !== "ok")
    alerts.push({
      key: "provider",
      text: "Saldo provider tidak terbaca",
      href: "/admin/settings",
      tone: "danger",
    });
  else if (low)
    alerts.push({
      key: "low",
      text: "Saldo provider rendah",
      href: "/admin/finance",
      tone: "warn",
    });
  if (data.counts.paymentExceptions > 0)
    alerts.push({
      key: "payment",
      text: `${count(data.counts.paymentExceptions)} pengecualian bayar`,
      href: "/admin/payments",
      tone: "warn",
    });
  if (paidNotReady > 0)
    alerts.push({
      key: "waiting",
      text: `${count(paidNotReady)} menunggu eSIM`,
      href: "/admin/provisioning",
      tone: "warn",
    });

  const pointLabel = (day: string) => (day.includes(" ") ? day.slice(11) : day.slice(5));
  const orderPoints: ChartPoint[] = series.map((p) => ({
    key: p.day,
    label: pointLabel(p.day),
    value: p.count,
    display: String(p.count),
  }));
  const revenuePoints: ChartPoint[] = data.revenueDaily.map((p) => ({
    key: p.day,
    label: pointLabel(p.day),
    value: p.grossIdr,
    display: formatRupiah(p.grossIdr),
  }));
  const bucketNoun = period === "daily" ? "jam" : "hari";
  const peakOrders = Math.max(...orderPoints.map((p) => p.value), 0);
  const ordersSummary = `Total ${privateMode ? "••" : total} · puncak ${privateMode ? "••" : peakOrders}/${bucketNoun}`;
  const revenueSummary = `Total ${amount(grossIdr)} · rata-rata ${amount(aov)}/order · ${PERIOD_LABEL[period]}`;
  const statusTotal = data.statuses.reduce((sum, item) => sum + item.count, 0);
  const packageMax = Math.max(...data.topPackages.map((p) => p.revenueIdr), 0);
  const paymentTotal = data.paymentMix.reduce((sum, item) => sum + item.count, 0);

  const traffic = data.traffic;
  const funnelInfo = data.homeFunnel;
  const visitors = traffic?.visitors ?? 0;
  const bounce = traffic ? bounceRate(traffic.bounceSessions, visitors) : null;
  const perSession = traffic ? pagesPerSession(traffic.pageViews, visitors) : null;
  const visitorsDelta = traffic ? percentChange(visitors, traffic.previous.visitors) : null;
  const viewsDelta = traffic ? percentChange(traffic.pageViews, traffic.previous.pageViews) : null;
  const trafficPoints = (pick: "visitors" | "clicks"): ChartPoint[] =>
    (traffic?.series ?? []).map((p) => ({
      key: p.bucket,
      label: p.bucket,
      value: p[pick],
      display: String(p[pick]),
    }));
  const METRICS = {
    orders: {
      label: "Order",
      title: "Tren order",
      summary: ordersSummary,
      points: orderPoints,
      empty: "Belum ada order pada periode ini.",
    },
    revenue: {
      label: "Pendapatan",
      title: "Pendapatan IDR",
      summary: revenueSummary,
      points: revenuePoints,
      empty: "Belum ada pendapatan pada periode ini.",
    },
    visitors: {
      label: "Pengunjung",
      title: "Pengunjung",
      summary: `Total ${count(visitors)} · ${PERIOD_LABEL[period]}`,
      points: trafficPoints("visitors"),
      empty: "Belum ada kunjungan terekam pada periode ini.",
    },
    clicks: {
      label: "Klik",
      title: "Klik",
      summary: `Total ${count(traffic?.clicks ?? 0)} · ${PERIOD_LABEL[period]}`,
      points: trafficPoints("clicks"),
      empty: "Belum ada klik terekam pada periode ini.",
    },
  } as const;
  const active = METRICS[metric];
  const funnelSteps = [
    { label: "Pengunjung", value: visitors },
    { label: "Cari paket", value: traffic?.finderSubmits ?? 0 },
    { label: "Mulai checkout", value: traffic?.checkoutStarts ?? 0 },
    { label: "Order dibuat", value: total },
    { label: "Dibayar", value: paid },
  ];
  const funnelMax = Math.max(...funnelSteps.map((step) => step.value), 0);
  const pageMax = Math.max(...(traffic?.topPages ?? []).map((x) => x.views), 0);
  const clickMax = Math.max(...(traffic?.topClicks ?? []).map((x) => x.clicks), 0);
  const sourceTotal = (traffic?.sources ?? []).reduce((sum, x) => sum + x.visitors, 0);
  const deviceTotal = (traffic?.devices ?? []).reduce((sum, x) => sum + x.visitors, 0);
  const DEVICE_LABEL: Record<string, string> = {
    mobile: "Ponsel",
    tablet: "Tablet",
    desktop: "Desktop",
    other: "Lainnya",
  };
  const withShare = (value: number, share: number | null) =>
    `${count(value)}${share !== null && !privateMode ? ` · ${share}%` : ""}`;
  const chipToSheet = funnelInfo ? funnelRates(funnelInfo).chipToSheet : null;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await router.invalidate();
    } finally {
      setRefreshing(false);
    }
  };

  const iconButton =
    "inline-flex size-9 items-center justify-center rounded-xl border border-border bg-surface";
  return (
    <AdminShell title="Dashboard" subtitle="Ringkasan operasional Djiwa Travel">
      <div className="flex flex-col gap-2 lg:h-[calc(100dvh-8.5rem)] lg:overflow-hidden">
        {/* Row 1: period, live status, freshness, controls */}
        <div className="flex shrink-0 flex-wrap items-center gap-2" aria-live="polite">
          <div
            className="flex items-center gap-0.5 rounded-xl bg-surface p-0.5 shadow-sm"
            aria-label="Periode"
          >
            {(["daily", "weekly", "monthly"] as Period[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() =>
                  void router.navigate({
                    to: "/admin/dashboard",
                    search: { period: v },
                  } as never)
                }
                aria-pressed={period === v}
                className={`min-h-8 rounded-lg px-3 text-xs font-semibold ${period === v ? "bg-brand-red-soft text-brand-red" : "text-muted-foreground"}`}
              >
                {v === "daily" ? "Harian" : v === "weekly" ? "Mingguan" : "Bulanan"}
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {alerts.length === 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f6ec] px-2.5 py-1 text-[11px] font-semibold text-[#1f7a3d]">
                <CheckCircle2 className="size-3.5" aria-hidden="true" /> Semua normal
              </span>
            ) : (
              alerts.map((alert) => (
                <Link
                  key={alert.key}
                  to={alert.href as never}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${alert.tone === "danger" ? "bg-[#fdecec] text-[#b42318]" : "bg-[#fff4df] text-[#9a6100]"}`}
                >
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                  {alert.text}
                </Link>
              ))
            )}
          </div>
          <span className="hidden text-[10px] text-muted-foreground md:inline">
            Diperbarui {formatAdminDateTime(data.generatedAt)}
            {data.updatedAt ? ` · order terakhir ${formatAdminDateTime(data.updatedAt)}` : ""}
          </span>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh dashboard"
            className={iconButton}
          >
            <RefreshCw
              className={`size-4 ${refreshing ? "animate-spin" : ""} motion-reduce:animate-none`}
            />
          </button>
          <button
            type="button"
            onClick={() => setPrivateMode((v) => !v)}
            aria-pressed={privateMode}
            aria-label="Mode privasi"
            className={iconButton}
          >
            {privateMode ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>

        {/* Row 2: business + traffic KPIs */}
        <div className="grid shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-8">
          <Kpi
            label="Orders"
            value={count(total)}
            sub={
              <>
                <Delta value={ordersDelta} /> vs lalu
              </>
            }
            href="/admin/orders"
          />
          <Kpi
            label="Dibayar"
            value={count(paid)}
            sub={
              <>
                <Delta value={paidDelta} /> vs lalu
              </>
            }
            href="/admin/orders"
          />
          <Kpi
            label="Gross IDR"
            value={amount(grossIdr)}
            sub={
              <>
                <Delta value={grossDelta} /> vs lalu
              </>
            }
          />
          <Kpi
            label="Pengunjung"
            value={traffic ? count(visitors) : "—"}
            sub={
              traffic ? (
                <>
                  <Delta value={visitorsDelta} /> vs lalu
                </>
              ) : (
                "traffic belum tersedia"
              )
            }
          />
          <Kpi
            label="Page views"
            value={traffic ? count(traffic.pageViews) : "—"}
            sub={
              traffic ? (
                <>
                  <Delta value={viewsDelta} /> · {perSession ?? "—"}/sesi
                </>
              ) : (
                "—"
              )
            }
          />
          <Kpi
            label="Konversi"
            value={privateMode ? "••%" : conversion === null ? "—" : `${conversion}%`}
            sub="dibayar ÷ dibuat"
          />
          <Kpi
            label="Bounce"
            value={privateMode || bounce === null ? "—" : `${bounce}%`}
            sub="sesi satu halaman"
          />
          <Kpi
            label="Pengecualian"
            value={count(data.counts.paymentExceptions)}
            sub={data.counts.paymentExceptions > 0 ? "perlu ditinjau" : "tidak ada"}
            tone={data.counts.paymentExceptions > 0 ? "warn" : "neutral"}
            href="/admin/payments"
          />
        </div>

        {/* Row 3: one switchable trend chart, end-to-end funnel, attention column */}
        <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-12">
          <div className="flex min-h-[260px] min-w-0 flex-col lg:col-span-6 lg:min-h-0 [&>*]:flex-1">
            <BarChart
              title={active.title}
              summary={active.summary}
              points={active.points}
              privateMode={privateMode}
              emptyText={active.empty}
              actions={
                <div
                  className="flex items-center gap-0.5 rounded-lg bg-secondary p-0.5"
                  role="group"
                  aria-label="Metrik chart"
                >
                  {(Object.keys(METRICS) as (keyof typeof METRICS)[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={metric === key}
                      onClick={() => setMetric(key)}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${metric === key ? "bg-surface text-brand-red shadow-sm" : "text-muted-foreground"}`}
                    >
                      {METRICS[key].label}
                    </button>
                  ))}
                </div>
              }
            />
          </div>

          <AdminSurface className="flex min-h-[200px] flex-col overflow-hidden p-2.5 lg:col-span-3 lg:min-h-0">
            <CardTitle title="Corong end-to-end" detail="Pengunjung → dibayar" />
            <div className="mt-1.5 space-y-1.5">
              {funnelSteps.map((step) => (
                <ShareRow
                  key={step.label}
                  label={step.label}
                  value={withShare(step.value, sharePercent(step.value, visitors))}
                  share={funnelMax > 0 ? barPercent(step.value, funnelMax, 2) : null}
                  masked={privateMode}
                />
              ))}
            </div>
            <p className="mt-auto pt-1.5 text-[10px] text-muted-foreground">
              eSIM siap {count(provisioningReady)} · belum siap {count(paidNotReady)} · gagal{" "}
              {count(provisioningFailed)}
              {funnelInfo
                ? ` · Beranda: rel ${count(funnelInfo.chipTaps)} → sheet ${count(funnelInfo.sheetOpens)}${chipToSheet === null || privateMode ? "" : ` (${chipToSheet}%)`}`
                : ""}
            </p>
          </AdminSurface>

          <div className="flex min-h-0 flex-col gap-2 lg:col-span-3">
            <AdminSurface className="shrink-0 p-2.5">
              <CardTitle
                title="Saldo provider eSIM"
                detail={
                  provider.state === "ok"
                    ? `ceiling ${provider.sellableCeilingUsd === null ? "—" : `US$${provider.sellableCeilingUsd.toFixed(2)}`} · buffer 15%`
                    : "Tidak tersedia"
                }
                right={
                  <StatusPill tone={provider.state !== "ok" ? "danger" : low ? "warn" : "good"}>
                    {provider.state !== "ok"
                      ? "Error"
                      : privateMode
                        ? "••••"
                        : low
                          ? "Top-up"
                          : "Sehat"}
                  </StatusPill>
                }
              />
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="text-xl font-bold tabular-nums">{balance}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {provider.state === "ok"
                    ? `≈ ${amount(provider.idrReference)} · ${formatAdminDateTime(provider.fetchedAt)}`
                    : "Saldo tidak bisa dibaca"}
                </p>
              </div>
              {provider.state === "ok" && provider.sellableCeilingUsd !== null && (
                <p className="sr-only">
                  Habis di atas US${provider.sellableCeilingUsd.toFixed(2)} (buffer 15%)
                </p>
              )}
            </AdminSurface>
            <AdminSurface className="flex min-h-[140px] flex-1 flex-col p-2.5 lg:min-h-0">
              <CardTitle
                title="Perhatian"
                detail={
                  actions.length
                    ? `${count(actions.length)} item perlu ditinjau`
                    : "Tidak ada exception aktif"
                }
              />
              <div className="mt-1.5 min-h-0 flex-1 space-y-1 overflow-y-auto">
                {actions.length === 0 && (
                  <p className="flex items-center gap-1.5 py-2 text-[11px] text-muted-foreground">
                    <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                    Semua order periode ini berjalan normal.
                  </p>
                )}
                {actions.map((item) => (
                  <Link
                    key={item.detailHref}
                    to={item.kind === "payment" ? "/admin/payments" : (item.detailHref as never)}
                    className="flex min-h-9 items-center gap-1.5 rounded-lg bg-[#fffaf0] px-2 text-[11px]"
                  >
                    <AlertTriangle className="size-3.5 shrink-0 text-[#b87400]" />
                    <span className="min-w-0 flex-1 truncate">
                      <b>{id(item.displayIdentifier)}</b> ·{" "}
                      {projectAdminCustomer(item.customer, privateMode).label} ·{" "}
                      {humanizeAdminStatus(item.status)} · {ageFrom(item.exceptionAt)}
                    </span>
                    <ArrowRight className="size-3 shrink-0" />
                  </Link>
                ))}
              </div>
            </AdminSurface>
          </div>
        </div>

        {/* Row 4: breakdowns, fixed compact height */}
        <div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:h-[158px] lg:grid-cols-4">
          <AdminSurface className="overflow-hidden p-2.5">
            <CardTitle title="Halaman populer" detail="Page views per halaman" />
            <div className="mt-1.5 space-y-1.5">
              {(traffic?.topPages.length ?? 0) === 0 && (
                <p className="text-[11px] text-muted-foreground">Belum ada kunjungan.</p>
              )}
              {(traffic?.topPages ?? []).slice(0, 3).map((page) => (
                <ShareRow
                  key={page.path}
                  label={page.path}
                  value={count(page.views)}
                  share={pageMax > 0 ? barPercent(page.views, pageMax, 2) : null}
                  masked={privateMode}
                />
              ))}
            </div>
          </AdminSurface>

          <AdminSurface className="overflow-hidden p-2.5">
            <CardTitle title="Sumber & perangkat" detail="Pengunjung" />
            <div className="mt-1.5 space-y-1.5">
              {(traffic?.sources.length ?? 0) === 0 && (
                <p className="text-[11px] text-muted-foreground">Belum ada data.</p>
              )}
              {(traffic?.sources ?? []).slice(0, 2).map((item) => {
                const share = sharePercent(item.visitors, sourceTotal);
                return (
                  <ShareRow
                    key={`s-${item.label}`}
                    label={item.label}
                    value={withShare(item.visitors, share)}
                    share={share}
                    masked={privateMode}
                    tone="muted"
                  />
                );
              })}
              {(traffic?.devices ?? []).slice(0, 1).map((item) => {
                const share = sharePercent(item.visitors, deviceTotal);
                return (
                  <ShareRow
                    key={`d-${item.device}`}
                    label={DEVICE_LABEL[item.device] ?? item.device}
                    value={withShare(item.visitors, share)}
                    share={share}
                    masked={privateMode}
                  />
                );
              })}
            </div>
          </AdminSurface>

          <AdminSurface className="overflow-hidden p-2.5">
            <CardTitle title="Metode pembayaran" detail="Order dibayar per metode" />
            <div className="mt-1.5 space-y-1.5">
              {data.paymentMix.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Belum ada pembayaran.</p>
              )}
              {data.paymentMix.slice(0, 3).map((item) => {
                const share = sharePercent(item.count, paymentTotal);
                return (
                  <ShareRow
                    key={item.label}
                    label={item.label}
                    value={withShare(item.count, share)}
                    share={share}
                    masked={privateMode}
                    tone="muted"
                  />
                );
              })}
            </div>
          </AdminSurface>

          <AdminSurface className="overflow-hidden p-2.5">
            <CardTitle title="Paket & klik teratas" detail="Pendapatan · tombol/tautan" />
            <div className="mt-1.5 space-y-1.5">
              {data.topPackages.length === 0 && (traffic?.topClicks.length ?? 0) === 0 && (
                <p className="text-[11px] text-muted-foreground">Belum ada data.</p>
              )}
              {data.topPackages.slice(0, 2).map((pkg) => (
                <ShareRow
                  key={pkg.name}
                  label={pkg.name}
                  value={`${count(pkg.quantity)}× · ${amount(pkg.revenueIdr)}`}
                  share={packageMax > 0 ? barPercent(pkg.revenueIdr, packageMax, 2) : null}
                  masked={privateMode}
                />
              ))}
              {(traffic?.topClicks ?? []).slice(0, 1).map((item) => (
                <ShareRow
                  key={item.target}
                  label={`Klik ${item.target}`}
                  value={count(item.clicks)}
                  share={clickMax > 0 ? barPercent(item.clicks, clickMax, 2) : null}
                  masked={privateMode}
                  tone="muted"
                />
              ))}
            </div>
          </AdminSurface>
        </div>
      </div>
      <TrafficPanel data={data.census} range={range} />
    </AdminShell>
  );
}
