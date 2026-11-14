import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Search, ChevronRight, Bell, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Page } from "@/components/shell";
import { SkeletonCards } from "@/components/route-loading";
import { destinations, search } from "@/lib/catalog";
import {
  ServiceCategoryGrid,
  ServiceSectionHeading,
  ServiceShelf,
} from "@/components/explore/service-category-grid";
import { getListableDestinations } from "@/lib/destination-availability.fn";
import { exploreAvailability } from "@/lib/explore-availability";
import { FeedTimelineSection } from "@/components/feeds/feed-timeline-section";
import { useFeedsStatus } from "@/hooks/use-feeds-status";
import { useFeedsUnread } from "@/hooks/use-feeds-unread";
import { getFeed } from "@/lib/feeds.fn";
import type { FeedPostView } from "@/lib/feeds";

export const Route = createFileRoute("/explore")({
  validateSearch: (search: Record<string, unknown>): { tulis?: "titip" } =>
    search["tulis"] === "titip" ? { tulis: "titip" } : {},
  // The resolver reuses the provider cache, handles regional coverage, and falls back to the
  // seeded display list during a transient provider outage. Re-run when returning to Explore so a
  // transient error from another route is never kept as the page's only state.
  staleTime: 0,
  loader: async () => {
    const available = await getListableDestinations();
    return exploreAvailability(available, "live");
  },
  head: () => ({
    meta: [
      { title: "Explore — Djiwa Travel" },
      {
        name: "description",
        content: "Temukan destinasi dan kebutuhan perjalanan internasionalmu.",
      },
      { property: "og:title", content: "Explore — Djiwa Travel" },
      {
        property: "og:description",
        content: "Temukan destinasi dan kebutuhan perjalanan internasionalmu.",
      },
      { property: "og:url", content: "https://djiwatravel.com/explore" },
    ],
    links: [{ rel: "canonical", href: "https://djiwatravel.com/explore" }],
  }),
  // A cold provider read can legitimately take a few seconds; say so instead of showing a gap.
  pendingComponent: () => (
    <Page>
      <h1 className="text-[22px] font-bold leading-tight tracking-tight pt-4">Explore</h1>
      <div role="status" aria-busy="true" className="mt-4 space-y-3">
        <span className="sr-only">Memuat katalog…</span>
        <div className="h-12 animate-pulse rounded-2xl bg-secondary motion-reduce:animate-none" />
        <SkeletonCards />
      </div>
    </Page>
  ),
  component: Explore,
});

