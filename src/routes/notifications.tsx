import { createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  Bell,
  Check,
  CheckCheck,
  CreditCard,
  Ellipsis,
  ExternalLink,
  Gift,
  Plane,
  RefreshCw,
  Search,
  Smartphone,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { FixedLayer } from "@/components/motion-primitives";
import { useSwipeHint } from "@/components/swipeable-ticket";
import { Page, TabBar } from "@/components/shell";
import { getCustomerNotificationsFeed } from "@/lib/customer-notifications.fn";

type Category = "esim" | "bayar" | "trip" | "info";
type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  action_href: string | null;
  created_at: string;
  expires_at: string | null;
  read_at: string | null;
  archived_at: string | null;
  category: Category;
};
type NotificationData = {
  notifications: Notification[];
  unread_count: number;
  next_cursor: string | null;
};
type Action = "read" | "read_all" | "archive" | "unarchive" | "delete" | "restore";
type Filter = "all" | "unread" | Category;

const CATEGORY: Record<Category, { label: string; Icon: LucideIcon; tone: string }> = {
  esim: { label: "eSIM", Icon: Smartphone, tone: "bg-emerald-100 text-emerald-700" },
  bayar: { label: "Bayar", Icon: CreditCard, tone: "bg-amber-100 text-amber-700" },
  trip: { label: "Trip", Icon: Plane, tone: "bg-sky-100 text-sky-700" },
  info: { label: "Info", Icon: Gift, tone: "bg-brand-red/10 text-brand-red" },
};
const TZ = "Asia/Jakarta";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
function dayLabel(iso: string) {
  const key = dayKey(iso);
  const now = Date.now();
  if (key === dayKey(new Date(now).toISOString())) return "Hari ini";
  if (key === dayKey(new Date(now - 86_400_000).toISOString())) return "Kemarin";
  return new Date(iso).toLocaleDateString("id-ID", {
    timeZone: TZ,
    day: "numeric",
    month: "long",
  });
}
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });

// Uses the server function directly: a relative fetch("/api/...") fails during SSR, which made
// the loader always report "belum dapat dimuat" on first render.
async function fetchNotifications(view: "inbox" | "archived" = "inbox"): Promise<NotificationData> {
  const payload: unknown = await getCustomerNotificationsFeed({
    data: { limit: 50, unreadOnly: false, view },
  });
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray((payload as { notifications?: unknown }).notifications)
  ) {
    throw new Error("Unable to load notifications");
  }
  return payload as NotificationData;
}

async function mutate(action: Action, ids: string[]) {
  const response = await fetch("/api/customer-notifications", {
    method: "PATCH",
    keepalive: true, // survives the page navigating away right after
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, notification_ids: ids }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !payload || (payload as { ok?: unknown }).ok !== true)
    throw new Error("Unable to update notifications");
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
  head: () => ({
    meta: [
      { title: "Notifikasi — Djiwa Travel" },
      { name: "description", content: "Pusat notifikasi akun Djiwa Travel." },
    ],
  }),
  component: Notifications,
});

function NotificationsLoading() {
  return (
    <Page>
      <div className="py-12 text-center text-sm text-muted-foreground" role="status">
        Memuat notifikasi…
      </div>
    </Page>
  );
}

/** Width of Arsip + Hapus revealed by a left swipe, and of Baca revealed by a right swipe. */
const ACTION_W = 112;
const READ_W = 96;

