import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { BackBar, Page } from "@/components/shell";
import { getDest } from "@/lib/catalog";
import { filterPackagesByDestination } from "@/lib/reseller-catalog-view";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";

export const Route = createFileRoute("/destination/$code")({
  loader: async ({ params }) => {
    const destination =
      getDest(params.code) ??
      getDest(params.code.toUpperCase()) ??
      getDest(params.code.toLowerCase());
    if (!destination) throw notFound();
    const catalog = await getResellerCatalog(destination.code);
    return {
      destination,
      packages: filterPackagesByDestination(catalog.packages, destination.code),
      stale: catalog.stale,
    };
  },
  head: ({ loaderData }) => {
    const title = loaderData
      ? `eSIM ${loaderData.destination.nameId} — Djiwa Travel`
      : "Paket eSIM — Djiwa Travel";
    return { meta: [{ title }, { name: "description", content: title }] };
  },
  component: Destination,
});

function rupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function Destination() {
  const { destination, packages, stale } = Route.useLoaderData();
  return (
    <Page>
      <BackBar title={`${destination.flag} ${destination.nameId}`} />
      <h1 className="large-title">Paket eSIM untuk {destination.nameId}</h1>
      {stale && (
        <p className="mt-3 rounded-xl bg-secondary p-3 text-sm text-muted-foreground">
          Menampilkan katalog tersimpan; harga mungkin belum terbaru.
        </p>
      )}
      {packages.length === 0 ? (
        <p className="mt-8 rounded-xl bg-surface p-4 text-sm text-muted-foreground">
          Belum ada paket live untuk destinasi ini. Lihat semua paket yang tersedia di katalog.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {packages.map((pkg) => (
            <article key={pkg.packageCode} className="rounded-2xl bg-surface p-4 shadow-sm">
              <h2 className="font-semibold">{pkg.name}</h2>
              <p className="mt-2 text-xs text-muted-foreground">
                {pkg.locationCodes.join(", ")} · {pkg.durationDays} hari
              </p>
              <p className="mt-4 text-lg font-bold text-brand-red">
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
      )}
    </Page>
  );
}
