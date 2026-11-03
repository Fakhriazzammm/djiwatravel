import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminDashboard } from "@/lib/admin-read-model.fn";
import { AdminShell, AdminSurface } from "@/components/admin-shell";
import { BarChart, CardTitle, Kpi, ShareRow, type ChartPoint } from "@/components/admin-charts";
import { formatAdminDateTime, maskSensitiveValue } from "@/lib/admin-display";
import {
  barPercent,
  formatDelta,
  percentChange,
  sharePercent,
} from "@/lib/admin-dashboard-metrics";
import { getHomeEsimFunnel } from "@/lib/home-esim-events.fn";
import { funnelRates } from "@/lib/home-esim-events";
import { getSiteTraffic } from "@/lib/site-events.fn";
import { bounceRate, pagesPerSession } from "@/lib/site-events";

const analyticsSearch = z.object({
  period: z.enum(["daily", "weekly", "monthly"]).catch("daily").default("daily"),
});

export const Route = createFileRoute("/admin/analytics")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: analyticsSearch,
  loaderDeps: ({ search }) => ({ period: search.period }),
  loader: async ({ deps }) => {
    const [orders, traffic, homeFunnel] = await Promise.all([
      getAdminDashboard({ data: deps }),
      getSiteTraffic({ data: deps }),
      getHomeEsimFunnel(),
    ]);
    return { orders, traffic, homeFunnel };
  },
  component: AdminAnalytics,
});

type Period = "daily" | "weekly" | "monthly";
const PERIOD_LABEL: Record<Period, string> = {
  daily: "hari ini",
  weekly: "minggu ini",
  monthly: "bulan ini",
};
const DEVICE_LABEL: Record<string, string> = {
  mobile: "Ponsel",
  tablet: "Tablet",
  desktop: "Desktop",
  other: "Lainnya",
};

