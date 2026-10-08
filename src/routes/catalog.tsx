import { createFileRoute, Link } from "@tanstack/react-router";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";
import { packageCoverageLabel, packageDataLabel, packageDestinationLabel } from "@/lib/package-copy";

export const Route = createFileRoute("/catalog")({
  loader: () => getResellerCatalog(),
  component: LiveCatalog,
});

function rupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function LiveCatalog() {
  const catalog = Route.useLoaderData();
  return (
    <main className="mx-auto min-h-screen max-w-5xl bg-background px-4 py-8 text-foreground">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Djiwa Travel
        </p>
        <h1 className="mt-2 text-2xl font-bold">Paket internet untuk perjalanan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pilih kuota dan masa aktif yang sesuai. Cakupan negara ditampilkan di setiap paket.
        </p>
        <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">
          <strong>{catalog.packages.length.toLocaleString("id-ID")}</strong> pilihan paket tersedia
          untuk berbagai destinasi.
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.packages.map((pkg) => (
          <article
            key={pkg.packageCode}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Paket internet</p>
            <h2 className="mt-2 font-semibold leading-snug">{packageDestinationLabel(pkg)}</h2>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Kuota</p><p className="mt-1 font-semibold">{packageDataLabel(pkg)}</p></div>
              <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Masa aktif</p><p className="mt-1 font-semibold">{pkg.durationDays} hari</p></div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground"><span className="font-medium text-foreground">Cakupan:</span> {packageCoverageLabel(pkg)}</p>
            <p className="mt-4 text-xs text-muted-foreground">Harga paket</p>
            <p className="text-lg font-bold text-primary">{rupiah(pkg.sellingPrice.sellingPriceIdr)}</p>
            <Link
              to="/checkout/$id"
              params={{ id: pkg.packageCode }}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
            >
              Lihat detail &amp; pilih
            </Link>
          </article>
        ))}
      </div>
    </main>
  );
}
