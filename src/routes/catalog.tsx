import { createFileRoute, Link } from "@tanstack/react-router";
import { TabBar } from "@/components/shell";
import { useMemo, useState } from "react";
import type { ResellerCatalogPackage } from "@/lib/esim-access-catalog";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";
import { packageCoverageLabel, packageDataLabel, packageDestinationLabel } from "@/lib/package-copy";

export const Route = createFileRoute("/catalog")({
  loader: () => getResellerCatalog(),
  component: LiveCatalog,
});

function rupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

const destinationFilters = [
  ["JP", "Jepang", "🇯🇵"], ["SG", "Singapura", "🇸🇬"], ["TH", "Thailand", "🇹🇭"],
  ["KR", "Korea Selatan", "🇰🇷"], ["CN", "Tiongkok", "🇨🇳"], ["US", "Amerika Serikat", "🇺🇸"],
  ["AU", "Australia", "🇦🇺"], ["GB", "Inggris", "🇬🇧"], ["SA", "Arab Saudi", "🇸🇦"],
] as const;
type SortMode = "recommended" | "price-asc" | "price-desc" | "data-desc" | "duration-desc";
/** Unknown quota is not unlimited: sort it last instead of treating it as the largest package. */
function volumeForSort(pkg: ResellerCatalogPackage) { if (pkg.unlimited === true) return Number.POSITIVE_INFINITY; return Number.isFinite(pkg.volumeBytes) && pkg.volumeBytes > 0 ? pkg.volumeBytes : -1; }

function LiveCatalog() {
  const catalog = Route.useLoaderData();
  const [destination, setDestination] = useState("ALL");
  const [sort, setSort] = useState<SortMode>("recommended");
  const packages = useMemo(() => {
    const filtered = destination === "ALL" ? catalog.packages : catalog.packages.filter((pkg) => pkg.locationCodes.includes(destination));
    return [...filtered].sort((a, b) => {
      if (sort === "price-asc") return a.sellingPrice.sellingPriceIdr - b.sellingPrice.sellingPriceIdr;
      if (sort === "price-desc") return b.sellingPrice.sellingPriceIdr - a.sellingPrice.sellingPriceIdr;
      if (sort === "data-desc") return volumeForSort(b) - volumeForSort(a);
      if (sort === "duration-desc") return b.durationDays - a.durationDays;
      return 0;
    });
  }, [catalog.packages, destination, sort]);
  return (
    <>
    <main className="mx-auto min-h-screen w-full min-w-0 max-w-5xl overflow-x-hidden bg-background px-4 py-5 pb-24 text-foreground sm:px-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Djiwa Travel</p>
        <h1 className="mt-2 max-w-[22ch] text-xl font-bold leading-tight sm:max-w-none sm:text-2xl">Paket internet untuk perjalanan</h1>
        <p className="mt-2 text-sm text-muted-foreground">Pilih kuota dan masa aktif yang sesuai. Cakupan negara ditampilkan di setiap paket.</p>
        <div className="mt-3 rounded-xl border border-border bg-card px-3 py-2.5 text-sm">
          <strong>{packages.length.toLocaleString("id-ID")}</strong> paket tersedia{destination === "ALL" ? " untuk berbagai destinasi" : " untuk destinasi pilihanmu"}.
        </div>
      </header>
      <section aria-label="Filter destinasi dan urutan paket" className="mb-4 rounded-2xl border border-border bg-card p-2.5 sm:p-3">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold">Pilih destinasi</p>
          <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><span className="shrink-0">Urutkan</span><select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className="h-9 min-w-0 max-w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"><option value="recommended">Rekomendasi</option><option value="price-asc">Harga terendah</option><option value="price-desc">Harga tertinggi</option><option value="data-desc">Kuota terbesar</option><option value="duration-desc">Masa aktif terlama</option></select></label>
        </div>
        <div className="mt-2 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1" role="group" aria-label="Filter negara">
          <button type="button" onClick={() => setDestination("ALL")} aria-pressed={destination === "ALL"} title="Semua destinasi" className={`flex size-11 shrink-0 items-center justify-center rounded-xl border text-xl transition ${destination === "ALL" ? "border-primary bg-primary/10" : "border-border bg-background"}`}>🌐</button>
          {destinationFilters.map(([code, name, flag]) => <button key={code} type="button" onClick={() => setDestination(code)} aria-label={name} aria-pressed={destination === code} title={name} className={`flex size-11 shrink-0 items-center justify-center rounded-xl border text-xl transition ${destination === code ? "border-primary bg-primary/10" : "border-border bg-background"}`}>{flag}</button>)}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Ketuk bendera untuk melihat paket di negara tersebut.</p>
      </section>
      {packages.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">Belum ada paket untuk destinasi ini. Coba pilih bendera lain.</p> : <div className="grid min-w-0 grid-cols-2 gap-2 lg:gap-2.5 lg:grid-cols-3">{packages.map((pkg) => <article key={pkg.packageCode} className="min-w-0 max-w-full rounded-2xl border border-border/80 border-t-2 border-t-primary/70 bg-gradient-to-b from-card via-card to-muted/30 p-2.5 shadow-sm transition-shadow hover:shadow-md sm:p-3"><div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><h2 className="break-words text-sm font-bold leading-snug tracking-tight sm:text-base">{packageDestinationLabel(pkg)}</h2></div><p className="shrink-0 text-sm font-extrabold tracking-tight text-primary sm:text-base">{rupiah(pkg.sellingPrice.sellingPriceIdr)}</p></div><div className="mt-2 inline-flex max-w-full items-center rounded-lg bg-primary/10 px-2 py-1.5 text-[11px] font-bold text-primary"><span className="whitespace-nowrap">{packageDataLabel(pkg)} · {pkg.durationDays} hari</span></div><p className="mt-2 break-words px-0.5 text-xs leading-snug text-muted-foreground"><span className="font-semibold text-foreground">Cakupan:</span> {packageCoverageLabel(pkg)}</p><Link to="/checkout/$id" params={{ id: pkg.packageCode }} className="mt-2.5 inline-flex min-h-10 w-full max-w-full items-center justify-center rounded-xl bg-primary px-2.5 py-2 text-center text-[11px] font-bold leading-tight text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:px-3 sm:text-sm">Pilih paket</Link></article>)}</div>}
    </main>
      <TabBar />
    </>
  );
}
