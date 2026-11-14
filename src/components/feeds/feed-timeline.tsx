import { FeedCard } from "@/components/feeds/feed-card";
import type { FeedPostView, FeedsStatus } from "@/lib/feeds";

export function FeedSkeleton({ flush = false }: { flush?: boolean }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={`divide-y divide-border/60 overflow-hidden bg-surface ${flush ? "-mx-4 border-b border-border/60" : "rounded-2xl"}`}
    >
      <span className="sr-only">Memuat Feeds…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-2.5 px-3 py-3">
          <div className="size-8 shrink-0 animate-pulse rounded-full bg-secondary motion-reduce:animate-none" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3 w-1/3 animate-pulse rounded bg-secondary motion-reduce:animate-none" />
            <div className="h-3 w-full animate-pulse rounded bg-secondary motion-reduce:animate-none" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-secondary motion-reduce:animate-none" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The viewer's own pending posts first, then the published ones. */
export function FeedPosts({
  posts,
  pending,
  status,
  flush = false,
}: {
  posts: FeedPostView[];
  pending: FeedPostView[];
  status: FeedsStatus;
  /** Edge to edge rows (the Feeds page); otherwise one rounded group (inside Explore). */
  flush?: boolean;
}) {
  return (
    <div
      className={`divide-y divide-border/60 overflow-hidden bg-surface ${flush ? "-mx-4 border-y border-border/60" : "rounded-2xl"}`}
    >
      {pending.map((post) => (
        <FeedCard key={`p-${post.id}`} post={post} status={status} />
      ))}
      {posts.map((post) => (
        <FeedCard key={post.id} post={post} status={status} />
      ))}
    </div>
  );
}
