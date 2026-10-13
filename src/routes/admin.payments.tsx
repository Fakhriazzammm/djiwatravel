import { ArrowUpDown, CreditCard, Eye, EyeOff, RefreshCw, Search } from "lucide-react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminPayments } from "@/lib/admin-read-model.server";
import { MAX_PAYMENT_PAGE, normalizePaymentQuery, type PaymentSortKey } from "@/lib/admin-metrics";
import {
  ageFrom,
  formatAdminDateTime,
  humanizeAdminStatus,
  projectAdminCustomer,
  projectAdminIdentifier,
  projectAdminPrivacy,
  projectAdminTitle,
} from "@/lib/admin-display";
import { AdminShell, AdminSurface, StatusPill } from "@/components/admin-shell";

const paymentSearch = z.object({
  q: z.string().default(""),
  status: z.string().default("ALL"),
  sort: z.enum(["createdAt", "updatedAt", "amount", "status"]).default("updatedAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(0).max(MAX_PAYMENT_PAGE).default(0),
});

export const Route = createFileRoute("/admin/payments")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: paymentSearch,
  loaderDeps: ({ search }) => ({ ...search }),
  loader: ({ deps }) =>
    getAdminPayments({
      data: normalizePaymentQuery({
        query: deps.q,
        status: deps.status,
        sort: deps.sort,
        dir: deps.dir,
        page: deps.page,
      }),
    }),
  component: AdminPayments,
});

