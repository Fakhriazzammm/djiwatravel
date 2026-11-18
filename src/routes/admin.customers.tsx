import { Download, RefreshCw, Search } from "lucide-react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { requireAdmin } from "@/lib/admin-guard";
import {
  exportAdminCustomers,
  getAdminCustomerGrowth,
  getAdminCustomers,
} from "@/lib/admin-customers.fn";
import type {
  AdminCustomerCriteria,
  AdminCustomerKind,
  AdminCustomerRow,
  AdminCustomerSort,
} from "@/lib/admin-customers.server";
import {
  CUSTOMER_CRITERIA_LABEL,
  CUSTOMER_KIND_FILTERS,
  CUSTOMER_SORT_LABEL,
  avatarTone,
  customerCsvRows,
  customerInitial,
  customerName,
  pageWindow,
  rupiahCompact,
  sharePct,
  type CustomerView,
} from "@/lib/admin-customers-view";
import { AdminShell } from "@/components/admin-shell";
import { CustomerGrowth } from "@/components/admin-customers-growth";
import { formatAdminDateTime } from "@/lib/admin-display";
import { toCsv } from "@/lib/analytics-insights";

const MONO = "font-mono text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground";
const KIND_LABEL: Record<AdminCustomerKind, string> = {
  all: "Semua",
  member: "Member",
  guest: "Tamu",
  noprofile: "Tanpa profil",
};

export const Route = createFileRoute("/admin/customers")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: (search) => {
    const page = Number(search["page"]);
    const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
      allowed.includes(value as T) ? (value as T) : fallback;
    return {
      tab: pick<CustomerView>(search["tab"], ["daftar", "analisis"], "daftar"),
      q: typeof search["q"] === "string" ? search["q"] : "",
      kind: pick<AdminCustomerKind>(search["kind"], CUSTOMER_KIND_FILTERS, "all"),
      criteria: pick<AdminCustomerCriteria>(
        search["criteria"],
        Object.keys(CUSTOMER_CRITERIA_LABEL) as AdminCustomerCriteria[],
        "all",
      ),
      sort: pick<AdminCustomerSort>(
        search["sort"],
        Object.keys(CUSTOMER_SORT_LABEL) as AdminCustomerSort[],
        "active",
      ),
      page: Number.isInteger(page) && page >= 1 ? page : 1,
    };
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    if (deps.tab === "analisis") return { list: null, growth: await getAdminCustomerGrowth() };
    const { tab: _tab, ...filters } = deps;
    return { list: await getAdminCustomers({ data: filters }), growth: null };
  },
  component: AdminCustomers,
});

function Pills({ row }: { row: AdminCustomerRow }) {
  const items = [
    row.tripCount > 0 && `${row.tripCount} trip`,
    row.shoppingCount > 0 && `${row.shoppingCount} titip`,
    row.feedPostCount > 0 && `${row.feedPostCount} feed`,
  ].filter(Boolean) as string[];
  if (!items.length) return <span className="text-muted-foreground">–</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span key={item} className="bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-semibold">
          {item}
        </span>
      ))}
    </span>
  );
}

