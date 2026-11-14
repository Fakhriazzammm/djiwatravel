import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { ConsentGate } from "@/components/consent-gate";
import { CustomerAuth } from "@/components/customer-auth";
import { FeedAvatar } from "@/components/feeds/feed-card";
import { FEEDS_REFRESH_EVENT } from "@/components/feeds/feeds-dock";
import { FeedComposer } from "@/components/feeds/feed-composer";
import { destinationLabel } from "@/components/feeds/feed-helpers";
import { FeedPosts, FeedSkeleton } from "@/components/feeds/feed-timeline";
import { useFeedList, useNewFeedPostCount, type FeedSort } from "@/components/feeds/use-feed-list";
import { BadgeCheck } from "lucide-react";
import { useFeedsStatus } from "@/hooks/use-feeds-status";
import { FEED_KINDS, FEED_KIND_LABEL, type FeedKind } from "@/lib/feeds";

const chip = (on: boolean) =>
  `tap flex min-h-8 shrink-0 items-center rounded-full border px-3 text-[12px] font-semibold ${on ? "border-foreground bg-foreground text-background" : "border-transparent bg-secondary"}`;

const TABS: { id: FeedSort; label: string }[] = [
  { id: "foryou", label: "Untuk kamu" },
  { id: "new", label: "Terbaru" },
  { id: "mine", label: "Tujuanku" },
];

/** The eSIM card as one row of the timeline, from the Djiwa account (verified, like Travo Guide). */
function DjiwaPromoRow() {
  return (
    <article
      aria-label="Dari Djiwa Travel"
      className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2.5 bg-brand-red-soft/60 px-3 py-3"
    >
      <FeedAvatar name="Djiwa Travel" guide />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="flex min-w-0 items-center gap-1 text-[13px] font-semibold">
            <span className="truncate">Djiwa Travel</span>
            <BadgeCheck
              className="size-4 shrink-0 fill-amber-400 text-white"
              role="img"
              aria-label="Akun resmi Djiwa Travel, terverifikasi"
            />
          </p>
          <span className="text-[11px] text-muted-foreground">· Untuk perjalananmu</span>
          <span className="ml-auto shrink-0 rounded-lg bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-brand-red">
            eSIM
          </span>
        </div>
        <Link to="/esim/finder" className="tap mt-1 block">
          <p className="text-[13px] font-semibold">Bingung pilih paket eSIM?</p>
          <p className="text-[12px] text-muted-foreground">
            Temukan paket yang cocok untuk perjalananmu.
          </p>
          <span className="mt-1.5 flex items-center justify-between text-[12px] font-semibold text-brand-red">
            Cari paket
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        </Link>
      </div>
    </article>
  );
}

/**
 * The traveler timeline that lives on Explore: the composer, the sticky tabs (Untuk kamu, Terbaru,
 * Tujuanku), the kind and destination filters, the "N post baru" pill and the list. The composer, tabs
 * and filters stick to the top together while the list scrolls (not while the composer is open).
 */
