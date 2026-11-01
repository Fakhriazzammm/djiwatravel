import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BackBar, Page, StickyCta } from "@/components/shell";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getDestinationPage } from "@/lib/destination-packages.fn";
import type { FastPickTag } from "@/lib/home-quick-packages";
import { destinationOgImage } from "@/lib/destination-artwork";
import type { ViewPackage } from "@/lib/package-view";
import { pricePerDay } from "@/lib/package-picker";
import { z } from "zod";
import {
  packageCoverageLabel,
  packageDataLabel,
  packageDestinationLabel,
  packageDisplayedGb,
} from "@/lib/package-copy";

/** Cards rendered on the first paint; the rest are revealed on demand (see below). */
export const PAGE_SIZE = 20;

export type SortKey = "recommended" | "price" | "data" | "duration" | "value";

export const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "recommended", label: "Rekomendasi" },
  { key: "price", label: "Termurah" },
  { key: "data", label: "Kuota terbesar" },
  { key: "duration", label: "Masa aktif terlama" },
  { key: "value", label: "Paling hemat (Rp/hari)" },
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
      return list.sort((a, b) => pricePerDay(a) - pricePerDay(b) || a.priceIdr - b.priceIdr);
    default:
      return list;
  }
}

/** Destination pages that ship a social share image; see lib/destination-artwork.ts. */
const BASE_URL = "https://djiwatravel.com";

