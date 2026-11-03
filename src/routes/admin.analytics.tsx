import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminDashboard } from "@/lib/admin-read-model.fn";
import { AdminShell, AdminSurface } from "@/components/admin-shell";
import { BarChart, CardTitle, Kpi, ShareRow, type ChartPoint } from "@/components/admin-charts";
import { formatAdminDateTime, humanizeAdminStatus, maskSensitiveValue } from "@/lib/admin-display";
import {
  averageOrderValue,
  formatRupiah,
  barPercent,
  formatDelta,
  percentChange,
  sharePercent,
} from "@/lib/admin-dashboard-metrics";
import { getHomeEsimFunnel } from "@/lib/home-esim-events.fn";
import { funnelRates } from "@/lib/home-esim-events";

const analyticsSearch = z.object({
  period: z.enum(["daily", "weekly", "monthly"]).catch("daily").default("daily"),
});

export const Route = createFileRoute("/admin/analytics")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: analyticsSearch,
  loaderDeps: ({ search }) => ({ period: search.period }),
  loader: async ({ deps }) => ({
    ...(await getAdminDashboard({ data: deps })),
    homeFunnel: await getHomeEsimFunnel(),
  }),
  component: AdminAnalytics,
});

type Period = "daily" | "weekly" | "monthly";
const PERIOD_LABEL: Record<Period, string> = {
  daily: "hari ini",
  weekly: "minggu ini",
  monthly: "bulan ini",
};

