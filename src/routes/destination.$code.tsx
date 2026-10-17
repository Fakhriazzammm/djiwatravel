import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BackBar, Page } from "@/components/shell";
import { getDest } from "@/lib/catalog";
import { getSellableDestinationCodes } from "@/lib/destination-availability.server";
import { regionalCoverage as extendRegionalCoverage } from "@/lib/destination-availability";
import { destinationOgImage } from "@/lib/destination-artwork";
import { toViewPackages, type ViewPackage } from "@/lib/package-view";
import { filterPackagesByDestination } from "@/lib/reseller-catalog-view";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";
import { getSellabilityState } from "@/lib/sellability.server";
import {
  packageCoverageLabel,
  packageDataLabel,
  packageDestinationLabel,
} from "@/lib/package-copy";

/** Cards rendered on the first paint; the rest are revealed on demand (see below). */
export const PAGE_SIZE = 20;

export type SortKey = "recommended" | "price" | "data" | "duration" | "value";

export const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "recommended", label: "Rekomendasi" },
  { key: "price", label: "Termurah" },
  { key: "data", label: "Kuota terbesar" },
  { key: "duration", label: "Masa aktif terlama" },
  { key: "value", label: "Paling hemat (Rp/GB)" },
];

function pricePerGb(pkg: ViewPackage): number {
  const gb = pkg.volumeBytes / 1_000_000_000;
  if (!Number.isFinite(gb) || gb <= 0) return Number.POSITIVE_INFINITY;
  return pkg.priceIdr / gb;
}

/**
 * Sorts a copy of the package list. Kept pure and exported so the ordering rules are covered by
 * tests instead of being verified by eye on production.
 */
export function sortPackages(packages: ViewPackage[], key: SortKey): ViewPackage[] {
  const list = [...packages];
  switch (key) {
    case "price":
      return list.sort((a, b) => a.priceIdr - b.priceIdr);
    case "data":
      return list.sort((a, b) => b.volumeBytes - a.volumeBytes || a.priceIdr - b.priceIdr);
    case "duration":
      return list.sort((a, b) => b.durationDays - a.durationDays || a.priceIdr - b.priceIdr);
    case "value":
      return list.sort((a, b) => pricePerGb(a) - pricePerGb(b) || a.priceIdr - b.priceIdr);
    default:
      return list;
  }
}

/** Destination pages that ship a social share image; see lib/destination-artwork.ts. */
const BASE_URL = "https://djiwatravel.com";

