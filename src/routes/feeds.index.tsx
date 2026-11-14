import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BackBar, Page } from "@/components/shell";
import { FeedComposer } from "@/components/feeds/feed-composer";
import { destinationLabel } from "@/components/feeds/feed-helpers";
import { FeedPosts, FeedSkeleton } from "@/components/feeds/feed-timeline";
import { useFeedList } from "@/components/feeds/use-feed-list";
import { useFeedsStatus } from "@/hooks/use-feeds-status";
import { FEED_KINDS, FEED_KIND_LABEL, type FeedKind } from "@/lib/feeds";

export const Route = createFileRoute("/feeds/")({
  validateSearch: (search: Record<string, unknown>): { tulis?: "titip" } =>
    search["tulis"] === "titip" ? { tulis: "titip" } : {},
  head: () => ({
    meta: [
      { title: "Feeds traveler — Djiwa Travel" },
      {
        name: "description",
        content: "Tips, cerita, dan pertanyaan antar traveler Djiwa Travel.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FeedsPage,
});

const chip = (on: boolean) =>
  `tap flex min-h-8 shrink-0 items-center rounded-full border px-3 text-[12px] font-semibold ${on ? "border-foreground bg-foreground text-background" : "border-border/70 bg-surface"}`;

function FeedsPage() {
  const search = Route.useSearch();
  const feeds = useFeedsStatus();
  const [kind, setKind] = useState<FeedKind | undefined>();
  const [destination, setDestination] = useState<string | undefined>();
  const list = useFeedList({ kind, destination, limit: 10, active: feeds.enabled });

  return (
    <Page>
      <div className="pt-4">
        <BackBar title="Feeds traveler" fallbackTo="/explore" />
      </div>
      {!feeds.loaded ? (
        <FeedSkeleton />
      ) : !feeds.enabled ? (
        <p
          role="status"
          className="rounded-2xl bg-surface p-4 text-center text-[13px] text-muted-foreground"
        >
          Feeds belum tersedia. Coba lagi nanti.
        </p>
      ) : (
        <>
          <div
            className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4"
            role="group"
            aria-label="Filter Feeds"
          >
            <button
              type="button"
              className={chip(!kind && !destination)}
              aria-pressed={!kind && !destination}
              onClick={() => {
                setKind(undefined);
                setDestination(undefined);
              }}
            >
              Terbaru
            </button>
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
          <FeedComposer
            status={feeds}
            onPosted={list.addPosted}
            startKind={search.tulis === "titip" ? "titip" : undefined}
          />
          <div className="mt-3">
            {list.loading ? (
              <FeedSkeleton />
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
                {kind || destination
                  ? "Belum ada postingan untuk filter ini."
                  : "Belum ada postingan. Jadilah yang pertama berbagi tips."}
              </p>
            ) : (
              <FeedPosts posts={list.posts} pending={list.pending} status={feeds} />
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
      )}
    </Page>
  );
}