function AdminAnalytics() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const period = data.period as Period;
  const [privateMode, setPrivateMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const count = (v: number) => maskSensitiveValue(v, privateMode);
  const rupiah = (v: number | null) => (v === null ? "—" : privateMode ? "••••" : formatRupiah(v));
  const withShare = (value: number, share: number | null) =>
    `${count(value)}${share !== null && !privateMode ? ` · ${share}%` : ""}`;

  const { counts, previous } = data;
  const conversion = sharePercent(counts.paid, counts.total);
  const aov = averageOrderValue(counts.grossIdr, counts.paid);
  const ordersDelta = formatDelta(percentChange(counts.total, previous.total));
  const paidDelta = formatDelta(percentChange(counts.paid, previous.paid));
  const grossDelta =
    counts.grossIdr === null
      ? null
      : formatDelta(percentChange(counts.grossIdr, previous.grossIdr));
  const vsPrev = (delta: string | null) => (delta ? `${delta} vs periode lalu` : "periode lalu: —");

  const pointLabel = (day: string) => (day.includes(" ") ? day.slice(11) : day.slice(5));
  const orderPoints: ChartPoint[] = data.daily.map((p) => ({
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

  const statusTotal = data.statuses.reduce((sum, item) => sum + item.count, 0);
  const paymentTotal = data.paymentMix.reduce((sum, item) => sum + item.count, 0);
  const packageMax = Math.max(...data.topPackages.map((p) => p.revenueIdr), 0);

  const funnel = data.homeFunnel;
  const funnelMax = funnel ? Math.max(funnel.chipTaps, funnel.sheetOpens, funnel.promoTaps, 0) : 0;
  const chipToSheet = funnel ? funnelRates(funnel).chipToSheet : null;
  const destMax = funnel ? Math.max(...funnel.topDestinations.map((d) => d.sheetOpens), 0) : 0;

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
    <AdminShell title="Analytics" subtitle="Tren order, pendapatan, dan corong eSIM Djiwa Travel.">
      <div className="flex flex-col gap-2 lg:h-[calc(100dvh-8.5rem)] lg:overflow-hidden">
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
                  void router.navigate({ to: "/admin/analytics", search: { period: v } } as never)
                }
                aria-pressed={period === v}
                className={`min-h-8 rounded-lg px-3 text-xs font-semibold ${period === v ? "bg-brand-red-soft text-brand-red" : "text-muted-foreground"}`}
              >
                {v === "daily" ? "Harian" : v === "weekly" ? "Mingguan" : "Bulanan"}
              </button>
            ))}
          </div>
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            Periode {PERIOD_LABEL[period]}
            {funnel ? ` · corong Beranda ${funnel.days} hari terakhir` : ""}
          </span>
          <span className="hidden text-[10px] text-muted-foreground md:inline">
            Diperbarui {formatAdminDateTime(data.generatedAt)}
          </span>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh analytics"
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

        <div className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Orders" value={count(counts.total)} sub={vsPrev(ordersDelta)} />
          <Kpi label="Dibayar" value={count(counts.paid)} sub={vsPrev(paidDelta)} />
          <Kpi
            label="Konversi"
            value={conversion === null || privateMode ? "—" : `${conversion}%`}
            sub="dibayar / order"
          />
          <Kpi label="Gross IDR" value={rupiah(counts.grossIdr)} sub={vsPrev(grossDelta)} />
          <Kpi label="Rata-rata order" value={rupiah(aov)} sub="per order dibayar" />
          <Kpi
            label="eSIM siap"
            value={count(counts.provisioningReady)}
            sub={`belum siap ${count(counts.paidNotReady)}`}
            tone={counts.paidNotReady > 0 ? "warn" : "neutral"}
            href="/admin/provisioning"
          />
        </div>

        <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-3">
          <BarChart
            title="Tren order"
            summary={`Total ${count(counts.total)} · puncak ${count(peakOrders)}/${bucketNoun}`}
            points={orderPoints}
            privateMode={privateMode}
            emptyText="Belum ada order pada periode ini."
          />
          <BarChart
            title="Pendapatan IDR"
            summary={`Total ${rupiah(counts.grossIdr)} · ${PERIOD_LABEL[period]}`}
            points={revenuePoints}
            privateMode={privateMode}
            emptyText="Belum ada pendapatan pada periode ini."
          />
          <AdminSurface className="flex min-h-[220px] flex-col overflow-hidden p-2.5 lg:min-h-0">
            <CardTitle
              title="Corong eSIM Beranda"
              detail={
                funnel ? `${funnel.days} hari terakhir · event anonim` : "Data event belum tersedia"
              }
            />
            {funnel === null ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Tabel event belum dimigrasi atau database tidak terbaca.
              </p>
            ) : (
              <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2">
                <div className="space-y-1.5">
                  {[
                    { label: "Ketuk rel", value: funnel.chipTaps },
                    { label: "Sheet dibuka", value: funnel.sheetOpens },
                    { label: "Ketuk promo", value: funnel.promoTaps },
                  ].map((step) => (
                    <ShareRow
                      key={step.label}
                      label={step.label}
                      value={count(step.value)}
                      share={funnelMax > 0 ? barPercent(step.value, funnelMax, 2) : null}
                      masked={privateMode}
                    />
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Rel → sheet: {chipToSheet === null || privateMode ? "—" : `${chipToSheet}%`} ·
                  Order dibuat {funnel.ordersInWindow === null ? "—" : count(funnel.ordersInWindow)}{" "}
                  (konteks, bukan konversi)
                </p>
                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto border-t border-border pt-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground">
                    Destinasi paling dibuka
                  </p>
                  {funnel.topDestinations.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">Belum ada event.</p>
                  )}
                  {funnel.topDestinations.slice(0, 5).map((item) => (
                    <ShareRow
                      key={item.code}
                      label={item.code}
                      value={count(item.sheetOpens)}
                      share={destMax > 0 ? barPercent(item.sheetOpens, destMax, 2) : null}
                      masked={privateMode}
                      tone="muted"
                    />
                  ))}
                </div>
              </div>
            )}
          </AdminSurface>
        </div>

        <div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:h-[158px] lg:grid-cols-4">
          <AdminSurface className="overflow-hidden p-2.5">
            <CardTitle title="Corong order" detail="Dibuat → dibayar → siap" />
            <div className="mt-1.5 space-y-1.5">
              {[
                {
                  label: "Order dibuat",
                  value: counts.total,
                  share: counts.total > 0 ? 100 : null,
                },
                {
                  label: "Dibayar",
                  value: counts.paid,
                  share: sharePercent(counts.paid, counts.total),
                },
                {
                  label: "eSIM siap",
                  value: counts.provisioningReady,
                  share: sharePercent(counts.provisioningReady, counts.total),
                },
              ].map((step) => (
                <ShareRow
                  key={step.label}
                  label={step.label}
                  value={withShare(step.value, step.share)}
                  share={step.share}
                  masked={privateMode}
                />
              ))}
            </div>
          </AdminSurface>

          <AdminSurface className="overflow-hidden p-2.5">
            <CardTitle title="Status order" detail="Sebaran periode ini" />
            <div className="mt-1.5 space-y-1.5">
              {data.statuses.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Belum ada data.</p>
              )}
              {data.statuses.slice(0, 4).map((item) => {
                const share = sharePercent(item.count, statusTotal);
                return (
                  <ShareRow
                    key={item.status}
                    label={humanizeAdminStatus(item.status)}
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
            <CardTitle title="Metode pembayaran" detail="Order dibayar per metode" />
            <div className="mt-1.5 space-y-1.5">
              {data.paymentMix.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Belum ada pembayaran.</p>
              )}
              {data.paymentMix.slice(0, 4).map((item) => {
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
            <CardTitle title="Paket terlaris" detail="Berdasarkan pendapatan" />
            <div className="mt-1.5 space-y-1.5">
              {data.topPackages.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Belum ada penjualan paket.</p>
              )}
              {data.topPackages.slice(0, 3).map((pkg) => (
                <ShareRow
                  key={pkg.name}
                  label={pkg.name}
                  value={`${count(pkg.quantity)}× · ${rupiah(pkg.revenueIdr)}`}
                  share={packageMax > 0 ? barPercent(pkg.revenueIdr, packageMax, 2) : null}
                  masked={privateMode}
                />
              ))}
            </div>
          </AdminSurface>
        </div>
      </div>
    </AdminShell>
  );
}
