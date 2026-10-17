import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Check, ExternalLink, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Page } from "@/components/shell";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  action_href: string | null;
  created_at: string;
  expires_at: string | null;
  read_at: string | null;
};
type NotificationData = { notifications: Notification[]; unread_count: number; next_cursor: string | null };
const notificationsUrl = "/api/customer-notifications?limit=50&unreadOnly=false";

async function fetchNotifications(): Promise<NotificationData> {
  const response = await fetch(notificationsUrl);
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object" || !Array.isArray((payload as { notifications?: unknown }).notifications)) {
    throw new Error("Unable to load notifications");
  }
  return payload as NotificationData;
}

export const Route = createFileRoute("/notifications")({
  loader: async (): Promise<{ data: NotificationData | null; error: string | null }> => {
    try {
      return { data: await fetchNotifications(), error: null };
    } catch {
      return { data: null, error: "Notifikasi belum dapat dimuat. Coba lagi sebentar." };
    }
  },
  pendingComponent: NotificationsLoading,
  head: () => ({ meta: [{ title: "Notifikasi — Djiwa Travel" }, { name: "description", content: "Pusat notifikasi akun Djiwa Travel." }] }),
  component: Notifications,
});

function NotificationsLoading() {
  return <Page><div className="py-12 text-center text-sm text-muted-foreground" role="status">Memuat notifikasi…</div></Page>;
}

function Notifications() {
  const initial = Route.useLoaderData();
  const [data, setData] = useState(initial.data);
  const [error, setError] = useState(initial.error);
  const [readingId, setReadingId] = useState<string | null>(null);
  const unreadCount = data?.unread_count ?? 0;
  const notifications = useMemo(() => data?.notifications ?? [], [data]);

  async function retry() {
    setError(null);
    try {
      const next = await fetchNotifications();
      setData(next);
    } catch {
      setError("Notifikasi belum dapat dimuat. Coba lagi sebentar.");
    }
  }

  async function markRead(item: Notification) {
    if (item.read_at || readingId) return;
    setReadingId(item.id);
    try {
      const response = await fetch("/api/customer-notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", notification_id: item.id }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload !== "object" || (payload as { ok?: unknown }).ok !== true) throw new Error("Unable to mark notification read");
      setData((current) => current && {
        ...current,
        unread_count: Math.max(0, current.unread_count - 1),
        notifications: current.notifications.map((notification) => notification.id === item.id ? { ...notification, read_at: new Date().toISOString() } : notification),
      });
    } catch {
      setError("Notifikasi belum ditandai sudah dibaca. Coba lagi.");
    } finally {
      setReadingId(null);
    }
  }

  return (
    <Page>
      <div className="flex items-start justify-between gap-3 pt-4">
        <div>
          <p className="text-sm font-semibold text-brand-red">Pusat notifikasi</p>
          <h1 className="large-title mt-1">Notifikasi</h1>
        </div>
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary" aria-label={`${unreadCount} notifikasi belum dibaca`}>
          <Bell className="size-5" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{unreadCount ? `${unreadCount} belum dibaca` : "Semua sudah dibaca"}</p>

      {error && <div role="alert" className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p>{error}</p><button type="button" onClick={() => void retry()} className="mt-3 inline-flex min-h-10 items-center gap-2 font-semibold underline underline-offset-2"><RefreshCw className="size-4" aria-hidden="true" />Coba lagi</button></div>}
      {!error && notifications.length === 0 && <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface p-8 text-center"><Bell className="mx-auto size-8 text-muted-foreground" aria-hidden="true" /><p className="mt-3 font-semibold">Belum ada notifikasi</p><p className="mt-1 text-sm text-muted-foreground">Kami akan memberi tahu kalau ada kabar baru untuk perjalananmu.</p></div>}
      <div className="mt-5 space-y-3">
        {notifications.map((item) => <article key={item.id} className={`rounded-2xl border p-4 ${item.read_at ? "border-border bg-background" : "border-brand-red/30 bg-brand-red/[0.04]"}`}>
          <div className="flex gap-3"><div className={`mt-1 size-2 shrink-0 rounded-full ${item.read_at ? "bg-muted" : "bg-brand-red"}`} aria-hidden="true" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><h2 className="font-semibold leading-snug">{item.title}</h2><time className="shrink-0 text-xs text-muted-foreground" dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</time></div><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p><div className="mt-3 flex flex-wrap items-center gap-4 text-sm font-semibold">{!item.read_at && <button type="button" onClick={() => void markRead(item)} disabled={readingId === item.id} className="inline-flex min-h-10 items-center gap-2 underline underline-offset-2 disabled:opacity-60"><Check className="size-4" aria-hidden="true" />{readingId === item.id ? "Menyimpan…" : "Tandai sudah dibaca"}</button>}{item.action_href && <a href={item.action_href} className="inline-flex min-h-10 items-center gap-2 text-brand-red underline underline-offset-2">Buka detail<ExternalLink className="size-4" aria-hidden="true" /></a>}</div></div></div>
        </article>)}
      </div>
      <Link to="/" className="mt-8 inline-flex min-h-11 items-center font-semibold text-brand-red underline underline-offset-2">Kembali ke beranda</Link>
    </Page>
  );
}
