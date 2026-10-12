import { Eye, EyeOff, RefreshCw, ArrowRight, AlertTriangle, Activity } from "lucide-react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminDashboard } from "@/lib/admin-read-model.server";
import {
  ageFrom,
  formatAdminDateTime,
  humanizeAdminStatus,
  maskSensitiveValue,
  projectAdminIdentifier,
  projectAdminAmount,
  projectAdminCustomer,
  projectAdminTitle,
} from "@/lib/admin-display";
import { AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";
import { z } from "zod";

export const Route = createFileRoute("/admin/dashboard")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: z.object({ period: z.enum(["daily", "weekly", "monthly"]).default("daily") }),
  loaderDeps: ({ search }) => ({ period: search.period }),
  loader: ({ deps }) => getAdminDashboard({ data: deps }),
  component: AdminDashboard,
});

type Period = "daily" | "weekly" | "monthly";
/** Display-only alert threshold: the credit at which provisioning could start failing. */
const LOW_BALANCE_USD = 5;
function AdminDashboard() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const period = data.period;
  const [privateMode, setPrivateMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const series = useMemo(() => data.daily, [data.daily]);
  const max = privateMode ? 1 : Math.max(...series.map((point) => point.count), 1);
  const formatCount = (value: number) => maskSensitiveValue(value, privateMode);
  const projectIdentifier = (value: string | null | undefined) =>
    projectAdminIdentifier(value, privateMode);
  const formatAmount = (value: number | null) =>
    value === null ? "—" : privateMode ? "••••" : `Rp${value.toLocaleString("id-ID")}`;
  const actions = data.items.slice(0, 5);
  const providerBalance = data.providerBalance;
  const balanceLabel =
    providerBalance.state !== "ok" || providerBalance.usd === null
      ? "—"
      : privateMode
        ? "••••"
        : `US$${providerBalance.usd.toFixed(2)}`;
  const balanceIsLow =
    providerBalance.state === "ok" && providerBalance.usd !== null && providerBalance.usd < LOW_BALANCE_USD;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await router.invalidate();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <AdminShell
      title="Dashboard"
      subtitle="Monitor → pahami → tindak. Data realtime dari database Travel; semua angka tetap berbasis record aktual."
    >
      <div className="flex flex-wrap items-center justify-between gap-3" aria-live="polite">
        <div
          className="flex min-h-11 items-center gap-1 rounded-xl border border-[#e5e5ea] bg-white p-1"
          aria-label="Periode"
        >
          {(["daily", "weekly", "monthly"] as Period[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                void router.navigate({ to: "/admin/dashboard", search: { period: value } } as never)
              }
              aria-pressed={period === value}
              className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${period === value ? "bg-[#eaf3ff] text-[#0a67c7]" : "text-[#6b6b72]"}`}
            >
              {value === "daily" ? "Harian" : value === "weekly" ? "Mingguan" : "Bulanan"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-[#6b6b72]">
          <span>Data terakhir: {formatAdminDateTime(data.updatedAt)}</span>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e5ea] bg-white px-3 font-semibold text-[#111113] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]"
            aria-label="Refresh dashboard"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setPrivateMode((value) => !value)}
            aria-pressed={privateMode}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e5ea] bg-white px-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]"
          >
            {privateMode ? <EyeOff className="size-4" /> : <Eye className="size-4" />}{" "}
            {privateMode ? "Tampilkan" : "Privasi"}
          </button>
        </div>
      </div>

      <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-6" aria-label="KPI periode">
        {[
          ["Orders", data.counts.total],
          ["Paid / verified", data.counts.paid],
          ["Payment exceptions", data.counts.paymentExceptions],
          ["eSIM ready", data.counts.provisioningReady],
          ["Paid belum ready", data.counts.paidNotReady],
        ].map(([label, value]) => (
          <article key={label} className="rounded-xl border border-[#e5e5ea] bg-white p-3">
            <p className="text-xs text-[#6b6b72]">{label}</p>
            <p className="mt-2 text-xl font-bold">{formatCount(value as number)}</p>
          </article>
        ))}
        <article className="rounded-xl border border-[#e5e5ea] bg-white p-3">
          <p className="text-xs text-[#6b6b72]">Gross IDR paid</p>
          <p className="mt-2 text-xl font-bold">{formatAmount(data.counts.grossIdr)}</p>
        </article>
      </section>

      <section className="mt-4">
        <article className="rounded-xl border border-[#e5e5ea] bg-white p-4">
          <SectionHeading
            title="Saldo provider eSIM"
            detail="Kredit tersisa di eSIM Access. Kalau habis, order pelanggan gagal di tahap provisioning."
          />
          {providerBalance.state === "ok" ? (
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-2xl font-bold">{balanceLabel}</p>
                <p className="mt-1 text-xs text-[#6b6b72]">
                  ≈ {formatAmount(providerBalance.idrReference)} · kurs referensi Rp
                  {providerBalance.fxRateIdr.toLocaleString("id-ID")}/US$
                </p>
              </div>
              <div className="text-right">
                <StatusPill tone={balanceIsLow ? "warn" : "good"}>
                  {privateMode ? "••••" : balanceIsLow ? "Perlu top-up" : "Sehat"}
                </StatusPill>
                <p className="mt-2 text-[10px] text-[#8a8a91]">
                  Diambil {formatAdminDateTime(providerBalance.fetchedAt)}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex items-start gap-2 text-sm text-[#6b6b72]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#b25e00]" />
              <span>
                Saldo provider tidak bisa dibaca sekarang
                {providerBalance.error ? ` (${providerBalance.error})` : ""}. Cek kredensial eSIM
                Access bila berulang; order yang sudah dibayar tetap diproses ulang oleh timer
                provisioning.
              </span>
            </div>
          )}
        </article>
      </section>

      <section className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_.8fr]">
        <article className="rounded-xl border border-[#e5e5ea] bg-white p-4">
          <SectionHeading
            title={`Orders ${period === "daily" ? "hari ini" : period === "weekly" ? "minggu ini" : "bulan ini"}`}
            detail="Jumlah order per hari dalam periode terpilih, WIB. KPI dan status memakai periode yang sama."
          />
          {series.length === 0 ? (
            <p className="mt-6 text-sm text-[#6b6b72]">Belum ada data pada periode ini.</p>
          ) : (
            <div className="mt-5 flex h-36 items-end gap-1 border-b border-[#e5e5ea] px-1">
              {series.map((point) => (
                <div
                  key={point.day}
                  className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                  title={projectAdminTitle(`${point.day}: ${point.count}`, privateMode)}
                >
                  <span className="text-[10px] text-[#6b6b72]">
                    {privateMode ? "••" : point.count}
                  </span>
                  <div
                    className="w-full max-w-7 rounded-t bg-[#0a84ff]"
                    style={{
                      height: privateMode ? "4px" : `${Math.max(4, (point.count / max) * 100)}%`,
                    }}
                  />
                  <span className="max-w-full truncate text-[10px] text-[#8a8a91]">
                    {point.day.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </article>
        <article className="rounded-xl border border-[#e5e5ea] bg-white p-4">
          <SectionHeading title="Distribusi status" detail="Status order aktual." />
          <div className="mt-4 space-y-2">
            {data.statuses.slice(0, 6).map((item) => (
              <div key={item.status} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{humanizeAdminStatus(item.status)}</span>
                <div className="h-2 w-20 rounded bg-[#eef0f3]">
                  <div
                    className="h-2 rounded bg-[#5b9bea]"
                    style={{
                      width: privateMode
                        ? "0%"
                        : `${(item.count / Math.max(data.counts.total, 1)) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-8 text-right font-semibold">{formatCount(item.count)}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_.9fr]">
        <article className="rounded-xl border border-[#e5e5ea] bg-white p-4">
          <div className="flex items-center justify-between">
            <SectionHeading
              title="Perlu tindakan"
              detail="Prioritas dari status dan webhook yang tercatat."
            />
            <StatusPill tone={actions.length ? "warn" : "good"}>
              {privateMode ? "••••" : formatCount(actions.length)} item
            </StatusPill>
          </div>
          {actions.length === 0 ? (
            <p className="mt-5 text-sm text-[#6b6b72]">Tidak ada exception aktif.</p>
          ) : (
            <div className="mt-3 divide-y">
              {actions.map((item) => (
                <Link
                  key={`${item.kind}-${item.detailHref}`}
                  to={item.kind === "payment" ? "/admin/payments" : (item.detailHref as never)}
                  className="flex min-h-11 items-center gap-3 py-2 text-xs"
                >
                  <AlertTriangle className="size-4 shrink-0 text-[#b87400]" />
                  <span className="min-w-0 flex-1">
                    <b>{projectIdentifier(item.displayIdentifier)}</b> ·{" "}
                    {projectAdminCustomer(item.customer, privateMode).label}
                    <span className="block text-[#6b6b72]">
                      {humanizeAdminStatus(item.status)} · {ageFrom(item.exceptionAt)}
                    </span>
                  </span>
                  <span className="text-right text-[#6b6b72]">
                    {formatAdminDateTime(item.exceptionAt)}
                    <ArrowRight className="ml-1 inline size-3" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </article>
        <article className="rounded-xl border border-[#e5e5ea] bg-white p-4">
          <SectionHeading
            title="Health & freshness"
            detail="Readiness operasional, tanpa secrets."
          />
          <div className="mt-4 space-y-3 text-xs">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-[#248a3d]" />
              <span className="flex-1">Database Travel</span>
              <StatusPill tone="good">Terhubung</StatusPill>
            </div>
            <div className="flex justify-between gap-3">
              <span>Last successful data</span>
              <span className="font-semibold">{formatAdminDateTime(data.updatedAt)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Provisioning gagal</span>
              <span className="font-semibold">{formatCount(data.counts.provisioningFailed)}</span>
            </div>
          </div>
        </article>
      </section>

      <section className="mt-4 rounded-xl border border-[#e5e5ea] bg-white p-4">
        <SectionHeading title="Exception terbaru" detail="Waktu WIB · customer tetap masked." />
        {data.items.length === 0 ? (
          <p className="mt-4 text-sm text-[#6b6b72]">Belum ada exception.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead>
                <tr className="border-b text-[#6b6b72]">
                  <th className="py-2">Waktu</th>
                  <th>Type</th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={`${item.kind}-${item.detailHref}`} className="border-b last:border-0">
                    <td className="py-2 whitespace-nowrap">
                      {formatAdminDateTime(item.exceptionAt)}
                    </td>
                    <td>{item.kind}</td>
                    <td>
                      <Link
                        className="font-semibold text-[#0a67c7]"
                        to={
                          item.kind === "payment" ? "/admin/payments" : (item.detailHref as never)
                        }
                      >
                        {projectIdentifier(item.displayIdentifier)}
                      </Link>
                    </td>
                    <td>{projectAdminCustomer(item.customer, privateMode).label}</td>
                    <td>
                      {projectAdminAmount(
                        item.amount,
                        privateMode ? null : item.currencyCode,
                        privateMode,
                      )}
                    </td>
                    <td>{humanizeAdminStatus(item.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
