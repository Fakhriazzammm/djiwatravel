import { useCallback, useEffect, useState } from "react";
import { countNewFeedPosts, getFeed } from "@/lib/feeds.fn";
import type { FeedKind, FeedPostView } from "@/lib/feeds";

type Facet = { code: string; count: number };
export type FeedSort = "new" | "foryou" | "mine";
export type FeedBlocked = "signin" | "consent" | "notrips" | null;

/** Loads one page of the timeline (and more on request); `active` false keeps it idle. */
export function useFeedList({
  kind,
  destination,
  sort = "new",
  limit,
  active,
}: {
  kind?: FeedKind | undefined;
  destination?: string | undefined;
  sort?: FeedSort;
  limit: number;
  active: boolean;
}) {
  const [posts, setPosts] = useState<FeedPostView[]>([]);
  const [pending, setPending] = useState<FeedPostView[]>([]);
  const [facets, setFacets] = useState<Facet[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<FeedBlocked>(null);
  const [tripDestinations, setTripDestinations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await getFeed({ data: { kind, destination, sort, limit } });
      setPosts(result.posts);
      setPending(result.pending);
      setFacets(result.facets);
      setCursor(result.nextCursor);
      setServerTime(result.serverTime);
      setBlocked(result.blocked);
      setTripDestinations(result.tripDestinations);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [kind, destination, sort, limit]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await getFeed({ data: { kind, destination, sort, limit, cursor } });
      setPosts((current) => {
        const seen = new Set(current.map((p) => p.id));
        return [...current, ...result.posts.filter((p) => !seen.has(p.id))];
      });
      setCursor(result.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, kind, destination, sort, limit, loadingMore]);

  /** A post the viewer just wrote: shown at once (pending ones in the "ditinjau" slot). */
  const addPosted = useCallback(
    (post: FeedPostView, isPending: boolean) => {
      if (isPending) setPending((current) => [post, ...current.filter((p) => p.id !== post.id)]);
      else if (
        (!kind || kind === post.kind) &&
        (!destination || destination === post.destinationCode)
      )
        setPosts((current) => [post, ...current.filter((p) => p.id !== post.id)]);
    },
    [kind, destination],
  );

  return {
    posts,
    pending,
    facets,
    hasMore: cursor !== null,
    loading,
    loadingMore,
    error,
    serverTime,
    blocked,
    tripDestinations,
    reload: load,
    loadMore,
    addPosted,
  };
}

/** "N post baru": asks every minute how many posts others published since the list loaded. */
export function useNewFeedPostCount({
  since,
  kind,
  destination,
  active,
}: {
  since: string | null;
  kind?: FeedKind | undefined;
  destination?: string | undefined;
  active: boolean;
}) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(0);
    if (!active || !since) return;
    let live = true;
    const check = () => {
      if (document.visibilityState === "hidden") return;
      void countNewFeedPosts({ data: { since, kind, destination } })
        .then((result) => live && setCount(result.count))
        .catch(() => undefined);
    };
    const timer = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [active, since, kind, destination]);
  return count;
}