const statuses = ["ALL", "PAYMENT_PENDING", "FAILED", "EXPIRED", "PROVISIONING_FAILED"];
function AdminPayments() {
  const result = Route.useLoaderData();
  const router = useRouter();
  const search = Route.useSearch();
  const [privateMode, setPrivateMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const updateSearch = (patch: Record<string, string | number>) =>
    void router.navigate({ to: "/admin/payments", search: { ...search, ...patch } } as never);
  const setSort = (key: PaymentSortKey) =>
    updateSearch({
      sort: key,
      dir: search.sort === key && search.dir === "desc" ? "asc" : "desc",
      page: 0,
    });
  const refresh = async () => {
    setRefreshing(true);
    try {
      await router.invalidate();
    } finally {
      setRefreshing(false);
    }
  };
  const displayAmount = (payment: (typeof result.rows)[number]) =>
    payment.amount === null || !payment.currencyCode
      ? "—"
      : privateMode
        ? `${payment.currencyCode} ••••`
        : `${payment.currencyCode} ${payment.amount.toLocaleString("id-ID")}`;
  const row = (payment: (typeof result.rows)[number]) => (
    <>
      <td className="py-2">
        <StatusPill tone={payment.lastError ? "danger" : "warn"}>
          {humanizeAdminStatus(payment.status)}
        </StatusPill>
        <span className="mt-1 block max-w-40 truncate text-[11px] text-[#b00020]">
          {payment.lastError ?? payment.eventType ?? "Reason unknown"}
        </span>
      </td>
      <td
        className="max-w-28 truncate font-mono"
        title={projectAdminTitle(payment.displayIdentifier, privateMode)}
      >
        {projectAdminIdentifier(payment.displayIdentifier, privateMode)}
      </td>
      <td>{projectAdminCustomer(payment.customer, privateMode).label}</td>
      <td>
        <Link to={payment.detailHref as never} className="font-semibold text-[#0a67c7]">
          {projectAdminIdentifier(payment.displayIdentifier, privateMode)}
        </Link>
      </td>
      <td className="max-w-44 truncate" title={projectAdminTitle(payment.itemSummary, privateMode)}>
        {projectAdminPrivacy(payment.itemSummary ?? "Paket belum tersedia", privateMode)}
      </td>
      <td className="whitespace-nowrap">{displayAmount(payment)}</td>
      <td className="whitespace-nowrap">
        {formatAdminDateTime(payment.orderCreatedAt ?? payment.createdAt)}
      </td>
      <td className="whitespace-nowrap">{formatAdminDateTime(payment.updatedAt)}</td>
      <td className="whitespace-nowrap">{ageFrom(payment.updatedAt)}</td>
      <td className="max-w-32 truncate">
        {projectAdminPrivacy(payment.paymentProviderLabel ?? "Provider unknown", privateMode)}
        {payment.paymentReference
          ? ` · ${projectAdminPrivacy(payment.paymentReference, privateMode)}`
          : ""}
      </td>
    </>
  );
  return (
    <AdminShell title="Payments" subtitle="Monitor exception pembayaran dan status provisioning.">
      <div className="space-y-2">
        <AdminSurface className="p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6e6e73]">
                Payment monitor
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">
                {result.total} <span className="text-xs font-medium text-[#6e6e73]">exception</span>
              </p>
            </div>
            <div className="flex items-center gap-1">
              <StatusPill tone={result.total ? "warn" : "good"}>
                {result.total ? "Perlu ditinjau" : "Aman"}
              </StatusPill>
              <button
                type="button"
                onClick={() => setPrivateMode((value) => !value)}
                aria-label="Mode privasi"
                aria-pressed={privateMode}
                className="min-h-11 min-w-11 rounded-xl border bg-white p-2"
              >
                {privateMode ? (
                  <EyeOff className="mx-auto size-4" />
                ) : (
                  <Eye className="mx-auto size-4" />
                )}
              </button>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
            {[
              ["Ditampilkan", result.rows.length],
              ["Halaman", result.page + 1],
              ["Filter", search.status === "ALL" ? "Semua" : humanizeAdminStatus(search.status)],
              ["Sort", humanizeAdminStatus(search.sort)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-[#f7f7f8] px-2.5 py-2">
                <span className="block text-[#6e6e73]">{label}</span>
                <b className="mt-0.5 block truncate">{value}</b>
              </div>
            ))}
          </div>
        </AdminSurface>
        <AdminSurface className="p-2.5">
          <div className="flex gap-2" aria-live="polite">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 size-4 text-[#8a8a91]" />
              <input
                value={search.q}
                onChange={(event) => updateSearch({ q: event.target.value, page: 0 })}
                placeholder="Cari payment / order"
                aria-label="Cari payment atau order"
                className="min-h-11 w-full rounded-xl border border-[#e5e5ea] bg-[#f7f7f8] pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]"
              />
            </label>
            <select
              aria-label="Filter status pembayaran"
              value={search.status}
              onChange={(event) => updateSearch({ status: event.target.value, page: 0 })}
              className="min-h-11 max-w-[132px] rounded-xl border border-[#e5e5ea] bg-white px-2 text-xs"
            >
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value === "ALL" ? "Semua" : humanizeAdminStatus(value)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              aria-label="Refresh payments"
              className="min-h-11 min-w-11 rounded-xl border border-[#e5e5ea] bg-white p-2"
            >
              <RefreshCw className={`mx-auto size-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </AdminSurface>
        <AdminSurface className="p-3">
          {result.rows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-5 text-center text-sm text-[#6b6b72]">
              Tidak ada payment exception yang cocok.
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between text-[11px] text-[#6e6e73]">
                <span>Exception terbaru</span>
                <span>
                  {result.rows.length} dari {result.total}
                </span>
              </div>
              <div className="space-y-1.5 lg:hidden">
                {result.rows.map((payment) => (
                  <div
                    key={payment.detailHref}
                    className="block w-full rounded-xl border border-[#e5e5ea] p-2.5 text-left text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">
                        {projectAdminIdentifier(payment.displayIdentifier, privateMode)}
                      </span>
                      <StatusPill tone={payment.lastError ? "danger" : "warn"}>
                        {humanizeAdminStatus(payment.status)}
                      </StatusPill>
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-x-3 text-[11px] text-[#6e6e73]">
                      <span className="truncate">
                        {projectAdminCustomer(payment.customer, privateMode).label}
                      </span>
                      <span className="truncate text-right">{displayAmount(payment)}</span>
                      <span className="truncate">
                        {projectAdminPrivacy(payment.itemSummary ?? "Paket —", privateMode)}
                      </span>
                      <span className="truncate text-right">{ageFrom(payment.updatedAt)}</span>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-[#b00020]">
                      {payment.lastError ?? payment.eventType ?? "Reason unknown"}
                    </p>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-auto lg:block">
                <table className="w-full min-w-[1250px] table-fixed text-left text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b text-[#6b6b72]">
                      <th className="w-32 py-2">
                        <button
                          onClick={() => setSort("status")}
                          className="inline-flex items-center gap-1"
                        >
                          Status / reason <ArrowUpDown className="size-3" />
                        </button>
                      </th>
                      <th className="w-28">Payment ID</th>
                      <th className="w-32">Customer</th>
                      <th className="w-28">Order</th>
                      <th className="w-44">Paket</th>
                      <th className="w-28">
                        <button
                          onClick={() => setSort("amount")}
                          className="inline-flex items-center gap-1"
                        >
                          Amount <ArrowUpDown className="size-3" />
                        </button>
                      </th>
                      <th className="w-32">
                        <button
                          onClick={() => setSort("createdAt")}
                          className="inline-flex items-center gap-1"
                        >
                          Created <ArrowUpDown className="size-3" />
                        </button>
                      </th>
                      <th className="w-32">
                        <button
                          onClick={() => setSort("updatedAt")}
                          className="inline-flex items-center gap-1"
                        >
                          Updated <ArrowUpDown className="size-3" />
                        </button>
                      </th>
                      <th className="w-20">Age</th>
                      <th>Provider / reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.rows.map((payment) => (
                      <tr key={payment.detailHref}>{row(payment)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-[#6b6b72]">
            <span>
              Halaman {result.page + 1} · {result.total} total
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={result.page === 0}
                onClick={() => updateSearch({ page: result.page - 1 })}
                className="min-h-9 rounded-lg border px-2.5 disabled:opacity-40"
              >
                ‹
              </button>
              <button
                type="button"
                disabled={!result.hasMore}
                onClick={() => updateSearch({ page: result.page + 1 })}
                className="min-h-9 rounded-lg border px-2.5 disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        </AdminSurface>
      </div>
    </AdminShell>
  );
}
