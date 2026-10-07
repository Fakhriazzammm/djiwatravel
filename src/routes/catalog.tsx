import { createFileRoute, Link } from "@tanstack/react-router";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";

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
        <h1 className="mt-2 text-2xl font-bold">Paket eSIM Live</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pilih paket eSIM yang sesuai untuk perjalanan Anda.
        </p>
        <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">
          Tersedia <strong>{catalog.packages.length.toLocaleString("id-ID")}</strong> paket eSIM
          untuk berbagai destinasi.
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.packages.map((pkg) => (
          <article
            key={pkg.packageCode}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold">{pkg.name}</h2>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {pkg.locationCodes.join(", ") || "Regional"} · {pkg.durationDays} hari
            </p>
            <p className="mt-4 text-lg font-bold text-primary">
              {rupiah(pkg.sellingPrice.sellingPriceIdr)}
            </p>
            <Link
              to="/checkout/$id"
              params={{ id: pkg.packageCode }}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
            >
              Pilih paket
            </Link>
          </article>
        ))}
      </div>
    </main>
  );
}
