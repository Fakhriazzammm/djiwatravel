import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, CalendarPlus, ChevronRight, Heart, MapPin, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { toggleFeedLike } from "@/lib/feeds.fn";
import {
  FEED_KIND_LABEL,
  feedRelativeTime,
  type FeedPostView,
  type FeedsStatus,
} from "@/lib/feeds";
import { destinationLabel, useRequireSignIn } from "./feed-helpers";
import { FeedSaveSheet } from "./feed-sheets";

export function FeedAvatar({ name, guide = false }: { name: string; guide?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${guide ? "bg-brand-red text-white" : "bg-brand-red-soft text-brand-red"}`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/** One post in the timeline. `detail` shows the full text and a taller photo. */
export function FeedCard({
  post,
  status,
  detail = false,
}: {
  post: FeedPostView;
  status: FeedsStatus;
  detail?: boolean;
}) {
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likeCount);
  const [saveOpen, setSaveOpen] = useState(false);
  const requireSignIn = useRequireSignIn(status.signedIn);
  const pending = post.status === "PENDING";
  const place = destinationLabel(post.destinationCode);

  async function like() {
    if (!requireSignIn("Masuk dulu untuk menyukai postingan.")) return;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikes((n) => n + (wasLiked ? -1 : 1));
    try {
      const result = await toggleFeedLike({ data: { id: post.id } });
      setLiked(result.liked);
      setLikes(result.likeCount);
    } catch {
      setLiked(wasLiked);
      setLikes((n) => n + (wasLiked ? 1 : -1));
      toast.error("Belum bisa menyukai postingan.");
    }
  }

  const bodyClass = `text-[13px] leading-snug whitespace-pre-line break-words ${detail ? "" : "line-clamp-6"}`;
  return (
    <article
      className={`rounded-2xl bg-surface p-3 ${pending ? "border border-dashed border-amber-400 bg-amber-50/60" : ""}`}
      aria-label={`Postingan ${post.authorName}`}
    >
      <div className="flex items-center gap-2">
        <FeedAvatar name={post.authorName} guide={post.source === "guide"} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[13px] font-semibold">
            <span className="truncate">
              {post.authorName}
              {post.mine ? " · kamu" : ""}
            </span>
            {post.source === "guide" && (
              <BadgeCheck
                className="size-4 shrink-0 fill-amber-400 text-white"
                role="img"
                aria-label="Akun resmi Djiwa Travel, terverifikasi"
              />
            )}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {feedRelativeTime(post.publishedAt ?? post.createdAt)}
            {place ? ` · ${place}` : ""}
          </p>
        </div>
        {pending ? (
          <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
            Sedang ditinjau
          </span>
        ) : (
          <span className="rounded-lg bg-brand-red-soft px-2 py-0.5 text-[10px] font-semibold text-brand-red">
            {FEED_KIND_LABEL[post.kind]}
          </span>
        )}
      </div>
      {detail ? (
        <p className={`mt-2 ${bodyClass}`}>{post.body}</p>
      ) : (
        <Link
          to="/feeds/$id"
          params={{ id: post.id }}
          className="mt-2 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className={bodyClass}>{post.body}</p>
        </Link>
      )}
      {post.photoUrl && (
        <img
          src={post.photoUrl}
          alt={post.source === "guide" ? "" : "Foto dari traveler"}
          loading="lazy"
          decoding="async"
          className={`mt-2 w-full rounded-xl bg-secondary object-cover ${detail ? "max-h-96" : "max-h-64"}`}
        />
      )}
      {post.linkPath && (
        <a
          href={post.linkPath}
          className="tap mt-2 flex min-h-10 items-center gap-2 rounded-xl bg-secondary px-3 text-[12px] font-semibold"
        >
          <span className="min-w-0 flex-1 truncate">{post.linkLabel ?? "Baca selengkapnya"}</span>
          <span className="shrink-0 text-brand-red">Baca</span>
          <ChevronRight className="size-4 shrink-0 text-brand-red" aria-hidden="true" />
        </a>
      )}
      {post.placeName && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{post.placeName}</span>
        </div>
      )}
      {pending ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Hanya kamu yang melihat ini sampai disetujui tim (biasanya kurang dari 1 jam).
        </p>
      ) : (
        <div className="mt-1 flex items-center gap-1 text-[12px] text-muted-foreground">
          <button
            type="button"
            onClick={like}
            aria-pressed={liked}
            aria-label={liked ? "Batal suka" : "Suka"}
            className={`tap flex min-h-9 items-center gap-1 pr-3 ${liked ? "text-brand-red" : ""}`}
          >
            <Heart className="size-4" fill={liked ? "currentColor" : "none"} aria-hidden="true" />
            {likes}
          </button>
          <Link
            to="/feeds/$id"
            params={{ id: post.id }}
            aria-label={`${post.commentCount} komentar`}
            className="tap flex min-h-9 items-center gap-1 pr-3"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            {post.commentCount}
          </Link>
          {post.placeName && (
            <button
              type="button"
              onClick={() => {
                if (requireSignIn("Masuk dulu untuk menyimpan ke Agenda.")) setSaveOpen(true);
              }}
              aria-label="Simpan ke Agenda"
              className="tap ml-auto flex size-9 items-center justify-center text-brand-red"
            >
              <CalendarPlus className="size-[18px]" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {post.placeName && (
        <FeedSaveSheet
          postId={post.id}
          placeName={post.placeName}
          open={saveOpen}
          onOpenChange={setSaveOpen}
          signedIn={status.signedIn}
        />
      )}
    </article>
  );
}
