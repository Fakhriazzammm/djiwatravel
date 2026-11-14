import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CustomerAuth } from "@/components/customer-auth";
import { FeedSkeleton } from "@/components/feeds/feed-timeline";
import { FeedsFrame } from "@/components/feeds/feeds-dock";
import { BackBar } from "@/components/shell";
import { useFeedsStatus } from "@/hooks/use-feeds-status";
import { FEEDS_UNREAD_EVENT } from "@/hooks/use-feeds-unread";
import { getFeedActivity, markFeedActivityRead } from "@/lib/feeds.fn";
import { feedRelativeTime, type FeedActivityItem } from "@/lib/feeds";

export const Route = createFileRoute("/feeds/aktivitas")({
  head: () => ({
    meta: [{ title: "Aktivitas Feeds — Djiwa Travel" }, { name: "robots", content: "noindex" }],
  }),
  component: FeedsActivityPage,
});

type Segment = "all" | "feed_comment" | "feed_post";
const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "all", label: "Semua" },
  { id: "feed_comment", label: "Komentar" },
  { id: "feed_post", label: "Postingan" },
];

function FeedsActivityPage() {
  const feeds = useFeedsStatus();
  const [segment, setSegment] = useState<Segment>("all");
  const [items, setItems] = useState<FeedActivityItem[] | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!feeds.loaded || !feeds.enabled) return;
    let live = true;
    void getFeedActivity()
      .then((result) => {
        if (!live) return;
        setItems(result.items);
        setSignedIn(result.signedIn);
        // Opening the page counts as reading; the unread dots stay for this visit.
        if (result.unread > 0)
          void markFeedActivityRead()
            .then(() => window.dispatchEvent(new Event(FEEDS_UNREAD_EVENT)))
            .catch(() => toast.error("Belum bisa menandai sudah dibaca."));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [feeds.loaded, feeds.enabled]);

  const shown = (items ?? []).filter((item) => segment === "all" || item.type === segment);

  return (
    <FeedsFrame>
      <div className="pt-4">
        <BackBar title="Aktivitas" fallbackTo="/feeds" />
      </div>
      {!feeds.loaded || (feeds.enabled && items === null && !failed && signedIn) ? (
        <FeedSkeleton />
      ) : !feeds.enabled ? (
        <p
          role="status"
          className="rounded-2xl bg-surface p-4 text-center text-[13px] text-muted-foreground"
        >
          Feeds belum tersedia. Coba lagi nanti.
        </p>
      ) : !signedIn ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-3">
          <p className="text-[13px] text-muted-foreground">
            Masuk untuk melihat aktivitas postinganmu.
          </p>
          <CustomerAuth size="compact" />
        </div>
      ) : failed ? (
        <p
          role="alert"
          className="rounded-2xl bg-surface p-4 text-center text-[13px] text-muted-foreground"
        >
          Aktivitas belum dapat dimuat.
        </p>
      ) : (
        <>
          <div role="tablist" aria-label="Jenis aktivitas" className="mb-3 flex gap-1.5">
            {SEGMENTS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={segment === entry.id}
                onClick={() => setSegment(entry.id)}
                className={`tap flex min-h-9 flex-1 items-center justify-center rounded-xl text-[12px] font-semibold ${segment === entry.id ? "bg-foreground text-background" : "bg-surface"}`}
              >
                {entry.label}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="rounded-2xl bg-surface p-4 text-center text-[13px] text-muted-foreground">
              {items && items.length > 0
                ? "Belum ada aktivitas di sini."
                : "Belum ada aktivitas. Komentar di postinganmu dan keputusan tim muncul di sini."}
            </p>
          ) : (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-surface">
              {shown.map((item) => {
                const Icon = item.type === "feed_comment" ? MessageCircle : ShieldCheck;
                const inner = (
                  <>
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-red-soft text-brand-red"
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold">{item.title}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {item.body}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {feedRelativeTime(item.at)}
                      </span>
                    </span>
                    {item.unread && (
                      <span
                        aria-label="Belum dibaca"
                        className="size-2 shrink-0 rounded-full bg-brand-red"
                      />
                    )}
                  </>
                );
                return (
                  <li key={item.id} className={item.unread ? "bg-brand-red-soft/40" : undefined}>
                    {item.href ? (
                      <a href={item.href} className="tap flex items-center gap-3 px-3 py-3">
                        {inner}
                      </a>
                    ) : (
                      <div className="flex items-center gap-3 px-3 py-3">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Notifikasi pesanan dan lainnya ada di{" "}
            <Link to="/notifications" className="font-semibold text-brand-red">
              Notifikasi
            </Link>
            .
          </p>
        </>
      )}
    </FeedsFrame>
  );
}
