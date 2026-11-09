import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NotebookPen, Send } from "lucide-react";
import { toast } from "sonner";
import {
  assignAdminChat,
  closeAdminChat,
  getAdminChatList,
  getAdminChatThread,
  sendAdminChatMessage,
} from "@/lib/shopper-chat.fn";
import {
  getAdminDiscovery,
  runAdminDiscoveryAction,
  saveAdminDiscoverySettings,
} from "@/lib/shopper-discovery.fn";
import { formatIdr } from "@/lib/personal-shopper";
import { formatCountdown, suggestedFee, type ChatMessageView } from "@/lib/shopper-chat";
import { offerTotal, type DiscoveryOffer } from "@/lib/shopper-discovery";
import {
  MessageBubble,
  OfferCardView,
  Pill,
  RequestCardView,
  StageDots,
  StageTrack,
  SystemLine,
  ThreadIcon,
  listTime,
  useNow,
} from "./shopper-chat-parts";
import { ImageViewer } from "./shopper-viewer";

type List = Awaited<ReturnType<typeof getAdminChatList>>;
type Thread = Awaited<ReturnType<typeof getAdminChatThread>>;
type Summary = List["threads"][number];

const field = "min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm";
const chipBtn =
  "tap rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-secondary disabled:opacity-50";
const panel = "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface";
const panelTitle = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

type Filter = "all" | "new" | "waiting" | "offer" | "done";

const mercariLike = (url: string | null) => {
  if (!url) return "";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("mercari")) return "Mercari";
    if (host.includes("rakuten")) return "Rakuten";
    return host;
  } catch {
    return "";
  }
};

function Sla({ dueAt }: { dueAt: string | null }) {
  const now = useNow(1000);
  if (!dueAt) return null;
  const left = new Date(dueAt).getTime() - now;
  return (
    <span className={`text-xs font-bold ${left <= 0 ? "text-destructive" : "text-[#a16207]"}`}>
      ⏱ {formatCountdown(left)}
    </span>
  );
}

