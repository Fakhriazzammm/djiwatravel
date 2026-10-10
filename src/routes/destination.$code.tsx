import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BackBar, Page } from "@/components/shell";
import { getDest } from "@/lib/catalog";
import type { ResellerCatalogPackage } from "@/lib/esim-access-catalog";
import { filterPackagesByDestination } from "@/lib/reseller-catalog-view";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";
import { packageCoverageLabel, packageDataLabel, packageDestinationLabel } from "@/lib/package-copy";

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

function pricePerGb(pkg: ResellerCatalogPackage): number {
  const gb = pkg.volumeBytes / 1_000_000_000;
  if (!Number.isFinite(gb) || gb <= 0) return Number.POSITIVE_INFINITY;
  return pkg.sellingPrice.sellingPriceIdr / gb;
}

/**
 * Sorts a copy of the package list. Kept pure and exported so the ordering rules are covered by
 * tests instead of being verified by eye on production.
 */
export function sortPackages(
  packages: ResellerCatalogPackage[],
  key: SortKey,
): ResellerCatalogPackage[] {
  const list = [...packages];
  switch (key) {
    case "price":
      return list.sort((a, b) => a.sellingPrice.sellingPriceIdr - b.sellingPrice.sellingPriceIdr);
    case "data":
      return list.sort(
        (a, b) => b.volumeBytes - a.volumeBytes || a.sellingPrice.sellingPriceIdr - b.sellingPrice.sellingPriceIdr,
      );
    case "duration":
      return list.sort(
        (a, b) => b.durationDays - a.durationDays || a.sellingPrice.sellingPriceIdr - b.sellingPrice.sellingPriceIdr,
      );
    case "value":
      return list.sort(
        (a, b) => pricePerGb(a) - pricePerGb(b) || a.sellingPrice.sellingPriceIdr - b.sellingPrice.sellingPriceIdr,
      );
    default:
      return list;
  }
}

/** Destination pages that ship a social share image; everything else falls back to the default. */
const OG_PHOTO_CODES = new Set(["jp", "kr", "sg", "th"]);
const BASE_URL = "https://djiwatravel.com";

export const Route = createFileRoute("/destination/$code")({
  // Same reseller read as Explore: keep the result warm so opening a country from the
  // destination list or the home cards does not pay for it twice.
  staleTime: 60_000,
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
    const description = loaderData
      ? `Paket eSIM ${loaderData.destination.nameId} untuk traveler Indonesia. Aktif otomatis, bayar QRIS atau VA.`
      : "Paket eSIM untuk traveler Indonesia. Aktif otomatis, bayar QRIS atau VA.";
    const code = loaderData?.destination.code.toLowerCase() ?? "";
    const image = OG_PHOTO_CODES.has(code)
      ? `${BASE_URL}/og/${code}.jpg`
      : `${BASE_URL}/og/default.png`;
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
    };
  },
  component: Destination,
});

function rupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function Destination() {
  const { destination, packages, stale } = Route.useLoaderData();
  const [sort, setSort] = useState<SortKey>("recommended");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sorted = useMemo(() => sortPackages(packages, sort), [packages, sort]);
  const shown = sorted.slice(0, visible);
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
              <article key={pkg.packageCode} className="rounded-2xl bg-surface p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Paket internet
                </p>
                <h2 className="font-semibold">{packageDestinationLabel(pkg)}</h2>
                <p className="mt-2 text-xs text-muted-foreground">
                  {packageDataLabel(pkg)} · {pkg.durationDays} hari masa aktif
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cakupan: {packageCoverageLabel(pkg)}
                </p>
                <p className="mt-4 text-lg font-bold text-brand-red">
                  {rupiah(pkg.sellingPrice.sellingPriceIdr)}
                </p>
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
