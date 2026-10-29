import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BackBar, Page, StickyCta } from "@/components/shell";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getDest } from "@/lib/catalog";
import { getSellableDestinationCodes } from "@/lib/destination-availability.server";
import { regionalCoverage as extendRegionalCoverage } from "@/lib/destination-availability";
import { destinationOgImage } from "@/lib/destination-artwork";
import { toViewPackages, type ViewPackage } from "@/lib/package-view";
import { filterPackagesByDestination } from "@/lib/reseller-catalog-view";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";
import { readSellability } from "@/lib/sellability-api";
import { z } from "zod";
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

export type AvailabilityFilter = "all" | "available" | "sold-out";

export const AVAILABILITY_OPTIONS: Array<{
  key: AvailabilityFilter;
  label: string;
}> = [
  { key: "all", label: "Semua" },
  { key: "available", label: "Tersedia" },
  { key: "sold-out", label: "Habis" },
];

/** Filters confirmed stock states without treating a pending balance read as sold out. */
export function filterPackagesByAvailability(
  packages: ViewPackage[],
  filter: AvailabilityFilter,
  stockPending = false,
): ViewPackage[] {
  if (filter === "all" || stockPending) return filter === "all" ? [...packages] : [];
  return packages.filter((pkg) => (filter === "available" ? pkg.sellable : !pkg.sellable));
}

export function toggleComparisonSelection(
  selectedCodes: readonly string[],
  packageCode: string,
  maxSelections = 3,
): string[] {
  if (selectedCodes.includes(packageCode)) {
    return selectedCodes.filter((code) => code !== packageCode);
  }
  if (selectedCodes.length >= maxSelections) return [...selectedCodes];
  return [...selectedCodes, packageCode];
}

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

const REGIONAL_COVERAGE: Record<string, readonly string[]> = {
  ASIA: ["CN", "HK", "JP", "KR", "MY", "SG", "TH", "TW"],
  EU: ["EU"],
};

async function coverageFor(destination: { code: string; region: string }) {
  const seed = REGIONAL_COVERAGE[destination.code.toUpperCase()] ?? [];
  if (destination.region !== "Regional") return seed;
  const availability = await getSellableDestinationCodes(1_500);
  return extendRegionalCoverage(
    { code: destination.code, region: destination.region },
    availability,
  );
}

