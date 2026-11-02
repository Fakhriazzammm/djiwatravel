import { Activity, AlertTriangle, ArrowRight, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminDashboard } from "@/lib/admin-read-model.fn";
import {
  ageFrom,
  formatAdminDateTime,
  humanizeAdminStatus,
  maskSensitiveValue,
  projectAdminAmount,
  projectAdminCustomer,
  projectAdminIdentifier,
  projectAdminTitle,
} from "@/lib/admin-display";
import {
  averageOrderValue,
  barPercent,
  formatDelta,
  percentChange,
  sharePercent,
} from "@/lib/admin-dashboard-metrics";
import {
  AdminShell,
  AdminStatStrip,
  AdminSurface,
  SectionHeading,
  StatusPill,
} from "@/components/admin-shell";

export const Route = createFileRoute("/admin/dashboard")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: z.object({ period: z.enum(["daily", "weekly", "monthly"]).default("daily") }),
  loaderDeps: ({ search }) => ({ period: search.period }),
  loader: ({ deps }) => getAdminDashboard({ data: deps }),
  component: AdminDashboard,
});

type Period = "daily" | "weekly" | "monthly";
const PERIOD_LABEL: Record<Period, string> = {
  daily: "hari ini",
  weekly: "minggu ini",
  monthly: "bulan ini",
};
const LOW_BALANCE_USD = 5;

type ChartPoint = { key: string; label: string; value: number; display: string };

/** Vertical bar chart with a value at the tip of the tallest bar and a hidden-table fallback. */
function BarChart({
  title,
  detail,
  points,
  privateMode,
  emptyText,
}: {
  title: string;
  detail: string;
  points: ChartPoint[];
  privateMode: boolean;
  emptyText: string;
}) {
  const max = Math.max(...points.map((p) => p.value), 0);
  const peak = points.find((p) => p.value === max && max > 0);
  return (
    <AdminSurface className="p-3">
      <SectionHeading title={title} detail={detail} />
      {points.length ? (
        <div className="mt-2">
          <div
            className="flex h-40 items-end gap-1 border-b border-border"
            role="img"
            aria-label={`${title}: ${points.length} titik data`}
          >
            {points.map((point) => (
              <div
                key={point.key}
                className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                title={projectAdminTitle(`${point.label}: ${point.display}`, privateMode)}
              >
                <span className="h-3.5 text-[10px] tabular-nums text-muted-foreground">
                  {peak?.key === point.key ? (privateMode ? "••" : point.display) : ""}
                </span>
                <div
                  className="w-full max-w-7 rounded-t bg-brand-red"
                  style={{
                    height: privateMode
                      ? "4px"
                      : `${point.value > 0 ? barPercent(point.value, max) : 0}%`,
                  }}
                />
                <span className="text-[10px] text-muted-foreground">{point.label}</span>
              </div>
            ))}
          </div>
          <details className="mt-2 text-[11px] text-muted-foreground">
            <summary className="cursor-pointer select-none py-1">Lihat tabel</summary>
            <div className="mt-1 divide-y">
              {points.map((point) => (
                <div key={point.key} className="flex justify-between py-1">
                  <span>{point.label}</span>
                  <span className="font-semibold tabular-nums">
                    {privateMode ? "••" : point.display}
                  </span>
                </div>
              ))}
            </div>
          </details>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{emptyText}</p>
      )}
    </AdminSurface>
  );
}

