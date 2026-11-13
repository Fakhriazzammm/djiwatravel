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
}: {
  posts: FeedPostView[];
  pending: FeedPostView[];
  status: FeedsStatus;
}) {
  return (
    <div className="space-y-2">
      {pending.map((post) => (
        <FeedCard key={`p-${post.id}`} post={post} status={status} />
      ))}
      {posts.map((post) => (
        <FeedCard key={post.id} post={post} status={status} />
      ))}
    </div>
  );
}
