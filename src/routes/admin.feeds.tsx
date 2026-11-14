import { createFileRoute, useLocation, useRouter } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminShell, AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { formatAdminDateTime } from "@/lib/admin-display";
import { requireAdmin } from "@/lib/admin-guard";
import {
  getAdminFeedComments,
  getAdminFeeds,
  runAdminFeedAction,
  runAdminFeedCommentAction,
  saveAdminFeedsConfig,
} from "@/lib/feeds.fn";
import {
  FEED_KIND_LABEL,
  FEED_REPORT_LABEL,
  FEED_STATUS_LABEL,
  type FeedReportReason,
  type FeedsConfig,
} from "@/lib/feeds";

export const Route = createFileRoute("/admin/feeds")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: () => getAdminFeeds(),
  component: AdminFeeds,
});

type Data = Awaited<ReturnType<typeof getAdminFeeds>>;
type AdminPost = Data["recent"][number];
type Notice = { error: boolean; text: string } | null;
type Tab = "pending" | "reports" | "posts" | "settings";

const input =
  "min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand-red";
const btn =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50";
const btnPrimary =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand-red px-3 text-xs font-semibold text-white disabled:opacity-50";
const btnDanger =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-destructive/40 px-3 text-xs font-semibold text-destructive disabled:opacity-50";

const statusTone = (status: AdminPost["status"]) =>
  status === "PUBLISHED" ? "good" : status === "PENDING" ? "warn" : "neutral";

