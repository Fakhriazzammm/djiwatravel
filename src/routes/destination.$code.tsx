import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { glassIconButtonClass, Page, StickyCta } from "@/components/shell";
import { GeoAnswer } from "@/components/geo-answer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getDestinationPage } from "@/lib/destination-packages.fn";
import { destinationOgImage } from "@/lib/destination-artwork";
import type { ViewPackage } from "@/lib/package-view";
import { pricePerDay } from "@/lib/package-picker";
import { z } from "zod";
import { buildDestinationFacts, faqPageJsonLd } from "@/lib/geo";
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
      ? buildDestinationFacts(loaderData.destination.nameId, loaderData.packages).answer.split(
          /(?<=\.) /,
        )[0]!
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
    const facts = loaderData
      ? buildDestinationFacts(loaderData.destination.nameId, loaderData.packages)
      : null;
    const webPageSchema =
      loaderData && facts
        ? {
            "@type": "WebPage",
            "@id": `${BASE_URL}/destination/${code}`,
            url: `${BASE_URL}/destination/${code}`,
            name: title,
            description: facts.answer,
            inLanguage: "id-ID",
            dateModified: new Date().toISOString().slice(0, 10),
            isPartOf: { "@type": "WebSite", name: "Djiwa Travel", url: BASE_URL },
          }
        : null;
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
                "@graph": [
                  breadcrumbSchema,
                  packageListSchema,
                  ...(webPageSchema ? [webPageSchema] : []),
                  ...(facts && facts.count > 0 ? [faqPageJsonLd(facts.faqs)] : []),
                ],
              }),
            },
          ]
        : [],
    };
  },
  component: Destination,
});

function shortData(pkg: ViewPackage) {
  return packageDataLabel(pkg).replace(/ data$/, "");
}

function rupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