function AdminAnalytics() {
  const { orders, traffic, homeFunnel: funnel } = Route.useLoaderData();
  const router = useRouter();
  const period = orders.period as Period;
  const [privateMode, setPrivateMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const count = (v: number) => maskSensitiveValue(v, privateMode);
  const withShare = (value: number, share: number | null) =>
    `${count(value)}${share !== null && !privateMode ? ` · ${share}%` : ""}`;
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
  const vsPrev = (delta: string | null) => (delta ? `${delta} vs periode lalu` : "periode lalu: —");

  const bucketNoun = period === "daily" ? "jam" : "hari";
  const visitorPoints: ChartPoint[] = (traffic?.series ?? []).map((p) => ({
    key: p.bucket,
    label: p.bucket,
    value: p.visitors,
    display: String(p.visitors),
  }));
  const clickPoints: ChartPoint[] = (traffic?.series ?? []).map((p) => ({
    key: p.bucket,
    label: p.bucket,
    value: p.clicks,
    display: String(p.clicks),
  }));
  const peak = (points: ChartPoint[]) => Math.max(...points.map((p) => p.value), 0);

  const visitors = traffic?.visitors ?? 0;
  const pageViews = traffic?.pageViews ?? 0;
  const clicks = traffic?.clicks ?? 0;
  const bounce = traffic ? bounceRate(traffic.bounceSessions, visitors) : null;
  const perSession = traffic ? pagesPerSession(pageViews, visitors) : null;
  const pct = (v: number | null) => (v === null || privateMode ? "—" : `${v}%`);

  const steps = [
    { label: "Pengunjung", value: visitors },
    { label: "Cari paket (finder)", value: traffic?.finderSubmits ?? 0 },
    { label: "Mulai checkout", value: traffic?.checkoutStarts ?? 0 },
    { label: "Order dibuat", value: orders.counts.total },
    { label: "Dibayar", value: orders.counts.paid },
  ];
  const stepMax = Math.max(...steps.map((s) => s.value), 0);

  const funnelMax = funnel ? Math.max(funnel.chipTaps, funnel.sheetOpens, funnel.promoTaps, 0) : 0;
  const chipToSheet = funnel ? funnelRates(funnel).chipToSheet : null;
  const pageMax = Math.max(...(traffic?.topPages ?? []).map((p) => p.views), 0);
  const clickMax = Math.max(...(traffic?.topClicks ?? []).map((c) => c.clicks), 0);
  const deviceTotal = (traffic?.devices ?? []).reduce((sum, d) => sum + d.visitors, 0);
  const sourceTotal = (traffic?.sources ?? []).reduce((sum, d) => sum + d.visitors, 0);

  return (
    <AdminShell title="Analytics" subtitle="Traffic, klik, dan perilaku pengunjung Djiwa Travel.">
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
            {traffic === null
              ? "Data traffic belum tersedia (tabel belum dimigrasi atau database tidak terbaca)."
              : `Traffic ${PERIOD_LABEL[period]} · anonim, tanpa data pribadi`}
          </span>
          <span className="hidden text-[10px] text-muted-foreground md:inline">
            Diperbarui {formatAdminDateTime(orders.generatedAt)}
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
          <Kpi
            label="Pengunjung"
            value={count(visitors)}
            sub={vsPrev(formatDelta(percentChange(visitors, traffic?.previous.visitors)))}
          />
          <Kpi
            label="Page views"
            value={count(pageViews)}
            sub={vsPrev(formatDelta(percentChange(pageViews, traffic?.previous.pageViews)))}
          />
          <Kpi
            label="Halaman / sesi"
            value={perSession === null || privateMode ? "—" : String(perSession)}
            sub="kedalaman kunjungan"
          />
          <Kpi label="Bounce rate" value={pct(bounce)} sub="sesi satu halaman" />
          <Kpi
            label="Total klik"
            value={count(clicks)}
            sub={vsPrev(formatDelta(percentChange(clicks, traffic?.previous.clicks)))}
          />
          <Kpi
            label="Visit → checkout"
            value={pct(sharePercent(traffic?.checkoutStarts ?? 0, visitors))}
            sub={`${count(traffic?.checkoutStarts ?? 0)} mulai checkout`}
          />
        </div>

        <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-3">
          <BarChart
            title="Pengunjung"
            summary={`Total ${count(visitors)} · puncak ${count(peak(visitorPoints))}/${bucketNoun}`}
            points={visitorPoints}
            privateMode={privateMode}
            emptyText="Belum ada kunjungan terekam pada periode ini."
          />
          <BarChart
            title="Klik"
            summary={`Total ${count(clicks)} · puncak ${count(peak(clickPoints))}/${bucketNoun}`}
            points={clickPoints}
            privateMode={privateMode}
            emptyText="Belum ada klik terekam pada periode ini."
          />
          <AdminSurface className="flex min-h-[220px] flex-col overflow-hidden p-2.5 lg:min-h-0">
            <CardTitle title="Corong kunjungan" detail="Pengunjung → order dibayar" />
            <div className="mt-1.5 space-y-1.5">
              {steps.map((step) => (
                <ShareRow
                  key={step.label}
                  label={step.label}
                  value={withShare(step.value, sharePercent(step.value, visitors))}
                  share={stepMax > 0 ? barPercent(step.value, stepMax, 2) : null}
                  masked={privateMode}
                />
              ))}
            </div>
            <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto border-t border-border pt-1.5">
              <p className="text-[10px] font-medium text-muted-foreground">
                Kartu eSIM Beranda{funnel ? ` · ${funnel.days} hari` : ""}
              </p>
              {funnel === null ? (
                <p className="text-[11px] text-muted-foreground">Data event belum tersedia.</p>
              ) : (
                <>
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
                      tone="muted"
                    />
                  ))}
                  <p className="text-[10px] text-muted-foreground">
                    Rel → sheet {pct(chipToSheet)}
                  </p>
                </>
              )}
            </div>
          </AdminSurface>
        </div>

        <div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:h-[158px] lg:grid-cols-4">
          <AdminSurface className="overflow-hidden p-2.5">
            <CardTitle title="Halaman populer" detail="Page views per halaman" />
            <div className="mt-1.5 space-y-1.5">
              {(traffic?.topPages.length ?? 0) === 0 && (
                <p className="text-[11px] text-muted-foreground">Belum ada kunjungan.</p>
              )}
              {(traffic?.topPages ?? []).slice(0, 4).map((page) => (
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
            <CardTitle title="Sumber trafik" detail="Pengunjung per sumber" />
            <div className="mt-1.5 space-y-1.5">
              {(traffic?.sources.length ?? 0) === 0 && (
                <p className="text-[11px] text-muted-foreground">Belum ada data.</p>
              )}
              {(traffic?.sources ?? []).slice(0, 4).map((item) => {
                const share = sharePercent(item.visitors, sourceTotal);
                return (
                  <ShareRow
                    key={item.label}
                    label={item.label}
                    value={withShare(item.visitors, share)}
                    share={share}
                    masked={privateMode}
                    tone="muted"
                  />
                );
              })}
            </div>
          </AdminSurface>

          <AdminSurface className="overflow-hidden p-2.5">
            <CardTitle title="Perangkat" detail="Pengunjung per jenis layar" />
            <div className="mt-1.5 space-y-1.5">
              {(traffic?.devices.length ?? 0) === 0 && (
                <p className="text-[11px] text-muted-foreground">Belum ada data.</p>
              )}
              {(traffic?.devices ?? []).slice(0, 4).map((item) => {
                const share = sharePercent(item.visitors, deviceTotal);
                return (
                  <ShareRow
                    key={item.device}
                    label={DEVICE_LABEL[item.device] ?? item.device}
                    value={withShare(item.visitors, share)}
                    share={share}
                    masked={privateMode}
                    tone="muted"
                  />
                );
              })}
            </div>
          </AdminSurface>

          <AdminSurface className="overflow-hidden p-2.5">
            <CardTitle title="Klik teratas" detail="Tautan dan tombol paling diklik" />
            <div className="mt-1.5 space-y-1.5">
              {(traffic?.topClicks.length ?? 0) === 0 && (
                <p className="text-[11px] text-muted-foreground">Belum ada klik.</p>
              )}
              {(traffic?.topClicks ?? []).slice(0, 4).map((item) => (
                <ShareRow
                  key={item.target}
                  label={item.target}
                  value={count(item.clicks)}
                  share={clickMax > 0 ? barPercent(item.clicks, clickMax, 2) : null}
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