function Notifications() {
  const initial = Route.useLoaderData();
  const [items, setItems] = useState<Notification[]>(initial.data?.notifications ?? []);
  const [error, setError] = useState(initial.error);
  const [archivedView, setArchivedView] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheetFor, setSheetFor] = useState<Notification | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const hint = useSwipeHint("djiwa:swipe-hint-notifications-v2");

  const unreadCount = useMemo(
    () => (archivedView ? 0 : items.filter((n) => !n.read_at).length),
    [items, archivedView],
  );

  const load = useCallback(async (view: "inbox" | "archived") => {
    setError(null);
    try {
      setItems((await fetchNotifications(view)).notifications);
    } catch {
      setError("Notifikasi belum dapat dimuat. Coba lagi sebentar.");
    }
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  function showToast(text: string, undo: () => void) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }

  /** Optimistic mutation: apply locally, persist, and roll back with an error if the server refuses. */
  async function run(action: Action, ids: string[], opts?: { toast?: string; undo?: Action }) {
    const snapshot = items;
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    setOpenId(null);
    setSheetFor(null);
    setItems((cur) => {
      if (action === "read")
        return cur.map((n) => (idSet.has(n.id) && !n.read_at ? { ...n, read_at: now } : n));
      if (action === "read_all") return cur.map((n) => (n.read_at ? n : { ...n, read_at: now }));
      return cur.filter((n) => !idSet.has(n.id)); // archive/unarchive/delete leave the current view
    });
    try {
      await mutate(action, ids);
      if (opts?.toast && opts.undo) {
        const undoAction = opts.undo;
        showToast(opts.toast, () => {
          setToast(null);
          void mutate(undoAction, ids)
            .then(() => load(archivedView ? "archived" : "inbox"))
            .catch(() => setError("Gagal mengurungkan. Coba lagi."));
        });
      }
    } catch {
      setItems(snapshot);
      setError("Perubahan belum tersimpan. Coba lagi.");
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((n) => {
      if (filter === "unread" && n.read_at) return false;
      if (filter !== "all" && filter !== "unread" && n.category !== filter) return false;
      return !q || `${n.title} ${n.body}`.toLowerCase().includes(q);
    });
  }, [items, filter, query]);

  const groups = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const n of visible) {
      const label = dayLabel(n.created_at);
      map.set(label, [...(map.get(label) ?? []), n]);
    }
    return [...map.entries()];
  }, [visible]);

  const toggleSelect = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const bulk = async (action: Action, label: string, undo?: Action) => {
    const ids = [...selected];
    exitSelect();
    await run(action, ids, undo ? { toast: label, undo } : undefined);
  };

  const filters: { id: Filter; label: string; count?: number }[] = [
    { id: "all", label: "Semua", count: items.length },
    { id: "unread", label: "Belum dibaca", count: unreadCount },
    { id: "esim", label: "eSIM" },
    { id: "bayar", label: "Bayar" },
    { id: "trip", label: "Trip" },
  ];

  return (
    <>
      <div className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden px-4 safe-top">
        <div className="shrink-0">
          <div className="flex items-start justify-between gap-3 pt-1">
            <div className="min-w-0">
              <h1 className="ios-title">
                {selecting ? `${selected.size} dipilih` : archivedView ? "Arsip" : "Notifikasi"}
              </h1>
              <p className="ios-subtitle" aria-live="polite">
                {archivedView
                  ? "Notifikasi yang kamu arsipkan"
                  : unreadCount
                    ? `${unreadCount} belum dibaca`
                    : "Semua sudah dibaca"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-brand-red">
              <button
                type="button"
                className="min-h-9 px-2"
                onClick={() => {
                  const next = !archivedView;
                  setArchivedView(next);
                  setFilter("all");
                  exitSelect();
                  void load(next ? "archived" : "inbox");
                }}
              >
                {archivedView ? "← Kotak masuk" : "Arsip"}
              </button>
              <button
                type="button"
                className="min-h-9 px-2 disabled:opacity-40"
                disabled={items.length === 0}
                onClick={() => (selecting ? exitSelect() : setSelecting(true))}
              >
                {selecting ? "Selesai" : "Ubah"}
              </button>
            </div>
          </div>

          <label className="mt-2 flex min-h-9 items-center gap-2 rounded-xl bg-secondary px-3 text-[13px]">
            <Search className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari notifikasi"
              aria-label="Cari notifikasi"
              className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </label>

          {!archivedView && (
            <div
              className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
              role="tablist"
              aria-label="Filter notifikasi"
            >
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`min-h-8 shrink-0 rounded-full px-3 text-xs font-semibold ${filter === f.id ? "bg-foreground text-background" : "bg-surface text-muted-foreground"}`}
                >
                  {f.label}
                  {f.count ? <span className="ml-1 opacity-70">{f.count}</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-28 [scrollbar-width:none]">
          {hint.active && !archivedView && !selecting && visible.length > 0 && (
            <motion.p
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
              className="mt-2 px-1 text-[11px] text-muted-foreground"
            >
              ↔ Geser kiri untuk Arsip atau Hapus, kanan untuk Buka detail
            </motion.p>
          )}
          {error && (
            <div
              role="alert"
              className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
            >
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void load(archivedView ? "archived" : "inbox")}
                className="mt-3 inline-flex min-h-10 items-center gap-2 font-semibold underline underline-offset-2"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Coba lagi
              </button>
            </div>
          )}

          {!error && items.length === 0 && (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface p-4 text-center">
              <Bell className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 font-semibold">
                {archivedView ? "Arsip kosong" : "Belum ada notifikasi"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {archivedView
                  ? "Notifikasi yang diarsipkan akan muncul di sini."
                  : "Kami akan memberi tahu kalau ada kabar baru untuk perjalananmu."}
              </p>
            </div>
          )}
          {!error && items.length > 0 && visible.length === 0 && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Tidak ada notifikasi yang cocok.
            </p>
          )}

          {groups.map(([label, list], groupIndex) => (
            <section key={label} className="mt-3">
              <div className="mb-1 flex items-center justify-between px-1">
                <h2 className="ios-section-label !mb-0 !px-0 font-bold">{label}</h2>
                {label === "Hari ini" && !archivedView && unreadCount > 0 && !selecting && (
                  <button
                    type="button"
                    onClick={() => void run("read_all", [])}
                    className="inline-flex min-h-7 items-center gap-1 text-[11px] font-semibold text-brand-red"
                  >
                    <CheckCheck className="size-3.5" aria-hidden="true" />
                    Tandai semua dibaca
                  </button>
                )}
              </div>
              <div className="ios-group">
                {list.map((item, itemIndex) => (
                  <Row
                    key={item.id}
                    item={item}
                    hint={hint.active && !archivedView && groupIndex === 0 && itemIndex === 0}
                    onUsed={hint.dismiss}
                    archivedView={archivedView}
                    selecting={selecting}
                    checked={selected.has(item.id)}
                    open={openId === item.id}
                    onOpenChange={(v) => setOpenId(v ? item.id : null)}
                    onToggle={() => toggleSelect(item.id)}
                    onMenu={() => setSheetFor(item)}
                    onRead={() => void run("read", [item.id])}
                    onArchive={() =>
                      void run(archivedView ? "unarchive" : "archive", [item.id], {
                        toast: archivedView
                          ? "Dikembalikan ke kotak masuk"
                          : "Notifikasi diarsipkan",
                        undo: archivedView ? "archive" : "unarchive",
                      })
                    }
                    onDelete={() =>
                      void run("delete", [item.id], {
                        toast: "Notifikasi dihapus",
                        undo: "restore",
                      })
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      <FixedLayer>
        <TabBar />
      </FixedLayer>

      {sheetFor && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
          onClick={() => setSheetFor(null)}
        >
          <div
            role="dialog"
            aria-label="Aksi notifikasi"
            className="mb-[calc(6.5rem+env(safe-area-inset-bottom))] w-[calc(100%-24px)] max-w-md overflow-hidden rounded-2xl bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="truncate px-4 pt-4 text-sm font-semibold">{sheetFor.title}</p>
            <div className="mt-2 divide-y divide-border/70 text-[15px]">
              {!sheetFor.read_at && (
                <SheetButton icon={Check} onClick={() => void run("read", [sheetFor.id])}>
                  Tandai dibaca
                </SheetButton>
              )}
              {sheetFor.action_href && (
                <a href={sheetFor.action_href} className="flex min-h-12 items-center gap-3 px-4">
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Buka detail
                </a>
              )}
              <SheetButton
                icon={archivedView ? ArchiveRestore : Archive}
                onClick={() =>
                  void run(archivedView ? "unarchive" : "archive", [sheetFor.id], {
                    toast: archivedView ? "Dikembalikan ke kotak masuk" : "Notifikasi diarsipkan",
                    undo: archivedView ? "archive" : "unarchive",
                  })
                }
              >
                {archivedView ? "Kembalikan" : "Arsipkan"}
              </SheetButton>
              <SheetButton
                icon={Trash2}
                danger
                onClick={() =>
                  void run("delete", [sheetFor.id], {
                    toast: "Notifikasi dihapus",
                    undo: "restore",
                  })
                }
              >
                Hapus
              </SheetButton>
            </div>
            <button
              type="button"
              onClick={() => setSheetFor(null)}
              className="min-h-12 w-full border-t border-border/70 text-[15px] font-semibold"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {selecting && (
        <div className="fixed inset-x-3 bottom-24 z-40 mx-auto flex max-w-md items-center justify-around rounded-full bg-surface py-1 text-sm font-semibold shadow-xl">
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => void bulk("read", "")}
            className="min-h-11 px-3 text-brand-red disabled:opacity-40"
          >
            Baca
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() =>
              void bulk(
                archivedView ? "unarchive" : "archive",
                archivedView ? "Dikembalikan" : "Diarsipkan",
                archivedView ? "archive" : "unarchive",
              )
            }
            className="min-h-11 px-3 disabled:opacity-40"
          >
            {archivedView ? "Kembalikan" : "Arsip"}
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => void bulk("delete", "Notifikasi dihapus", "restore")}
            className="min-h-11 px-3 text-destructive disabled:opacity-40"
          >
            Hapus
          </button>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-md items-center justify-between rounded-2xl bg-foreground px-4 py-3 text-sm text-background shadow-xl"
        >
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={toast.undo}
            className="min-h-8 font-bold text-brand-red-soft"
          >
            Urungkan
          </button>
        </div>
      )}
    </>
  );
}

function SheetButton({
  icon: Icon,
  danger,
  onClick,
  children,
}: {
  icon: LucideIcon;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-12 w-full items-center gap-3 px-4 ${danger ? "text-destructive" : ""}`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {children}
    </button>
  );
}

function Row({
  item,
  hint,
  onUsed,
  archivedView,
  selecting,
  checked,
  open,
  onOpenChange,
  onToggle,
  onMenu,
  onRead,
  onArchive,
  onDelete,
}: {
  item: Notification;
  /** Plays a short peek animation so people discover the swipe actions. */
  hint: boolean;
  onUsed: () => void;
  archivedView: boolean;
  selecting: boolean;
  checked: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: () => void;
  onMenu: () => void;
  onRead: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const { Icon, tone } = CATEGORY[item.category];
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const moved = useRef(false);
  const press = useRef<number | null>(null);
  const [peek, setPeek] = useState(0);
  const reduce = useReducedMotion();
  const offset = drag ?? (open ? -ACTION_W : peek);
  useEffect(() => {
    if (!hint || reduce || selecting) return;
    // Peek left (Arsip/Hapus), rest, peek right (Buka detail, only when the notification has a link), rest.
    const timers = [
      window.setTimeout(() => setPeek(-ACTION_W * 0.7), 1400),
      window.setTimeout(() => setPeek(0), 2400),
      ...(item.action_href
        ? [
            window.setTimeout(() => setPeek(READ_W * 0.7), 3000),
            window.setTimeout(() => setPeek(0), 4000),
          ]
        : []),
    ];
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      setPeek(0);
    };
  }, [hint, reduce, selecting, item.action_href]);
  const clearPress = () => {
    if (press.current) window.clearTimeout(press.current);
    press.current = null;
  };

  return (
    <article className="relative overflow-hidden border-b border-border/70 last:border-b-0">
      <div className="absolute inset-y-0 left-0 flex" style={{ width: READ_W }} aria-hidden="true">
        <div className="flex flex-1 items-center justify-center gap-1 bg-sky-500 text-xs font-bold text-white">
          <ExternalLink className="size-3.5" aria-hidden="true" />
          Buka detail
        </div>
      </div>
      <div
        className="absolute inset-y-0 right-0 flex"
        style={{ width: ACTION_W }}
        aria-hidden={!open}
      >
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          onClick={onArchive}
          className="flex-1 bg-zinc-500 text-xs font-bold text-white"
        >
          {archivedView ? "Kembalikan" : "Arsip"}
        </button>
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          onClick={onDelete}
          className="flex-1 bg-red-600 text-xs font-bold text-white"
        >
          Hapus
        </button>
      </div>
      <div
        className={`relative flex gap-2.5 bg-surface px-3 py-2.5 ${drag === null ? "transition-transform duration-200 motion-reduce:transition-none" : ""}`}
        style={{ transform: `translateX(${offset}px)`, touchAction: "pan-y" }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!selecting) onMenu();
        }}
        onPointerDown={(e) => {
          if (selecting) return;
          start.current = { x: e.clientX, y: e.clientY, base: open ? -ACTION_W : 0 };
          moved.current = false;
          clearPress();
          press.current = window.setTimeout(() => {
            if (!moved.current) onMenu();
          }, 550);
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const dx = e.clientX - start.current.x;
          const dy = e.clientY - start.current.y;
          if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
            moved.current = true;
            clearPress();
          }
          if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
            onUsed();
            setDrag(
              Math.min(item.action_href ? READ_W : 0, Math.max(-ACTION_W, start.current.base + dx)),
            );
          }
        }}
        onPointerUp={() => {
          clearPress();
          if (drag !== null) {
            if (drag > READ_W / 2) {
              onOpenChange(false);
              if (item.action_href) {
                if (!item.read_at) onRead();
                window.location.assign(item.action_href);
              }
            } else onOpenChange(drag < -ACTION_W / 2);
          }
          setDrag(null);
          start.current = null;
        }}
        onPointerCancel={() => {
          clearPress();
          setDrag(null);
          start.current = null;
        }}
        onClick={() => {
          if (selecting) onToggle();
          else if (open) onOpenChange(false);
        }}
      >
        {selecting && (
          <span
            className={`mt-2 flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${checked ? "border-brand-red bg-brand-red text-white" : "border-border"}`}
            role="checkbox"
            aria-checked={checked}
            aria-label={`Pilih ${item.title}`}
          >
            {checked && <Check className="size-3" aria-hidden="true" />}
          </span>
        )}
        <div
          className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tone}`}
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3
              className={`text-[14px] leading-snug ${item.read_at ? "font-medium" : "font-semibold"}`}
            >
              {item.title}
            </h3>
            <div className="flex shrink-0 items-center gap-1.5">
              {!item.read_at && (
                <span
                  className="size-2 rounded-full bg-brand-red"
                  role="img"
                  aria-label="Belum dibaca"
                />
              )}
              <time className="text-xs text-muted-foreground" dateTime={item.created_at}>
                {timeLabel(item.created_at)}
              </time>
            </div>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-snug text-muted-foreground">
            {item.body}
          </p>
          <div className="flex items-center justify-between">
            {item.action_href && !selecting ? (
              <a
                href={item.action_href}
                onClick={() => !item.read_at && onRead()}
                className="inline-flex min-h-8 items-center gap-1 text-[13px] font-semibold text-brand-red"
              >
                Buka detail
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            ) : (
              <span />
            )}
            {!selecting && (
              <button
                type="button"
                onClick={onMenu}
                aria-label={`Aksi untuk ${item.title}`}
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground"
              >
                <Ellipsis className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