/** Trip-length chips on the page; a package falls in the first bucket whose `max` covers it. */
export const DURATION_FILTERS = [
  { id: "short", label: "≤ 3 hari", short: "≤3 hr", max: 3 },
  { id: "week", label: "4–7 hari", short: "4–7 hr", max: 7 },
  { id: "twoweeks", label: "8–15 hari", short: "8–15 hr", max: 15 },
  { id: "month", label: "16–30 hari", short: "16–30 hr", max: 30 },
  { id: "long", label: "30+ hari", short: "30+ hr", max: Number.POSITIVE_INFINITY },
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

/** Cards shown in the swipe deck for one trip length; evenly sampled so the range stays visible. */
export const DECK_MAX = 6;

/** One card per data+validity combination (the cheapest), so the deck shows real choices. */
export function dedupeByOffer<
  T extends Pick<ViewPackage, "volumeBytes" | "unlimited" | "durationDays">,
>(sortedByPrice: readonly T[]): T[] {
  const seen = new Set<string>();
  return sortedByPrice.filter((pkg) => {
    const key = `${pkg.unlimited ? "u" : pkg.volumeBytes}:${pkg.durationDays}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sampleDeck<T>(sortedByPrice: readonly T[], max = DECK_MAX): T[] {
  if (sortedByPrice.length <= max) return [...sortedByPrice];
  const last = sortedByPrice.length - 1;
  const out: T[] = [];
  for (let i = 0; i < max; i += 1) {
    const item = sortedByPrice[Math.round((i * last) / (max - 1))]!;
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

export function packageDeckCardClass(selected: boolean): string {
  const state = selected ? "bg-brand-red text-white" : "bg-surface ring-1 ring-border/60";
  return `tap w-[48%] max-w-[188px] shrink-0 snap-center rounded-2xl p-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${state}`;
}

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
        <Link
          to="/plan/$id"
          params={{ id: pkg.packageCode }}
          className="block rounded-sm text-[15px] font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {packageDataLabel(pkg)}
          <span className="font-medium text-muted-foreground"> · {pkg.durationDays} hari</span>
        </Link>
        <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
          {showCoverage
            ? packageCoverageLabel(pkg)
            : isDailyQuota(pkg)
              ? "Kuota harian"
              : "Kuota total"}
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
  const [duration, setDuration] = useState<DurationFilterId | null>(null);
  const [showAllDurations, setShowAllDurations] = useState(false);
  const [cardCode, setCardCode] = useState<string | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);
  const [quota, setQuota] = useState<QuotaFilter>("all");
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
      return;
    }
    void router.navigate({ to: "/esim/finder" });
  };
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const isRegionalDestination = destination.region === "Regional";
  const geoFacts = useMemo(
    () => buildDestinationFacts(destination.nameId, packages),
    [destination.nameId, packages],
  );

  useEffect(() => {
    setSelectedCodes([]);
    setComparisonOpen(false);
    setVisible(PAGE_SIZE);
    setDuration(null);
    setShowAllDurations(false);
    setCardCode(null);
    setQuota("all");
    setPickerOpen(false);
  }, [destination.code]);

  const byAvailability = useMemo(
    () => filterPackagesByAvailability(packages, availability, stockPending),
    [packages, availability, stockPending],
  );
  const quotaOk = (pkg: ViewPackage) =>
    quota === "all" || (quota === "daily") === isDailyQuota(pkg);
  const durationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const pkg of byAvailability) {
      const id = durationFilterOf(pkg.durationDays);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [byAvailability]);
  const availableBuckets = DURATION_FILTERS.filter((f) => durationCounts.has(f.id));
  const seller = picks.find((pick) => pick.tag === "best_seller") ?? picks[0];
  const preferred = seller ? durationFilterOf(seller.pkg.durationDays) : availableBuckets[0]?.id;
  const activeBucket: DurationFilterId | undefined =
    duration && durationCounts.has(duration)
      ? duration
      : preferred && durationCounts.has(preferred)
        ? preferred
        : availableBuckets[0]?.id;
  const matchesFilters = (pkg: ViewPackage) =>
    quotaOk(pkg) && (showAllDurations || durationFilterOf(pkg.durationDays) === activeBucket);

  const filtered = byAvailability.filter(matchesFilters);
  const ordered = useMemo(() => {
    const list = sortPackages(filtered, sort);
    return list.sort((a, b) => a.durationDays - b.durationDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byAvailability, activeBucket, showAllDurations, quota, sort]);
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
  const cheapest = packages
    .filter((pkg) => pkg.sellable)
    .sort((a, b) => a.priceIdr - b.priceIdr)[0];
  const fromPrice = cheapest ? rupiah(cheapest.priceIdr) : null;
  const filtersActive = quota !== "all" || showAllDurations;

  const pickTag = new Map(picks.map((pick) => [pick.pkg.packageCode, pick.tag] as const));
  const deck = sampleDeck(
    dedupeByOffer(
      byAvailability
        .filter(
          (pkg) =>
            pkg.sellable &&
            quotaOk(pkg) &&
            durationFilterOf(pkg.durationDays) === activeBucket &&
            (isRegionalDestination || !isMultiCountry(pkg)),
        )
        .sort((a, b) => a.priceIdr - b.priceIdr || b.volumeBytes - a.volumeBytes),
    ),
  );
  const deckLabel = (pkg: ViewPackage, index: number) => {
    const tag = pickTag.get(pkg.packageCode);
    if (tag === "best_seller") return "🔥 Terlaris";
    if (tag === "best_deal") return "Best Deal";
    if (index === 0) return "Hemat";
    if (index === deck.length - 1 && deck.length > 2) return "Puas";
    return "Pilihan";
  };
  const chosen =
    deck.find((pkg) => pkg.packageCode === cardCode) ??
    deck.find((pkg) => pickTag.get(pkg.packageCode) === "best_seller") ??
    deck[Math.floor((deck.length - 1) / 2)];
  const chosenCode = chosen?.packageCode;
  const deckKey = deck.map((pkg) => pkg.packageCode).join("|");
  useEffect(() => {
    const el = chosenCode
      ? deckRef.current?.querySelector<HTMLElement>(`[data-code="${CSS.escape(chosenCode)}"]`)
      : null;
    const box = deckRef.current;
    if (el && box) box.scrollLeft = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckKey]);
  const chooseCard = (pkg: ViewPackage) => {
    setCardCode(pkg.packageCode);
    deckRef.current
      ?.querySelector<HTMLElement>(`[data-code="${CSS.escape(pkg.packageCode)}"]`)
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  };

  return (
    <Page>
      <header className="grid h-11 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center">
        <button
          type="button"
          onClick={goBack}
          aria-label="Kembali"
          className={glassIconButtonClass}
        >
          <ChevronLeft className="size-5" strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-haspopup="dialog"
          aria-label={`Negara tujuan: ${destination.nameId}. Ganti negara`}
          className="tap mx-auto inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border/70 bg-surface px-4 text-[15px] font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden="true">{destination.flag}</span>
          {destination.nameId}
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
        </button>
        <span />
      </header>
      <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[78dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] border-border/70 px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4"
        >
          <SheetHeader className="mb-3 pr-10 text-left">
            <SheetTitle>Pilih negara tujuan</SheetTitle>
            <SheetDescription>Paket eSIM menyesuaikan negara yang kamu pilih.</SheetDescription>
          </SheetHeader>
          <nav aria-label="Ganti negara tujuan" className="grid grid-cols-2 gap-2">
            {switcher.map((item) => {
              const active = item.code === destination.code;
              return (
                <Link
                  key={item.code}
                  to="/destination/$code"
                  params={{ code: item.code }}
                  search={{ availability: "all" }}
                  onClick={() => setPickerOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`tap flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active
                      ? "border-brand-red bg-brand-red/10 text-brand-red"
                      : "border-border/70 bg-surface"
                  }`}
                >
                  <span className="text-xl" aria-hidden="true">
                    {item.flag}
                  </span>
                  <span className="truncate">{item.nameId}</span>
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
      <section className="mt-3 px-0.5">
        <span className="block text-[28px] leading-none" aria-hidden="true">
          {destination.flag}
        </span>
        <h1 className="mt-4 text-[22px] font-bold leading-tight tracking-tight">
          eSIM {destination.nameId}
        </h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          {[network, "Aktif otomatis", isRegionalDestination ? "Regional" : null]
            .filter(Boolean)
            .join(" · ")}
          {fromPrice && (
            <>
              {" "}
              · Mulai <span className="font-semibold text-foreground">{fromPrice}</span>
            </>
          )}
        </p>
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
        <p className="mt-4 rounded-xl bg-surface p-4 text-sm text-muted-foreground">
          Belum ada paket live untuk destinasi ini. Lihat semua paket yang tersedia di katalog.
        </p>
      ) : (
        <>
          <section className="mt-4" aria-labelledby="trip-length">
            <h2 id="trip-length" className="mb-2 text-[15px] font-bold">
              Berapa lama perjalananmu?
            </h2>
            <div role="group" aria-label="Masa aktif" className="flex rounded-xl bg-secondary p-1">
              {availableBuckets.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={activeBucket === f.id}
                  onClick={() => {
                    setDuration(f.id);
                    setCardCode(null);
                    setShowAllDurations(false);
                  }}
                  className={`tap min-h-9 flex-1 rounded-lg text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    activeBucket === f.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  {f.short}
                </button>
              ))}
            </div>
          </section>
          {deck.length > 0 && chosen && (
            <section className="mt-4" aria-label="Pilih paket">
              <div
                ref={deckRef}
                className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none]"
              >
                {deck.map((pkg, index) => {
                  const on = pkg.packageCode === chosen.packageCode;
                  return (
                    <button
                      key={pkg.packageCode}
                      type="button"
                      data-code={pkg.packageCode}
                      aria-pressed={on}
                      onClick={() => chooseCard(pkg)}
                      className={packageDeckCardClass(on)}
                    >
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide ${on ? "text-white/85" : "text-brand-red"}`}
                      >
                        {deckLabel(pkg, index)}
                      </span>
                      <span className="mt-1 block text-[20px] font-extrabold leading-none tracking-tight">
                        {shortData(pkg)}
                      </span>
                      <span
                        className={`text-[11px] ${on ? "text-white/80" : "text-muted-foreground"}`}
                      >
                        {pkg.durationDays} hari · {isDailyQuota(pkg) ? "harian" : "total"}
                      </span>
                      <span className="mt-3 block text-[15px] font-bold">
                        {rupiah(pkg.priceIdr)}
                      </span>
                      <span
                        className={`text-[10px] ${on ? "text-white/80" : "text-muted-foreground"}`}
                      >
                        ≈ {rupiah(Math.round(pricePerDay(pkg)))}/hari
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-center gap-1.5" aria-hidden="true">
                {deck.map((pkg) => (
                  <i
                    key={pkg.packageCode}
                    className={`h-1.5 rounded-full transition-all ${
                      pkg.packageCode === chosen.packageCode
                        ? "w-4 bg-brand-red"
                        : "w-1.5 bg-border"
                    }`}
                  />
                ))}
              </div>
              <Link
                to="/checkout/$id"
                params={{ id: chosen.packageCode }}
                className="tap mt-3 flex min-h-10 w-full items-center justify-center rounded-xl bg-brand-red text-[14px] font-bold text-white transition hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2"
              >
                Beli {shortData(chosen)} · {rupiah(chosen.priceIdr)}
              </Link>
            </section>
          )}
          {regionalList.length > 0 && (
            <section className="mt-4" aria-labelledby="regional">
              <h2 id="regional" className="text-[15px] font-bold">
                Jalan-jalan ke lebih dari satu negara?
              </h2>
              <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
                Satu eSIM yang juga mencakup {destination.nameId}, langsung dari katalog provider.
              </p>
              <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70 bg-surface">
                {regionalList.slice(0, 3).map((pkg) => (
                  <PackageRow key={pkg.packageCode} {...rowProps(pkg, true)} />
                ))}
              </ul>
              {regionalList.length > 3 && (
                <Link
                  to="/esim/finder"
                  hash="multi-negara"
                  className="mt-2 inline-block px-1 text-sm font-semibold text-brand-red"
                >
                  Lihat {regionalList.length - 3} paket multi-negara lainnya
                </Link>
              )}
            </section>
          )}
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold">
                {showAllDurations
                  ? "Semua paket"
                  : `Paket ${DURATION_FILTERS.find((f) => f.id === activeBucket)?.label ?? ""}`}{" "}
                · {live.length}
              </h2>
              <button
                type="button"
                onClick={() => setShowAllDurations((current) => !current)}
                className="mt-0.5 text-xs font-semibold text-brand-red"
              >
                {showAllDurations ? "Hanya masa aktif terpilih" : "Tampilkan semua masa aktif"}
              </button>
            </div>
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
          <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4">
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
                    setShowAllDurations(false);
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
          className="z-[70] max-h-[88dvh] overflow-y-auto rounded-t-3xl border-border bg-background px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:left-1/2 sm:right-auto sm:w-[min(100%,44rem)] sm:-translate-x-1/2"
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
      {geoFacts.count > 0 ? (
        <GeoAnswer
          heading={`Tentang eSIM ${destination.nameId}`}
          answer={geoFacts.answer}
          faqs={geoFacts.faqs}
          updatedLabel={`Harga dan ketersediaan live dari katalog Djiwa Travel, diperbarui ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}.`}
        />
      ) : null}
    </Page>
  );
}
