import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { glassIconButtonClass, Page, StickyCta } from "@/components/shell";
import { GeoAnswer } from "@/components/geo-answer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  clampDays,
  initialDays,
  isDailyQuota,
  matchesQuota,
  matchPackagesForDays,
  pricePerChosenDay,
  sliderMarks,
  sliderMaxDays,
  type QuotaFilter,
} from "@/lib/destination-days";
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
  packageIsUnlimited,
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
  if (packageIsUnlimited(pkg)) return "Unlimited";
  return packageDataLabel(pkg).replace(/ data$/, "");
}

function rupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

/** Range tabs used when Admin turns the day slider off; a package falls in the first bucket whose `max` covers it. */
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

export { isDailyQuota };
export type { QuotaFilter };

/** A package covering more than one country is "regional" even when listed under a country. */
export function isMultiCountry(pkg: Pick<ViewPackage, "locationCodes">): boolean {
  return pkg.locationCodes.length > 1;
}

/** Splits "3 GB" into the big number and the small unit; anything else (Unlimited) stays whole. */
function splitData(label: string): { amount: string; unit: string } {
  const match = /^([\d.,]+)\s*(GB|MB)$/i.exec(label.trim());
  return match ? { amount: match[1]!, unit: match[2]! } : { amount: label, unit: "" };
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
      className={`tap min-h-9 shrink-0 rounded-full px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active ? "bg-foreground text-background" : "bg-surface text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

type PackageTag = "best_seller" | "best_deal" | "cheapest" | undefined;

/** One package: big quota left, kind and validity in the middle, price and price per day right. */
function PlanRow({
  pkg,
  days,
  selected,
  tag,
  note,
  showCoverage,
  onSelect,
}: {
  pkg: ViewPackage;
  days: number;
  selected: boolean;
  tag: PackageTag;
  note: string | null;
  showCoverage: boolean;
  onSelect: () => void;
}) {
  const { amount, unit } = splitData(shortData(pkg));
  const perDay = pricePerChosenDay(pkg, days);
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={`${packageDataLabel(pkg)}, ${pkg.durationDays} hari, ${rupiah(pkg.priceIdr)}`}
        onClick={onSelect}
        className={`tap flex min-h-12 w-full items-center gap-3 px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
          selected ? "bg-brand-red/10" : ""
        }`}
      >
        <span className="w-16 shrink-0">
          <b className={`font-bold tracking-tight ${unit ? "text-[21px]" : "text-[14px]"}`}>
            {amount}
          </b>
          {unit && (
            <span className="ml-0.5 text-xs font-semibold text-muted-foreground">{unit}</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block whitespace-nowrap text-[13.5px] font-semibold">
            {showCoverage ? packageCoverageLabel(pkg) : isDailyQuota(pkg) ? "Harian" : "Total"}
            {tag === "best_seller" && (
              <span className="ml-1.5 rounded-full bg-brand-red px-1.5 py-0.5 align-[1px] text-[9.5px] font-bold text-white">
                Terlaris
              </span>
            )}
            {tag === "best_deal" && (
              <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 align-[1px] text-[9.5px] font-bold text-emerald-700">
                Best Deal
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
            {pkg.durationDays} hari
            {isDailyQuota(pkg) ? " · tiap hari" : ""}
            {note ? ` · ${note}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <b className="block text-[14.5px] font-bold tracking-tight">{rupiah(pkg.priceIdr)}</b>
          <span className="text-[10.5px] text-muted-foreground">
            {Number.isFinite(perDay) ? `≈ ${rupiah(Math.round(perDay))}/hari` : ""}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`grid size-[22px] shrink-0 place-items-center rounded-full border-2 ${
            selected ? "border-brand-red" : "border-[#c6cad5]"
          }`}
        >
          {selected && <span className="size-[11px] rounded-full bg-brand-red" />}
        </span>
      </button>
    </li>
  );
}

