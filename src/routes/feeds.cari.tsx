import { createFileRoute } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { destinationLabel } from "@/components/feeds/feed-helpers";
import { FeedPosts, FeedSkeleton } from "@/components/feeds/feed-timeline";
import { FeedsFrame } from "@/components/feeds/feeds-dock";
import { useFeedList } from "@/components/feeds/use-feed-list";
import { BackBar } from "@/components/shell";
import { useFeedsStatus } from "@/hooks/use-feeds-status";

export const Route = createFileRoute("/feeds/cari")({
  head: () => ({
    meta: [{ title: "Cari di Feeds — Djiwa Travel" }, { name: "robots", content: "noindex" }],
  }),
  component: FeedsSearchPage,
});

const sectionTitle =
  "px-1 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

function FeedsSearchPage() {
  const feeds = useFeedsStatus();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [destination, setDestination] = useState<string | undefined>();

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(text.trim().length >= 2 ? text.trim() : ""), 300);
    return () => window.clearTimeout(timer);
  }, [text]);

  const searching = Boolean(q || destination);
  const results = useFeedList({
    q: q || undefined,
    destination,
    limit: 20,
    active: feeds.enabled && searching,
  });
  const overview = useFeedList({ limit: 1, active: feeds.enabled && !searching });
  const open = useFeedList({ unanswered: true, limit: 5, active: feeds.enabled && !searching });

  return (
    <FeedsFrame>
      <div className="pt-4">
        <BackBar title="Cari" fallbackTo="/feeds" />
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
          <form
            role="search"
            onSubmit={(event) => event.preventDefault()}
            className="flex h-11 items-center gap-2 rounded-full border border-border/70 bg-surface px-3 focus-within:ring-2 focus-within:ring-ring"
          >
            <Search className="size-[18px] text-muted-foreground" aria-hidden="true" />
            <input
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setDestination(undefined);
              }}
              maxLength={60}
              placeholder="Cari post, tempat, atau tujuan"
              aria-label="Cari di Feeds"
              className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
            />
            {(text || destination) && (
              <button
                type="button"
                aria-label="Hapus pencarian"
                onClick={() => {
                  setText("");
                  setDestination(undefined);
                }}
                className="tap flex size-8 items-center justify-center text-muted-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </form>

          {searching ? (
            <div className="mt-3">
              {destination && (
                <p className="px-1 pb-2 text-[12px] text-muted-foreground">
                  Post tentang{" "}
                  <span className="font-semibold text-foreground">
                    {destinationLabel(destination)}
                  </span>
                </p>
              )}
              {results.loading ? (
                <FeedSkeleton flush />
              ) : results.error ? (
                <p
                  role="alert"
                  className="rounded-2xl bg-surface p-4 text-center text-[13px] text-muted-foreground"
                >
                  Pencarian belum berhasil. Coba lagi.
                </p>
              ) : results.posts.length === 0 ? (
                <p className="rounded-2xl bg-surface p-4 text-center text-[13px] text-muted-foreground">
                  Tidak ada postingan yang cocok{q ? ` dengan “${q}”` : ""}.
                </p>
              ) : (
                <FeedPosts posts={results.posts} pending={[]} status={feeds} flush />
              )}
              {results.hasMore && !results.loading && (
                <button
                  type="button"
                  onClick={() => void results.loadMore()}
                  disabled={results.loadingMore}
                  className="tap mt-2 flex min-h-10 w-full items-center justify-center rounded-xl bg-surface text-[13px] font-semibold disabled:opacity-50"
                >
                  {results.loadingMore ? "Memuat…" : "Muat lagi"}
                </button>
              )}
            </div>
          ) : (
            <>
              <h2 className={sectionTitle}>Tujuan ramai</h2>
              {overview.loading ? (
                <FeedSkeleton />
              ) : overview.facets.length === 0 ? (
                <p className="rounded-2xl bg-surface p-3 text-center text-[13px] text-muted-foreground">
                  Belum ada tujuan yang dibahas.
                </p>
              ) : (
                <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-surface">
                  {overview.facets.map((facet) => (
                    <button
                      key={facet.code}
                      type="button"
                      onClick={() => setDestination(facet.code)}
                      className="tap flex min-h-12 w-full items-center gap-3 px-3 text-left text-[14px]"
                    >
                      <span className="flex-1 font-semibold">{destinationLabel(facet.code)}</span>
                      <span className="text-[12px] text-muted-foreground">{facet.count} post</span>
                    </button>
                  ))}
                </div>
              )}
              <h2 className={sectionTitle}>Belum terjawab</h2>
              {open.loading ? (
                <FeedSkeleton />
              ) : open.posts.length === 0 ? (
                <p className="rounded-2xl bg-surface p-3 text-center text-[13px] text-muted-foreground">
                  Semua pertanyaan sudah terjawab.
                </p>
              ) : (
                <FeedPosts posts={open.posts} pending={[]} status={feeds} />
              )}
            </>
          )}
        </>
      )}
    </FeedsFrame>
  );
}