export const Route = createFileRoute("/destination/$code")({
  validateSearch: z.object({
    availability: z.enum(["all", "available", "sold-out"]).default("all"),
  }),
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
      : new Set<string>(sellability.hidden);
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
        ...(loaderData
          ? [
              {
                "@type": "ListItem",
                position: 3,
                name: loaderData.destination.nameId,
                item: `${BASE_URL}/destination/${code}`,
              },
            ]
          : []),
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
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@graph": [breadcrumbSchema, ...productSchema],
              }),
            },
          ]
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
  const { availability } = Route.useSearch();
  const [sort, setSort] = useState<SortKey>("recommended");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const comparisonRef = useRef<HTMLElement>(null);
  const filteredPackages = useMemo(
    () => filterPackagesByAvailability(packages, availability, stockPending),
    [packages, availability, stockPending],
  );
  const sorted = useMemo(() => sortPackages(filteredPackages, sort), [filteredPackages, sort]);
  const shown = sorted.slice(0, visible);
  const availabilityCounts = useMemo(
    () => ({
      all: packages.length,
      available: stockPending ? null : packages.filter((pkg) => pkg.sellable).length,
      "sold-out": stockPending ? null : packages.filter((pkg) => !pkg.sellable).length,
    }),
    [packages, stockPending],
  );
  const setAvailability = (next: AvailabilityFilter) => {
    setVisible(PAGE_SIZE);
    void router.navigate({
      to: "/destination/$code",
      params: { code: destination.code },
      search: { availability: next },
    } as never);
  };
  const selectedPackages = selectedCodes
    .map((code) => packages.find((pkg) => pkg.packageCode === code))
    .filter((pkg): pkg is ViewPackage => Boolean(pkg?.sellable));
  useEffect(() => {
    setSelectedCodes([]);
    setVisible(PAGE_SIZE);
  }, [destination.code]);
  const toggleComparison = (pkg: ViewPackage) => {
    if (!pkg.sellable) return;
    setSelectedCodes((current) => toggleComparisonSelection(current, pkg.packageCode));
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
      {packages.length > 0 && (
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Pilih paket yang cocok</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {filteredPackages.length} paket ·{" "}
              {availability === "available"
                ? "Tersedia"
                : availability === "sold-out"
                  ? "Habis"
                  : "Semua"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="tap inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-surface px-3.5 text-sm font-semibold shadow-sm ring-1 ring-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Buka filter dan urutkan paket"
          >
            <SlidersHorizontal className="size-4 text-brand-red" aria-hidden="true" />
            Filter
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>
      )}
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
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetContent
              side="bottom"
              className="mx-auto max-h-[82dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] border-border/70 px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-6"
            >
              <SheetHeader className="mb-6 pr-10 text-left">
                <SheetTitle>Filter &amp; Urutkan</SheetTitle>
                <SheetDescription>
                  Temukan paket yang sesuai kebutuhan perjalananmu.
                </SheetDescription>
              </SheetHeader>
              <div>
                <p className="mb-2 text-sm font-semibold">Ketersediaan</p>
                <div className="space-y-1.5">
                  {AVAILABILITY_OPTIONS.map((option) => {
                    const count = availabilityCounts[option.key];
                    const disabled = stockPending && option.key !== "all";
                    const active = availability === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        aria-pressed={active}
                        disabled={disabled}
                        onClick={() => setAvailability(option.key)}
                        className="tap flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-medium transition hover:bg-secondary disabled:opacity-50"
                      >
                        <span>
                          {option.label}
                          {count !== null ? ` (${count})` : ""}
                        </span>
                        {active && <Check className="size-4 text-brand-red" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
                {stockPending && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Filter stok tersedia setelah status diperbarui.
                  </p>
                )}
              </div>
              <div className="mt-6">
                <p className="mb-2 text-sm font-semibold">Urutkan</p>
                <div className="space-y-1.5">
                  {SORT_OPTIONS.map((option) => {
                    const active = sort === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setSort(option.key);
                          setVisible(PAGE_SIZE);
                        }}
                        className="tap flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-medium transition hover:bg-secondary"
                      >
                        <span>{option.label}</span>
                        {active && <Check className="size-4 text-brand-red" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="tap mt-5 min-h-12 w-full rounded-xl bg-brand-red text-sm font-bold text-white"
              >
                Tampilkan {filteredPackages.length} paket
              </button>
            </SheetContent>
          </Sheet>
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            Menampilkan {shown.length} dari {sorted.length} paket
          </p>
          {filteredPackages.length === 0 ? (
            <p className="mt-4 rounded-xl bg-surface p-4 text-sm text-muted-foreground">
              {stockPending
                ? "Status ketersediaan paket belum dapat dipastikan."
                : availability === "available"
                  ? "Belum ada paket yang tersedia untuk dibeli."
                  : "Belum ada paket yang habis pada katalog ini."}
            </p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {shown.map((pkg) => (
                <article
                  key={pkg.packageCode}
                  className={`rounded-[22px] p-4 shadow-sm ring-1 ring-black/[0.035] ${
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
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {packageDataLabel(pkg)}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {pkg.durationDays} hari
                    </span>
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {packageCoverageLabel(pkg)}
                  </p>
                  <div className="mt-4 flex items-end justify-between gap-2">
                    <p className="text-xl font-bold tracking-tight text-brand-red">
                      {rupiah(pkg.priceIdr)}
                    </p>
                    <p className="text-right text-[11px] leading-4 text-muted-foreground">
                      {Number.isFinite(pricePerGb(pkg))
                        ? `${rupiah(Math.round(pricePerGb(pkg)))}/GB`
                        : ""}
                    </p>
                  </div>
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
                      Pilih paket
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
          )}
          {selectedPackages.length > 0 && (
            <section
              ref={comparisonRef}
              className="mt-6 scroll-mt-4 rounded-2xl bg-surface p-4 shadow-sm"
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
                          <Link
                            to="/checkout/$id"
                            params={{ id: pkg.packageCode }}
                            className="mt-1 block text-xs font-semibold text-primary underline"
                          >
                            Pilih paket
                          </Link>
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
      {selectedPackages.length > 0 && (
        <StickyCta>
          <div className="flex items-center gap-3 pb-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">
                {selectedPackages.length} paket dipilih
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {selectedPackages.map((pkg) => pkg.name).join(" · ")}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                comparisonRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
              aria-label={`Buka perbandingan ${selectedPackages.length} paket`}
            >
              Bandingkan
            </button>
          </div>
        </StickyCta>
      )}
    </Page>
  );
}