/** Pre-order or sold-out package: not selectable, links to checkout only when pre-order is open. */
function OffRow({ pkg, stockPending }: { pkg: ViewPackage; stockPending: boolean }) {
  return (
    <li className="flex min-h-12 items-center gap-3 px-3.5 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold">
          {packageDataLabel(pkg)}
          <span className="font-medium text-muted-foreground"> · {pkg.durationDays} hari</span>
        </span>
        <span className="block text-[11.5px] text-muted-foreground">{rupiah(pkg.priceIdr)}</span>
      </span>
      {pkg.preorderAvailable && !pkg.sellable ? (
        <Link
          to="/checkout/$id"
          params={{ id: pkg.packageCode }}
          className="tap inline-flex min-h-10 items-center rounded-xl bg-brand-red px-3 text-[13px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2"
        >
          Pre-order
        </Link>
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">
          {stockPending ? "Cek stok" : "Habis"}
        </span>
      )}
    </li>
  );
}

/** Day slider: a transparent native range on top of a drawn track, so touch and keyboard just work. */
function DaySlider({
  days,
  max,
  onChange,
}: {
  days: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const pct = (value: number) => (max > 1 ? ((value - 1) / (max - 1)) * 100 : 0);
  return (
    <div>
      <div className="relative h-11">
        <div className="pointer-events-none absolute inset-x-3.5 inset-y-0">
          <div className="absolute inset-x-0 top-[19px] h-1.5 rounded-full bg-secondary" />
          <div
            className="absolute left-0 top-[19px] h-1.5 rounded-full bg-brand-red"
            style={{ width: `${pct(days)}%` }}
          />
          <div
            className="absolute top-2 -ml-3.5 size-7 rounded-full bg-white shadow-[0_1px_6px_rgb(0_0_0/0.28),0_0_0_1px_rgb(0_0_0/0.05)]"
            style={{ left: `${pct(days)}%` }}
          >
            <span className="absolute inset-[9px] rounded-full bg-brand-red" />
          </div>
        </div>
        <input
          type="range"
          min={1}
          max={max}
          step={1}
          value={days}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label="Lama perjalanan (hari)"
          aria-valuetext={`${days} hari`}
          className="absolute inset-0 h-11 w-full cursor-pointer appearance-none bg-transparent opacity-0 [touch-action:pan-y] [&::-moz-range-thumb]:size-7 [&::-moz-range-thumb]:border-0 [&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:appearance-none"
        />
      </div>
      <div className="relative mx-3.5 h-5 text-[10.5px] text-muted-foreground">
        {sliderMarks(max).map((mark) => (
          <button
            key={mark}
            type="button"
            onClick={() => onChange(mark)}
            aria-label={`${mark} hari`}
            style={{ left: `${pct(mark)}%` }}
            className={`tap absolute top-0 -translate-x-1/2 px-1.5 py-0.5 ${
              mark === days ? "font-bold text-brand-red" : ""
            }`}
          >
            {mark}
          </button>
        ))}
      </div>
    </div>
  );
}

const LONGER_PAGE = 12;

function Destination() {
  const router = useRouter();
  const { destination, packages, picks, switcher, network, stale, stockPending, daySlider } =
    Route.useLoaderData();
  const { availability } = Route.useSearch();
  const isRegionalDestination = destination.region === "Regional";
  const [quota, setQuota] = useState<QuotaFilter>("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [longerVisible, setLongerVisible] = useState(LONGER_PAGE);
  const [bucket, setBucket] = useState<DurationFilterId | null>(null);
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
      return;
    }
    void router.navigate({ to: "/esim/finder" });
  };
  const geoFacts = useMemo(
    () => buildDestinationFacts(destination.nameId, packages),
    [destination.nameId, packages],
  );

  const byAvailability = useMemo(
    () => filterPackagesByAvailability(packages, availability, stockPending),
    [packages, availability, stockPending],
  );
  const countryPool = byAvailability.filter((pkg) => isRegionalDestination || !isMultiCountry(pkg));
  const livePool = countryPool.filter((pkg) => pkg.sellable || stockPending);
  const offPool = countryPool.filter((pkg) => !pkg.sellable && !stockPending);
  const regionalPool = isRegionalDestination
    ? []
    : byAvailability.filter((pkg) => isMultiCountry(pkg) && (pkg.sellable || stockPending));

  const maxDays = sliderMaxDays(livePool);
  const seller = picks.find((pick) => pick.tag === "best_seller") ?? picks[0];
  const [chosenDays, setChosenDays] = useState<number | null>(null);
  const days = clampDays(chosenDays ?? initialDays(seller?.pkg.durationDays, maxDays), maxDays);

  useEffect(() => {
    setQuota("all");
    setPickerOpen(false);
    setSelectedCode(null);
    setChosenDays(null);
    setBucket(null);
    setLongerVisible(LONGER_PAGE);
  }, [destination.code]);

  const quotaPool = livePool.filter((pkg) => matchesQuota(pkg, quota));
  // Range tabs (slider off): count per bucket, the active one falls back to the seller's, then the first.
  const bucketCounts = new Map<DurationFilterId, number>();
  for (const pkg of livePool) {
    const id = durationFilterOf(pkg.durationDays);
    bucketCounts.set(id, (bucketCounts.get(id) ?? 0) + 1);
  }
  const availableBuckets = DURATION_FILTERS.filter((f) => bucketCounts.has(f.id));
  const sellerBucket = seller ? durationFilterOf(seller.pkg.durationDays) : undefined;
  const activeBucket: DurationFilterId | undefined =
    bucket && bucketCounts.has(bucket)
      ? bucket
      : sellerBucket && bucketCounts.has(sellerBucket)
        ? sellerBucket
        : availableBuckets[0]?.id;

  const match = useMemo(() => {
    if (daySlider) return matchPackagesForDays(quotaPool, days);
    const fit = quotaPool
      .filter((pkg) => durationFilterOf(pkg.durationDays) === activeBucket)
      .sort((a, b) => a.priceIdr - b.priceIdr || a.durationDays - b.durationDays);
    return { tier: fit[0]?.durationDays ?? null, fit, longer: [] as ViewPackage[] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daySlider, quotaPool.length, quota, days, activeBucket, livePool]);
  const regionalFit = matchPackagesForDays(
    regionalPool.filter((pkg) => matchesQuota(pkg, quota)),
    daySlider ? days : 1,
  );
  const regionalList = [...regionalFit.fit, ...regionalFit.longer].slice(0, 8);
  const offList = matchPackagesForDays(
    offPool.filter((pkg) => matchesQuota(pkg, quota)),
    daySlider ? days : 1,
  );
  const offShown = [...offList.fit, ...offList.longer];

  const rowDays = daySlider ? days : (match.fit[0]?.durationDays ?? days);
  const selectable = [...match.fit, ...match.longer, ...regionalList].filter(
    (pkg) => pkg.sellable || stockPending,
  );
  const selected =
    selectable.find((pkg) => pkg.packageCode === selectedCode) ??
    match.fit.find((pkg) => pkg.sellable) ??
    match.longer.find((pkg) => pkg.sellable);
  const pickTag = new Map(picks.map((pick) => [pick.pkg.packageCode, pick.tag] as const));
  const tagOf = (pkg: ViewPackage): PackageTag => {
    const tag = pickTag.get(pkg.packageCode);
    return tag === "best_seller" || tag === "best_deal" ? tag : undefined;
  };
  const choose = (pkg: ViewPackage) => setSelectedCode(pkg.packageCode);
  const row = (pkg: ViewPackage, index: number, coverage: boolean) => (
    <PlanRow
      key={pkg.packageCode}
      pkg={pkg}
      days={rowDays}
      selected={selected?.packageCode === pkg.packageCode}
      tag={tagOf(pkg)}
      note={daySlider && index === 0 && match.fit[0] === pkg ? "paling pas" : null}
      showCoverage={coverage}
      onSelect={() => choose(pkg)}
    />
  );

  const setAvailability = (next: AvailabilityFilter) => {
    void router.navigate({
      to: "/destination/$code",
      params: { code: destination.code },
      search: { availability: next },
    } as never);
  };
  const cheapest = packages
    .filter((pkg) => pkg.sellable)
    .sort((a, b) => a.priceIdr - b.priceIdr)[0];
  const fromPrice = cheapest ? rupiah(cheapest.priceIdr) : null;
  const nothing = match.fit.length === 0 && match.longer.length === 0;

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
        <h1 className="text-[22px] font-bold leading-tight tracking-tight">
          eSIM {destination.nameId}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
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
          <section
            aria-labelledby="trip-length"
            className="sticky top-[env(safe-area-inset-top)] z-20 -mx-4 mt-3 bg-background px-4 pb-1.5 pt-2"
          >
            {daySlider ? (
              <div className="rounded-2xl bg-surface px-4 pb-2 pt-3 shadow-[0_1px_3px_rgb(0_0_0/0.06)]">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="trip-length" className="text-xs font-semibold text-muted-foreground">
                    Berapa lama perjalananmu?
                    <span className="block font-normal">Geser untuk mengatur</span>
                  </h2>
                  <p className="text-[28px] font-bold leading-none tracking-tight tabular-nums">
                    {days}
                    <span className="ml-1 text-sm font-semibold text-muted-foreground">hari</span>
                  </p>
                </div>
                <DaySlider
                  days={days}
                  max={maxDays}
                  onChange={(next) => {
                    setChosenDays(next);
                    setSelectedCode(null);
                    setLongerVisible(LONGER_PAGE);
                  }}
                />
                <p className="text-[11.5px] text-muted-foreground" aria-live="polite">
                  {match.tier === null ? (
                    <>Tidak ada paket dengan masa aktif {days} hari</>
                  ) : (
                    <>
                      Masa aktif paket terdekat:{" "}
                      <b className="text-foreground">{match.tier} hari</b> · {match.fit.length}{" "}
                      pilihan
                    </>
                  )}
                </p>
              </div>
            ) : (
              <>
                <h2 id="trip-length" className="mb-1.5 text-xs font-semibold text-muted-foreground">
                  Berapa lama perjalananmu?
                </h2>
                <div
                  role="group"
                  aria-label="Masa aktif"
                  className="flex rounded-xl bg-secondary p-0.5"
                >
                  {availableBuckets.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={activeBucket === f.id}
                      onClick={() => {
                        setBucket(f.id);
                        setSelectedCode(null);
                      }}
                      className={`tap min-h-10 flex-1 rounded-[10px] text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        activeBucket === f.id
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground"
                      }`}
                    >
                      {f.short}
                      <span className="block text-[9.5px] font-normal">
                        {bucketCounts.get(f.id)} paket
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex gap-1.5">
                {(
                  [
                    ["all", "Semua"],
                    ["total", "Total"],
                    ["daily", "Harian"],
                  ] as const
                ).map(([key, label]) => (
                  <Chip
                    key={key}
                    active={quota === key}
                    onClick={() => {
                      setQuota(key);
                      setSelectedCode(null);
                    }}
                  >
                    {label}
                  </Chip>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">{match.fit.length} paket</span>
            </div>
          </section>

          {match.fit.length > 0 && (
            <section className="mt-2" aria-label={daySlider ? `Cocok untuk ${days} hari` : "Paket"}>
              <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {daySlider ? `Cocok untuk ${days} hari` : "Pilih paket"}
              </h3>
              <ul
                role="radiogroup"
                aria-label="Paket eSIM"
                className="divide-y divide-border/70 overflow-hidden rounded-2xl bg-surface"
              >
                {match.fit.map((pkg, index) => row(pkg, index, isRegionalDestination))}
              </ul>
            </section>
          )}
          {nothing && (
            <div className="mt-2 rounded-2xl bg-surface p-4 text-center text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">
                {stockPending
                  ? "Status ketersediaan paket belum dapat dipastikan."
                  : daySlider
                    ? `Belum ada paket untuk ${days} hari`
                    : "Belum ada paket pada tampilan ini."}
              </p>
              <p className="mt-1 text-xs">Kurangi hari atau ganti jenis kuota.</p>
              {quota !== "all" && (
                <button
                  type="button"
                  onClick={() => setQuota("all")}
                  className="tap mt-2 min-h-10 rounded-xl bg-secondary px-3 text-[13px] font-semibold"
                >
                  Semua jenis kuota
                </button>
              )}
            </div>
          )}
          {match.longer.length > 0 && (
            <details className="mt-3 rounded-2xl bg-surface">
              <summary className="tap flex min-h-12 cursor-pointer list-none items-center justify-between px-3.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span>
                  Masa aktif lebih lama
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    {match.longer.length} paket · {match.longer[0]!.durationDays} hari ke atas
                  </span>
                </span>
                <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
              </summary>
              <ul
                role="radiogroup"
                aria-label="Paket masa aktif lebih lama"
                className="divide-y divide-border/70 border-t border-border/70"
              >
                {match.longer
                  .slice(0, longerVisible)
                  .map((pkg, index) => row(pkg, index + 1, isRegionalDestination))}
              </ul>
              {longerVisible < match.longer.length && (
                <button
                  type="button"
                  onClick={() => setLongerVisible((current) => current + LONGER_PAGE)}
                  className="tap min-h-12 w-full border-t border-border/70 text-[13px] font-semibold text-brand-red"
                >
                  Muat {Math.min(LONGER_PAGE, match.longer.length - longerVisible)} paket lagi
                </button>
              )}
            </details>
          )}
          {regionalList.length > 0 && (
            <details className="mt-3 rounded-2xl bg-surface">
              <summary className="tap flex min-h-12 cursor-pointer list-none items-center justify-between px-3.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span>
                  Ke lebih dari satu negara?
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    {regionalList.length} paket multi-negara termasuk {destination.nameId}
                  </span>
                </span>
                <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
              </summary>
              <ul
                role="radiogroup"
                aria-label="Paket multi-negara"
                className="divide-y divide-border/70 border-t border-border/70"
              >
                {regionalList.map((pkg, index) => row(pkg, index + 1, true))}
              </ul>
            </details>
          )}
          {!stockPending && (offShown.length > 0 || availability !== "all") && (
            <details className="mt-3 rounded-2xl bg-surface" open={availability === "sold-out"}>
              <summary className="tap flex min-h-12 cursor-pointer list-none items-center justify-between px-3.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span>
                  Pre-order atau habis sementara
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    {offShown.length} paket
                  </span>
                </span>
                <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
              </summary>
              <ul className="divide-y divide-border/70 border-t border-border/70">
                {offShown.map((pkg) => (
                  <OffRow key={pkg.packageCode} pkg={pkg} stockPending={stockPending} />
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
          {selected && <div className="h-16" aria-hidden="true" />}
        </>
      )}
      {selected && (
        <StickyCta>
          <div className="flex items-center gap-3 pb-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] text-muted-foreground">
                {shortData(selected)} ·{" "}
                {isDailyQuota(selected)
                  ? "harian"
                  : packageIsUnlimited(selected)
                    ? "unlimited"
                    : "total"}{" "}
                · {selected.durationDays} hari ·{" "}
                <Link
                  to="/plan/$id"
                  params={{ id: selected.packageCode }}
                  className="font-semibold text-brand-red"
                >
                  Detail
                </Link>
              </p>
              <p className="text-[15px] font-bold">{rupiah(selected.priceIdr)}</p>
            </div>
            <Link
              to="/checkout/$id"
              params={{ id: selected.packageCode }}
              className="tap inline-flex min-h-10 min-w-20 shrink-0 items-center justify-center rounded-xl bg-brand-red px-4 text-[14px] font-bold text-white transition hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2"
            >
              Beli
            </Link>
          </div>
        </StickyCta>
      )}
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
