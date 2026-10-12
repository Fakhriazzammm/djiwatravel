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
import { AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";

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
        {projectAdminPrivacy(payment.paymentProvider ?? "Provider unknown", privateMode)}
        {payment.paymentReference
          ? ` · ${projectAdminPrivacy(payment.paymentReference, privateMode)}`
          : ""}
      </td>
    </>
  );
  return (
    <AdminShell
      title="Payments"
      subtitle="Exception pembayaran yang dapat ditelusuri ke detail order; tidak ada mutasi status."
    >
      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-[#8a8a91]" />
          <input
            value={search.q}
            onChange={(event) => updateSearch({ q: event.target.value, page: 0 })}
            placeholder="Cari order, provider, status…"
            className="min-h-11 w-full rounded-xl border border-[#e5e5ea] bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]"
          />
        </label>
        <select
          aria-label="Filter status pembayaran"
          value={search.status}
          onChange={(event) => updateSearch({ status: event.target.value, page: 0 })}
          className="min-h-11 rounded-xl border border-[#e5e5ea] bg-white px-3 text-sm"
        >
          {statuses.map((value) => (
            <option key={value} value={value}>
              Status: {value === "ALL" ? "Semua" : humanizeAdminStatus(value)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e5ea] bg-white px-3 text-sm font-semibold"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
        <button
          type="button"
          onClick={() => setPrivateMode((value) => !value)}
          aria-pressed={privateMode}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e5ea] bg-white px-3 text-sm font-semibold"
        >
          {privateMode ? <EyeOff className="size-4" /> : <Eye className="size-4" />} Privasi
        </button>
      </div>
      <section className="mt-4 rounded-xl border border-[#e5e5ea] bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading
            title="Payment exceptions"
            detail="Query, filter, sort, dan pagination diproses server-side; reference/error sudah direduksi."
          />
          <StatusPill>
            {result.rows.length} / {result.total}
          </StatusPill>
        </div>
        {result.rows.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed p-8 text-center text-sm text-[#6b6b72]">
            Tidak ada payment exception yang cocok.
          </div>
        ) : (
          <>
            <div className="mt-4 hidden overflow-auto lg:block">
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
            <div className="space-y-2 lg:hidden">
              {result.rows.map((payment) => (
                <Link
                  key={payment.detailHref}
                  to={payment.detailHref as never}
                  className="block rounded-xl border border-[#e5e5ea] p-3 text-xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {projectAdminIdentifier(payment.displayIdentifier, privateMode)} ·{" "}
                        {humanizeAdminStatus(payment.status)}
                      </p>
                      <p className="mt-1 text-[#6b6b72]">
                        {privateMode ? "••••" : payment.customer.label} · {displayAmount(payment)}
                      </p>
                    </div>
                    <CreditCard className="size-4 text-[#b87400]" />
                  </div>
                  <p className="mt-2 text-[#6b6b72]">
                    {projectAdminPrivacy(
                      payment.itemSummary ?? "Paket belum tersedia",
                      privateMode,
                    )}{" "}
                    · {ageFrom(payment.updatedAt)}
                  </p>
                  <p className="mt-1 text-[#b00020]">
                    {payment.lastError ?? payment.eventType ?? "Reason unknown"}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
        <div className="mt-4 flex items-center justify-between text-xs text-[#6b6b72]">
          <span>
            Halaman {result.page + 1} · total exact {result.total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={result.page === 0}
              onClick={() => updateSearch({ page: result.page - 1 })}
              className="min-h-9 rounded-lg border px-3 disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <button
              type="button"
              disabled={!result.hasMore}
              onClick={() => updateSearch({ page: result.page + 1 })}
              className="min-h-9 rounded-lg border px-3 disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
