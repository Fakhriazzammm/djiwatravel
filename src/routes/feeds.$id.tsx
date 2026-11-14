import { ConsentGate } from "@/components/consent-gate";
import { useConsent } from "@/hooks/use-consent";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { EllipsisVertical, Heart } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CustomerAuth } from "@/components/customer-auth";
import { FeedAvatar, FeedCard } from "@/components/feeds/feed-card";
import { FeedReportSheet } from "@/components/feeds/feed-sheets";
import { FeedSkeleton } from "@/components/feeds/feed-timeline";
import { BackBar, Page, glassIconButtonClass } from "@/components/shell";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useFeedsStatus } from "@/hooks/use-feeds-status";
import {
  addFeedComment,
  deleteFeedComment,
  toggleFeedCommentLike,
  deleteFeedPost,
  getFeedPost,
  undoFeedReport,
} from "@/lib/feeds.fn";
import {
  FEED_COMMENT_MAX,
  feedRelativeTime,
  type FeedCommentView,
  type FeedPostView,
} from "@/lib/feeds";

export const Route = createFileRoute("/feeds/$id")({
  head: () => ({
    meta: [{ title: "Postingan — Djiwa Travel" }, { name: "robots", content: "noindex" }],
  }),
  component: FeedPostPage,
});

const menuRow =
  "tap ios-row w-full border-t border-border/60 text-left text-[14px] first:border-t-0";

function FeedPostPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const feeds = useFeedsStatus();
  const consent = useConsent();
  const communityOk = consent.state ? consent.state.purposes.community : feeds.communityConsent;
  const [post, setPost] = useState<FeedPostView | null>(null);
  const [comments, setComments] = useState<FeedCommentView[]>([]);
  const [reported, setReported] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const result = await getFeedPost({ data: { id } });
      if (!result.enabled || !result.post) {
        setState("missing");
        return;
      }
      setPost(result.post);
      setComments(result.comments);
      setReported(result.reported);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    if (feeds.loaded) void load();
  }, [feeds.loaded, load]);

  async function sendComment(event: React.FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const { comment } = await addFeedComment({ data: { postId: id, body } });
      setComments((current) => [...current, comment]);
      setPost((p) => (p ? { ...p, commentCount: p.commentCount + 1 } : p));
      setText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Komentar belum terkirim.");
    } finally {
      setSending(false);
    }
  }

  async function likeComment(comment: FeedCommentView) {
    if (!feeds.signedIn) {
      toast.error("Masuk dulu untuk menyukai komentar.");
      return;
    }
    const apply = (liked: boolean, likeCount: number) =>
      setComments((current) =>
        current.map((c) => (c.id === comment.id ? { ...c, liked, likeCount } : c)),
      );
    apply(!comment.liked, Math.max(0, comment.likeCount + (comment.liked ? -1 : 1)));
    try {
      const result = await toggleFeedCommentLike({ data: { id: comment.id } });
      apply(result.liked, result.likeCount);
    } catch {
      apply(comment.liked, comment.likeCount);
      toast.error("Belum bisa menyukai komentar.");
    }
  }

  async function removeComment(commentId: string) {
    try {
      await deleteFeedComment({ data: { id: commentId } });
      setComments((current) => current.filter((c) => c.id !== commentId));
      setPost((p) => (p ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p));
    } catch {
      toast.error("Komentar belum bisa dihapus.");
    }
  }

  async function removePost() {
    try {
      await deleteFeedPost({ data: { id } });
      toast.success("Postingan dihapus.");
      void navigate({ to: "/feeds" });
    } catch {
      toast.error("Postingan belum bisa dihapus.");
    }
  }

  async function undoReport() {
    try {
      await undoFeedReport({ data: { id } });
      setReported(false);
    } catch {
      toast.error("Belum bisa membatalkan laporan.");
    }
  }

  async function share() {
    setMenu(false);
    const url = `${window.location.origin}/feeds/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Tautan disalin.");
    } catch {
      toast.message(url);
    }
  }

  const action =
    state === "ready" && post && !reported ? (
      <button
        type="button"
        onClick={() => {
          setConfirmDelete(false);
          setMenu(true);
        }}
        className={glassIconButtonClass}
        aria-label="Menu postingan"
      >
        <EllipsisVertical className="size-5" aria-hidden="true" />
      </button>
    ) : null;

  return (
    <Page>
      <div className="pt-4">
        <BackBar title="Postingan" fallbackTo="/feeds" action={action} />
      </div>
      {state === "loading" || !feeds.loaded ? (
        <FeedSkeleton />
      ) : !feeds.enabled || state === "missing" ? (
        <p
          role="status"
          className="rounded-2xl bg-surface p-4 text-center text-[13px] text-muted-foreground"
        >
          Postingan ini tidak tersedia.
        </p>
      ) : state === "error" || !post ? (
        <div role="alert" className="rounded-2xl bg-surface p-3 text-center">
          <p className="text-[13px] text-muted-foreground">Postingan belum dapat dimuat.</p>
          <button
            type="button"
            onClick={() => void load()}
            className="tap mt-2 min-h-9 rounded-xl bg-secondary px-4 text-[13px] font-semibold"
          >
            Coba lagi
          </button>
        </div>
      ) : reported ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary p-3 text-[13px] text-muted-foreground">
          <span>Postingan disembunyikan untukmu. Tim kami akan meninjau.</span>
          <button
            type="button"
            onClick={() => void undoReport()}
            className="tap min-h-9 shrink-0 px-2 font-semibold text-brand-red"
          >
            Batal
          </button>
        </div>
      ) : (
        <>
          <FeedCard post={post} status={feeds} detail />
          {post.status === "PUBLISHED" && (
            <section className="mt-3" aria-label="Komentar">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Komentar
              </h2>
              {comments.length === 0 && (
                <p className="mb-2 text-[12px] text-muted-foreground">Belum ada komentar.</p>
              )}
              <ul className="space-y-2">
                {comments.map((comment) => (
                  <li key={comment.id} className="flex gap-2">
                    <FeedAvatar name={comment.authorName} />
                    <div className="min-w-0 flex-1 rounded-2xl bg-surface px-3 py-2">
                      <p className="text-[12px] font-semibold">
                        {comment.authorName}
                        {comment.mine ? " · kamu" : ""}
                      </p>
                      <p className="whitespace-pre-line break-words text-[13px] leading-snug">
                        {comment.body}
                      </p>
                      <p className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                        {feedRelativeTime(comment.createdAt)}
                        <button
                          type="button"
                          onClick={() => void likeComment(comment)}
                          aria-pressed={comment.liked}
                          aria-label={comment.liked ? "Batal suka komentar" : "Suka komentar"}
                          className={`tap flex min-h-8 items-center gap-1 font-semibold ${comment.liked ? "text-brand-red" : ""}`}
                        >
                          <Heart
                            className="size-3.5"
                            fill={comment.liked ? "currentColor" : "none"}
                            aria-hidden="true"
                          />
                          {comment.likeCount > 0 ? comment.likeCount : "Suka"}
                        </button>
                        {comment.mine && (
                          <button
                            type="button"
                            onClick={() => void removeComment(comment.id)}
                            className="tap min-h-8 font-semibold"
                          >
                            Hapus
                          </button>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              {!feeds.allowComments ? (
                <p className="mt-3 text-[12px] text-muted-foreground">Komentar sedang dimatikan.</p>
              ) : !feeds.signedIn ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-surface p-3">
                  <p className="text-[12px] text-muted-foreground">Masuk untuk berkomentar.</p>
                  <CustomerAuth size="compact" />
                </div>
              ) : feeds.banned ? (
                <p role="alert" className="mt-3 text-[12px] text-destructive">
                  Akunmu tidak dapat berkomentar di Feeds.
                </p>
              ) : !communityOk ? (
                <ConsentGate
                  purpose="community"
                  text="Namamu akan tampil di komentar. Aktifkan “Komunitas” untuk berkomentar."
                />
              ) : (
                <form onSubmit={sendComment} className="mt-3 flex items-center gap-2">
                  <input
                    value={text}
                    maxLength={FEED_COMMENT_MAX}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Tulis komentar…"
                    aria-label="Tulis komentar"
                    className="min-h-10 flex-1 rounded-full border border-border bg-surface px-4 text-[14px] outline-none focus:border-brand-red"
                  />
                  <button
                    type="submit"
                    disabled={!text.trim() || sending}
                    className="tap min-h-10 rounded-full bg-brand-red px-4 text-[13px] font-semibold text-white disabled:opacity-40"
                  >
                    Kirim
                  </button>
                </form>
              )}
            </section>
          )}
        </>
      )}

      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[88dvh] w-full max-w-md rounded-t-[28px] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-5"
        >
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-muted-foreground/25" aria-hidden />
          <SheetHeader className="p-0 text-left">
            <SheetTitle className="text-[16px]">
              {confirmDelete ? "Hapus postingan ini?" : "Menu postingan"}
            </SheetTitle>
          </SheetHeader>
          {confirmDelete ? (
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => void removePost()}
                className="tap flex min-h-10 w-full items-center justify-center rounded-xl bg-destructive px-4 text-[14px] font-semibold text-white"
              >
                Hapus
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="tap flex min-h-9 w-full items-center justify-center rounded-xl bg-secondary px-4 text-[13px] font-semibold"
              >
                Batal
              </button>
            </div>
          ) : (
            <div className="ios-group mt-3">
              {post?.status === "PUBLISHED" && (
                <button type="button" className={menuRow} onClick={() => void share()}>
                  Bagikan tautan
                </button>
              )}
              {post?.mine ? (
                <button
                  type="button"
                  className={`${menuRow} text-destructive`}
                  onClick={() => setConfirmDelete(true)}
                >
                  Hapus postingan
                </button>
              ) : (
                <button
                  type="button"
                  className={`${menuRow} text-destructive`}
                  onClick={() => {
                    setMenu(false);
                    if (!feeds.signedIn) {
                      toast.message("Masuk dulu untuk melaporkan postingan.");
                      return;
                    }
                    setReportOpen(true);
                  }}
                >
                  Lapor postingan
                </button>
              )}
              <button type="button" className={menuRow} onClick={() => setMenu(false)}>
                Tutup
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <FeedReportSheet
        postId={id}
        open={reportOpen}
        onOpenChange={setReportOpen}
        onReported={() => {
          setReported(true);
          toast.success("Terima kasih, laporan diterima.", {
            action: { label: "Batal", onClick: () => void undoReport() },
          });
        }}
      />
    </Page>
  );
}