function Explore() {
  const router = useRouter();
  const available = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const reduceMotion = useReducedMotion();
  const feeds = useFeedsStatus();
  const searchParams = Route.useSearch();
  const unread = useFeedsUnread(feeds.enabled);
  const headRef = useRef<HTMLDivElement>(null);
  const [headH, setHeadH] = useState(0);
  const [postHits, setPostHits] = useState<FeedPostView[]>([]);

  // The timeline tabs stick right under Explore's own sticky header, whatever its height.
  useEffect(() => {
    const node = headRef.current;
    if (!feeds.enabled || !node) return;
    const measure = () => setHeadH(Math.round(node.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [feeds.enabled]);

  // One search for the whole page: destinations and the traveler posts that mention the words.
  useEffect(() => {
    const text = q.trim();
    if (!feeds.enabled || text.length < 2) {
      setPostHits([]);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      void getFeed({ data: { q: text, limit: 3 } })
        .then((result) => live && setPostHits(result.posts))
        .catch(() => live && setPostHits([]));
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [q, feeds.enabled]);
  const [placeholderText, setPlaceholderText] = useState("Cari negara atau kota");
  const res = search(q).filter((destination) =>
    available.destinations.some((item) => item.code === destination.code),
  );
  const searchOptions = (q.trim() ? res : destinations).filter((destination) =>
    available.destinations.some((item) => item.code === destination.code),
  );

  useEffect(() => {
    if (reduceMotion || searchFocused || q) {
      setPlaceholderText("Cari negara atau kota");
      return;
    }

    const examples = ["Jepang", "Singapura", "Thailand"];
    let wordIndex = 0;
    let characterCount = 0;
    let deleting = false;
    let timeout: ReturnType<typeof setTimeout>;

    const tick = () => {
      const word = examples[wordIndex] ?? "";
      characterCount += deleting ? -1 : 1;
      setPlaceholderText(`Cari ${word.slice(0, characterCount)}`);

      if (!deleting && characterCount === word.length) {
        deleting = true;
        timeout = setTimeout(tick, 1100);
      } else if (deleting && characterCount === 0) {
        deleting = false;
        wordIndex = (wordIndex + 1) % examples.length;
        timeout = setTimeout(tick, 250);
      } else {
        timeout = setTimeout(tick, deleting ? 45 : 85);
      }
    };

    timeout = setTimeout(tick, 500);
    return () => clearTimeout(timeout);
  }, [q, reduceMotion, searchFocused]);
  return (
    <Page>
      <div
        ref={headRef}
        className={feeds.enabled ? "sticky top-0 z-30 -mx-4 bg-background px-4 pb-2" : undefined}
      >
        <header className="pt-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-red">
            Djiwa Travel
          </p>
          <div className="mt-1 flex items-center justify-between">
            <h1 className="text-[22px] font-bold leading-tight tracking-tight">Explore</h1>
            {feeds.enabled && (
              <div className="flex items-center gap-1.5">
                <Link
                  to="/feeds/aktivitas"
                  aria-label={
                    unread > 0 ? `Aktivitas Feeds, ${unread} belum dibaca` : "Aktivitas Feeds"
                  }
                  className="tap relative flex size-9 items-center justify-center rounded-full bg-surface"
                >
                  <Bell className="size-[18px]" aria-hidden="true" />
                  {unread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-red px-1 text-[9px] font-bold text-white">
                      {unread >= 99 ? "99+" : unread}
                    </span>
                  )}
                </Link>
                <Link
                  to="/feeds/aku"
                  aria-label="Post dan simpananku"
                  className="tap flex size-9 items-center justify-center rounded-full bg-surface"
                >
                  <User className="size-[18px]" aria-hidden="true" />
                </Link>
              </div>
            )}
          </div>
          {!feeds.enabled && (
            <p className="mt-2 text-sm text-muted-foreground">Mau pergi ke mana?</p>
          )}
        </header>
        <div className="relative">
          <form
            className="mt-4 flex h-12 items-center gap-2 rounded-2xl border border-border/70 bg-surface px-3 focus-within:ring-2 focus-within:ring-ring"
            onSubmit={(event) => {
              event.preventDefault();
              if (!q.trim()) {
                setSearchMessage("Masukkan nama negara atau kota terlebih dahulu.");
                return;
              }
              const destination = res[0];
              if (!destination) {
                setSearchMessage(`Destinasi “${q.trim()}” belum tersedia di katalog.`);
                return;
              }
              setSearchMessage("");
              void router.navigate({
                to: "/destination/$code",
                params: { code: destination.code.toLowerCase() },
              });
            }}
          >
            <Search className="size-5 text-muted-foreground" aria-hidden="true" />
            <input
              value={q}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
              onChange={(e) => {
                setQ(e.target.value);
                setSearchMessage("");
              }}
              placeholder={placeholderText}
              aria-label="Cari destinasi"
              className="flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setSearchMessage("");
                }}
                aria-label="Hapus pencarian"
                className="rounded-full px-2 text-lg text-muted-foreground"
              >
                ×
              </button>
            )}
          </form>
          <AnimatePresence>
            {searchFocused && q.trim() && (
              <motion.div
                key="destination-search-results"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                transition={
                  reduceMotion ? { duration: 0.1 } : { duration: 0.18, ease: [0.32, 0.72, 0, 1] }
                }
                className="absolute inset-x-0 top-[calc(100%+8px)] z-20 max-h-72 overflow-y-auto rounded-2xl border border-border bg-surface p-2 shadow-md"
              >
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Hasil pencarian
                </p>
                {searchOptions.length > 0 ? (
                  searchOptions.map((destination) => (
                    <motion.button
                      layout={!reduceMotion}
                      key={destination.code}
                      type="button"
                      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-secondary"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setQ(destination.nameId);
                        setSearchFocused(false);
                        setSearchMessage("");
                        void router.navigate({
                          to: "/destination/$code",
                          params: { code: destination.code.toLowerCase() },
                        });
                      }}
                    >
                      <span aria-hidden="true">{destination.flag}</span>
                      <span className="font-medium">{destination.nameId}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {destination.region}
                      </span>
                    </motion.button>
                  ))
                ) : (
                  <p className="px-3 py-3 text-sm text-muted-foreground" role="status">
                    Tidak ada destinasi yang cocok.
                  </p>
                )}
                {postHits.length > 0 && (
                  <>
                    <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Post traveler
                    </p>
                    {postHits.map((post) => (
                      <Link
                        key={post.id}
                        to="/feeds/$id"
                        params={{ id: post.id }}
                        onMouseDown={(event) => event.preventDefault()}
                        className="block rounded-xl px-3 py-2 text-left hover:bg-secondary"
                      >
                        <span className="text-[12px] font-semibold">{post.authorName}</span>
                        <span className="line-clamp-2 block text-[13px] text-muted-foreground">
                          {post.body}
                        </span>
                      </Link>
                    ))}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {searchMessage && (
          <p className="mt-2 text-sm text-muted-foreground" role="status">
            {searchMessage}
          </p>
        )}
        {feeds.enabled && <ServiceShelf />}
      </div>
      {!feeds.enabled && (
        <Link
          to="/esim/finder"
          className="tap mt-3 flex items-center gap-3 rounded-2xl bg-brand-red-soft p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold">Bingung pilih paket eSIM?</p>
            <p className="truncate text-[12px] text-muted-foreground">
              Temukan paket yang cocok untuk perjalananmu.
            </p>
          </div>
          <ChevronRight className="size-5 shrink-0 text-brand-red" />
        </Link>
      )}
      {available.source === "error" && (
        <div role="alert" className="mt-4 rounded-2xl bg-surface p-4 text-center shadow-sm">
          <p className="font-semibold">Explore belum dapat dimuat</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {available.errorMessage} Tidak ada paket yang dibuat-buat.
          </p>
          <button
            type="button"
            onClick={() => void router.invalidate()}
            className="mt-4 min-h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
          >
            Coba lagi
          </button>
        </div>
      )}
      {!feeds.enabled && (
        <section className="mt-4">
          <ServiceSectionHeading title="Kebutuhan perjalanan" detail="Layanan" />
          <ServiceCategoryGrid />
        </section>
      )}
      {feeds.enabled && (
        <FeedTimelineSection
          startKind={searchParams.tulis === "titip" ? "titip" : undefined}
          stickyTop={headH}
        />
      )}
      {res.length === 0 && available.source !== "error" && (
        <p className="mb-4 text-center text-sm text-muted-foreground">
          Belum ada destinasi untuk “{q}”. Coba nama negara lain.
        </p>
      )}
    </Page>
  );
}