function AdminCustomers() {
  const { list, growth } = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const [draft, setDraft] = useState(search.q);
  const [busy, setBusy] = useState<"refresh" | "export" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const go = (next: Partial<typeof search>) =>
    void router.navigate({
      to: "/admin/customers",
      search: { ...search, page: 1, ...next },
    } as never);

  async function refresh() {
    setBusy("refresh");
    try {
      await router.invalidate();
    } finally {
      setBusy(null);
    }
  }

  async function exportCsv() {
    setBusy("export");
    setNotice(null);
    try {
      const { rows, truncated } = await exportAdminCustomers({
        data: { q: search.q, kind: search.kind, criteria: search.criteria, sort: search.sort },
      });
      const blob = new Blob([toCsv(customerCsvRows(rows))], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `pelanggan-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(
        truncated
          ? `${rows.length} baris diekspor (dibatasi). Persempit dengan pencarian untuk sisanya.`
          : `${rows.length} baris diekspor. Ekspor tercatat di audit log.`,
      );
    } catch {
      setNotice("Ekspor gagal. Coba lagi.");
    } finally {
      setBusy(null);
    }
  }

  const tabs: [CustomerView, string][] = [
    ["daftar", "Daftar pelanggan"],
    ["analisis", "Pertumbuhan & analisis"],
  ];

  return (
    <AdminShell
      title="Pelanggan"
      subtitle="Semua orang yang dikenal sistem: member (dengan atau tanpa profil) dan tamu."
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <nav className="inline-flex border border-border" aria-label="Bagian pelanggan">
            {tabs.map(([id, label]) => (
              <Link
                key={id}
                to="/admin/customers"
                search={{ ...search, tab: id, page: 1 } as never}
                aria-current={search.tab === id ? "page" : undefined}
                className={`min-h-9 px-3 py-2 font-mono text-[11.5px] ${search.tab === id ? "bg-foreground text-background" : "hover:bg-secondary"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            aria-label="Muat ulang pelanggan"
            disabled={busy === "refresh"}
            onClick={refresh}
            className="inline-flex min-h-9 items-center gap-1.5 border border-border px-2.5 font-mono text-[11.5px] hover:bg-secondary disabled:opacity-60"
          >
            <RefreshCw className={`size-3.5 ${busy === "refresh" ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Muat ulang</span>
          </button>
        </div>

        {growth && <CustomerGrowth data={growth} />}

        {list && (
          <>
            <div className="grid grid-cols-2 border border-border bg-card sm:grid-cols-4 sm:divide-x sm:divide-border">
              {[
                [
                  "Total pelanggan",
                  list.counts.all,
                  `${list.counts.member} member · ${list.counts.guest} tamu`,
                ],
                [
                  "Pernah membayar",
                  list.counts.buyers,
                  `${sharePct(list.counts.buyers, list.counts.all) ?? 0}% dari semua`,
                ],
                ["Baru 30 hari", list.counts.newMonth, "pertama kali terlihat"],
                [
                  "Tanpa profil",
                  list.counts.noProfile,
                  `${sharePct(list.counts.noProfile, list.counts.member) ?? 0}% dari member`,
                ],
              ].map(([label, value, hint]) => (
                <div key={String(label)} className="px-3 py-2">
                  <p className={MONO}>{label}</p>
                  <p className="text-base font-semibold tabular-nums">
                    {Number(value).toLocaleString("id-ID")}
                  </p>
                  <p className="truncate text-[10.5px] text-muted-foreground">{hint}</p>
                </div>
              ))}
            </div>

            <form
              className="flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                go({ q: draft.trim() });
              }}
            >
              <label className="flex min-h-10 min-w-[200px] flex-1 items-center gap-2 border border-border bg-card px-3">
                <Search className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">Cari pelanggan</span>
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                  placeholder="Cari nama, email, atau nomor WhatsApp…"
                />
              </label>
              <select
                aria-label="Urutkan"
                value={search.sort}
                onChange={(event) => go({ sort: event.target.value as AdminCustomerSort })}
                className="min-h-10 border border-border bg-card px-2 text-[13px]"
              >
                {Object.entries(CUSTOMER_SORT_LABEL).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Kriteria"
                value={search.criteria}
                onChange={(event) => go({ criteria: event.target.value as AdminCustomerCriteria })}
                className="min-h-10 border border-border bg-card px-2 text-[13px]"
              >
                {Object.entries(CUSTOMER_CRITERIA_LABEL).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={exportCsv}
                disabled={busy === "export" || list.total === 0}
                className="inline-flex min-h-10 items-center gap-1.5 bg-foreground px-3 font-mono text-[11.5px] font-semibold text-background disabled:opacity-50"
              >
                <Download className="size-3.5" aria-hidden="true" />
                {busy === "export" ? "Menyiapkan…" : "Ekspor CSV"}
              </button>
            </form>
            {notice && (
              <p role="status" className="text-[11px] text-muted-foreground">
                {notice}
              </p>
            )}

            <div
              role="group"
              aria-label="Jenis pelanggan"
              className="inline-flex max-w-full overflow-x-auto border border-border bg-card"
            >
              {CUSTOMER_KIND_FILTERS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={search.kind === id}
                  onClick={() => go({ kind: id })}
                  className={`min-h-9 shrink-0 px-3 font-mono text-[11.5px] ${search.kind === id ? "bg-foreground text-background" : "hover:bg-secondary"}`}
                >
                  {KIND_LABEL[id]}
                </button>
              ))}
            </div>

            <section className="border border-border bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <p className={MONO}>{list.total.toLocaleString("id-ID")} pelanggan</p>
                <p className="text-[11px] text-muted-foreground">
                  halaman {list.page}/{list.pageCount}
                </p>
              </div>
              <div
                className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-border px-3 py-1.5 md:grid"
                aria-hidden="true"
              >
                {["Pelanggan", "Kelompok", "Order", "Fitur", "Belanja", "Aktif"].map((head, i) => (
                  <span key={head} className={`${MONO} ${i >= 4 ? "text-right" : ""}`}>
                    {head}
                  </span>
                ))}
              </div>
              {list.rows.length === 0 ? (
                <p className="p-6 text-center text-[13px] text-muted-foreground">
                  Belum ada pelanggan yang cocok.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {list.rows.map((row) => (
                    <li key={row.ref}>
                      <Link
                        to="/admin/customer/$id"
                        params={{ id: row.id }}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 hover:bg-secondary/50 md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${avatarTone(row.id)}`}
                            aria-hidden="true"
                          >
                            {customerInitial(row)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold">
                              {customerName(row)}
                            </span>
                            <span className="block truncate text-[11.5px] text-muted-foreground">
                              {[row.email, row.whatsapp].filter(Boolean).join(" · ") ||
                                "Email dan WhatsApp belum tersimpan"}
                            </span>
                          </span>
                        </span>
                        <span className="hidden text-[11.5px] md:block">
                          <span
                            className={`inline-block px-1.5 py-0.5 font-mono text-[10px] font-semibold ${row.kind === "guest" ? "bg-secondary" : row.profileComplete ? "bg-[#e8f8ed] text-success" : "bg-[#fff4df] text-[#9a6100]"}`}
                          >
                            {row.kind === "guest"
                              ? "Tamu"
                              : row.profileComplete
                                ? "Member"
                                : "Profil belum lengkap"}
                          </span>
                          <span className="mt-0.5 block text-muted-foreground">#{row.ref}</span>
                        </span>
                        <span className="hidden text-[12px] md:block">
                          {row.orderCount} order
                          <span className="block text-[11px] text-muted-foreground">
                            {row.latestOrderAt
                              ? formatAdminDateTime(row.latestOrderAt)
                              : "belum pernah"}
                          </span>
                        </span>
                        <span className="hidden text-[11px] md:block">
                          <Pills row={row} />
                        </span>
                        <span className="text-right text-[12px] tabular-nums">
                          {rupiahCompact(row.spendIdr)}
                          <span className="block text-[11px] text-muted-foreground">
                            {row.paidCount} bayar
                          </span>
                        </span>
                        <span className="hidden text-right text-[11.5px] text-muted-foreground md:block">
                          {formatAdminDateTime(row.lastActivityAt ?? row.firstSeenAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                <button
                  type="button"
                  disabled={list.page <= 1}
                  onClick={() => go({ page: list.page - 1 })}
                  className="min-h-9 border border-border px-3 text-[12px] disabled:opacity-40"
                >
                  ← Sebelumnya
                </button>
                <div className="flex gap-1">
                  {pageWindow(list.page, list.pageCount).map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-current={n === list.page ? "page" : undefined}
                      onClick={() => go({ page: n })}
                      className={`size-9 text-[12px] tabular-nums ${n === list.page ? "bg-foreground text-background" : "hover:bg-secondary"}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={list.page >= list.pageCount}
                  onClick={() => go({ page: list.page + 1 })}
                  className="min-h-9 border border-border px-3 text-[12px] disabled:opacity-40"
                >
                  Berikutnya →
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </AdminShell>
  );
}
