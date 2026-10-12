import { ArrowUpDown, CreditCard, Eye, EyeOff, RefreshCw, Search } from "lucide-react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminPayments } from "@/lib/admin-read-model.server";
import { ageFrom, formatAdminDateTime, humanizeAdminStatus } from "@/lib/admin-display";
import { AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";

export const Route = createFileRoute("/admin/payments")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: () => getAdminPayments(),
  component: AdminPayments,
});

type SortKey = "createdAt" | "updatedAt" | "amount" | "status";
function AdminPayments() {
  const payments = Route.useLoaderData();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSortState] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "updatedAt", dir: "desc" });
  const [privateMode, setPrivateMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const filtered = useMemo(() => payments.filter((payment) => {
    const haystack = [payment.publicOrderCode, payment.customer.label, payment.customer.email, payment.customer.whatsapp, payment.paymentReference, payment.paymentProvider, payment.lastError].filter(Boolean).join(" ").toLowerCase();
    return (status === "ALL" || payment.status === status) && haystack.includes(query.toLowerCase());
  }).sort((a, b) => {
    const left = sort.key === "amount" ? (a.amount ?? -1) : sort.key === "status" ? a.status : (a[sort.key] ?? "");
    const right = sort.key === "amount" ? (b.amount ?? -1) : sort.key === "status" ? b.status : (b[sort.key] ?? "");
    const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
    return sort.dir === "asc" ? result : -result;
  }), [payments, query, status, sort]);
  const statuses = [...new Set(payments.map((payment) => payment.status))];
  const setSort = (key: SortKey) => setSortState((current) => ({ key, dir: current.key === key && current.dir === "desc" ? "asc" : "desc" }));
  const refresh = async () => { setRefreshing(true); try { await router.invalidate(); } finally { setRefreshing(false); } };
  const displayAmount = (payment: (typeof payments)[number]) => payment.amount === null || !payment.currencyCode ? "—" : privateMode ? `${payment.currencyCode} ••••` : `${payment.currencyCode} ${payment.amount.toLocaleString("id-ID")}`;
  const row = (payment: (typeof payments)[number]) => <>
    <td className="py-2"><StatusPill tone={payment.lastError ? "danger" : "warn"}>{humanizeAdminStatus(payment.status)}</StatusPill><span className="mt-1 block max-w-40 truncate text-[11px] text-[#b00020]" title={payment.lastError ?? undefined}>{payment.lastError ?? payment.eventType ?? "Reason unknown"}</span></td>
    <td className="max-w-28 truncate font-mono" title={payment.id}>{payment.id.slice(0, 12)}…</td>
    <td>{privateMode ? "••••" : payment.customer.label}</td>
    <td><Link to={`/admin/orders/${payment.orderId}` as never} className="font-semibold text-[#0a67c7]">{payment.publicOrderCode}</Link></td>
    <td className="max-w-44 truncate" title={payment.itemSummary ?? undefined}>{payment.itemSummary ?? "Paket belum tersedia"}</td>
    <td className="whitespace-nowrap">{displayAmount(payment)}</td>
    <td className="whitespace-nowrap">{formatAdminDateTime(payment.orderCreatedAt ?? payment.createdAt)}</td>
    <td className="whitespace-nowrap">{formatAdminDateTime(payment.updatedAt)}</td>
    <td className="whitespace-nowrap">{ageFrom(payment.updatedAt)}</td>
    <td className="max-w-32 truncate" title={payment.paymentReference ?? undefined}>{payment.paymentProvider ?? "Provider unknown"}{payment.paymentReference ? ` · ${payment.paymentReference}` : ""}</td>
  </>;
  return <AdminShell title="Payments" subtitle="Exception pembayaran yang dapat ditelusuri ke detail order; tidak ada mutasi status.">
    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
      <label className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-[#8a8a91]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari order, customer masked, payment…" className="min-h-11 w-full rounded-xl border border-[#e5e5ea] bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]" /></label>
      <select aria-label="Filter status pembayaran" value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-11 rounded-xl border border-[#e5e5ea] bg-white px-3 text-sm"><option value="ALL">Status: Semua</option>{statuses.map((value) => <option key={value} value={value}>{humanizeAdminStatus(value)}</option>)}</select>
      <button type="button" onClick={refresh} disabled={refreshing} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e5ea] bg-white px-3 text-sm font-semibold"><RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh</button>
      <button type="button" onClick={() => setPrivateMode((value) => !value)} aria-pressed={privateMode} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e5ea] bg-white px-3 text-sm font-semibold">{privateMode ? <EyeOff className="size-4" /> : <Eye className="size-4" />} Privasi</button>
    </div>
    <section className="mt-4 rounded-xl border border-[#e5e5ea] bg-white p-4"><div className="flex items-center justify-between gap-3"><SectionHeading title="Payment exceptions" detail="Provider, reference, timestamps, order/package context, dan customer masked dari loader server-side." /><StatusPill>{filtered.length} / {payments.length}</StatusPill></div>
      {filtered.length === 0 ? <div className="mt-5 rounded-xl border border-dashed p-8 text-center text-sm text-[#6b6b72]">Tidak ada payment exception yang cocok.</div> : <><div className="mt-4 hidden overflow-auto lg:block"><table className="w-full min-w-[1250px] table-fixed text-left text-xs"><thead className="sticky top-0 bg-white"><tr className="border-b text-[#6b6b72]"><th className="w-32 py-2"><button onClick={() => setSort("status")} className="inline-flex items-center gap-1">Status / reason <ArrowUpDown className="size-3" /></button></th><th className="w-28">Payment ID</th><th className="w-32">Customer</th><th className="w-28">Order</th><th className="w-44">Paket</th><th className="w-28"><button onClick={() => setSort("amount")} className="inline-flex items-center gap-1">Amount <ArrowUpDown className="size-3" /></button></th><th className="w-32"><button onClick={() => setSort("createdAt")} className="inline-flex items-center gap-1">Created <ArrowUpDown className="size-3" /></button></th><th className="w-32"><button onClick={() => setSort("updatedAt")} className="inline-flex items-center gap-1">Updated <ArrowUpDown className="size-3" /></button></th><th className="w-20">Age</th><th>Provider / reference</th></tr></thead><tbody className="divide-y">{filtered.map((payment) => <tr key={payment.id}>{row(payment)}</tr>)}</tbody></table></div><div className="space-y-2 lg:hidden">{filtered.map((payment) => <Link key={payment.id} to={`/admin/orders/${payment.orderId}` as never} className="block rounded-xl border border-[#e5e5ea] p-3 text-xs"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{payment.publicOrderCode} · {humanizeAdminStatus(payment.status)}</p><p className="mt-1 text-[#6b6b72]">{privateMode ? "••••" : payment.customer.label} · {displayAmount(payment)}</p></div><CreditCard className="size-4 text-[#b87400]" /></div><p className="mt-2 text-[#6b6b72]">{payment.itemSummary ?? "Paket belum tersedia"} · {ageFrom(payment.updatedAt)}</p><p className="mt-1 text-[#b00020]">{payment.lastError ?? payment.eventType ?? "Reason unknown"}</p></Link>)}</div></>}
    </section>
  </AdminShell>;
}