function AdminFeeds() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const location = useLocation();
  const [tab, setTab] = useState<Tab>("pending");
  const [notice, setNotice] = useState<Notice>(null);
  useEffect(() => {
    const hash = location.hash.replace(/^#/, "");
    setTab(hash === "reports" || hash === "posts" || hash === "settings" ? hash : "pending");
  }, [location.hash]);
  const refresh = () => router.invalidate();

  const tabs: [Tab, string][] = [
    ["pending", `Tinjauan${data.stats.pending ? ` (${data.stats.pending})` : ""}`],
    ["reports", `Laporan${data.stats.openReports ? ` (${data.stats.openReports})` : ""}`],
    ["posts", "Semua post"],
    ["settings", "Pengaturan"],
  ];

  return (
    <AdminShell
      title="Feeds"
      subtitle="Postingan antar traveler di Explore: tinjau, tangani laporan, dan atur aturan."
    >
      <div className="space-y-3">
        {!data.config.enabled && (
          <div
            role="status"
            className="rounded-xl border border-[#f1d9a8] bg-[#fffaf0] p-3 text-xs text-[#78520b]"
          >
            Feeds sedang <b>mati</b>: bagian Feeds tidak tampil di Explore. Nyalakan di tab
            Pengaturan setelah aturan siap.
          </div>
        )}
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Menunggu tinjauan", data.stats.pending],
            ["Laporan terbuka", data.stats.openReports],
            ["Tayang", data.stats.published],
            ["Posting 7 hari", data.stats.posts7d],
            ["Komentar 7 hari", data.stats.comments7d],
            ["Suka 7 hari", data.stats.likes7d],
            ["Akun diblokir", data.stats.bans],
          ].map(([label, value]) => (
            <AdminSurface key={String(label)} className="p-3">
              <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
            </AdminSurface>
          ))}
        </dl>
        <div className="flex gap-1 rounded-xl bg-secondary p-1" role="tablist">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`min-h-10 flex-1 rounded-lg text-xs font-semibold ${tab === id ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {notice && (
          <p
            role={notice.error ? "alert" : "status"}
            className={`rounded-xl p-3 text-sm ${notice.error ? "bg-destructive/10 text-destructive" : "bg-secondary"}`}
          >
            {notice.text}
          </p>
        )}
        {tab === "pending" && (
          <PostList
            posts={data.pending}
            empty="Tidak ada postingan yang menunggu tinjauan."
            mode="pending"
            setNotice={setNotice}
            refresh={refresh}
          />
        )}
        {tab === "reports" && (
          <PostList
            posts={data.reported}
            empty="Tidak ada laporan terbuka."
            mode="reports"
            setNotice={setNotice}
            refresh={refresh}
          />
        )}
        {tab === "posts" && (
          <PostList
            posts={data.recent}
            empty="Belum ada postingan."
            mode="all"
            setNotice={setNotice}
            refresh={refresh}
          />
        )}
        {tab === "settings" && (
          <>
            <Settings data={data} setNotice={setNotice} refresh={refresh} />
            <BanList data={data} />
          </>
        )}
      </div>
    </AdminShell>
  );
}

type ListMode = "pending" | "reports" | "all";

function PostList({
  posts,
  empty,
  mode,
  setNotice,
  refresh,
}: {
  posts: (AdminPost & { reasons?: { reason: string; n: number }[] })[];
  empty: string;
  mode: ListMode;
  setNotice: (n: Notice) => void;
  refresh: () => Promise<unknown>;
}) {
  if (posts.length === 0)
    return (
      <AdminSurface className="p-4 text-center text-sm text-muted-foreground">{empty}</AdminSurface>
    );
  return (
    <div className="space-y-2">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} mode={mode} setNotice={setNotice} refresh={refresh} />
      ))}
    </div>
  );
}

function PostCard({
  post,
  mode,
  setNotice,
  refresh,
}: {
  post: AdminPost & { reasons?: { reason: string; n: number }[] };
  mode: ListMode;
  setNotice: (n: Notice) => void;
  refresh: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState<
    Awaited<ReturnType<typeof getAdminFeedComments>>["comments"] | null
  >(null);

  async function act(
    action: "approve" | "hide" | "restore" | "remove" | "dismiss" | "ban" | "unban",
  ) {
    let note: string | undefined;
    if (action === "hide" || action === "remove" || action === "ban") {
      const answer = window.prompt(
        action === "ban" ? "Alasan blokir akun ini dari Feeds:" : "Alasan (tercatat di audit log):",
      );
      if (!answer || answer.trim().length < 3) return;
      note = answer.trim();
    }
    setBusy(true);
    setNotice(null);
    try {
      await runAdminFeedAction({ data: { postId: post.id, action, note } });
      setNotice({ error: false, text: "Tersimpan dan tercatat di audit log." });
      await refresh();
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Gagal menyimpan." });
    } finally {
      setBusy(false);
    }
  }

  async function toggleComments() {
    if (comments) return setComments(null);
    try {
      setComments((await getAdminFeedComments({ data: { id: post.id } })).comments);
    } catch {
      setNotice({ error: true, text: "Komentar belum bisa dimuat." });
    }
  }

  async function commentAction(commentId: string, action: "hide" | "restore") {
    try {
      await runAdminFeedCommentAction({ data: { commentId, action } });
      setComments((await getAdminFeedComments({ data: { id: post.id } })).comments);
      await refresh();
    } catch {
      setNotice({ error: true, text: "Komentar belum bisa diubah." });
    }
  }

  return (
    <AdminSurface as="article" className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <b className="text-sm">{post.authorName}</b>
        <span className="text-muted-foreground">akun #{post.authorRef}</span>
        <StatusPill tone={statusTone(post.status)}>{FEED_STATUS_LABEL[post.status]}</StatusPill>
        <StatusPill>{FEED_KIND_LABEL[post.kind]}</StatusPill>
        {post.source === "seed" && <StatusPill tone="warn">Contoh (bukan akun asli)</StatusPill>}
        {post.source === "guide" && <StatusPill>Travo Guide</StatusPill>}
        {post.banned && <StatusPill tone="danger">Diblokir</StatusPill>}
        {post.flag && (
          <StatusPill tone="warn">
            {post.flag === "post_awal" ? "Post awal akun" : post.flag}
          </StatusPill>
        )}
        <span className="ml-auto text-muted-foreground">{formatAdminDateTime(post.createdAt)}</span>
      </div>
      <p className="whitespace-pre-line break-words text-sm">{post.body}</p>
      {post.placeName && (
        <p className="text-xs text-muted-foreground">
          Tempat: {post.placeName}
          {post.destinationCode ? ` · ${post.destinationCode}` : ""}
        </p>
      )}
      {post.photoUrl && (
        <img
          src={post.photoUrl}
          alt="Foto postingan"
          loading="lazy"
          className="max-h-60 rounded-xl object-cover"
        />
      )}
      {post.reasons && post.reasons.length > 0 && (
        <p className="text-xs text-destructive">
          {post.reportCount} laporan:{" "}
          {post.reasons
            .map((r) => `${FEED_REPORT_LABEL[r.reason as FeedReportReason] ?? r.reason} (${r.n})`)
            .join(", ")}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {post.likeCount} suka · {post.commentCount} komentar · {post.authorPosts} postingan akun ini
        {post.statusReason ? ` · alasan: ${post.statusReason}` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {post.status === "PENDING" && (
          <button
            type="button"
            disabled={busy}
            className={btnPrimary}
            onClick={() => void act("approve")}
          >
            Setujui
          </button>
        )}
        {post.status === "HIDDEN" && (
          <button
            type="button"
            disabled={busy}
            className={btnPrimary}
            onClick={() => void act("restore")}
          >
            Pulihkan
          </button>
        )}
        {mode === "reports" && (
          <button type="button" disabled={busy} className={btn} onClick={() => void act("dismiss")}>
            Abaikan laporan
          </button>
        )}
        {(post.status === "PENDING" || post.status === "PUBLISHED") && (
          <button type="button" disabled={busy} className={btn} onClick={() => void act("hide")}>
            Sembunyikan
          </button>
        )}
        {post.status !== "REMOVED" && (
          <button
            type="button"
            disabled={busy}
            className={btnDanger}
            onClick={() => void act("remove")}
          >
            Hapus
          </button>
        )}
        {post.banned ? (
          <button type="button" disabled={busy} className={btn} onClick={() => void act("unban")}>
            Buka blokir akun
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            className={btnDanger}
            onClick={() => void act("ban")}
          >
            Blokir akun
          </button>
        )}
        {post.commentCount > 0 && (
          <button type="button" className={btn} onClick={() => void toggleComments()}>
            {comments ? "Tutup komentar" : "Lihat komentar"}
          </button>
        )}
      </div>
      {comments && (
        <ul className="space-y-1.5 border-t border-border pt-2">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-xs">
              <span className="min-w-0 flex-1">
                <b>{c.authorName}</b>: <span className="break-words">{c.body}</span>
                {c.status === "HIDDEN" && (
                  <span className="ml-1 text-muted-foreground">(disembunyikan)</span>
                )}
              </span>
              <button
                type="button"
                className={btn}
                onClick={() => void commentAction(c.id, c.status === "HIDDEN" ? "restore" : "hide")}
              >
                {c.status === "HIDDEN" ? "Pulihkan" : "Sembunyikan"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </AdminSurface>
  );
}

function BanList({ data }: { data: Data }) {
  return (
    <AdminSurface className="space-y-2 p-3">
      <SectionHeading
        title="Akun diblokir dari Feeds"
        detail="Buka blokir dari kartu postingan akun itu di tab Semua post."
      />
      {data.bans.length === 0 ? (
        <p className="text-xs text-muted-foreground">Tidak ada akun yang diblokir.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {data.bans.map((ban) => (
            <li key={ban.authorRef}>
              <b>#{ban.authorRef}</b> · {formatAdminDateTime(ban.createdAt)}
              {ban.reason ? ` · ${ban.reason}` : ""}
            </li>
          ))}
        </ul>
      )}
    </AdminSurface>
  );
}

function Settings({
  data,
  setNotice,
  refresh,
}: {
  data: Data;
  setNotice: (n: Notice) => void;
  refresh: () => Promise<unknown>;
}) {
  const [config, setConfig] = useState<FeedsConfig>(data.config);
  const [words, setWords] = useState(data.config.bannedWords.join("\n"));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FeedsConfig>(key: K, value: FeedsConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));
  const flag = (label: string, hint: string, key: "enabled" | "allowPhotos" | "allowComments") => (
    <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2 text-sm font-medium">
      <span>
        {label}
        <span className="block text-[11px] font-normal text-muted-foreground">{hint}</span>
      </span>
      <input
        type="checkbox"
        checked={config[key]}
        onChange={(e) => set(key, e.target.checked)}
        className="size-5 accent-[var(--brand-red)]"
      />
    </label>
  );
  const num = (
    label: string,
    hint: string,
    key: "reviewFirstPosts" | "postsPerDay" | "commentsPerDay" | "reportHideThreshold",
  ) => (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <input
        type="number"
        className={`${input} mt-1`}
        value={config[key]}
        onChange={(e) => set(key, Number(e.target.value))}
      />
      <span className="mt-0.5 block text-[11px] font-normal">{hint}</span>
    </label>
  );

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const bannedWords = words
        .split("\n")
        .map((w) => w.trim())
        .filter(Boolean);
      const result = await saveAdminFeedsConfig({
        data: { config: { ...config, bannedWords }, expectedVersion: data.version, reason },
      });
      if (!result.ok)
        setNotice({
          error: true,
          text: "Pengaturan sudah diubah orang lain. Muat ulang lalu coba lagi.",
        });
      else {
        setNotice({ error: false, text: "Pengaturan Feeds disimpan dan tercatat di audit log." });
        setReason("");
      }
      await refresh();
    } catch (error) {
      setNotice({
        error: true,
        text: error instanceof Error ? error.message : "Pengaturan gagal disimpan.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminSurface className="space-y-3 p-3">
      <SectionHeading
        title="Pengaturan Feeds"
        detail="Berlaku untuk Explore dan halaman Feeds. Perubahan tercatat di audit log."
      />
      {flag(
        "Feeds aktif",
        "Mati = bagian Feeds hilang dari Explore dan tidak bisa diakses.",
        "enabled",
      )}
      {flag("Izinkan foto", "Satu foto per postingan, JPG/PNG/WebP.", "allowPhotos")}
      {flag(
        "Izinkan komentar",
        "Mati = komentar baru ditolak, yang lama tetap terlihat.",
        "allowComments",
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {num(
          "Tinjau postingan awal per akun",
          "0 = langsung tayang. Postingan awal tiap akun menunggu persetujuan.",
          "reviewFirstPosts",
        )}
        {num("Batas posting per hari", "Per akun, 24 jam terakhir.", "postsPerDay")}
        {num("Batas komentar per hari", "Per akun, 24 jam terakhir.", "commentsPerDay")}
        {num(
          "Sembunyikan otomatis setelah laporan",
          "Jumlah pelapor berbeda yang menyembunyikan post sampai ditinjau.",
          "reportHideThreshold",
        )}
      </div>
      <label className="block text-xs font-medium text-muted-foreground">
        Kata terlarang (satu per baris)
        <textarea
          className={`${input} mt-1 min-h-24 py-2`}
          value={words}
          onChange={(e) => setWords(e.target.value)}
          placeholder="Postingan yang memuat kata ini ditahan untuk ditinjau; komentar ditolak."
        />
      </label>
      <input
        className={input}
        placeholder="Alasan perubahan (wajib, masuk audit log)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button
        type="button"
        disabled={busy || reason.trim().length < 3}
        onClick={() => void save()}
        className={btnPrimary}
      >
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
        Simpan pengaturan
      </button>
    </AdminSurface>
  );
}
