import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BackBar, Page } from "@/components/shell";
import { getDest } from "@/lib/catalog";
import { toViewPackages, type ViewPackage } from "@/lib/package-view";
import { filterPackagesByDestination } from "@/lib/reseller-catalog-view";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";
import { getSellabilityState } from "@/lib/sellability.server";
import {
  packageCoverageLabel,
  packageDataLabel,
  packageDestinationLabel,
} from "@/lib/package-copy";

const REGIONAL_COVERAGE: Record<string, readonly string[]> = {
  ASIA: ["CN", "HK", "JP", "KR", "MY", "SG", "TH", "TW"],
  EU: ["EU"],
};

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
    // Regional provider packages are represented by their member country codes. Querying the
    // provider with the display code (for example ASIA) is rejected by some catalogue accounts,
    // so read the already-authoritative full list and apply the regional coverage locally.
    const catalog = await getResellerCatalog(
      destination.region === "Regional" ? undefined : destination.code,
    );
    const visible = filterPackagesByDestination(
      catalog.packages,
      destination.code,
      REGIONAL_COVERAGE[destination.code] ?? [],
    );
    // Balance-aware sellability: packages the provider balance cannot cover are marked sold out.
    const sellability = await getSellabilityState(visible);
    // Only display fields are sent to the client: the full record carries our cost basis and
    // made this page ~680 KB (see lib/package-view.ts).
    return {
      destination,
      packages: toViewPackages(visible, sellability.hidden),
      stale: catalog.stale,
      soldOut: sellability.hidden.size,
      balanceUnknown: sellability.mode === "on" && sellability.snapshot.balanceUnits === null,
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
  const { destination, packages, stale, soldOut } = Route.useLoaderData();
  const [sort, setSort] = useState<SortKey>("recommended");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sorted = useMemo(() => sortPackages(packages, sort), [packages, sort]);
  const shown = sorted.slice(0, visible);
  return (
    <Page>
      <BackBar title={`${destination.flag} ${destination.nameId}`} />
      <h1 className="large-title">Paket eSIM untuk {destination.nameId}</h1>
      <p className="mt-2 inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
        {destination.region === "Regional"
          ? "Cakupan regional · beberapa negara"
          : "Cakupan negara · satu tujuan"}
      </p>
      {stale && (
        <p className="mt-3 rounded-xl bg-secondary p-3 text-sm text-muted-foreground">
          Menampilkan katalog tersimpan; harga mungkin belum terbaru.
        </p>
      )}
      {soldOut > 0 && (
        <p className="mt-3 rounded-xl bg-secondary p-3 text-sm text-muted-foreground">
          {soldOut} paket bertanda <span className="font-semibold">Habis</span> karena stok provider
          kami belum mencukupi. Paket lain tetap bisa dipesan.
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
                  {!pkg.sellable && (
                    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                      Sold
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
                {pkg.sellable ? (
                  <Link
                    to="/checkout/$id"
                    params={{ id: pkg.packageCode }}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
                  >
                    Lihat detail &amp; pilih
                  </Link>
                ) : (
                  <span
                    className="inline-flex w-full items-center justify-center rounded-xl bg-red-100 px-4 py-3 text-sm font-bold text-red-700"
                    aria-label="Paket sold dan tidak dapat dibeli"
                  >
                    Sold
                  </span>
                )}
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
