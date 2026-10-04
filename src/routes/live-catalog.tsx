import { createFileRoute } from "@tanstack/react-router";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";

export const Route = createFileRoute("/live-catalog")({
  loader: () => getResellerCatalog(),
  component: LiveCatalog,
});

function rupiah(value: number) { return `Rp${value.toLocaleString("id-ID")}`; }

function LiveCatalog() {
  const catalog = Route.useLoaderData();
  return (
    <main className="mx-auto min-h-screen max-w-5xl bg-background px-4 py-8 text-foreground">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Djiwa Travel</p>
        <h1 className="mt-2 text-2xl font-bold">Paket eSIM Live</h1>
        <p className="mt-2 text-sm text-muted-foreground">Harga provider diambil langsung dari eSIM Access dan dihitung dengan konfigurasi reseller aktif.</p>
        <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">
          <strong>{catalog.packages.length.toLocaleString("id-ID")}</strong> paket · sumber: <strong>{catalog.source}</strong>{catalog.stale ? " · cache stale" : ""}
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.packages.map((pkg) => (
          <article key={pkg.packageCode} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold">{pkg.name}</h2>
              <span className="shrink-0 rounded-full bg-secondary px-2 py-1 text-[10px] font-medium">{pkg.packageCode}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{pkg.locationCodes.join(", ") || "Regional"} · {pkg.durationDays} hari</p>
            <p className="mt-4 text-lg font-bold text-primary">{rupiah(pkg.sellingPrice.sellingPriceIdr)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Harga reseller · provider units {pkg.providerPriceUnits.toLocaleString("id-ID")}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
