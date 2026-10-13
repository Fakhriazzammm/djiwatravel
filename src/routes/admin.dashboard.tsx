import { Activity, AlertTriangle, ArrowRight, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminDashboard } from "@/lib/admin-read-model.server";
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
  AdminDetailSheet,
  AdminShell,
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
const LOW_BALANCE_USD = 5;
function AdminDashboard() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const period = data.period;
  const [privateMode, setPrivateMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const series = useMemo(() => data.daily, [data.daily]);
  const max = privateMode ? 1 : Math.max(...series.map((p) => p.count), 1);
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
            className="flex min-h-11 items-center gap-0.5 rounded-xl bg-white p-1 shadow-sm"
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
                className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${period === v ? "bg-[#eaf3ff] text-[#0a67c7]" : "text-[#6e6e73]"}`}
              >
                {v === "daily" ? "Harian" : v === "weekly" ? "Mingguan" : "Bulanan"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="hidden text-[11px] text-[#6e6e73] sm:inline">
              Data {formatAdminDateTime(data.updatedAt)}
            </span>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              aria-label="Refresh dashboard"
              className="min-h-11 min-w-11 rounded-xl border border-black/[0.06] bg-white p-2"
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
              className="min-h-11 min-w-11 rounded-xl border border-black/[0.06] bg-white p-2"
            >
              {privateMode ? (
                <EyeOff className="mx-auto size-4" />
              ) : (
                <Eye className="mx-auto size-4" />
              )}
            </button>
          </div>
        </div>
        <AdminSurface className="overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-y divide-black/[0.06] sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Orders", data.counts.total],
              ["Dibayar", data.counts.paid],
              ["Pengecualian", data.counts.paymentExceptions],
              ["eSIM siap", data.counts.provisioningReady],
              ["Belum siap", data.counts.paidNotReady],
              ["Gross IDR", data.counts.grossIdr],
            ].map(([label, value]) => (
              <div key={label} className="min-h-[70px] p-2.5">
                <p className="text-[11px] leading-4 text-[#6e6e73]">{label}</p>
                <p className="mt-1 text-[20px] font-bold tabular-nums">
                  {label === "Gross IDR" ? amount(value as number) : count(value as number)}
                </p>
              </div>
            ))}
          </div>
        </AdminSurface>
        <AdminSurface className="p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold">Saldo provider eSIM</p>
              <p className="mt-0.5 truncate text-[11px] text-[#6e6e73]">
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
            <div className="text-right text-[10px] text-[#8e8e93]">
              {provider.state === "ok"
                ? `≈ ${amount(provider.idrReference)} · ${formatAdminDateTime(provider.fetchedAt)}`
                : "Saldo tidak bisa dibaca"}
            </div>
          </div>
          {provider.state === "ok" && provider.sellableCeilingUsd !== null && (
            <p className="mt-1 text-[10px] text-[#6e6e73]">
              Habis di atas US${provider.sellableCeilingUsd.toFixed(2)} (buffer 15%)
            </p>
          )}
        </AdminSurface>
        <div className="grid gap-2 lg:grid-cols-[1.4fr_.8fr]">
          <AdminSurface className="p-3">
            <div className="flex items-center justify-between">
              <SectionHeading
                title="Perhatian"
                detail={
                  actions.length
                    ? `${count(actions.length)} item perlu ditinjau`
                    : "Tidak ada exception aktif"
                }
              />
              <button
                type="button"
                onClick={() => setDetailOpen(true)}
                className="min-h-11 rounded-xl px-3 text-xs font-semibold text-[#0a67c7]"
              >
                Lihat detail
              </button>
            </div>
            {actions.slice(0, 1).map((item) => (
              <Link
                key={item.detailHref}
                to={item.kind === "payment" ? "/admin/payments" : (item.detailHref as never)}
                className="mt-2 flex min-h-11 items-center gap-2 rounded-xl bg-[#fffaf0] px-2.5 text-xs"
              >
                <AlertTriangle className="size-4 shrink-0 text-[#b87400]" />
                <span className="min-w-0 flex-1 truncate">
                  <b>{id(item.displayIdentifier)}</b> · {humanizeAdminStatus(item.status)} ·{" "}
                  {ageFrom(item.exceptionAt)}
                </span>
                <ArrowRight className="size-3" />
              </Link>
            ))}
          </AdminSurface>
          <AdminSurface className="p-3">
            <SectionHeading title="Health & freshness" />
            <div className="mt-2 space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-[#248a3d]" />
                <span className="flex-1">Database Travel</span>
                <StatusPill tone="good">Terhubung</StatusPill>
              </div>
              <div className="flex justify-between gap-2">
                <span>Last successful data</span>
                <b>{formatAdminDateTime(data.updatedAt)}</b>
              </div>
              <div className="flex justify-between gap-2">
                <span>Provisioning gagal</span>
                <b>{count(data.counts.provisioningFailed)}</b>
              </div>
            </div>
          </AdminSurface>
        </div>
      </div>
      <AdminDetailSheet
        open={detailOpen}
        title="Detail operasional"
        onClose={() => setDetailOpen(false)}
      >
        <div className="space-y-2">
          {series.length ? (
            <div className="flex h-40 items-end gap-1 border-b border-black/[0.06]">
              {series.map((point) => (
                <div
                  key={point.day}
                  className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                  title={projectAdminTitle(`${point.day}: ${point.count}`, privateMode)}
                >
                  <span className="text-[10px]">{privateMode ? "••" : point.count}</span>
                  <div
                    className="w-full max-w-7 rounded-t bg-[#0a84ff]"
                    style={{
                      height: privateMode ? "4px" : `${Math.max(4, (point.count / max) * 100)}%`,
                    }}
                  />
                  <span className="text-[10px] text-[#8e8e93]">{point.day.slice(5)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#6e6e73]">Belum ada data pada periode ini.</p>
          )}
          <div className="divide-y">
            {data.statuses.slice(0, 6).map((item) => (
              <div key={item.status} className="flex items-center gap-2 py-2 text-xs">
                <span className="flex-1">{humanizeAdminStatus(item.status)}</span>
                <span className="font-semibold">{count(item.count)}</span>
              </div>
            ))}
          </div>
          {actions.map((item) => (
            <Link
              key={item.detailHref}
              to={item.kind === "payment" ? "/admin/payments" : (item.detailHref as never)}
              onClick={() => setDetailOpen(false)}
              className="flex min-h-11 items-center gap-2 py-2 text-xs"
            >
              <AlertTriangle className="size-4 text-[#b87400]" />
              <span className="flex-1">
                {id(item.displayIdentifier)} ·{" "}
                {projectAdminCustomer(item.customer, privateMode).label}
              </span>
            </Link>
          ))}
        </div>
      </AdminDetailSheet>
    </AdminShell>
  );
}