function AdminDashboard() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const period = data.period;
  const [privateMode, setPrivateMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const series = useMemo(() => data.daily, [data.daily]);
  const count = (v: number) => maskSensitiveValue(v, privateMode);
  const id = (v: string | null | undefined) => projectAdminIdentifier(v, privateMode);
  const amount = (v: number | null) =>
    v === null ? "—" : privateMode ? "••••" : `Rp${v.toLocaleString("id-ID")}`;
  const provider = data.providerBalance;
  const balance =
    provider.state !== "ok" || provider.usd === null
      ? "—"
      : privateMode
        ? "••••"
        : `US$${provider.usd.toFixed(2)}`;
  const low = provider.state === "ok" && provider.usd !== null && provider.usd < LOW_BALANCE_USD;
  const actions = data.items.slice(0, 5);

  const total = data.counts.total;
  const paid = data.counts.paid;
  const paidNotReady = data.counts.paidNotReady;
  const provisioningReady = data.counts.provisioningReady;
  const provisioningFailed = data.counts.provisioningFailed;
  const grossIdr = data.counts.grossIdr;
  const previous = data.previous;
  const ordersDelta = formatDelta(percentChange(total, previous.total));
  const paidDelta = formatDelta(percentChange(paid, previous.paid));
  const grossDelta = formatDelta(
    grossIdr === null ? null : percentChange(grossIdr, previous.grossIdr),
  );
  const conversion = sharePercent(paid, total);
  const aov = averageOrderValue(grossIdr, paid);
  const compare = `vs ${PERIOD_LABEL[period]} sebelumnya`;
  const deltaDetail = (delta: string | null) =>
    delta === null ? "Belum ada pembanding" : `${delta} ${compare}`;

  const orderPoints: ChartPoint[] = series.map((p) => ({
    key: p.day,
    label: p.day.slice(5),
    value: p.count,
    display: String(p.count),
  }));
  const revenuePoints: ChartPoint[] = data.revenueDaily.map((p) => ({
    key: p.day,
    label: p.day.slice(5),
    value: p.grossIdr,
    display: `Rp${Math.round(p.grossIdr).toLocaleString("id-ID")}`,
  }));
  const statusTotal = data.statuses.reduce((sum, item) => sum + item.count, 0);
  const packageMax = Math.max(...data.topPackages.map((p) => p.revenueIdr), 0);
  const paymentTotal = data.paymentMix.reduce((sum, item) => sum + item.count, 0);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await router.invalidate();
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <AdminShell title="Dashboard" subtitle="Ringkasan operasional Djiwa Travel">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2" aria-live="polite">
          <div
            className="flex min-h-11 items-center gap-0.5 rounded-xl bg-surface p-1 shadow-sm"
            aria-label="Periode"
          >
            {(["daily", "weekly", "monthly"] as Period[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() =>
                  void router.navigate({ to: "/admin/dashboard", search: { period: v } } as never)
                }
                aria-pressed={period === v}
                className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${period === v ? "bg-brand-red-soft text-brand-red" : "text-muted-foreground"}`}
              >
                {v === "daily" ? "Harian" : v === "weekly" ? "Mingguan" : "Bulanan"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">
              Diperbarui {formatAdminDateTime(data.generatedAt)}
            </span>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              aria-label="Refresh dashboard"
              className="min-h-11 min-w-11 rounded-xl border border-border bg-surface p-2"
            >
              <RefreshCw
                className={`mx-auto size-4 ${refreshing ? "animate-spin" : ""} motion-reduce:animate-none`}
              />
            </button>
            <button
              type="button"
              onClick={() => setPrivateMode((v) => !v)}
              aria-pressed={privateMode}
              aria-label="Mode privasi"
              className="min-h-11 min-w-11 rounded-xl border border-border bg-surface p-2"
            >
              {privateMode ? (
                <EyeOff className="mx-auto size-4" />
              ) : (
                <Eye className="mx-auto size-4" />
              )}
            </button>
          </div>
        </div>

        <AdminSurface className="p-2.5">
          <AdminStatStrip
            columns={6}
            items={[
              {
                label: "Orders",
                value: count(total),
                detail: deltaDetail(ordersDelta),
                href: "/admin/orders",
              },
              {
                label: "Dibayar",
                value: count(paid),
                detail: deltaDetail(paidDelta),
                href: "/admin/orders",
              },
              {
                label: "Konversi",
                value: privateMode ? "••%" : conversion === null ? "—" : `${conversion}%`,
                detail: "Dibayar dari order dibuat",
              },
              {
                label: "Gross IDR",
                value: amount(grossIdr),
                detail: deltaDetail(grossDelta),
              },
              {
                label: "Rata-rata order",
                value: amount(aov),
                detail: "Gross ÷ order dibayar",
              },
              {
                label: "Pengecualian",
                value: count(data.counts.paymentExceptions),
                tone: data.counts.paymentExceptions > 0 ? "warn" : "neutral",
                href: "/admin/payments",
              },
            ]}
          />
        </AdminSurface>

        <AdminSurface className="p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold">Saldo provider eSIM</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {provider.state === "ok"
                  ? `IDR ${amount(provider.idrReference)} · ceiling ${provider.sellableCeilingUsd === null ? "—" : `US$${provider.sellableCeilingUsd.toFixed(2)}`}`
                  : "Tidak tersedia"}
              </p>
            </div>
            <StatusPill tone={provider.state !== "ok" ? "danger" : low ? "warn" : "good"}>
              {provider.state !== "ok"
                ? "Tidak tersedia"
                : privateMode
                  ? "••••"
                  : low
                    ? "Perlu top-up"
                    : "Sehat"}
            </StatusPill>
          </div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="text-[22px] font-bold tabular-nums">{balance}</p>
            <div className="text-right text-[10px] text-muted-foreground">
              {provider.state === "ok"
                ? `≈ ${amount(provider.idrReference)} · ${formatAdminDateTime(provider.fetchedAt)}`
                : "Saldo tidak bisa dibaca"}
            </div>
          </div>
          {provider.state === "ok" && provider.sellableCeilingUsd !== null && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Habis di atas US${provider.sellableCeilingUsd.toFixed(2)} (buffer 15%)
            </p>
          )}
        </AdminSurface>

        <div className="grid gap-2 lg:grid-cols-2">
          <BarChart
            title="Tren order"
            detail={`Order per hari pada periode ${PERIOD_LABEL[period]}.`}
            points={orderPoints}
            privateMode={privateMode}
            emptyText="Belum ada data pada periode ini."
          />
          <BarChart
            title="Pendapatan IDR"
            detail="Gross order dibayar per hari (IDR)."
            points={revenuePoints}
            privateMode={privateMode}
            emptyText="Belum ada pendapatan pada periode ini."
          />
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <AdminSurface className="p-3">
            <SectionHeading title="Corong eSIM" detail="Dari order dibuat sampai siap dipakai." />
            <div className="mt-2 space-y-2.5 text-xs">
              {[
                { label: "Order dibuat", value: total, share: 100 },
                { label: "Dibayar", value: paid, share: sharePercent(paid, total) },
                {
                  label: "eSIM siap",
                  value: provisioningReady,
                  share: sharePercent(provisioningReady, total),
                },
              ].map((step) => (
                <div key={step.label}>
                  <div className="flex justify-between">
                    <span>{step.label}</span>
                    <b className="tabular-nums">
                      {count(step.value)}
                      {step.share !== null && !privateMode ? ` · ${step.share}%` : ""}
                    </b>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-brand-red"
                      style={{
                        width: privateMode ? "4px" : `${step.share ?? 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
              <StatusPill tone={paidNotReady > 0 ? "warn" : "neutral"}>
                Belum siap {count(paidNotReady)}
              </StatusPill>
              <StatusPill tone={provisioningFailed > 0 ? "danger" : "neutral"}>
                Gagal {count(provisioningFailed)}
              </StatusPill>
            </div>
          </AdminSurface>

          <AdminSurface className="p-3">
            <SectionHeading title="Status order" detail="Sebaran status pada periode ini." />
            <div className="mt-2 divide-y">
              {data.statuses.length === 0 && (
                <p className="py-3 text-sm text-muted-foreground">Belum ada data.</p>
              )}
              {data.statuses.slice(0, 6).map((item) => {
                const share = sharePercent(item.count, statusTotal);
                return (
                  <div key={item.status} className="py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="flex-1">{humanizeAdminStatus(item.status)}</span>
                      <span className="font-semibold tabular-nums">
                        {count(item.count)}
                        {share !== null && !privateMode ? ` · ${share}%` : ""}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-muted-foreground/60"
                        style={{ width: privateMode ? "4px" : `${share ?? 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </AdminSurface>

          <AdminSurface className="p-3">
            <SectionHeading title="Metode pembayaran" detail="Order dibayar per provider." />
            <div className="mt-2 divide-y">
              {data.paymentMix.length === 0 && (
                <p className="py-3 text-sm text-muted-foreground">Belum ada pembayaran.</p>
              )}
              {data.paymentMix.map((item) => (
                <div key={item.label} className="flex items-center gap-2 py-2 text-xs">
                  <span className="flex-1">{item.label}</span>
                  <span className="font-semibold tabular-nums">
                    {count(item.count)}
                    {!privateMode && paymentTotal > 0
                      ? ` · ${sharePercent(item.count, paymentTotal)}%`
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </AdminSurface>
        </div>

        <div className="grid gap-2 lg:grid-cols-[1.4fr_.8fr]">
          <AdminSurface className="p-3">
            <SectionHeading
              title="Paket terlaris"
              detail="Berdasarkan pendapatan order dibayar pada periode ini."
            />
            <div className="mt-2 space-y-2.5">
              {data.topPackages.length === 0 && (
                <p className="py-3 text-sm text-muted-foreground">Belum ada penjualan paket.</p>
              )}
              {data.topPackages.map((pkg) => (
                <div key={pkg.name} className="text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">{pkg.name}</span>
                    <b className="shrink-0 tabular-nums">
                      {count(pkg.quantity)} eSIM · {amount(pkg.revenueIdr)}
                    </b>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-brand-red"
                      style={{
                        width: privateMode
                          ? "4px"
                          : `${barPercent(pkg.revenueIdr, packageMax, 2)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </AdminSurface>

          <div className="space-y-2">
            <AdminSurface className="p-3">
              <SectionHeading
                title="Perhatian"
                detail={
                  actions.length
                    ? `${count(actions.length)} item perlu ditinjau`
                    : "Tidak ada exception aktif"
                }
              />
              {actions.map((item) => (
                <Link
                  key={item.detailHref}
                  to={item.kind === "payment" ? "/admin/payments" : (item.detailHref as never)}
                  className="mt-1.5 flex min-h-11 items-center gap-2 rounded-xl bg-[#fffaf0] px-2.5 text-xs"
                >
                  <AlertTriangle className="size-4 shrink-0 text-[#b87400]" />
                  <span className="min-w-0 flex-1 truncate">
                    <b>{id(item.displayIdentifier)}</b> ·{" "}
                    {projectAdminCustomer(item.customer, privateMode).label} ·{" "}
                    {humanizeAdminStatus(item.status)} · {ageFrom(item.exceptionAt)}
                  </span>
                  <ArrowRight className="size-3" />
                </Link>
              ))}
            </AdminSurface>
            <AdminSurface className="p-3">
              <SectionHeading title="Health & freshness" />
              <div className="mt-2 space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <Activity className="size-4 text-success" />
                  <span className="flex-1">Database Travel</span>
                  <StatusPill tone="good">Terhubung</StatusPill>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Order terakhir</span>
                  <b>
                    {data.updatedAt
                      ? formatAdminDateTime(data.updatedAt)
                      : "Belum ada order periode ini"}
                  </b>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Provisioning gagal</span>
                  <b>{count(provisioningFailed)}</b>
                </div>
              </div>
            </AdminSurface>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