export const Route = createFileRoute("/destination/$code")({
  validateSearch: z.object({
    availability: z.enum(["all", "available", "sold-out"]).default("all"),
  }),
  // Same reseller read as Explore: keep the result warm so opening a country from the
  // destination list or the home cards does not pay for it twice.
  staleTime: 0,
  loader: async ({ params }) => {
    const result = await getDestinationPage({ data: params.code });
    if (!result) throw notFound();
    return result;
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
    const listedPackages = loaderData?.packages ?? [];
    const packageListSchema = {
      "@type": "ItemList",
      name: `Paket eSIM ${loaderData?.destination.nameId ?? ""}`,
      itemListElement: listedPackages.map((pkg, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: packageDestinationLabel(pkg),
        url: `${BASE_URL}/plan/${encodeURIComponent(pkg.packageCode)}`,
      })),
    };
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
                "@graph": [breadcrumbSchema, packageListSchema],
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

/** Trip-length chips on the page; a package falls in the first bucket whose `max` covers it. */
export const DURATION_FILTERS = [
  { id: "short", label: "≤ 3 hari", max: 3 },
  { id: "week", label: "4–7 hari", max: 7 },
  { id: "twoweeks", label: "8–15 hari", max: 15 },
  { id: "month", label: "16–30 hari", max: 30 },
  { id: "long", label: "30+ hari", max: Number.POSITIVE_INFINITY },
] as const;
export type DurationFilterId = (typeof DURATION_FILTERS)[number]["id"];

export function durationFilterOf(days: number): DurationFilterId {
  return (DURATION_FILTERS.find((f) => days <= f.max) ?? DURATION_FILTERS[4]).id;
}

/** "Harian" = a per-day allowance (name carries /Day) rather than one total quota. */
export function isDailyQuota(pkg: Pick<ViewPackage, "name">): boolean {
  return /\/\s*day|per\s*day|harian|daily/i.test(pkg.name);
}

export type QuotaFilter = "all" | "total" | "daily";

/** A package covering more than one country is "regional" even when listed under a country. */
export function isMultiCountry(pkg: Pick<ViewPackage, "locationCodes">): boolean {
  return pkg.locationCodes.length > 1;
}

const PICK_LABEL: Record<FastPickTag, string> = {
  cheapest: "Hemat",
  best_seller: "🔥 Terlaris",
  best_deal: "Best Deal",
};

function PackageRow({
  pkg,
  stockPending,
  selected,
  selectDisabled,
  onToggle,
  showCoverage,
}: {
  pkg: ViewPackage;
  stockPending: boolean;
  selected: boolean;
  selectDisabled: boolean;
  onToggle: () => void;
  showCoverage: boolean;
}) {
  const perDay = pricePerDay(pkg);
  return (
    <li className={`flex items-center gap-3 px-3 py-3 ${pkg.sellable ? "" : "opacity-60"}`}>
      <input
        type="checkbox"
        checked={selected}
        disabled={!pkg.sellable || selectDisabled}
        onChange={onToggle}
        className="size-[18px] shrink-0 accent-primary"
        aria-label={`Bandingkan ${pkg.name}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold tracking-tight">
          {packageDataLabel(pkg)}
          <span className="font-medium text-muted-foreground"> · {pkg.durationDays} hari</span>
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
          {showCoverage ? packageCoverageLabel(pkg) : isDailyQuota(pkg) ? "Kuota harian" : "Kuota total"}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[15px] font-bold tracking-tight">{rupiah(pkg.priceIdr)}</p>
        <p className="text-[10.5px] text-muted-foreground">
          {Number.isFinite(perDay) ? `≈ ${rupiah(Math.round(perDay))}/hari` : ""}
        </p>
      </div>
      {pkg.sellable ? (
        <Link
          to="/checkout/$id"
          params={{ id: pkg.packageCode }}
          aria-label={`Pilih paket ${pkg.name}`}
          className="tap inline-flex min-h-11 min-w-16 shrink-0 items-center justify-center gap-0.5 rounded-xl bg-brand-red px-3 text-sm font-bold text-white transition hover:brightness-95 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2"
        >
          Pilih <ChevronRight className="size-4" strokeWidth={2.5} aria-hidden="true" />
        </Link>
      ) : (
        <span
          className="min-w-16 shrink-0 text-center text-sm font-semibold text-muted-foreground"
          aria-label={stockPending ? "Paket belum dapat dipesan saat ini" : "Paket habis"}
        >
          {stockPending ? "Cek stok" : "Habis"}
        </span>
      )}
    </li>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`tap min-h-10 shrink-0 rounded-xl border px-3.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? "border-brand-red bg-brand-red/10 text-brand-red"
          : "border-border/70 bg-surface text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Destination() {
  const router = useRouter();
  const { destination, packages, picks, switcher, network, stale, stockPending } =
    Route.useLoaderData();
  const { availability } = Route.useSearch();
  const [sort, setSort] = useState<SortKey>("price");
  const [duration, setDuration] = useState<DurationFilterId | "all">("all");
  const [quota, setQuota] = useState<QuotaFilter>("all");
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const activeChip = useRef<HTMLAnchorElement | null>(null);
  const isRegionalDestination = destination.region === "Regional";

  useEffect(() => {
    setSelectedCodes([]);
    setComparisonOpen(false);
    setVisible(PAGE_SIZE);
    setDuration("all");
    setQuota("all");
    activeChip.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [destination.code]);

  const byAvailability = useMemo(
    () => filterPackagesByAvailability(packages, availability, stockPending),
    [packages, availability, stockPending],
  );
  const matchesFilters = (pkg: ViewPackage) =>
    (duration === "all" || durationFilterOf(pkg.durationDays) === duration) &&
    (quota === "all" || (quota === "daily") === isDailyQuota(pkg));
  const durationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const pkg of byAvailability) {
      const id = durationFilterOf(pkg.durationDays);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [byAvailability]);

  const filtered = byAvailability.filter(matchesFilters);
  const ordered = useMemo(() => {
    const list = sortPackages(filtered, sort);
    return list.sort((a, b) => a.durationDays - b.durationDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byAvailability, duration, quota, sort]);
  const countryList = ordered.filter((pkg) => isRegionalDestination || !isMultiCountry(pkg));
  const regionalList = isRegionalDestination ? [] : ordered.filter(isMultiCountry);
  const live = countryList.filter((pkg) => pkg.sellable || stockPending);
  const soldOut = countryList.filter((pkg) => !pkg.sellable && !stockPending);
  const shown = live.slice(0, visible);
  const groups = shown.reduce<Array<{ days: number; items: ViewPackage[] }>>((acc, pkg) => {
    const last = acc[acc.length - 1];
    if (last && last.days === pkg.durationDays) last.items.push(pkg);
    else acc.push({ days: pkg.durationDays, items: [pkg] });
    return acc;
  }, []);

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
  const toggleComparison = (pkg: ViewPackage) => {
    if (!pkg.sellable) return;
    setSelectedCodes((current) => toggleComparisonSelection(current, pkg.packageCode));
  };
  const rowProps = (pkg: ViewPackage, showCoverage: boolean) => ({
    pkg,
    stockPending,
    showCoverage,
    selected: selectedCodes.includes(pkg.packageCode),
    selectDisabled: selectedCodes.length >= 3 && !selectedCodes.includes(pkg.packageCode),
    onToggle: () => toggleComparison(pkg),
  });
  const cheapest = packages.filter((pkg) => pkg.sellable).sort((a, b) => a.priceIdr - b.priceIdr)[0];
  const fromPrice = cheapest ? rupiah(cheapest.priceIdr) : null;
  const filtersActive = duration !== "all" || quota !== "all";

  return (
    <Page>
      <BackBar title={`${destination.flag} ${destination.nameId}`} fallbackTo="/esim/finder" />
      <nav aria-label="Ganti negara tujuan" className="-mx-4 mt-1 flex gap-2 overflow-x-auto px-4 pb-1">
        {switcher.map((item) => {
          const active = item.code === destination.code;
          return (
            <Link
              key={item.code}
              ref={active ? activeChip : undefined}
              to="/destination/$code"
              params={{ code: item.code }}
              search={{ availability: "all" }}
              aria-current={active ? "page" : undefined}
              className={`tap inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/70 bg-surface"
              }`}
            >
              <span aria-hidden="true">{item.flag}</span>
              {item.nameId}
            </Link>
          );
        })}
      </nav>
      <section className="mt-3 rounded-[22px] bg-gradient-to-br from-[#c8102e] to-[#8f0a20] p-4 text-white">
        <p className="text-xs font-medium opacity-85">
          eSIM · {isRegionalDestination ? "Cakupan regional" : "Cakupan negara"}
        </p>
        <h1 className="mt-1 text-[24px] font-bold leading-tight tracking-tight">
          Paket eSIM untuk {destination.nameId}
        </h1>
        {fromPrice && <p className="mt-1 text-sm opacity-90">Mulai {fromPrice}</p>}
        <ul className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
          {network && <li className="rounded-full bg-white/20 px-2.5 py-1">📶 {network}</li>}
          <li className="rounded-full bg-white/20 px-2.5 py-1">⚡ Aktif otomatis</li>
          <li className="rounded-full bg-white/20 px-2.5 py-1">🔁 Tanpa ganti SIM</li>
        </ul>
      </section>
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
          {picks.length > 0 && (
            <section className="mt-5" aria-labelledby="fast-picks">
              <h2 id="fast-picks" className="mb-2 text-[15px] font-bold">
                Pilihan tercepat
              </h2>
              <div className="grid grid-cols-3 gap-2">
                {picks.map((pick) => (
                  <Link
                    key={pick.pkg.packageCode}
                    to="/checkout/$id"
                    params={{ id: pick.pkg.packageCode }}
                    className={`tap rounded-2xl border bg-surface p-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      pick.tag === "best_seller" ? "border-brand-red" : "border-border/70"
                    }`}
                  >
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-brand-red">
                      {PICK_LABEL[pick.tag]}
                    </span>
                    <span className="mt-1 block text-base font-extrabold">
                      {packageDataLabel(pick.pkg)}
                    </span>
                    <span className="text-muted-foreground">{pick.pkg.durationDays} hari</span>
                    <span className="mt-1.5 block font-bold">{rupiah(pick.pkg.priceIdr)}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <section className="mt-5" aria-labelledby="trip-length">
            <h2 id="trip-length" className="mb-2 text-[15px] font-bold">
              Berapa lama perjalananmu?
            </h2>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
              <Chip active={duration === "all"} onClick={() => setDuration("all")}>
                Semua
              </Chip>
              {DURATION_FILTERS.filter((f) => durationCounts.has(f.id)).map((f) => (
                <Chip key={f.id} active={duration === f.id} onClick={() => setDuration(f.id)}>
                  {f.label}
                </Chip>
              ))}
            </div>
            <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">
              {(
                [
                  ["all", "Semua kuota"],
                  ["total", "Kuota total"],
                  ["daily", "Kuota harian"],
                ] as const
              ).map(([key, label]) => (
                <Chip key={key} active={quota === key} onClick={() => setQuota(key)}>
                  {label}
                </Chip>
              ))}
            </div>
          </section>
          <div className="mt-5 flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-bold">Semua paket · {live.length}</h2>
            <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <span className="sr-only">Urutkan</span>
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as SortKey);
                  setVisible(PAGE_SIZE);
                }}
                className="min-h-10 rounded-xl border border-border/70 bg-surface px-2 text-xs font-semibold text-foreground"
              >
                {SORT_OPTIONS.filter((o) => o.key !== "recommended" && o.key !== "duration").map(
                  (o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
          {live.length === 0 && soldOut.length === 0 ? (
            <div className="mt-3 rounded-xl bg-surface p-4 text-sm text-muted-foreground">
              <p>
                {stockPending
                  ? "Status ketersediaan paket belum dapat dipastikan."
                  : filtersActive
                    ? "Tidak ada paket untuk pilihan ini."
                    : "Belum ada paket pada tampilan ini."}
              </p>
              {(filtersActive || availability !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setDuration("all");
                    setQuota("all");
                    if (availability !== "all") setAvailability("all");
                  }}
                  className="mt-2 font-semibold text-brand-red"
                >
                  Reset pilihan
                </button>
              )}
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.days} className="mt-3" aria-label={`${group.days} hari`}>
                <p className="mb-1.5 px-1 text-xs font-bold text-muted-foreground">
                  {group.days} HARI
                </p>
                <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70 bg-surface">
                  {group.items.map((pkg) => (
                    <PackageRow key={pkg.packageCode} {...rowProps(pkg, isRegionalDestination)} />
                  ))}
                </ul>
              </section>
            ))
          )}
          {visible < live.length && (
            <button
              type="button"
              onClick={() => setVisible((current) => current + PAGE_SIZE)}
              className="mt-4 w-full rounded-xl bg-secondary px-4 py-3 text-sm font-semibold"
            >
              Muat {Math.min(PAGE_SIZE, live.length - visible)} paket lagi
            </button>
          )}
          {!stockPending && (soldOut.length > 0 || availability !== "all") && (
            <details
              className="mt-4 rounded-2xl border border-border/70 bg-surface"
              open={availability === "sold-out"}
            >
              <summary className="tap flex min-h-12 cursor-pointer items-center justify-between px-4 text-sm font-semibold">
                Habis sementara ({soldOut.length})
                <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
              </summary>
              <ul className="divide-y divide-border/70 border-t border-border/70">
                {soldOut.map((pkg) => (
                  <PackageRow key={pkg.packageCode} {...rowProps(pkg, isRegionalDestination)} />
                ))}
              </ul>
              <div className="flex gap-2 border-t border-border/70 p-3">
                {AVAILABILITY_OPTIONS.map((option) => (
                  <Chip
                    key={option.key}
                    active={availability === option.key}
                    onClick={() => setAvailability(option.key)}
                  >
                    {option.label}
                  </Chip>
                ))}
              </div>
            </details>
          )}
          {regionalList.length > 0 && (
            <section className="mt-6" aria-labelledby="regional">
              <h2 id="regional" className="text-[15px] font-bold">
                Jalan-jalan ke lebih dari satu negara?
              </h2>
              <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
                Paket regional yang juga mencakup {destination.nameId}.
              </p>
              <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70 bg-surface">
                {regionalList.slice(0, 8).map((pkg) => (
                  <PackageRow key={pkg.packageCode} {...rowProps(pkg, true)} />
                ))}
              </ul>
              {regionalList.length > 8 && (
                <Link
                  to="/esim/finder"
                  className="mt-2 inline-block px-1 text-sm font-semibold text-brand-red"
                >
                  Lihat {regionalList.length - 8} paket regional lainnya
                </Link>
              )}
            </section>
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
              onClick={() => setComparisonOpen(true)}
              className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
              aria-label={`Buka perbandingan ${selectedPackages.length} paket`}
            >
              Bandingkan
            </button>
          </div>
        </StickyCta>
      )}
      <Sheet open={comparisonOpen && selectedPackages.length > 0} onOpenChange={setComparisonOpen}>
        <SheetContent
          side="bottom"
          className="z-[70] max-h-[88dvh] overflow-y-auto rounded-t-3xl border-border bg-background px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 sm:left-1/2 sm:right-auto sm:w-[min(100%,44rem)] sm:-translate-x-1/2"
          aria-describedby="comparison-description"
        >
          <SheetHeader className="pr-8 text-left">
            <SheetTitle>Bandingkan paket ({selectedPackages.length}/3)</SheetTitle>
            <SheetDescription id="comparison-description">
              Geser tabel ke samping untuk melihat semua paket.
            </SheetDescription>
          </SheetHeader>
          <div
            className="mt-4 overflow-x-auto rounded-xl border border-border/70"
            tabIndex={0}
            aria-label="Tabel perbandingan paket"
          >
            <table className="min-w-[34rem] w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/60 text-muted-foreground">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 bg-secondary px-3 py-3 font-semibold"
                  >
                    Detail
                  </th>
                  {selectedPackages.map((pkg) => (
                    <th scope="col" key={pkg.packageCode} className="min-w-36 px-3 py-3 align-top">
                      <div className="flex items-start justify-between gap-2">
                        <span className="line-clamp-2 font-semibold text-foreground">
                          {pkg.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCodes((current) =>
                              current.filter((code) => code !== pkg.packageCode),
                            );
                            if (selectedPackages.length === 1) setComparisonOpen(false);
                          }}
                          className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Hapus ${pkg.name} dari perbandingan`}
                        >
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                      <Link
                        to="/checkout/$id"
                        params={{ id: pkg.packageCode }}
                        className="mt-2 inline-flex min-h-9 items-center rounded-lg bg-brand-red px-3 text-xs font-semibold text-white transition hover:bg-brand-red/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                      className="sticky left-0 z-10 whitespace-nowrap bg-background px-3 py-3 font-semibold text-muted-foreground"
                    >
                      {label as string}
                    </th>
                    {selectedPackages.map((pkg) => (
                      <td key={pkg.packageCode} className="px-3 py-3 align-top">
                        {(value as (pkg: ViewPackage) => string)(pkg)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedCodes([]);
              setComparisonOpen(false);
            }}
            className="mt-4 min-h-11 w-full rounded-xl border border-border bg-surface text-sm font-semibold text-muted-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Hapus semua pilihan
          </button>
        </SheetContent>
      </Sheet>
    </Page>
  );
}
