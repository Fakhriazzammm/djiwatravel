import { createFileRoute, Link } from "@tanstack/react-router";
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
function volumeForSort(pkg: ResellerCatalogPackage) { return pkg.volumeBytes === 0 ? Number.POSITIVE_INFINITY : pkg.volumeBytes; }

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
    <main className="mx-auto min-h-screen max-w-5xl bg-background px-4 py-8 text-foreground">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Djiwa Travel</p>
        <h1 className="mt-2 text-2xl font-bold">Paket internet untuk perjalanan</h1>
        <p className="mt-2 text-sm text-muted-foreground">Pilih kuota dan masa aktif yang sesuai. Cakupan negara ditampilkan di setiap paket.</p>
        <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">
          <strong>{packages.length.toLocaleString("id-ID")}</strong> paket tersedia{destination === "ALL" ? " untuk berbagai destinasi" : " untuk destinasi pilihanmu"}.
        </div>
      </header>
      <section aria-label="Filter destinasi dan urutan paket" className="mb-5 rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">Pilih destinasi</p>
          <label className="flex items-center gap-2 text-xs text-muted-foreground"><span>Urutkan</span><select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"><option value="recommended">Rekomendasi</option><option value="price-asc">Harga terendah</option><option value="price-desc">Harga tertinggi</option><option value="data-desc">Kuota terbesar</option><option value="duration-desc">Masa aktif terlama</option></select></label>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter negara">
          <button type="button" onClick={() => setDestination("ALL")} aria-pressed={destination === "ALL"} title="Semua destinasi" className={`flex size-11 shrink-0 items-center justify-center rounded-xl border text-xl transition ${destination === "ALL" ? "border-primary bg-primary/10" : "border-border bg-background"}`}>🌐</button>
          {destinationFilters.map(([code, name, flag]) => <button key={code} type="button" onClick={() => setDestination(code)} aria-label={name} aria-pressed={destination === code} title={name} className={`flex size-11 shrink-0 items-center justify-center rounded-xl border text-xl transition ${destination === code ? "border-primary bg-primary/10" : "border-border bg-background"}`}>{flag}</button>)}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Ketuk bendera untuk melihat paket di negara tersebut.</p>
      </section>
      {packages.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">Belum ada paket untuk destinasi ini. Coba pilih bendera lain.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{packages.map((pkg) => <article key={pkg.packageCode} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-primary">Paket internet</p><h2 className="mt-2 font-semibold leading-snug">{packageDestinationLabel(pkg)}</h2><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Kuota</p><p className="mt-1 font-semibold">{packageDataLabel(pkg)}</p></div><div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Masa aktif</p><p className="mt-1 font-semibold">{pkg.durationDays} hari</p></div></div><p className="mt-3 text-xs text-muted-foreground"><span className="font-medium text-foreground">Cakupan:</span> {packageCoverageLabel(pkg)}</p><p className="mt-4 text-xs text-muted-foreground">Harga paket</p><p className="text-lg font-bold text-primary">{rupiah(pkg.sellingPrice.sellingPriceIdr)}</p><Link to="/checkout/$id" params={{ id: pkg.packageCode }} className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">Lihat detail &amp; pilih</Link></article>)}</div>}
    </main>
  );
}