export function AdminShopperChat() {
  const [list, setList] = useState<List | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [text, setText] = useState("");
  const [note, setNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState<{ url: string; label: string } | null>(null);
  const lastAt = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    try {
      setList(await getAdminChatList());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pesan gagal dimuat.");
    }
  }, []);
  useEffect(() => {
    void loadList();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadList();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [loadList]);

  const loadThread = useCallback(async (id: string, initial: boolean) => {
    try {
      const r = await getAdminChatThread({
        data: { id, ...(initial || !lastAt.current ? {} : { after: lastAt.current }) },
      });
      setThread(r);
      setMessages((current) => {
        const base = initial ? [] : current;
        const seen = new Map(base.map((m) => [m.id, m]));
        for (const m of r.messages) seen.set(m.id, m);
        const merged = [...seen.values()].sort((a, b) => a.at.localeCompare(b.at));
        lastAt.current = merged[merged.length - 1]?.at ?? lastAt.current;
        return merged;
      });
    } catch (e) {
      if (initial) setError(e instanceof Error ? e.message : "Percakapan gagal dimuat.");
    }
  }, []);
  useEffect(() => {
    if (!selected) return;
    lastAt.current = null;
    setThread(null);
    setMessages([]);
    void loadThread(selected, true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadThread(selected, false);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [selected, loadThread]);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const threads = useMemo(() => list?.threads ?? [], [list]);
  const counts = useMemo(
    () => ({
      new: threads.filter((t) => !t.closed && t.unread > 0).length,
      waiting: threads.filter(
        (t) => !t.closed && t.unread === 0 && t.stage.waitingOn === "customer",
      ).length,
      offer: threads.filter((t) => !t.closed && t.stage.label === "Penawaran").length,
    }),
    [threads],
  );
  const shown = threads.filter((t) => {
    const finished = t.closed || t.stage.closed;
    if (filter === "new") return !t.closed && t.unread > 0;
    if (filter === "waiting") return !t.closed && t.stage.waitingOn === "customer";
    if (filter === "offer") return !t.closed && t.stage.label === "Penawaran";
    if (filter === "done") return finished;
    return true;
  });

  async function send(body: string, internal: boolean) {
    if (!selected || !body.trim()) return;
    setBusy(true);
    try {
      await sendAdminChatMessage({ data: { threadId: selected, body, internal } });
      setText("");
      await loadThread(selected, false);
      void loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pesan belum terkirim.");
    } finally {
      setBusy(false);
    }
  }

  async function stageAction(action: "search" | "ask" | "unavailable") {
    const request = thread?.request;
    if (!request || !selected) return;
    const message =
      text.trim().length >= 3
        ? text.trim()
        : { search: "Sedang kami cari, kami kabari secepatnya.", ask: "", unavailable: "" }[action];
    if (message.length < 3) {
      toast.error("Tulis pesan untuk pelanggan dulu, lalu pilih tahap.");
      return;
    }
    setBusy(true);
    try {
      await runAdminDiscoveryAction({
        data: {
          id: request.id,
          expectedVersion: request.version,
          action,
          note: message,
          expiresHours: 24,
          verifiedJapan: false,
        },
      });
      setText("");
      await loadThread(selected, false);
      void loadList();
      toast.success("Tahap diperbarui dan pelanggan diberi tahu.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tindakan gagal.");
      await loadThread(selected, false);
    } finally {
      setBusy(false);
    }
  }

  const current = thread?.thread ?? null;
  const request = thread?.request ?? null;
  const canAct =
    !!request && !["DRAFT", "ORDERED", "CANCELLED"].includes(request.status) && !request.orderId;

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-xl bg-secondary p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-3 lg:h-[calc(100vh-17rem)] lg:min-h-[560px] lg:grid-cols-[320px_minmax(0,1fr)_340px]">
        {/* Queue */}
        <section aria-label="Antrean" className={`${panel} max-lg:max-h-[420px]`}>
          <div className="space-y-2 border-b border-border p-3">
            <div className="flex items-center justify-between">
              <h3 className={panelTitle}>Antrean</h3>
              <span className="text-xs text-muted-foreground">{shown.length} percakapan</span>
            </div>
            <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none]">
              {(
                [
                  ["all", "Semua", ""],
                  ["new", "Baru", counts.new ? ` ${counts.new}` : ""],
                  ["waiting", "Menunggu", counts.waiting ? ` ${counts.waiting}` : ""],
                  ["offer", "Penawaran", counts.offer ? ` ${counts.offer}` : ""],
                  ["done", "Selesai", ""],
                ] as const
              ).map(([id, label, n]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                    filter === id ? "bg-foreground text-background" : "bg-secondary"
                  }`}
                >
                  {label}
                  {n}
                </button>
              ))}
            </div>
          </div>
          {!list ? (
            <p className="p-4 text-sm text-muted-foreground">Memuat…</p>
          ) : shown.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Tidak ada percakapan di filter ini.
            </p>
          ) : (
            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
              {shown.map((t) => (
                <QueueItem
                  key={t.id}
                  t={t}
                  on={t.id === selected}
                  onPick={() => setSelected(t.id)}
                />
              ))}
            </ul>
          )}
        </section>

        {/* Conversation */}
        <section aria-label="Percakapan" className={`${panel} max-lg:min-h-[480px]`}>
          {!selected || !current ? (
            <div className="m-auto flex flex-col items-center gap-2 p-8 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-lg">
                💬
              </span>
              <p className="text-sm font-semibold">
                {selected ? "Memuat percakapan…" : "Belum ada percakapan dipilih"}
              </p>
              {!selected && (
                <p className="max-w-[260px] text-xs text-muted-foreground">
                  Pilih satu dari antrean di kiri untuk membalas, menandai tahap atau mengirim
                  penawaran.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold">{current.customerName}</p>
                  <p className="truncate text-xs text-muted-foreground">{current.title}</p>
                </div>
                <Pill tone={current.stage.tone}>Tahap: {current.stage.label}</Pill>
              </div>
              {current.kind === "REQUEST" && <StageTrack done={current.stage.done} />}
              <div
                ref={scroller}
                className="min-h-[220px] flex-1 space-y-2 overflow-y-auto bg-secondary/40 px-4 py-3"
              >
                {messages.map((m) =>
                  m.card?.type === "request" ? (
                    <RequestCardView
                      key={m.id}
                      card={m.card}
                      onPhoto={(url, label) => setViewer({ url, label })}
                    />
                  ) : m.card?.type === "offer" ? (
                    <div key={m.id} className="space-y-1">
                      {m.body && (
                        <MessageBubble
                          m={{ ...m, card: null }}
                          mine
                          onPhoto={(url, label) => setViewer({ url, label })}
                        />
                      )}
                      <OfferCardView
                        card={m.card}
                        orderId={request?.orderId ?? null}
                        perspective="admin"
                      />
                    </div>
                  ) : m.sender === "SYSTEM" ? (
                    <SystemLine key={m.id} text={m.body} />
                  ) : (
                    <MessageBubble
                      key={m.id}
                      m={m}
                      mine={m.sender === "ADMIN"}
                      read={
                        m.sender === "ADMIN" &&
                        !m.internal &&
                        !!current.peerReadAt &&
                        current.peerReadAt >= m.at
                      }
                      onPhoto={(url, label) => setViewer({ url, label })}
                    />
                  ),
                )}
              </div>
              <div className="border-t border-border p-3">
                <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                  {(list?.config.templates ?? []).map((t) => (
                    <button
                      key={t}
                      type="button"
                      title={t}
                      className={`${chipBtn} max-w-[240px] shrink-0 truncate`}
                      onClick={() => setText((x) => (x ? `${x} ${t}` : t))}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="flex items-end gap-1.5">
                  <textarea
                    rows={2}
                    value={text}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(text, note);
                    }}
                    maxLength={2000}
                    onChange={(e) => setText(e.target.value)}
                    aria-label={note ? "Catatan internal" : "Balas pelanggan"}
                    placeholder={
                      note ? "Catatan internal (tidak terlihat pelanggan)…" : "Balas pelanggan…"
                    }
                    className={`min-h-11 flex-1 resize-none rounded-xl border px-3 py-2.5 text-sm ${
                      note
                        ? "border-dashed border-[#e6c875] bg-[#fff8e6] dark:bg-[#3a3017]"
                        : "border-border bg-background"
                    }`}
                  />
                  <button
                    type="button"
                    aria-label="Catatan internal"
                    aria-pressed={note}
                    onClick={() => setNote((v) => !v)}
                    className={`tap flex size-11 shrink-0 items-center justify-center rounded-full border ${
                      note ? "border-[#e6c875] bg-[#fff8e6] dark:bg-[#3a3017]" : "border-border"
                    }`}
                  >
                    <NotebookPen className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Kirim"
                    disabled={busy || !text.trim()}
                    onClick={() => void send(text, note)}
                    className="tap flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-red text-white disabled:opacity-40"
                  >
                    <Send className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Actions */}
        <section aria-label="Tindakan" className={`${panel} text-sm`}>
          <h3 className={`${panelTitle} border-b border-border px-4 py-3`}>Tindakan</h3>
          {!current ? (
            <p className="p-4 text-sm text-muted-foreground">
              Tindakan muncul setelah percakapan dipilih.
            </p>
          ) : (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div className="flex items-end gap-2">
                <label className="min-w-0 flex-1 text-xs text-muted-foreground">
                  Penanggung jawab
                  <select
                    className={`${field} mt-0.5`}
                    value={current.assignee ?? ""}
                    onChange={async (e) => {
                      await assignAdminChat({
                        data: { threadId: current.id, assignee: e.target.value || null },
                      });
                      void loadThread(current.id, false);
                      void loadList();
                    }}
                  >
                    <option value="">Belum ada</option>
                    {[...new Set([current.assignee, ...threads.map((t) => t.assignee)])]
                      .filter((v): v is string => !!v)
                      .map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={chipBtn}
                  onClick={async () => {
                    await closeAdminChat({
                      data: { threadId: current.id, closed: !current.closed },
                    });
                    void loadThread(current.id, false);
                    void loadList();
                  }}
                >
                  {current.closed ? "Buka lagi" : "Tutup"}
                </button>
              </div>
              {request && (
                <>
                  <div className="space-y-1 rounded-xl bg-secondary p-3 text-sm">
                    <p className="font-semibold">{request.note || current.title}</p>
                    {request.analysis && (
                      <p className="text-xs text-muted-foreground">
                        Analisis foto: {request.analysis}
                      </p>
                    )}
                    {request.sourceUrl && (
                      <a
                        href={request.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="block break-all text-xs text-brand-red"
                      >
                        {request.sourceUrl}
                      </a>
                    )}
                  </div>
                  {request.orderId ? (
                    <p className="rounded-xl bg-secondary p-3 text-xs">
                      Sudah menjadi pesanan. Kelola pembayaran, pembelian dan pengiriman di tab
                      Pesanan.
                    </p>
                  ) : canAct ? (
                    <>
                      <div className="space-y-1.5">
                        <p className={panelTitle}>Ubah tahap</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            className={`${chipBtn} rounded-xl`}
                            disabled={busy}
                            onClick={() => void stageAction("search")}
                          >
                            Mulai cari
                          </button>
                          <button
                            type="button"
                            className={`${chipBtn} rounded-xl`}
                            disabled={busy}
                            onClick={() => void stageAction("ask")}
                          >
                            Minta info
                          </button>
                          <button
                            type="button"
                            className={`${chipBtn} rounded-xl`}
                            disabled={busy}
                            onClick={() => void stageAction("unavailable")}
                          >
                            Tidak ditemukan
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Tombol tahap mengirim isi kotak balasan sebagai pesan ke pelanggan.
                        </p>
                      </div>
                      <OfferForm
                        key={`${request.id}-${request.version}`}
                        request={request}
                        title={current.title}
                        shop={list?.shop}
                        message={text}
                        busy={busy}
                        onSent={async () => {
                          setText("");
                          await loadThread(current.id, false);
                          void loadList();
                        }}
                      />
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Status permintaan tidak bisa diubah lagi.
                    </p>
                  )}
                </>
              )}
              {current.kind === "ORDER" && (
                <p className="rounded-xl bg-secondary p-3 text-xs">
                  Percakapan pesanan {current.orderCode}. Kelola pesanannya di tab Pesanan.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
      <ImageViewer
        open={viewer !== null}
        title={viewer?.label ?? ""}
        images={viewer ? [{ src: viewer.url, label: viewer.label }] : []}
        index={0}
        onClose={() => setViewer(null)}
      />
    </div>
  );
}

function QueueItem({ t, on, onPick }: { t: Summary; on: boolean; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-current={on}
        className={`w-full rounded-xl border p-3 text-left transition-colors ${
          on ? "border-brand-red bg-brand-red-soft" : "border-border hover:bg-secondary/60"
        }`}
      >
        <span className="flex items-start gap-2">
          <ThreadIcon icon={t.icon} />
          <span className="min-w-0 flex-1">
            <span className="flex justify-between gap-1">
              <b className="flex min-w-0 items-center gap-1.5 truncate text-sm">
                {t.unread > 0 && (
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full bg-destructive"
                  />
                )}
                <span className="truncate">{t.customerName}</span>
              </b>
              <span className="shrink-0 text-xs text-muted-foreground">{listTime(t.lastAt)}</span>
            </span>
            <span className="block truncate text-xs font-medium">{t.title}</span>
            <span
              className={`block truncate text-xs ${t.unread > 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}
            >
              {t.lastSender === "ADMIN" && (
                <span className={t.lastRead ? "font-bold text-brand-red" : ""}>
                  {t.lastRead ? "✓✓ " : "✓ "}
                </span>
              )}
              {t.lastPreview}
            </span>
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Pill tone={t.stage.tone}>{t.closed ? "Ditutup" : t.stage.label}</Pill>
              {t.unread > 0 && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-bold text-white">
                  {t.unread} baru
                </span>
              )}
              {!t.closed && <Sla dueAt={t.dueAt} />}
              {t.assignee && (
                <span
                  title={t.assignee}
                  className="ml-auto flex size-[18px] items-center justify-center rounded-full bg-[#0b2a5b] text-[9px] font-bold text-white"
                >
                  {t.assignee[0]}
                </span>
              )}
            </span>
            {t.kind === "REQUEST" && (
              <span className="mt-2 block">
                <StageDots done={t.stage.done} mini />
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

/** The structured offer: the team enters the store price and costs; the total is computed live. */
function OfferForm({
  request,
  title,
  shop,
  message,
  busy,
  onSent,
}: {
  request: NonNullable<Thread["request"]>;
  title: string;
  shop: List["shop"] | undefined;
  message: string;
  busy: boolean;
  onSent: () => Promise<void>;
}) {
  const rate = shop?.rateIdr ?? 0;
  const prior = request.offer;
  const [o, setO] = useState<DiscoveryOffer>(() => ({
    name: prior?.name ?? title.slice(0, 200),
    merchant: prior?.merchant ?? mercariLike(request.sourceUrl),
    productUrl: prior?.productUrl ?? request.sourceUrl ?? "",
    condition: prior?.condition ?? "",
    variant: prior?.variant ?? "",
    quantity: prior?.quantity ?? 1,
    unitIdr: Math.round((prior?.unitJpy ?? 0) * rate),
    unitJpy: prior?.unitJpy ?? 0,
    rateIdr: rate,
    domesticIdr: prior?.domesticIdr ?? shop?.domesticIdr ?? 0,
    feeIdr: prior?.feeIdr ?? 0,
    shippingIdr: prior?.shippingIdr ?? shop?.shippingIdr ?? 0,
    note: prior?.note ?? "",
  }));
  const [feeTouched, setFeeTouched] = useState(!!prior);
  const [hours, setHours] = useState(24);
  const [verified, setVerified] = useState(false);
  const [sending, setSending] = useState(false);
  const goods = Math.round(o.unitJpy * rate) * o.quantity;
  const fee = feeTouched ? o.feeIdr : suggestedFee(goods, shop?.feePercent ?? 0);
  const offer: DiscoveryOffer = {
    ...o,
    rateIdr: rate,
    unitIdr: Math.round(o.unitJpy * rate),
    feeIdr: fee,
  };
  const total = offerTotal(offer);
  const set = (patch: Partial<DiscoveryOffer>) => setO((x) => ({ ...x, ...patch }));

  async function submit() {
    setSending(true);
    try {
      await runAdminDiscoveryAction({
        data: {
          id: request.id,
          expectedVersion: request.version,
          action: "offer",
          note:
            message.trim().length >= 3 ? message.trim() : "Penawaran untuk barangmu sudah siap.",
          offer,
          expiresHours: hours,
          verifiedJapan: verified,
        },
      });
      toast.success("Penawaran terkirim ke pelanggan.");
      await onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Penawaran gagal dikirim.");
    } finally {
      setSending(false);
    }
  }

  const text = (
    key: "name" | "merchant" | "productUrl" | "condition" | "variant" | "note",
    label: string,
  ) => (
    <label className="block text-xs text-muted-foreground">
      {label}
      <input
        className={`${field} mt-1`}
        value={o[key]}
        onChange={(e) => set({ [key]: e.target.value })}
      />
    </label>
  );
  const num = (label: string, value: number, onChange: (n: number) => void, min = 0) => (
    <label className="block text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        min={min}
        className={`${field} mt-1`}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
  return (
    <details className="rounded-xl border border-border" open>
      <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold">
        Kirim penawaran
      </summary>
      <div className="space-y-2.5 border-t border-border p-3">
        {text("name", "Nama barang")}
        {text("merchant", "Toko / penjual")}
        {text("productUrl", "Link produk penjual")}
        {text("condition", "Kondisi barang")}
        {text("variant", "Ukuran dan warna")}
        <div className="grid grid-cols-2 gap-2">
          {num("Jumlah", o.quantity, (n) => set({ quantity: n }), 1)}
          {num("Harga toko ¥", o.unitJpy, (n) => set({ unitJpy: n }))}
          {num("Kirim dlm Jepang (Rp)", o.domesticIdr, (n) => set({ domesticIdr: n }))}
          {num("Jasa titip (Rp)", fee, (n) => {
            setFeeTouched(true);
            set({ feeIdr: n });
          })}
          {num("Ongkir ke RI (Rp)", o.shippingIdr, (n) => set({ shippingIdr: n }))}
          {num("Berlaku (jam)", hours, setHours, 1)}
        </div>
        {text("note", "Rincian tambahan")}
        <div className="rounded-xl bg-secondary p-3">
          <p className="flex justify-between text-sm font-bold">
            <span>Total</span>
            <span>{formatIdr(total)}</span>
          </p>
          <p className="text-xs text-muted-foreground">Kurs ¥1 = {formatIdr(rate)}</p>
        </div>
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
          />
          Saya sudah memeriksa penjual, kondisi, varian, stok, biaya dan memastikan barang dapat
          dibeli di Jepang.
        </label>
        <button
          type="button"
          disabled={busy || sending || !verified || o.unitJpy <= 0}
          onClick={() => void submit()}
          className="tap min-h-11 w-full rounded-xl bg-brand-red px-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Kirim kartu penawaran
        </button>
        <p className="text-xs text-muted-foreground">
          Revisi membuat penawaran baru; yang lama ditandai &quot;Diganti&quot;. Pelanggan harus
          menyetujui rincian terbaru sebelum membayar.
        </p>
      </div>
    </details>
  );
}

/** Settings for the link and photo search plus the chat (hours, reply target, templates). */
export function ChatSettings() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getAdminDiscovery>> | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState("");
  const load = useCallback(async () => {
    const r = await getAdminDiscovery();
    setData(r);
    setTemplates(r.config.templates.join("\n"));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!data)
    return (
      <details
        className="rounded-2xl border border-border bg-surface p-3"
        onToggle={(e) => {
          if ((e.currentTarget as HTMLDetailsElement).open) void load();
        }}
      >
        <summary className="cursor-pointer text-sm font-semibold">
          Pengaturan chat, link dan foto
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">Memuat…</p>
      </details>
    );
  const config = data.config;
  const set = (patch: Partial<typeof config>) =>
    setData({ ...data, config: { ...config, ...patch } });
  async function save() {
    if (!data) return;
    setBusy(true);
    try {
      await saveAdminDiscoverySettings({
        data: { config: data.config, expectedVersion: data.version, reason },
      });
      setReason("");
      await load();
      toast.success("Pengaturan disimpan.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pengaturan gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }
  const num = (
    key:
      | "dailyLimit"
      | "photoDailyLimit"
      | "dailyAiRequests"
      | "replyTargetMinutes"
      | "openHour"
      | "closeHour"
      | "idleCloseDays"
      | "dailyMessages",
    label: string,
  ) => (
    <label className="text-xs">
      {label}
      <input
        type="number"
        className={`${field} mt-1`}
        value={config[key]}
        onChange={(e) => set({ [key]: Number(e.target.value) })}
      />
    </label>
  );
  return (
    <details className="rounded-2xl border border-border bg-surface p-3" open>
      <summary className="cursor-pointer text-sm font-semibold">
        Pengaturan chat, link dan foto
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(
          [
            ["enabled", "Aktifkan pencarian dan permintaan"],
            ["photoEnabled", "Aktifkan analisis foto AI"],
            ["chatEnabled", "Aktifkan chat dengan tim"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config[key]}
              onChange={(e) => set({ [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
        {num("replyTargetMinutes", "Target balas pertama (menit)")}
        {num("openHour", "Jam layanan buka (WIB)")}
        {num("closeHour", "Jam layanan tutup (WIB)")}
        {num("idleCloseDays", "Tutup otomatis setelah (hari tanpa pesan)")}
        {num("dailyMessages", "Pesan / pelanggan / hari")}
        {num("dailyLimit", "Pencarian / pelanggan / hari")}
        {num("photoDailyLimit", "Foto / pelanggan / hari")}
        {num("dailyAiRequests", "Foto AI maksimum / hari (semua pelanggan)")}
        <label className="text-xs sm:col-span-2">
          Templat jawaban (satu per baris, maksimal 12)
          <textarea
            className={`${field} mt-1 min-h-24 py-2`}
            value={templates}
            onChange={(e) => {
              setTemplates(e.target.value);
              set({
                templates: e.target.value
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean),
              });
            }}
          />
        </label>
        <label className="text-xs">
          Alasan perubahan
          <input
            className={`${field} mt-1`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
          />
        </label>
        <button
          type="button"
          disabled={busy || reason.trim().length < 3}
          className="min-h-9 rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-50"
          onClick={() => void save()}
        >
          Simpan pengaturan
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        AI{" "}
        {data.aiReady ? "terkonfigurasi" : "belum terkonfigurasi; foto tetap bisa diajukan manual"}.
        Jam layanan dipakai untuk balasan otomatis dan penanda batas waktu respons. Foto draft
        dihapus setelah 7 hari; permintaan yang dikirim setelah 90 hari.
      </p>
    </details>
  );
}
