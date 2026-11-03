import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bell, Search, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { glassIconButtonClass, Page, SectionTitle } from "@/components/shell";
import { HomeHero } from "@/components/home-hero";
import { InstallAppCard } from "@/components/install-app-card";
import { RecentPurchaseToast } from "@/components/recent-purchase-toast";
import { FixedLayer, Reveal, Stagger } from "@/components/motion-primitives";
import { destinations, type Destination } from "@/lib/catalog";
import {
  getBundleGroups,
  getHomeDestinationFeed,
  getListableDestinations,
} from "@/lib/destination-availability.fn";
import { useOrders } from "@/lib/orders";
import { CustomerAuth } from "@/components/customer-auth";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";
import { destinationPhoto } from "@/lib/destination-artwork";
import { formatTravelGuideDate, getNewestTravelGuides } from "@/lib/travel-guides";
import { HomeMyTripsWidget } from "@/components/home-my-trips-widget";
import { ServiceCategoryGrid } from "@/components/explore/service-category-grid";
import { EsimHomeSummaryCard } from "@/components/esim-home-summary-card";
import { EsimPackageResults } from "@/components/esim-package-results";
import { jsonLdScript, organizationJsonLd, websiteJsonLd } from "@/lib/seo";
import { useReducedMotion } from "motion/react";
import { EsimDestinationSheet, type SheetDestination } from "@/components/esim-destination-sheet";
import { trackAnalytics } from "@/lib/analytics";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import { useHomeEsimConfig } from "@/hooks/use-home-esim-config";
import { activeHomePromo, orderHomeDestinations } from "@/lib/home-esim-config";

import { GeoAnswer } from "@/components/geo-answer";
import { HOME_FAQS, faqPageJsonLd } from "@/lib/geo";

const featuredGuides = getNewestTravelGuides(3);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "eSIM Internasional untuk Traveler Indonesia | Djiwa Travel" },
      {
        name: "description",
        content:
          "Pilih paket eSIM untuk perjalanan internasional. Bandingkan kuota dan masa aktif, lalu siapkan koneksi sebelum berangkat bersama Djiwa Travel.",
      },
      {
        property: "og:title",
        content: "eSIM Internasional untuk Traveler Indonesia | Djiwa Travel",
      },
      {
        property: "og:description",
        content:
          "Pilih paket eSIM internasional untuk traveler Indonesia dan siapkan koneksi sebelum berangkat.",
      },
      { property: "og:url", content: "https://djiwatravel.com/" },
    ],
    links: [{ rel: "canonical", href: "https://djiwatravel.com/" }],
    scripts: [
      jsonLdScript(organizationJsonLd()),
      jsonLdScript(websiteJsonLd()),
      jsonLdScript({ "@context": "https://schema.org", ...faqPageJsonLd(HOME_FAQS) }),
    ],
  }),
  component: Home,
});

