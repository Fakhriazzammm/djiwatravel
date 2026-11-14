import { FeedsFrame } from "@/components/feeds/feeds-dock";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CustomerAuth } from "@/components/customer-auth";
import { FeedAvatar } from "@/components/feeds/feed-card";
import { FeedPosts, FeedSkeleton } from "@/components/feeds/feed-timeline";
import { BackBar } from "@/components/shell";
import { useFeedsStatus } from "@/hooks/use-feeds-status";
import { getMyFeedProfile } from "@/lib/feeds.fn";
import { feedAuthorName } from "@/lib/feeds";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";

export const Route = createFileRoute("/explore/aku")({
  head: () => ({
    meta: [{ title: "Aku di Feeds — Djiwa Travel" }, { name: "robots", content: "noindex" }],
  }),
  component: FeedsMePage,
});

type Profile = Awaited<ReturnType<typeof getMyFeedProfile>>;
type Segment = "posts" | "saved" | "pending";

function FeedsMePage() {
  const feeds = useFeedsStatus();
  const { user } = useBetterAuthUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);
  const [segment, setSegment] = useState<Segment>("posts");

  useEffect(() => {
    if (!feeds.loaded || !feeds.enabled) return;
    let live = true;
    void getMyFeedProfile()
      .then((result) => {
        if (!live) return;
        setProfile(result);
        if (result.posts.length === 0 && result.pending.length > 0) setSegment("pending");
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [feeds.loaded, feeds.enabled]);

  const name = feedAuthorName(user?.name);
  const list =
    segment === "saved"
      ? profile?.bookmarks
      : segment === "pending"
        ? profile?.pending
        : profile?.posts;
  const empty = {
    posts: "Belum ada postingan yang tayang. Tulis yang pertama dari kartu di atas Explore.",
    saved: "Belum ada yang disimpan. Ketuk ikon penanda di sebuah postingan untuk menyimpannya.",
    pending: "Tidak ada postingan yang menunggu tinjauan.",
  }[segment];

  return (
    <FeedsFrame>
      <div className="pt-4">
        <BackBar title="Aku" fallbackTo="/explore" />
      </div>
      {!feeds.loaded || (feeds.enabled && !profile && !failed) ? (
        <FeedSkeleton />
      ) : !feeds.enabled ? (
        <p
          role="status"
          className="rounded-2xl bg-surface p-4 text-center text-[13px] text-muted-foreground"
        >
          Feeds belum tersedia. Coba lagi nanti.
        </p>
      ) : failed ? (
        <p
          role="alert"
          className="rounded-2xl bg-surface p-4 text-center text-[13px] text-muted-foreground"
        >
          Halaman ini belum dapat dimuat.
        </p>
      ) : profile && !profile.signedIn ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-3">
          <p className="text-[13px] text-muted-foreground">
            Masuk untuk melihat postingan dan simpananmu.
          </p>
          <CustomerAuth size="compact" />
        </div>
      ) : profile ? (
        <>
          <section className="rounded-2xl bg-surface p-4 text-center" aria-label="Ringkasan">
            <div className="mx-auto flex w-fit flex-col items-center gap-1">
              <FeedAvatar name={name} />
              <p className="text-[15px] font-bold">{name}</p>
            </div>
            <dl className="mt-3 flex justify-center gap-x-5 text-[11px] text-muted-foreground">
              {[
                ["Post", profile.counts.posts],
                ["Komentar", profile.counts.comments],
                ["Tersimpan", profile.counts.bookmarks],
              ].map(([label, value]) => (
                <div key={label}>
                  <dd className="text-[16px] font-bold text-foreground">{value}</dd>
                  <dt>{label}</dt>
                </div>
              ))}
            </dl>
          </section>
          <div role="tablist" aria-label="Isi" className="my-3 flex gap-1.5">
            {(
              [
                ["posts", "Postinganku"],
                ["saved", "Tersimpan"],
                [
                  "pending",
                  `Menunggu${profile.pending.length ? ` (${profile.pending.length})` : ""}`,
                ],
              ] as [Segment, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={segment === id}
                onClick={() => setSegment(id)}
                className={`tap flex min-h-9 flex-1 items-center justify-center rounded-xl text-[12px] font-semibold ${segment === id ? "bg-foreground text-background" : "bg-surface"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {segment === "pending" && (list?.length ?? 0) > 0 && (
            <p className="mb-2 rounded-xl bg-amber-50 p-3 text-[12px] text-amber-900">
              Hanya kamu yang melihat ini sampai disetujui tim, biasanya kurang dari 1 jam.
            </p>
          )}
          {list && list.length > 0 ? (
            <FeedPosts posts={list} pending={[]} status={feeds} />
          ) : (
            <p className="rounded-2xl bg-surface p-4 text-center text-[13px] text-muted-foreground">
              {empty}
            </p>
          )}
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Atur data yang boleh dipakai di{" "}
            <Link to="/privasi-akun" className="font-semibold text-brand-red">
              Privasi & data
            </Link>
            .
          </p>
        </>
      ) : null}
    </FeedsFrame>
  );
}
