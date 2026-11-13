import { useCallback, useEffect, useState } from "react";
import { getFeed } from "@/lib/feeds.fn";
import type { FeedKind, FeedPostView } from "@/lib/feeds";

type Facet = { code: string; count: number };

/** Loads one page of the timeline (and more on request); `active` false keeps it idle. */
export function useFeedList({
  kind,
  destination,
  limit,
  active,
}: {
  kind?: FeedKind | undefined;
  destination?: string | undefined;
  limit: number;
  active: boolean;
}) {
  const [posts, setPosts] = useState<FeedPostView[]>([]);
  const [pending, setPending] = useState<FeedPostView[]>([]);
  const [facets, setFacets] = useState<Facet[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await getFeed({ data: { kind, destination, limit } });
      setPosts(result.posts);
      setPending(result.pending);
      setFacets(result.facets);
      setCursor(result.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [kind, destination, limit]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await getFeed({ data: { kind, destination, limit, cursor } });
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
  }, [cursor, kind, destination, limit, loadingMore]);

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
    reload: load,
    loadMore,
    addPosted,
  };
}