function Home() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Same sources as /esim/finder: every live country and region, plus the multi-country bundles.
  // Loaded when the search sheet opens; the static catalogue only fills in until they arrive.
  const [liveList, setLiveList] = useState<Destination[] | null>(null);
  const [bundleList, setBundleList] = useState<
    { code: string; flag: string; label: string; countryCount: number; fromPriceIdr: number }[]
  >([]);
  useEffect(() => {
    if (!searchOpen || liveList !== null) return;
    let live = true;
    void Promise.all([
      getListableDestinations().catch(() => null),
      getBundleGroups()
        .then((result) => result.groups)
        .catch(() => []),
    ]).then(([list, groups]) => {
      if (!live) return;
      if (list) setLiveList(list);
      setBundleList(groups);
    });
    return () => {
      live = false;
    };
  }, [searchOpen, liveList]);
  const searchPool = liveList ?? destinations;
  const normalizedQuery = query.trim().toLocaleLowerCase("id-ID");
  const searchResults = searchPool.filter((item) =>
    `${item.nameId} ${item.name} ${item.region} ${item.code}`
      .toLocaleLowerCase("id-ID")
      .includes(normalizedQuery),
  );
  const [searchHint, setSearchHint] = useState("Cari destinasi atau paket eSIM");
  const reduceMotion = useReducedMotion();
  const nav = useNavigate();
  const orders = useOrders();
  const homeConfig = useHomeEsimConfig();
  const [sheetDestination, setSheetDestination] = useState<SheetDestination | null>(null);
  const { user, loading } = useBetterAuthUser();
  const unread = useUnreadNotifications(Boolean(user));
  useEffect(() => {
    if (reduceMotion || query) {
      setSearchHint("Cari destinasi atau paket eSIM");
      return;
    }

    const examples = ["Jepang", "Singapura", "Korea Selatan", "Eropa"];
    let wordIndex = 0;
    let characterCount = 0;
    let deleting = false;
    let timeout: ReturnType<typeof setTimeout>;

    const tick = () => {
      const word = examples[wordIndex] ?? "";
      characterCount += deleting ? -1 : 1;
      setSearchHint(`Cari ${word.slice(0, characterCount)}`);
      if (!deleting && characterCount === word.length) {
        deleting = true;
        timeout = setTimeout(tick, 1000);
      } else if (deleting && characterCount === 0) {
        deleting = false;
        wordIndex = (wordIndex + 1) % examples.length;
        timeout = setTimeout(tick, 250);
      } else {
        timeout = setTimeout(tick, deleting ? 42 : 80);
      }
    };

    timeout = setTimeout(tick, 500);
    return () => clearTimeout(timeout);
  }, [query, reduceMotion, searchOpen]);

  // The seeded row paints immediately; the live (sellable-only) row replaces it when it arrives so
  // the first paint never blocks on the reseller provider.
  const [popular, setPopular] = useState(() => destinations.filter((d) => d.popular));
  useEffect(() => {
    let cancelled = false;
    void getHomeDestinationFeed()
      .then((feed) => {
        if (!cancelled && feed.popular.length > 0) setPopular(feed.popular);
      })
      .catch(() => {
        // Keep the seeded row: an unavailable catalogue must not blank the home page.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [bundleChip, setBundleChip] = useState<{
    regionCount: number;
    fromPriceIdr: number;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getBundleGroups()
      .then((result) => {
        if (cancelled || result.groups.length === 0) return;
        setBundleChip({
          regionCount: result.groups.length,
          fromPriceIdr: Math.min(...result.groups.map((group) => group.fromPriceIdr)),
        });
      })
      .catch(() => {
        // Provider or Admin gate unavailable: no chip, Home keeps working.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const railDestinations = orderHomeDestinations(popular, homeConfig.destinationOrder);
  const openSheet = (destination: SheetDestination, source: "rail" | "search" | "promo") => {
    trackAnalytics("home_esim_sheet_open", "/", { destination: destination.code, source });
    setSheetDestination(destination);
  };
  const promo = activeHomePromo(homeConfig, Date.now());
  const openPromo = () => {
    trackAnalytics("home_esim_promo_tap", "/", { destination: promo?.destinationCode ?? "search" });
    const target = promo?.destinationCode
      ? destinations.find((item) => item.code.toUpperCase() === promo.destinationCode)
      : undefined;
    if (target) openSheet(target, "promo");
    else setSearchOpen(true);
  };
  const accountLabel = user?.name?.trim().split(/\s+/)[0] || "Akun";

  return (
    <Page>
      <HomeHero
        mode={homeConfig.heroSky}
        firstName={user ? accountLabel : null}
        searchHint={searchHint}
        searchOpen={searchOpen}
        onOpenSearch={() => setSearchOpen(true)}
        headerAction={
          <>
            {loading ? (
              <div
                role="status"
                aria-label="Memuat akun"
                className="h-10 w-24 animate-pulse rounded-full bg-secondary motion-reduce:animate-none"
              />
            ) : user ? (
              <div className="flex items-center gap-2.5">
                <Link
                  to="/notifications"
                  data-testid="header-notifications"
                  aria-label={unread > 0 ? `Notifikasi, ${unread} belum dibaca` : "Notifikasi"}
                  className={`relative ${glassIconButtonClass}`}
                >
                  <Bell className="size-5" strokeWidth={2} aria-hidden="true" />
                  {unread > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-red px-1 text-[11px] font-bold leading-none text-white ring-2 ring-background"
                    >
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </Link>
                <Link
                  to="/profile"
                  search={{
                    admin: undefined,
                    returnTo: undefined,
                    calendar: undefined,
                    calendarSync: undefined,
                  }}
                  aria-label="Buka profil akun"
                  data-testid="header-account"
                  className={`${glassIconButtonClass} text-[16px] font-semibold`}
                >
                  <span aria-hidden="true">
                    {(user.name?.trim() || user.email || "T").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="sr-only">{accountLabel}</span>
                </Link>
              </div>
            ) : (
              <CustomerAuth size="compact" />
            )}
          </>
        }
      />

      {searchOpen && (
        // FixedLayer portals to <body>: the route wrapper is a motion div with will-change-transform,
        // which would otherwise trap this fixed overlay inside the (page-tall) route box.
        <FixedLayer>
          <div
            className="fixed inset-0 z-50 flex items-end bg-foreground/35 backdrop-blur-[2px] duration-200 animate-in fade-in sm:items-center sm:justify-center sm:p-3"
            role="presentation"
            onClick={() => setSearchOpen(false)}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="home-search-title"
              className="w-full max-w-lg rounded-t-[28px] bg-background px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-2 shadow-2xl duration-300 animate-in slide-in-from-bottom sm:rounded-[22px]"
              onClick={(event) => event.stopPropagation()}
            >
              <div
                aria-hidden="true"
                className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-black/15"
              />
              <div className="flex items-center justify-between gap-3">
                <h2 id="home-search-title" className="text-[20px] font-bold tracking-[-0.02em]">
                  Cari destinasi & paket eSIM
                </h2>
                <button
                  type="button"
                  aria-label="Tutup pencarian"
                  onClick={() => setSearchOpen(false)}
                  className="tap flex size-8 items-center justify-center rounded-full bg-black/[0.06] text-muted-foreground"
                >
                  <X className="size-4" strokeWidth={2.4} />
                </button>
              </div>
              <label className="mt-4 flex h-11 items-center gap-2 rounded-xl bg-black/[0.06] px-3">
                <Search className="size-5 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Cari destinasi atau paket eSIM"
                  placeholder={reduceMotion ? "Jepang, Korea, 5 GB…" : searchHint}
                  className="flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
                />
              </label>
              <div className="mt-4 max-h-[min(55vh,24rem)] overflow-y-auto overflow-x-hidden">
                {!normalizedQuery && bundleList.length > 0 && (
                  <div className="no-scrollbar -mx-5 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1">
                    {bundleList.map((group) => (
                      <Link
                        key={group.code}
                        to="/destination/$code"
                        params={{ code: group.code.toLowerCase() }}
                        search={{ availability: "all" }}
                        onClick={() => setSearchOpen(false)}
                        aria-label={`Paket ${group.label}, ${group.countryCount} negara, mulai Rp${group.fromPriceIdr.toLocaleString("id-ID")}`}
                        className="tap flex shrink-0 items-center gap-1.5 rounded-full bg-secondary py-1.5 pl-2 pr-3 text-[12.5px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span aria-hidden="true" className="text-[15px] leading-none">
                          {group.flag}
                        </span>
                        <span className="whitespace-nowrap">{group.label}</span>
                        <span className="whitespace-nowrap font-normal text-muted-foreground">
                          · {group.countryCount} negara
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
                {normalizedQuery.length > 0 && (
                  <p className="px-1 pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Destinasi
                  </p>
                )}
                {searchResults.length === 0 ? (
                  <p className="py-3 text-center text-sm text-muted-foreground">
                    {liveList === null && !normalizedQuery
                      ? "Memuat destinasi…"
                      : "Tidak ada destinasi yang cocok."}
                  </p>
                ) : (
                  <div className="ios-card divide-y divide-border/70 overflow-hidden">
                    {searchResults.map((destination) => (
                      <button
                        key={destination.code}
                        type="button"
                        onClick={() => {
                          setSearchOpen(false);
                          openSheet(destination, "search");
                        }}
                        className="tap flex w-full items-center gap-3 px-4 py-3 text-left"
                      >
                        <span className="text-xl">{destination.flag}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{destination.nameId}</span>
                          <span className="block text-xs text-muted-foreground">
                            {destination.region === "Regional" ? "Paket regional" : "Paket negara"}
                          </span>
                        </span>
                        <ChevronRight className="size-5 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
                <EsimPackageResults query={query} onNavigate={() => setSearchOpen(false)} />
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  void nav({ to: "/explore" });
                }}
                className="tap mt-4 h-12 w-full rounded-2xl bg-brand-red text-[16px] font-semibold text-primary-foreground"
              >
                Lihat semua destinasi
              </button>
            </section>
          </div>
        </FixedLayer>
      )}

      <Reveal as="section" className="relative z-[4] -mt-16">
        <EsimHomeSummaryCard
          orders={orders}
          onSearchPackages={() => setSearchOpen(true)}
          destinations={railDestinations}
          onSelectDestination={(destination) => {
            // Packages open inside the card; only the funnel events are recorded here.
            trackAnalytics("home_esim_chip_tap", "/", { destination: destination.code });
            trackAnalytics("home_esim_sheet_open", "/", {
              destination: destination.code,
              source: "rail",
            });
          }}
          config={homeConfig}
          bundleChip={bundleChip}
        />
        {!loading && !user && orders !== null && orders.length > 0 && (
          <Link
            to="/profile"
            search={{
              admin: undefined,
              returnTo: undefined,
              calendar: undefined,
              calendarSync: undefined,
            }}
            data-testid="home-sync-prompt"
            className="tap mt-2.5 flex min-h-11 w-full items-center gap-2 rounded-2xl border border-border/60 bg-surface px-4 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Masuk agar eSIM tersimpan di akunmu</span>
              <span className="block text-[12px] text-muted-foreground">
                eSIM ini baru ada di browser ini. Masuk untuk melihatnya di perangkat lain.
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        )}
        {promo && (
          <button
            type="button"
            onClick={openPromo}
            data-testid="home-promo-banner"
            className="tap mt-2.5 flex min-h-11 w-full items-center gap-2 rounded-2xl border border-border/60 bg-surface px-4 text-left text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1 truncate">{promo.text}</span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        )}
      </Reveal>
      {homeConfig.myTripsWidgetEnabled && (
        <Reveal as="section" className="mt-4" aria-labelledby="home-trips-title">
          <SectionTitle action={<Link to="/my-trips">Buka ›</Link>}>
            <span id="home-trips-title">Perjalananmu</span>
          </SectionTitle>
          <HomeMyTripsWidget signedIn={Boolean(user)} />
        </Reveal>
      )}
      <RecentPurchaseToast paused={searchOpen || sheetDestination !== null} />
      <EsimDestinationSheet
        destination={sheetDestination}
        onClose={() => setSheetDestination(null)}
      />

      <Stagger className="block">
        <Reveal as="section" className="mt-4">
          <SectionTitle action={<Link to="/explore">Lihat Semua ›</Link>}>
            Destinasi Populer
          </SectionTitle>
          <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-4 pt-0.5">
            {popular.map((d) => {
              const photo = destinationPhoto(d.code);
              return (
                <Link
                  key={d.code}
                  to="/destination/$code"
                  params={{ code: d.code.toLowerCase() }}
                  aria-label={`eSIM ${d.nameId}: lihat paket`}
                  className="tap relative h-[20rem] w-[76%] max-w-[17rem] shrink-0 snap-center overflow-hidden rounded-[22px] bg-secondary"
                >
                  {photo ? (
                    <img
                      src={photo}
                      alt=""
                      loading="lazy"
                      width={736}
                      height={912}
                      className="absolute inset-0 size-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/12 to-secondary pb-16 text-7xl"
                    >
                      {d.flag}
                    </span>
                  )}
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent via-45% to-transparent"
                  />
                  <span className="absolute left-5 top-[1.125rem] text-[12px] font-bold tracking-[0.08em] text-white [text-shadow:0_1px_8px_rgb(0_0_0/0.5)]">
                    POPULER
                  </span>
                  <h3 className="absolute inset-x-5 top-9 text-[22px] font-bold leading-tight tracking-tight text-white [text-shadow:0_2px_14px_rgb(0_0_0/0.45)]">
                    {d.nameId}
                  </h3>
                  <div className="glass !bg-[rgb(40_40_44/0.38)] absolute inset-x-2.5 bottom-2.5 flex items-center gap-3 rounded-[20px] py-2.5 pl-3.5 pr-3 text-white">
                    <span className="min-w-0 flex-1 text-[13px] leading-tight">
                      <b className="block truncate text-[15px]">eSIM {d.nameId}</b>
                      Lihat paket eSIM live
                    </span>
                    <span className="rounded-full bg-white/95 px-4 py-1.5 text-[14px] font-bold text-brand-red">
                      Lihat
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </Reveal>

        <Reveal as="section" className="mt-1" aria-labelledby="home-services-title">
          <SectionTitle action={<Link to="/explore">Layanan ›</Link>}>
            <span id="home-services-title">Kebutuhan perjalanan</span>
          </SectionTitle>
          <div className="ios-card px-1.5 pb-1.5 pt-3.5">
            <ServiceCategoryGrid waitlist />
          </div>
        </Reveal>

        <InstallAppCard className="mt-4" />

        <Reveal as="section" className="mt-4" aria-labelledby="home-guides-title">
          <SectionTitle action={<Link to="/panduan">Lihat semua ›</Link>}>
            <span id="home-guides-title">Panduan Travel</span>
          </SectionTitle>
          <div className="ios-card divide-y divide-border/70 overflow-hidden">
            {featuredGuides.map((guide) => (
              <Link
                key={guide.slug}
                to="/panduan/$slug"
                params={{ slug: guide.slug }}
                aria-label={`Baca panduan: ${guide.title}`}
                className="tap flex min-h-11 items-center gap-3 px-4 py-3.5 active:bg-black/[0.04]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-brand-red">
                    {guide.eyebrow}
                  </span>
                  <span className="mt-0.5 block text-[16px] font-semibold leading-snug tracking-[-0.01em]">
                    {guide.title}
                  </span>
                  <time
                    dateTime={guide.publishedAt}
                    className="mt-1 block text-xs font-medium text-muted-foreground"
                  >
                    Terbit {formatTravelGuideDate(guide.publishedAt)}
                  </time>
                </span>
                <ChevronRight
                  className="size-5 shrink-0 text-muted-foreground/60"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        </Reveal>
      </Stagger>
      <GeoAnswer heading="Pertanyaan umum eSIM" faqs={HOME_FAQS} />
    </Page>
  );
}
