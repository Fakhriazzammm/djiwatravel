import { FeedCard } from "@/components/feeds/feed-card";
import type { FeedPostView, FeedsStatus } from "@/lib/feeds";

export function FeedSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-2">
      <span className="sr-only">Memuat Feeds…</span>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-2xl bg-surface motion-reduce:animate-none"
        />
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