export function FeedTimelineSection({ startKind }: { startKind?: FeedKind | undefined }) {
  const feeds = useFeedsStatus();
  const [kind, setKind] = useState<FeedKind | undefined>();
  const [destination, setDestination] = useState<string | undefined>();
  const [sort, setSort] = useState<FeedSort>("foryou");
  const list = useFeedList({ kind, destination, sort, limit: 10, active: feeds.enabled });
  const newPosts = useNewFeedPostCount({
    since: list.serverTime,
    kind,
    destination,
    active: feeds.enabled && sort !== "mine",
  });
  useEffect(() => {
    const refresh = () => void list.reload();
    window.addEventListener(FEEDS_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(FEEDS_REFRESH_EVENT, refresh);
  }, [list]);
  const [composerOpen, setComposerOpen] = useState(false);

  if (!feeds.loaded) return <FeedSkeleton />;
  if (!feeds.enabled) return null;
  return (
    <>
      <div className={composerOpen ? "" : "sticky top-0 z-20"}>
        <FeedComposer
          status={feeds}
          onPosted={list.addPosted}
          flush
          onOpenChange={setComposerOpen}
          startKind={startKind}
        />
        <div className="-mx-4 bg-surface px-4">
          <div
            role="tablist"
            aria-label="Urutan Feeds"
            className="-mx-4 flex border-b border-border/70"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={sort === tab.id}
                onClick={() => setSort(tab.id)}
                className={`tap relative flex min-h-10 flex-1 items-center justify-center text-[13px] font-semibold ${sort === tab.id ? "text-foreground" : "text-muted-foreground"}`}
              >
                {tab.label}
                {sort === tab.id && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-[28%] bottom-[-1px] h-0.5 rounded-full bg-foreground"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
        <div
          className="-mx-4 flex gap-1.5 overflow-x-auto border-b border-border/60 bg-surface px-4 py-2"
          role="group"
          aria-label="Filter Feeds"
        >
          {FEED_KINDS.map((value) => (
            <button
              key={value}
              type="button"
              className={chip(kind === value)}
              aria-pressed={kind === value}
              onClick={() => setKind(kind === value ? undefined : value)}
            >
              {FEED_KIND_LABEL[value]}
            </button>
          ))}
          {list.facets.map((facet) => (
            <button
              key={facet.code}
              type="button"
              className={chip(destination === facet.code)}
              aria-pressed={destination === facet.code}
              onClick={() => setDestination(destination === facet.code ? undefined : facet.code)}
            >
              {destinationLabel(facet.code)}
            </button>
          ))}
        </div>
        {newPosts > 0 && (
          <button
            type="button"
            onClick={() => {
              window.scrollTo({ top: 0 });
              void list.reload();
            }}
            className="tap mx-auto mt-2 flex min-h-8 items-center rounded-full bg-foreground px-3.5 text-[12px] font-semibold text-background"
          >
            ↑ {newPosts >= 99 ? "99+" : newPosts} post baru
          </button>
        )}
      </div>
      <div className="mt-0">
        {sort === "mine" && !list.loading && !list.error && list.tripDestinations.length > 0 && (
          <p className="-mx-4 border-b border-border/60 bg-surface px-4 py-2 text-[12px] text-muted-foreground">
            Dari Agendamu:{" "}
            <span className="font-semibold text-foreground">
              {list.tripDestinations.map((code) => destinationLabel(code)).join(" · ")}
            </span>
          </p>
        )}
        {list.loading ? (
          <FeedSkeleton flush />
        ) : list.blocked === "signin" ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-surface p-3">
            <p className="text-[12px] text-muted-foreground">
              Masuk untuk melihat post tentang tujuan di Agendamu.
            </p>
            <CustomerAuth size="compact" />
          </div>
        ) : list.blocked === "consent" ? (
          <ConsentGate
            purpose="personalization"
            text="Aktifkan “Personalisasi” agar Feeds menampilkan post tentang tujuan di Agendamu."
            onGranted={() => void list.reload()}
          />
        ) : list.blocked === "notrips" ? (
          <div className="mt-3 rounded-2xl bg-surface p-4 text-center">
            <p className="text-[13px] text-muted-foreground">
              Belum ada perjalanan di Agenda. Tambahkan trip untuk melihat post tentang tujuanmu.
            </p>
            <Link
              to="/my-trips/new"
              className="tap mt-2 inline-flex min-h-9 items-center rounded-xl bg-brand-red px-4 text-[13px] font-semibold text-white"
            >
              Buat perjalanan
            </Link>
          </div>
        ) : list.error ? (
          <div role="alert" className="rounded-2xl bg-surface p-3 text-center">
            <p className="text-[13px] text-muted-foreground">Feeds belum dapat dimuat.</p>
            <button
              type="button"
              onClick={() => void list.reload()}
              className="tap mt-2 min-h-9 rounded-xl bg-secondary px-4 text-[13px] font-semibold"
            >
              Coba lagi
            </button>
          </div>
        ) : list.posts.length === 0 && list.pending.length === 0 ? (
          <p className="rounded-2xl bg-surface p-4 text-center text-[13px] text-muted-foreground">
            {kind || destination || sort === "mine"
              ? "Belum ada postingan untuk pilihan ini."
              : "Belum ada postingan. Jadilah yang pertama berbagi tips."}
          </p>
        ) : (
          <FeedPosts
            posts={list.posts}
            pending={list.pending}
            status={feeds}
            flush
            promo={<DjiwaPromoRow />}
          />
        )}
        {list.hasMore && !list.loading && (
          <button
            type="button"
            onClick={() => void list.loadMore()}
            disabled={list.loadingMore}
            className="tap mt-2 flex min-h-10 w-full items-center justify-center rounded-xl bg-surface text-[13px] font-semibold disabled:opacity-50"
          >
            {list.loadingMore ? "Memuat…" : "Muat lagi"}
          </button>
        )}
      </div>
    </>
  );
}