export const Route = createFileRoute("/destination/$code")({
  // Same reseller read as Explore: keep the result warm so opening a country from the
  // destination list or the home cards does not pay for it twice.
  staleTime: 0,
  loader: async ({ params }) => {
    const destination =
      getDest(params.code) ??
      getDest(params.code.toUpperCase()) ??
      getDest(params.code.toLowerCase());
    if (!destination) throw notFound();
    // Regional provider packages are represented by their member country codes. Querying the
    // provider with the display code (for example ASIA) is rejected by some catalogue accounts,
    // so read the already-authoritative full list and apply the regional coverage locally.
    const catalog = await getResellerCatalog(
      destination.region === "Regional" ? undefined : destination.code,
    );
    const visible = filterPackagesByDestination(
      catalog.packages,
      destination.code,
      await coverageFor(destination),
    );
    // Balance-aware sellability, read through a server function so a client-side navigation and
    // the server-rendered page agree on what is actually available.
    const sellability = await readSellability({
      data: {
        packages: visible.map((pkg) => ({
          packageCode: pkg.packageCode,
          providerPriceUnits: pkg.providerPriceUnits,
        })),
      },
    });
    const balanceUnknown = sellability.mode === "on" && !sellability.balanceKnown;
    // When the balance cannot be read we must not advertise availability we cannot honour, but we
    // say so neutrally: the customer never learns why.
    const unavailable = balanceUnknown
      ? new Set(visible.map((pkg) => pkg.packageCode))
      : new Set(sellability.hidden);
    // Only display fields are sent to the client: the full record carries our cost basis and
    // made this page ~680 KB (see lib/package-view.ts).
    return {
      destination,
      packages: toViewPackages(visible, unavailable),
      stale: catalog.stale,
      soldOut: unavailable.size,
      balanceUnknown,
      stockPending: balanceUnknown,
    };
  },
  head: ({ loaderData }) => {
    const title = loaderData
      ? `eSIM ${loaderData.destination.nameId} — Djiwa Travel`
      : "Paket eSIM — Djiwa Travel";
    const description = loaderData
      ? `Paket eSIM ${loaderData.destination.nameId} untuk traveler Indonesia. Aktif otomatis, bayar QRIS atau VA.`
      : "Paket eSIM untuk traveler Indonesia. Aktif otomatis, bayar QRIS atau VA.";
    const code = loaderData?.destination.code.toLowerCase() ?? "";
    const image = destinationOgImage(code, BASE_URL);
    const sellablePackages = loaderData?.packages.filter((pkg) => pkg.sellable) ?? [];
    const productSchema = sellablePackages.map((pkg) => ({
      "@type": "Product",
      name: packageDestinationLabel(pkg),
      description: `${packageDataLabel(pkg)} untuk ${packageCoverageLabel(pkg)} selama ${pkg.durationDays} hari.`,
      sku: pkg.packageCode,
      brand: { "@type": "Brand", name: "Djiwa Travel" },
      offers: {
        "@type": "Offer",
        url: `${BASE_URL}/checkout/${encodeURIComponent(pkg.packageCode)}`,
        priceCurrency: "IDR",
        price: pkg.priceIdr,
        availability: "https://schema.org/InStock",
      },
    }));
    const breadcrumbSchema = {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Beranda", item: BASE_URL },
        { "@type": "ListItem", position: 2, name: "Explore", item: `${BASE_URL}/explore` },
        ...(loaderData ? [{ "@type": "ListItem", position: 3, name: loaderData.destination.nameId, item: `${BASE_URL}/destination/${code}` }] : []),
      ],
    };
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: image },
        { name: "twitter:image", content: image },
        ...(code ? [{ property: "og:url", content: `${BASE_URL}/destination/${code}` }] : []),
      ],
      links: code ? [{ rel: "canonical", href: `${BASE_URL}/destination/${code}` }] : [],
      scripts: loaderData
        ? [{ type: "application/ld+json", children: JSON.stringify({ "@context": "https://schema.org", "@graph": [breadcrumbSchema, ...productSchema] }) }]
        : [],
    };
  },
  component: Destination,
});

function rupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function Destination() {
  const router = useRouter();
  const { destination, packages, stale, stockPending } = Route.useLoaderData();
  const [sort, setSort] = useState<SortKey>("recommended");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const sorted = useMemo(() => sortPackages(packages, sort), [packages, sort]);
  const shown = sorted.slice(0, visible);
  const selectedPackages = selectedCodes
    .map((code) => packages.find((pkg) => pkg.packageCode === code))
    .filter((pkg): pkg is ViewPackage => Boolean(pkg?.sellable));
  const toggleComparison = (pkg: ViewPackage) => {
    if (!pkg.sellable) return;
    setSelectedCodes((current) => {
      if (current.includes(pkg.packageCode))
        return current.filter((code) => code !== pkg.packageCode);
      if (current.length >= 3) return current;
      return [...current, pkg.packageCode];
    });
  };
  return (
    <Page>
      <BackBar title={`${destination.flag} ${destination.nameId}`} />
      <h1 className="large-title">Paket eSIM untuk {destination.nameId}</h1>
      <p className="mt-2 inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
        {destination.region === "Regional"
          ? "Cakupan regional · beberapa negara"
          : "Cakupan negara · satu tujuan"}
      </p>
      {stockPending && (
        <p className="mt-3 rounded-xl bg-secondary p-3 text-sm text-muted-foreground" role="status">
          Stok sedang diperbarui. Coba lagi sebentar lagi.
        </p>
      )}
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
        <>
          <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={sort === option.key}
                onClick={() => {
                  setSort(option.key);
                  setVisible(PAGE_SIZE);
                }}
                className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold ${
                  sort === option.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            Menampilkan {shown.length} dari {sorted.length} paket
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {shown.map((pkg) => (
              <article
                key={pkg.packageCode}
                className={`rounded-2xl p-4 shadow-sm ${
                  pkg.sellable ? "bg-surface" : "border border-red-200 bg-red-50/70"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Paket internet
                </p>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{packageDestinationLabel(pkg)}</h2>
                  {!pkg.sellable && !stockPending && (
                    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                      Habis
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {packageDataLabel(pkg)} · {pkg.durationDays} hari masa aktif
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cakupan: {packageCoverageLabel(pkg)}
                </p>
                <p className="mt-4 text-lg font-bold text-brand-red">{rupiah(pkg.priceIdr)}</p>
                <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={selectedCodes.includes(pkg.packageCode)}
                    disabled={
                      !pkg.sellable ||
                      (selectedCodes.length >= 3 && !selectedCodes.includes(pkg.packageCode))
                    }
                    onChange={() => toggleComparison(pkg)}
                    className="h-4 w-4 accent-primary"
                  />
                  Bandingkan paket
                </label>
                {pkg.sellable ? (
                  <Link
                    to="/checkout/$id"
                    params={{ id: pkg.packageCode }}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
                  >
                    Lihat detail &amp; pilih
                  </Link>
                ) : stockPending ? (
                  <span
                    className="inline-flex w-full items-center justify-center rounded-xl bg-secondary px-4 py-3 text-sm font-semibold text-muted-foreground"
                    aria-label="Paket belum dapat dipesan saat ini"
                  >
                    Belum tersedia
                  </span>
                ) : (
                  <span
                    className="inline-flex w-full items-center justify-center rounded-xl bg-red-100 px-4 py-3 text-sm font-bold text-red-700"
                    aria-label="Paket habis dan tidak dapat dibeli"
                  >
                    Habis
                  </span>
                )}
              </article>
            ))}
          </div>
          {selectedPackages.length > 0 && (
            <section
              className="mt-6 rounded-2xl bg-surface p-4 shadow-sm"
              aria-labelledby="comparison-title"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 id="comparison-title" className="font-semibold">
                  Bandingkan paket ({selectedPackages.length}/3)
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedCodes([])}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-primary underline"
                >
                  Hapus pilihan
                </button>
              </div>
              <div
                className="mt-3 overflow-x-auto"
                tabIndex={0}
                aria-label="Tabel perbandingan paket"
              >
                <table className="min-w-[36rem] w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th scope="col" className="px-2 py-2 font-semibold">
                        Detail
                      </th>
                      {selectedPackages.map((pkg) => (
                        <th scope="col" key={pkg.packageCode} className="px-2 py-2 font-semibold">
                          {pkg.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Destinasi", (pkg: ViewPackage) => packageDestinationLabel(pkg)],
                      ["Data", (pkg: ViewPackage) => packageDataLabel(pkg)],
                      ["Validitas", (pkg: ViewPackage) => `${pkg.durationDays} hari`],
                      ["Cakupan", (pkg: ViewPackage) => packageCoverageLabel(pkg)],
                      ["Harga", (pkg: ViewPackage) => rupiah(pkg.priceIdr)],
                    ].map(([label, value]) => (
                      <tr key={label as string} className="border-b border-border last:border-0">
                        <th
                          scope="row"
                          className="whitespace-nowrap px-2 py-2 font-semibold text-muted-foreground"
                        >
                          {label as string}
                        </th>
                        {selectedPackages.map((pkg) => (
                          <td key={pkg.packageCode} className="px-2 py-2 align-top">
                            {(value as (pkg: ViewPackage) => string)(pkg)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {visible < sorted.length && (
            <button
              type="button"
              onClick={() => setVisible((current) => current + PAGE_SIZE)}
              className="mt-4 w-full rounded-xl bg-secondary px-4 py-3 text-sm font-semibold"
            >
              Muat {Math.min(PAGE_SIZE, sorted.length - visible)} paket lagi
            </button>
          )}
        </>
      )}
    </Page>
  );
}
