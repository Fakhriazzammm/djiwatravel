import { AlertTriangle, Check, ChevronLeft, ChevronRight, History, Percent, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";

import { AdminShell, AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { formatAdminDateTime } from "@/lib/admin-display";
import { readAdminCatalogPage } from "@/lib/admin-catalog.server";
import { validatePriceRuleInput } from "@/lib/price-rules";
import {
  applyCataloguePricing,
  previewCataloguePricing,
  readPriceRuleHistory,
  rollbackPricingBatch,
  type PriceRuleEventView,
  type PricingPreviewResult,
} from "@/lib/price-rules.server";
import { requireAdmin } from "@/lib/admin-guard";

const searchSchema = z.object({
  q: z.string().max(80).default(""),
  status: z.enum(["all", "unaffordable", "affordable"]).default("all"),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.union([z.literal(50), z.literal(100), z.literal(200)]).default(50),
  sortKey: z
    .enum(["name", "providerCost", "sellingPrice", "marginPercent", "durationDays", "volumeBytes"])
    .default("providerCost"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export const Route = createFileRoute("/admin/catalog")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    readAdminCatalogPage({
      data: {
        page: deps.page,
        pageSize: deps.pageSize,
        filter: { q: deps.q, status: deps.status },
        sortKey: deps.sortKey,
        sortDir: deps.sortDir,
      },
    }),
  component: AdminCatalogPage,
  pendingComponent: () => (
    <AdminShell title="Katalog & Pricing" subtitle="Memuat katalog provider">
      <div className="space-y-2" role="status" aria-live="polite">
        <p className="text-sm text-[#6e6e73]">Memuat katalog…</p>
        <div className="h-16 animate-pulse rounded-2xl bg-white motion-reduce:animate-none" />
        <div className="h-64 animate-pulse rounded-2xl bg-white motion-reduce:animate-none" />
      </div>
    </AdminShell>
  ),
  errorComponent: () => (
    <AdminShell title="Katalog & Pricing" subtitle="Katalog belum dapat dimuat">
      <div role="alert" className="rounded-2xl border border-[#f1d9a8] bg-[#fffaf0] p-4">
        <p className="font-semibold">Katalog belum dapat dimuat</p>
        <p className="mt-1 text-sm text-[#6e6e73]">
          Pembacaan katalog provider gagal atau melewati batas waktu. Tidak ada angka contoh yang ditampilkan.
        </p>
      </div>
    </AdminShell>
  ),
});

type StatusFilter = "all" | "unaffordable" | "affordable";

const idr = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : `Rp${Math.round(value).toLocaleString("id-ID")}`;
const usd = (value: number | null): string => (value === null ? "—" : `US$${value.toFixed(2)}`);
const percent = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

function dataLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

function AdminCatalogPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const { slice, kpi, balance, meta, ruleSummary } = data;

  const [qDraft, setQDraft] = useState(search.q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scopeAllFiltered, setScopeAllFiltered] = useState(false);
  const [markupPercent, setMarkupPercent] = useState<string>("");
  const [markupFixed, setMarkupFixed] = useState<string>("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<PricingPreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "good" | "danger"; text: string } | null>(null);
  const [history, setHistory] = useState<PriceRuleEventView[] | null>(null);
  const [editing, setEditing] = useState<{ packageCode: string; name: string; sellingPriceIdr: number } | null>(null);

  const markupInput = useMemo(() => {
    const parsedPercent = markupPercent.trim() === "" ? null : Number(markupPercent.replace(",", "."));
    const parsedFixed = markupFixed.trim() === "" ? null : Number(markupFixed.replace(/[^\d.-]/g, ""));
    return {
      markupPercent: parsedPercent !== null && Number.isFinite(parsedPercent) ? parsedPercent : null,
      fixedMarkupIdr: parsedFixed !== null && Number.isFinite(parsedFixed) ? parsedFixed : null,
    };
  }, [markupFixed, markupPercent]);

  const markupProblems = validatePriceRuleInput(markupInput);
  const reasonOk = reason.trim().length >= 4;
  const selectionCount = scopeAllFiltered ? slice.filteredCount : selected.size;
  const bulkReady = markupProblems.length === 0 && reasonOk && selectionCount > 0 && !busy;

  const navigate = (next: Partial<z.infer<typeof searchSchema>>) =>
    void router.navigate({ to: "/admin/catalog", search: { ...search, ...next } } as never);

  const refresh = async () => {
    setBusy(true);
    try {
      await router.invalidate();
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const selectionPayload = () =>
    scopeAllFiltered
      ? { mode: "filter" as const, filter: { q: search.q, status: search.status } }
      : { mode: "codes" as const, packageCodes: [...selected] };

  const runPreview = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await previewCataloguePricing({
        data: {
          selection: selectionPayload(),
          markup: markupInput,
          scopeTarget: "auto",
        } as never,
      });
      setPreview(result);
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Preview gagal." });
    } finally {
      setBusy(false);
    }
  };

  const runApply = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await applyCataloguePricing({
        data: {
          selection: selectionPayload(),
          markup: markupInput,
          scopeTarget: "auto",
          reason: reason.trim(),
          allowLoss: false,
        } as never,
      });
      setNotice({
        tone: "good",
        text: `Tersimpan: ${result.affectedPackages} paket (${result.countryRules} aturan negara, ${result.packageRules} aturan paket) · ${result.fields.join(" + ")}. Katalog & harga customer disegarkan.`,
      });
      setSelected(new Set());
      setScopeAllFiltered(false);
      setPreview(null);
      setReason("");
      setHistory(null);
      await router.invalidate();
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Gagal menyimpan aturan harga." });
    } finally {
      setBusy(false);
    }
  };

  const loadHistory = async () => {
    setBusy(true);
    try {
      setHistory(await readPriceRuleHistory({ data: { limit: 12 } } as never));
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Riwayat gagal dimuat." });
    } finally {
      setBusy(false);
    }
  };

  const rollback = async (batchId: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await rollbackPricingBatch({ data: { batchId, reason: `Rollback batch ${batchId.slice(0, 8)}` } } as never);
      setNotice({ tone: "good", text: `Rollback selesai: ${result.rolledBack} aturan dibatalkan, ${result.restored} aturan sebelumnya dipulihkan.` });
      setHistory(null);
      await router.invalidate();
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Rollback gagal." });
    } finally {
      setBusy(false);
    }
  };

  const toggleRow = (code: string) => {
    setScopeAllFiltered(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const pageCodes = slice.rows.map((row) => row.packageCode);
  const allPageSelected = pageCodes.length > 0 && pageCodes.every((code) => selected.has(code));

  return (
    <AdminShell title="Katalog & Pricing" subtitle="Monitor katalog provider, saldo, dan profit">
      <div className={`space-y-2 ${selectionCount > 0 || editing ? "pb-40" : ""}`}>
        {/* KPI strip — one screen, no cards maze */}
        <AdminSurface className="p-2.5">
          <div className="grid grid-cols-2 gap-y-2 divide-[#f0f0f2] sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
            <Kpi label="Saldo provider" value={usd(balance.usd)} detail={balance.idrReference === null ? "belum terbaca" : idr(balance.idrReference)} tone={balance.state === "ok" ? (balance.usd !== null && balance.usd < 5 ? "warn" : "good") : "warn"} />
            <Kpi label="Plafon per paket" value={balance.sellableCeilingUsd === null ? "—" : `US$${balance.sellableCeilingUsd.toFixed(2)}`} detail={balance.sellableCeilingUsd === null ? "saldo belum terbaca" : idr(balance.sellableCeilingUsd * balance.fxRateIdr)} />
            <Kpi label="Paket" value={String(kpi.totalPackages)} detail={`${kpi.filteredPackages} setelah filter`} />
            <Kpi label="Melebihi saldo" value={String(kpi.unaffordableCount)} detail={kpi.unknownBalanceCount > 0 ? `${kpi.unknownBalanceCount} belum pasti` : "verdict saldo aktif"} tone={kpi.unaffordableCount > 0 ? "warn" : "good"} />
            <Kpi label="Profit aktif" value={`${ruleSummary.globalPercent ?? data.defaults.markupPercent}%`} detail={ruleSummary.globalFixedIdr ? `+ ${idr(ruleSummary.globalFixedIdr)} · ${ruleSummary.countryCount} negara · ${ruleSummary.packageCount} paket` : `${ruleSummary.countryCount} negara · ${ruleSummary.packageCount} paket`} />
          </div>
        </AdminSurface>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-3 shadow-sm">
            <Search className="size-4 text-[#8e8e93]" />
            <input
              value={qDraft}
              onChange={(event) => setQDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") navigate({ q: qDraft, page: 1 });
              }}
              placeholder="Cari kode, nama paket, atau negara…"
              aria-label="Cari paket"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#8e8e93]"
            />
            {qDraft !== "" && (
              <button type="button" aria-label="Hapus pencarian" onClick={() => { setQDraft(""); navigate({ q: "", page: 1 }); }}>
                <X className="size-4 text-[#8e8e93]" />
              </button>
            )}
          </label>
          <button type="button" onClick={() => navigate({ q: qDraft, page: 1 })} className="hidden min-h-11 rounded-xl border border-black/[0.06] bg-white px-3 text-[13px] font-semibold shadow-sm sm:block">
            Cari
          </button>
          <select
            aria-label="Filter status saldo"
            value={search.status}
            onChange={(event) => navigate({ status: event.target.value as StatusFilter, page: 1 })}
            className="min-h-11 rounded-xl border border-black/[0.06] bg-white px-2 text-[13px] shadow-sm"
          >
            <option value="all">Semua paket</option>
            <option value="unaffordable">Melebihi saldo</option>
            <option value="affordable">Masih bisa dijual</option>
          </select>
          <select
            aria-label="Jumlah baris"
            value={String(search.pageSize)}
            onChange={(event) => navigate({ pageSize: Number(event.target.value) as 50, page: 1 })}
            className="min-h-11 rounded-xl border border-black/[0.06] bg-white px-2 text-[13px] shadow-sm"
          >
            <option value="50">50 baris</option>
            <option value="100">100 baris</option>
            <option value="200">200 baris</option>
          </select>
          <button type="button" onClick={refresh} disabled={busy} aria-label="Segarkan katalog" className="min-h-11 min-w-11 rounded-xl border border-black/[0.06] bg-white p-2 shadow-sm">
            <RefreshCw className={`mx-auto size-4 ${busy ? "animate-spin" : ""} motion-reduce:animate-none`} />
          </button>
          {(search.q !== "" || search.status !== "all") && (
            <button type="button" onClick={() => { setQDraft(""); navigate({ q: "", status: "all", page: 1 }); }} className="min-h-11 rounded-xl border border-black/[0.06] bg-white px-3 text-[13px] font-semibold shadow-sm">
              Bersihkan filter
            </button>
          )}
        </div>

        {/* Source / freshness chips */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#6e6e73]">
          <StatusPill tone={meta.stale ? "warn" : "good"}>
            {meta.stale ? "Katalog tersimpan (stale)" : meta.source === "provider" ? "Katalog live" : "Cache katalog"}
          </StatusPill>
          <span>Terakhir disinkron {meta.syncedAt ? formatAdminDateTime(meta.syncedAt) : "—"}</span>
          {meta.freshnessAgeSeconds !== null && <span>· umur {meta.freshnessAgeSeconds}s</span>}
          <span>· {slice.page} / {slice.pageCount} halaman</span>
          {balance.state !== "ok" && <span className="font-semibold text-[#9a6100]">· saldo provider belum terbaca: status paket ditampilkan netral</span>}
        </div>

        {notice && (
          <div role="status" className={`rounded-2xl p-3 text-sm ${notice.tone === "good" ? "bg-[#e8f8ed] text-[#1f6b34]" : "bg-[#fff0ef] text-[#c7352d]"}`}>
            {notice.text}
          </div>
        )}

        {/* Selection helpers */}
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <button
            type="button"
            onClick={() => {
              setScopeAllFiltered(false);
              setSelected(allPageSelected ? new Set() : new Set(pageCodes));
            }}
            className="min-h-9 rounded-xl border border-black/[0.06] bg-white px-2.5 font-semibold"
          >
            {allPageSelected ? "Kosongkan halaman ini" : `Pilih ${pageCodes.length} di halaman ini`}
          </button>
          {slice.filteredCount > pageCodes.length && (
            <button
              type="button"
              onClick={() => { setSelected(new Set()); setScopeAllFiltered((v) => !v); }}
              aria-pressed={scopeAllFiltered}
              className={`min-h-9 rounded-xl border px-2.5 font-semibold ${scopeAllFiltered ? "border-[#0a67c7] bg-[#eaf3ff] text-[#0a67c7]" : "border-black/[0.06] bg-white"}`}
            >
              {scopeAllFiltered ? "Batalkan seluruh hasil filter" : `Pilih seluruh hasil filter (${slice.filteredCount})`}
            </button>
          )}
          <span className="text-[#6e6e73]">
            {selectionCount} dipilih dari {slice.filteredCount} hasil filter (total {slice.totalCount} paket, batas {data.maxBatch}/aksi)
          </span>
        </div>

        {/* Desktop table (one screen: only this body scrolls) */}
        <AdminSurface className="hidden overflow-hidden p-0 md:block">
          <div className="max-h-[calc(100vh-19rem)] overflow-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead className="sticky top-0 z-10 bg-[#f7f7f8] text-left text-[11px] uppercase tracking-wide text-[#6e6e73]">
                <tr>
                  <th className="w-8 px-2 py-2" aria-label="Pilih" />
                  <SortHeader label="Paket" active={search.sortKey === "name"} dir={search.sortDir} onClick={() => navigate({ sortKey: "name", sortDir: search.sortKey === "name" && search.sortDir === "asc" ? "desc" : "asc" })} />
                  <SortHeader label="Kuota" active={search.sortKey === "volumeBytes"} dir={search.sortDir} onClick={() => navigate({ sortKey: "volumeBytes", sortDir: search.sortKey === "volumeBytes" && search.sortDir === "asc" ? "desc" : "asc" })} />
                  <SortHeader label="Hari" active={search.sortKey === "durationDays"} dir={search.sortDir} onClick={() => navigate({ sortKey: "durationDays", sortDir: search.sortKey === "durationDays" && search.sortDir === "asc" ? "desc" : "asc" })} />
                  <SortHeader label="HPP" align="right" active={search.sortKey === "providerCost"} dir={search.sortDir} onClick={() => navigate({ sortKey: "providerCost", sortDir: search.sortKey === "providerCost" && search.sortDir === "asc" ? "desc" : "asc" })} />
                  <th className="px-2 py-2 text-right">Profit</th>
                  <SortHeader label="Harga jual" align="right" active={search.sortKey === "sellingPrice"} dir={search.sortDir} onClick={() => navigate({ sortKey: "sellingPrice", sortDir: search.sortKey === "sellingPrice" && search.sortDir === "asc" ? "desc" : "asc" })} />
                  <SortHeader label="Margin" align="right" active={search.sortKey === "marginPercent"} dir={search.sortDir} onClick={() => navigate({ sortKey: "marginPercent", sortDir: search.sortKey === "marginPercent" && search.sortDir === "asc" ? "desc" : "asc" })} />
                  <th className="px-2 py-2 text-right">Status</th>
                  <th className="px-2 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f2]">
                {slice.rows.map((row) => (
                  <tr key={row.packageCode} className={selected.has(row.packageCode) ? "bg-[#eaf3ff]" : "bg-white"}>
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={selected.has(row.packageCode)}
                        onChange={() => toggleRow(row.packageCode)}
                        aria-label={`Pilih ${row.packageCode}`}
                        className="size-4"
                      />
                    </td>
                    <td className="max-w-[22rem] px-2 py-1.5">
                      <p className="truncate font-semibold">{row.name}</p>
                      <p className="truncate text-[11px] text-[#8e8e93]">
                        {row.packageCode} · {row.locationCodes.slice(0, 4).join(", ")}
                        {row.locationCodes.length > 4 ? ` +${row.locationCodes.length - 4}` : ""} · aturan {row.pricingSource === "default" ? "default" : row.pricingSource}
                      </p>
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{dataLabel(row.volumeBytes)}</td>
                    <td className="px-2 py-1.5 tabular-nums">{row.durationDays}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <p>US${(row.providerPriceUnits / 10_000).toFixed(2)}</p>
                      <p className="text-[11px] text-[#8e8e93]">{idr(row.providerCostIdr)}</p>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {row.markupPercent}%{row.fixedMarkupIdr > 0 ? ` + ${idr(row.fixedMarkupIdr)}` : ""}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{idr(row.sellingPriceIdr)}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${row.marginIdr < 0 ? "text-[#c7352d]" : "text-[#1f6b34]"}`}>
                      <p>{idr(row.marginIdr)}</p>
                      <p className="text-[11px]">{percent(row.marginPercent)}</p>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <StatusCell affordable={row.affordable} />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing({ packageCode: row.packageCode, name: row.name, sellingPriceIdr: row.sellingPriceIdr });
                          setSelected(new Set([row.packageCode]));
                          setScopeAllFiltered(false);
                          setMarkupPercent(String(row.markupPercent));
                          setMarkupFixed(row.fixedMarkupIdr > 0 ? String(row.fixedMarkupIdr) : "");
                          setReason("");
                          setPreview(null);
                        }}
                        className="min-h-8 rounded-lg border border-black/[0.06] px-2 text-[12px] font-semibold"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {slice.rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-[13px] text-[#6e6e73]">
                      Tidak ada paket pada filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </AdminSurface>

        {/* Mobile list (one screen: only this list scrolls) */}
        <div className="md:hidden">
          <AdminSurface className="max-h-[calc(100dvh-19rem)] divide-y divide-[#f0f0f2] overflow-auto p-0">
            {slice.rows.map((row) => (
              <div key={row.packageCode} className={`flex items-start gap-2 px-3 py-2 ${selected.has(row.packageCode) ? "bg-[#eaf3ff]" : ""}`}>
                <input
                  type="checkbox"
                  checked={selected.has(row.packageCode)}
                  onChange={() => toggleRow(row.packageCode)}
                  aria-label={`Pilih ${row.packageCode}`}
                  className="mt-1 size-4"
                />
                <button
                  type="button"
                  onClick={() => {
                    setEditing({ packageCode: row.packageCode, name: row.name, sellingPriceIdr: row.sellingPriceIdr });
                    setSelected(new Set([row.packageCode]));
                    setScopeAllFiltered(false);
                    setMarkupPercent(String(row.markupPercent));
                    setMarkupFixed(row.fixedMarkupIdr > 0 ? String(row.fixedMarkupIdr) : "");
                    setReason("");
                    setPreview(null);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-[13px] font-semibold">{row.name}</p>
                  <p className="truncate text-[11px] text-[#8e8e93]">{row.packageCode} · {dataLabel(row.volumeBytes)} · {row.durationDays} hari</p>
                  <p className="mt-0.5 text-[12px] tabular-nums">
                    US${(row.providerPriceUnits / 10_000).toFixed(2)} → <b>{idr(row.sellingPriceIdr)}</b>{" "}
                    <span className={row.marginIdr < 0 ? "text-[#c7352d]" : "text-[#1f6b34]"}>{percent(row.marginPercent)}</span>
                  </p>
                </button>
                <StatusCell affordable={row.affordable} />
              </div>
            ))}
            {slice.rows.length === 0 && <p className="px-3 py-8 text-center text-[13px] text-[#6e6e73]">Tidak ada paket pada filter ini.</p>}
          </AdminSurface>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#6e6e73]">
          <span>
            {slice.filteredCount === 0 ? "0" : (slice.page - 1) * slice.pageSize + 1}–{Math.min(slice.page * slice.pageSize, slice.filteredCount)} dari {slice.filteredCount} hasil filter · {slice.totalCount} paket total
          </span>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => navigate({ page: slice.page - 1 })} disabled={slice.page <= 1} className="min-h-9 rounded-xl border border-black/[0.06] bg-white px-2 disabled:opacity-40" aria-label="Halaman sebelumnya">
              <ChevronLeft className="size-4" />
            </button>
            <span className="tabular-nums">{slice.page} / {slice.pageCount}</span>
            <button type="button" onClick={() => navigate({ page: slice.page + 1 })} disabled={slice.page >= slice.pageCount} className="min-h-9 rounded-xl border border-black/[0.06] bg-white px-2 disabled:opacity-40" aria-label="Halaman berikutnya">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        {/* Active rules */}
        <AdminSurface className="p-3">
          <div className="flex items-center justify-between gap-2">
            <SectionHeading title="Aturan harga aktif" detail="Package mengalahkan negara, negara mengalahkan global; profit persen dan nominal digabung." />
            <button type="button" onClick={loadHistory} disabled={busy} className="min-h-9 shrink-0 rounded-xl border border-black/[0.06] px-2.5 text-[12px] font-semibold">
              <History className="mr-1 inline size-3.5" /> Riwayat
            </button>
          </div>
          {data.rules.length === 0 ? (
            <p className="mt-2 text-[12px] text-[#6e6e73]">
              Belum ada aturan tersimpan. Harga memakai default server: {data.defaults.markupPercent}% + {idr(data.defaults.fixedMarkupIdr)} (kurs {idr(data.defaults.usdToIdr)}/US$, pembulatan {idr(data.defaults.roundingIdr)}).
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-[#f0f0f2] text-[12px]">
              {data.rules.map((rule) => (
                <li key={rule.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <span className="font-semibold uppercase">{rule.scopeType}</span>
                  <span>{rule.scopeKey ?? "semua paket"}</span>
                  <span className="text-[#6e6e73]">
                    {rule.markupType === "percentage" ? `${rule.markupValue}%` : idr(rule.markupValue)}
                  </span>
                  <span className="text-[11px] text-[#8e8e93]">v{rule.version} · {rule.createdBy ?? "—"} · {formatAdminDateTime(rule.effectiveFrom)}</span>
                  {rule.reason && <span className="truncate text-[11px] text-[#8e8e93]">· {rule.reason}</span>}
                </li>
              ))}
            </ul>
          )}
          {history && (
            <ul className="mt-3 divide-y divide-[#f0f0f2] text-[12px]">
              {history.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <StatusPill tone={event.action === "rolled_back" ? "warn" : "neutral"}>{event.action}</StatusPill>
                  <span className="uppercase">{event.scopeType}</span>
                  <span>{event.scopeKey ?? "semua"}</span>
                  <span className="text-[#6e6e73]">
                    {event.markupType === "percentage" ? `${event.beforeValue ?? "—"}% → ${event.afterValue ?? "—"}%` : `${idr(event.beforeValue)} → ${idr(event.afterValue)}`}
                  </span>
                  <span className="text-[11px] text-[#8e8e93]">{event.actorId} · {formatAdminDateTime(event.createdAt)} · {event.reason}</span>
                  {event.batchId && event.action === "bulk_applied" && (
                    <button type="button" onClick={() => rollback(event.batchId as string)} disabled={busy} className="min-h-8 rounded-lg border border-[#e5e5ea] px-2 font-semibold">
                      <RotateCcw className="mr-1 inline size-3.5" /> Batalkan batch
                    </button>
                  )}
                </li>
              ))}
              {history.length === 0 && <li className="py-2 text-[#6e6e73]">Belum ada riwayat perubahan.</li>}
            </ul>
          )}
        </AdminSurface>
      </div>

      {/* Bulk / single editor bar */}
      {(selectionCount > 0 || editing) && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/[0.06] bg-white/95 p-2.5 pb-[max(10px,env(safe-area-inset-bottom))] backdrop-blur lg:left-[272px]">
          <div className="mx-auto max-w-[1360px] space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="font-semibold">{editing ? `Edit ${editing.name}` : `${selectionCount} paket dipilih`}</span>
              <label className="flex min-h-9 items-center gap-1 rounded-xl border border-black/[0.06] px-2">
                <Percent className="size-3.5 text-[#8e8e93]" />
                <input value={markupPercent} onChange={(event) => setMarkupPercent(event.target.value)} inputMode="decimal" placeholder="profit %" aria-label="Profit persen" className="w-20 bg-transparent text-[12px] outline-none" />
              </label>
              <label className="flex min-h-9 items-center gap-1 rounded-xl border border-black/[0.06] px-2">
                <span className="text-[#8e8e93]">Rp</span>
                <input value={markupFixed} onChange={(event) => setMarkupFixed(event.target.value)} inputMode="numeric" placeholder="profit nominal" aria-label="Profit nominal" className="w-28 bg-transparent text-[12px] outline-none" />
              </label>
              <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="alasan perubahan (wajib)" aria-label="Alasan perubahan" className="min-h-9 min-w-40 flex-1 rounded-xl border border-black/[0.06] px-2 text-[12px] outline-none" />
              <button type="button" onClick={runPreview} disabled={!bulkReady} className="min-h-9 rounded-xl border border-black/[0.06] px-3 font-semibold disabled:opacity-40">
                Preview Δ
              </button>
              <button type="button" onClick={runApply} disabled={!bulkReady || !preview} className="min-h-9 rounded-xl bg-[#0a67c7] px-3 font-semibold text-white disabled:opacity-40">
                Terapkan
              </button>
              <button
                type="button"
                onClick={() => { setSelected(new Set()); setScopeAllFiltered(false); setEditing(null); setPreview(null); }}
                className="min-h-9 rounded-xl border border-black/[0.06] px-3 font-semibold"
              >
                Tutup
              </button>
            </div>
            {markupProblems.length > 0 && <p className="text-[11px] text-[#9a6100]">{markupProblems.join(" ")}</p>}
            {!reasonOk && selectionCount > 0 && <p className="text-[11px] text-[#9a6100]">Alasan minimal 4 karakter (wajib untuk audit).</p>}
            {preview && (
              <div className="max-h-40 overflow-auto rounded-xl bg-[#f7f7f8] p-2 text-[11.5px]">
                <p className="font-semibold">
                  {preview.summary.affected} paket · naik {preview.summary.increased} · turun {preview.summary.decreased} · tetap {preview.summary.unchanged} · margin total {idr(preview.summary.marginIdrDelta)} · margin rata-rata {preview.summary.averageAfterMarginPercent.toFixed(1)}%
                  {preview.summary.becomesUnaffordable > 0 ? ` · ${preview.summary.becomesUnaffordable} jadi melebihi saldo` : ""}
                  {preview.summary.lossMaking > 0 ? ` · ${preview.summary.lossMaking} rugi (diblokir)` : ""} · aturan: {preview.scopes.country} negara / {preview.scopes.package} paket
                </p>
                <table className="mt-1 w-full border-collapse">
                  <tbody>
                    {preview.sample.map((row) => (
                      <tr key={row.packageCode} className="border-t border-black/[0.05]">
                        <td className="py-0.5">{row.packageCode}</td>
                        <td className="py-0.5 text-right">{idr(row.beforePriceIdr)} → <b>{idr(row.afterPriceIdr)}</b></td>
                        <td className="py-0.5 text-right">{percent(row.beforeMarginPercent)} → <b>{percent(row.afterMarginPercent)}</b></td>
                        <td className="py-0.5 text-right">{row.lossMaking ? "rugi" : row.affordableAfter === false ? "melebihi saldo" : "ok"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.sampled < preview.summary.affected && (
                  <p className="mt-1 text-[#6e6e73]">Menampilkan {preview.sampled} contoh dari {preview.summary.affected} paket.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function Kpi({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail?: string; tone?: "neutral" | "good" | "warn" }) {
  return (
    <div className="px-2.5 py-1">
      <p className="text-[11px] text-[#6e6e73]">{label}</p>
      <p className={`text-base font-semibold tabular-nums tracking-tight ${tone === "warn" ? "text-[#9a6100]" : tone === "good" ? "text-[#1f6b34]" : ""}`}>{value}</p>
      {detail && <p className="truncate text-[11px] text-[#8e8e93]">{detail}</p>}
    </div>
  );
}

function StatusCell({ affordable }: { affordable: boolean | null }) {
  if (affordable === null) return <StatusPill tone="neutral">Belum tersedia</StatusPill>;
  return (
    <StatusPill tone={affordable ? "good" : "danger"}>
      {affordable ? (
        <>
          <Check className="mr-0.5 inline size-3" /> Bisa dijual
        </>
      ) : (
        <>
          <AlertTriangle className="mr-0.5 inline size-3" /> Melebihi saldo
        </>
      )}
    </StatusPill>
  );
}

function SortHeader({ label, align = "left", active, dir, onClick }: { label: string; align?: "left" | "right"; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  return (
    <th className={`px-2 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <button type="button" onClick={onClick} className="font-semibold uppercase tracking-wide" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
        {label}
        {active ? (dir === "asc" ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );
}
