import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Camera,
  ChevronLeft,
  Clock,
  EllipsisVertical,
  Link2,
  LoaderCircle,
  Plus,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { CustomerAuth } from "@/components/customer-auth";
import { BackBar, Page } from "@/components/shell";
import { compressReceiptPhoto } from "@/lib/receipt-image";
import { getMyChatThread, listMyChatThreads, startMyChatThread } from "@/lib/shopper-chat.fn";
import { acceptDiscoveryQuote, runCustomerDiscoveryAction } from "@/lib/shopper-discovery.fn";
import type { ShopperAddress } from "@/lib/personal-shopper";
import { quickReplies, type ChatMessageView } from "@/lib/shopper-chat";
import {
  MessageBubble,
  OfferCardView,
  Pill,
  RequestCardView,
  StageDots,
  StageTrack,
  SystemLine,
  ThreadIcon,
  dayLabel,
  listTime,
} from "./shopper-chat-parts";
import { ShopperNav } from "./shopper-nav";
import { ImageViewer } from "./shopper-viewer";
import { ShopperSheet } from "./shopper-ui";

type ThreadList = Awaited<ReturnType<typeof listMyChatThreads>>;
type ThreadData = Awaited<ReturnType<typeof getMyChatThread>>;

const field = "min-h-10 w-full rounded-xl border border-border bg-secondary px-3 text-[13px]";
const authMessage = (e: unknown) => (e instanceof Error ? e.message : "");
const needsLogin = (e: unknown) => /autentikasi|login|masuk/i.test(authMessage(e));

/* ------------------------------------------------------------------- list */

type Filter = "all" | "reply" | "active" | "done";

export function ChatInbox() {
  const [data, setData] = useState<ThreadList | null>(null);
  const [error, setError] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await listMyChatThreads());
      setError("");
    } catch (e) {
      if (needsLogin(e)) setSignedOut(true);
      else setError(authMessage(e) || "Pesan belum bisa dimuat.");
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const threads = data?.threads ?? [];
  const needsReply = threads.filter(
    (t) => !t.closed && (t.unread > 0 || t.stage.waitingOn === "customer"),
  ).length;
  const shown = threads.filter((t) => {
    const finished = t.closed || t.stage.closed;
    if (filter === "reply") return !t.closed && (t.unread > 0 || t.stage.waitingOn === "customer");
    if (filter === "active") return !finished;
    if (filter === "done") return finished;
    return true;
  });

  return (
    <Page tabs={false}>
      <ShopperNav active="chat" />
      <BackBar
        title="Pesan"
        fallbackTo="/titip-belanja"
        action={
          !signedOut && (
            <button
              type="button"
              aria-label="Pesan baru"
              onClick={() => setComposing(true)}
              className="tap flex size-9 items-center justify-center rounded-full border border-border/70 bg-surface"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          )
        }
      />
      {signedOut ? (
        <div className="mt-4">
          <p className="mb-2 text-[13px] text-muted-foreground">
            Masuk untuk melihat pesan dengan tim Djiwa.
          </p>
          <CustomerAuth size="block" />
        </div>
      ) : (
        <>
          <p className="-mt-1 mb-2 text-[12px] text-muted-foreground">
            Tanya tim Djiwa soal barang dan pesanan
          </p>
          {data && (
            <p className="mb-2 flex items-center gap-1.5 rounded-xl bg-[#fff8e6] px-3 py-1.5 text-[11px] text-[#92600a] dark:bg-[#3a3017] dark:text-[#f1deb0]">
              <Clock className="size-3.5 shrink-0" aria-hidden="true" />
              {data.promise}
            </p>
          )}
          <div className="-mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
            {(
              [
                ["all", "Semua"],
                ["reply", `Perlu dibalas${needsReply ? ` ${needsReply}` : ""}`],
                ["active", "Aktif"],
                ["done", "Selesai"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                className={`tap ios-chip shrink-0 ${filter === id ? "bg-foreground text-background" : "bg-secondary"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {error ? (
            <p role="alert" className="text-[12px] text-brand-red">
              {error}
            </p>
          ) : !data ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-secondary" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div className="mt-10 text-center">
              <p className="text-[14px] font-semibold">
                {threads.length === 0 ? "Belum ada percakapan" : "Tidak ada percakapan di sini"}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {threads.length === 0
                  ? "Cari barang di Titip Belanja. Kalau tidak ketemu, tanya tim kami di sini."
                  : "Coba filter lain."}
              </p>
              {threads.length === 0 && (
                <button
                  type="button"
                  onClick={() => setComposing(true)}
                  className="tap ios-btn mt-3 bg-brand-red text-white"
                >
                  Tanya tim Djiwa
                </button>
              )}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {shown.map((t) => (
                <li key={t.id}>
                  <Link
                    to="/titip-belanja/pesan/$id"
                    params={{ id: t.id }}
                    className="tap flex gap-2.5 rounded-2xl border border-border/70 bg-surface p-2.5"
                  >
                    <ThreadIcon icon={t.icon} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <b className="truncate text-[13px]">{t.title}</b>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {listTime(t.lastAt)}
                        </span>
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {t.lastPreview || "Belum ada pesan"}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5">
                        <Pill
                          tone={t.stage.tone === "bad" && !t.stage.closed ? "bad" : t.stage.tone}
                        >
                          {t.closed && !t.stage.closed ? "Ditutup" : t.stage.label}
                        </Pill>
                        {t.unread > 0 && (
                          <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-bold text-white">
                            {t.unread}
                          </span>
                        )}
                        {t.kind === "REQUEST" && (
                          <span className="ml-auto">
                            <StageDots done={t.stage.done} mini />
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <NewMessageSheet open={composing} onClose={() => setComposing(false)} />
    </Page>
  );
}

/** A fresh conversation: what the customer is after, and optionally a link. */
export function NewMessageSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef(crypto.randomUUID());
  const navigate = useNavigate();
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await startMyChatThread({ data: { text, url, clientKey: key.current } });
      key.current = crypto.randomUUID();
      setText("");
      setUrl("");
      onClose();
      await navigate({ to: "/titip-belanja/pesan/$id", params: { id: r.threadId } });
    } catch (e) {
      setError(authMessage(e) || "Pesan belum terkirim.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ShopperSheet
      open={open}
      onOpenChange={(v) => !v && !busy && onClose()}
      title="Tanya tim Djiwa"
      description="Ceritakan barang yang kamu cari. Tim kami mencarikan lalu mengirim penawaran."
    >
      <div className="space-y-3 py-3">
        <label className="block text-[12px]">
          Barang yang dicari
          <textarea
            className={`${field} mt-1 py-2`}
            rows={3}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Contoh: poster くら寿司 A3, kondisi bagus, 1 barang"
          />
        </label>
        <label className="block text-[12px]">
          Link produk (opsional)
          <input
            className={`${field} mt-1`}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
        {error && (
          <p role="alert" className="text-[12px] text-brand-red">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={busy || (text.trim().length < 3 && url.trim().length < 8)}
          onClick={() => void submit()}
          className="tap ios-btn w-full bg-brand-red text-white disabled:opacity-50"
        >
          {busy ? "Mengirim…" : "Kirim ke tim"}
        </button>
      </div>
    </ShopperSheet>
  );
}

/* ----------------------------------------------------------------- thread */

const emptyAddress: ShopperAddress = {
  recipientName: "",
  whatsapp: "62",
  addressLine: "",
  city: "",
  postalCode: "",
};

export function ChatThread({ id }: { id: string }) {
  const navigate = useNavigate();
  const [data, setData] = useState<ThreadData | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [error, setError] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState(false);
  const [accept, setAccept] = useState(false);
  const [attach, setAttach] = useState(false);
  const [viewer, setViewer] = useState<{ url: string; label: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const lastAt = useRef<string | null>(null);

  const merge = useCallback((incoming: ChatMessageView[], replace = false) => {
    setMessages((current) => {
      const base = replace ? [] : current.filter((m) => !m.id.startsWith("tmp-"));
      const seen = new Map(base.map((m) => [m.id, m]));
      for (const m of incoming) seen.set(m.id, m);
      const list = [...seen.values()].sort((a, b) => a.at.localeCompare(b.at));
      lastAt.current = list[list.length - 1]?.at ?? lastAt.current;
      return list;
    });
  }, []);

  const load = useCallback(
    async (initial = false) => {
      try {
        const r = await getMyChatThread({
          data: { id, ...(initial || !lastAt.current ? {} : { after: lastAt.current }) },
        });
        setData(r);
        // Offer cards change state without new messages (expiry, payment), so refresh them too.
        if (initial || r.messages.length > 0) merge(r.messages, initial);
        setError("");
      } catch (e) {
        if (needsLogin(e)) setSignedOut(true);
        else if (initial) setError(authMessage(e) || "Percakapan belum bisa dimuat.");
      }
    },
    [id, merge],
  );
  useEffect(() => {
    lastAt.current = null;
    void load(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, data?.thread.stage.done]);

  const thread = data?.thread ?? null;
  const request = data?.request ?? null;
  const stage = thread?.stage ?? null;
  const latestOffer = useMemo(
    () => [...messages].reverse().find((m) => m.card?.type === "offer") ?? null,
    [messages],
  );
  const firstCard = messages.find((m) => m.card?.type === "request")?.card;
  const lastTeamAt = useMemo(
    () => [...messages].reverse().find((m) => m.sender !== "CUSTOMER")?.at ?? "",
    [messages],
  );

  async function send(body: string, file: File | null) {
    if (!thread || sending || (!body.trim() && !file)) return;
    setSending(true);
    stick.current = true;
    const clientKey = crypto.randomUUID();
    const temp: ChatMessageView = {
      id: `tmp-${clientKey}`,
      sender: "CUSTOMER",
      senderName: "",
      body: body.trim(),
      internal: false,
      at: new Date().toISOString(),
      attachmentUrl: preview,
      card: null,
    };
    setMessages((m) => [...m, temp]);
    setText("");
    setPhoto(null);
    try {
      const form = new FormData();
      form.set("threadId", thread.id);
      form.set("body", body);
      form.set("clientKey", clientKey);
      if (file) form.set("photo", await compressReceiptPhoto(file), "foto.jpg");
      const response = await fetch("/api/shopper-chat", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Pesan belum terkirim.");
      await load();
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setText(body);
      toast.error(authMessage(e) || "Pesan belum terkirim.");
    } finally {
      setSending(false);
    }
  }

  async function requestAction(action: "decline" | "cancel" | "refresh_offer") {
    if (!request) return;
    try {
      await runCustomerDiscoveryAction({
        data: { id: request.id, expectedVersion: request.version, action, note: "" },
      });
      setMenu(false);
      await load();
      toast.success("Percakapan diperbarui.");
    } catch (e) {
      await load();
      toast.error(authMessage(e) || "Belum bisa diproses.");
    }
  }

  if (signedOut)
    return (
      <Page tabs={false}>
        <BackBar title="Pesan" fallbackTo="/titip-belanja/pesan" />
        <div className="mt-4">
          <p className="mb-2 text-[13px] text-muted-foreground">Masuk untuk membuka percakapan.</p>
          <CustomerAuth size="block" />
        </div>
      </Page>
    );

  const quick = stage && thread ? quickReplies(stage, thread.kind) : [];
  const canWrite = !!thread;
  const offerOpen = latestOffer?.card?.type === "offer" && latestOffer.card.state === "open";
  const pinned =
    latestOffer?.card?.type === "offer"
      ? {
          title: latestOffer.card.offer.name,
          sub: `¥${latestOffer.card.offer.unitJpy.toLocaleString("id-ID")} · ${latestOffer.card.offer.merchant}`,
        }
      : firstCard?.type === "request"
        ? { title: firstCard.title, sub: firstCard.hasPhoto ? "Foto referensi" : "Barang incaran" }
        : null;

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-md flex-col bg-background">
      <header className="safe-top border-b border-border/70 bg-surface">
        <div className="flex items-center gap-2 px-3 pb-2 pt-1">
          <Link
            to="/titip-belanja/pesan"
            aria-label="Kembali ke daftar pesan"
            className="tap flex size-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Link>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-red text-[11px] font-bold text-white">
            DT
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[14px] font-bold leading-tight">
              {thread?.title ?? "Pesan"}
            </h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {thread
                ? `Tim Djiwa · ${thread.closed ? "Ditutup" : `Tahap: ${stage?.label ?? ""}`}`
                : "Memuat…"}
            </p>
          </div>
          {thread && (
            <button
              type="button"
              aria-label="Menu percakapan"
              onClick={() => setMenu(true)}
              className="tap flex size-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background"
            >
              <EllipsisVertical className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>
      {thread && thread.kind === "REQUEST" && stage && <StageTrack done={stage.done} />}
      {pinned && (
        <div className="flex items-center gap-2 border-b border-border/70 bg-surface px-3 py-1.5">
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-secondary">
            <Link2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold">{pinned.title}</p>
            <p className="truncate text-[10px] text-muted-foreground">{pinned.sub}</p>
          </div>
          {stage && <Pill tone={stage.tone}>{stage.label}</Pill>}
        </div>
      )}

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-secondary/40 px-3 py-2.5"
        aria-live="polite"
      >
        {error ? (
          <p role="alert" className="text-[12px] text-brand-red">
            {error}
          </p>
        ) : !data ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" aria-label="Memuat" />
          </div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const showDay = !prev || dayLabel(prev.at) !== dayLabel(m.at);
            return (
              <div key={m.id}>
                {showDay && <SystemLine text={dayLabel(m.at)} />}
                {m.card?.type === "request" ? (
                  <RequestCardView
                    card={m.card}
                    onPhoto={(url, label) => setViewer({ url, label })}
                  />
                ) : m.card?.type === "offer" ? (
                  <>
                    {m.body && (
                      <MessageBubble
                        m={{ ...m, card: null }}
                        mine={false}
                        onPhoto={(url, label) => setViewer({ url, label })}
                      />
                    )}
                    <div className="mt-1">
                      <OfferCardView
                        card={m.card}
                        orderId={request?.orderId ?? null}
                        perspective="customer"
                        onAccept={() => setAccept(true)}
                        onAsk={() => composer.current?.focus()}
                        onRefresh={() => void requestAction("refresh_offer")}
                      />
                    </div>
                  </>
                ) : m.sender === "SYSTEM" ? (
                  m.card?.type === "order" ? (
                    <div className="flex flex-col items-center gap-1">
                      <SystemLine text={m.body} />
                      <Link
                        to="/titip-belanja/pesanan/$id"
                        params={{ id: m.card.orderId }}
                        className="tap text-[11px] font-semibold text-brand-red"
                      >
                        Buka pesanan {m.card.code} ›
                      </Link>
                    </div>
                  ) : (
                    <SystemLine text={m.body} />
                  )
                ) : (
                  <MessageBubble
                    m={m}
                    mine={m.sender === "CUSTOMER"}
                    read={m.sender === "CUSTOMER" && lastTeamAt > m.at}
                    onPhoto={(url, label) => setViewer({ url, label })}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      {canWrite && (
        <div className="border-t border-border/70 bg-surface pb-[env(safe-area-inset-bottom)]">
          {quick.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto px-3 pt-2 [scrollbar-width:none]">
              {quick.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={sending}
                  onClick={() => {
                    if (q === "Setuju" && offerOpen) return setAccept(true);
                    if (q === "Batalkan") return setMenu(true);
                    void send(q, null);
                  }}
                  className="tap ios-chip shrink-0 border border-border/70 bg-background"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          {preview && (
            <div className="relative mx-3 mt-2 inline-block">
              <img src={preview} alt="Foto yang akan dikirim" className="h-16 rounded-lg" />
              <button
                type="button"
                aria-label="Hapus foto"
                onClick={() => setPhoto(null)}
                className="tap absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-1.5 px-3 py-2">
            <button
              type="button"
              aria-label="Tambah lampiran"
              onClick={() => setAttach(true)}
              className="tap flex size-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
            <textarea
              ref={composer}
              rows={1}
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(text, photo);
                }
              }}
              placeholder="Tulis pesan…"
              aria-label="Tulis pesan"
              className="max-h-24 min-h-9 flex-1 resize-none rounded-2xl bg-secondary px-3 py-2 text-[13px] outline-none"
            />
            <label
              className="tap flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border/70 bg-background"
              aria-label="Kirim foto"
            >
              <Camera className="size-4" aria-hidden="true" />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && f.size > 5 * 1024 * 1024) toast.error("Foto maksimal 5 MB.");
                  else setPhoto(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              aria-label="Kirim"
              disabled={sending || (!text.trim() && !photo)}
              onClick={() => void send(text, photo)}
              className="tap flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-red text-white disabled:opacity-40"
            >
              {sending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      )}

      <ShopperSheet open={attach} onOpenChange={setAttach} title="Tambah lampiran">
        <div className="space-y-2 py-3">
          <label className="tap ios-btn w-full cursor-pointer bg-secondary">
            Pilih foto dari galeri
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f && f.size > 5 * 1024 * 1024) toast.error("Foto maksimal 5 MB.");
                else setPhoto(f);
                e.target.value = "";
                setAttach(false);
              }}
            />
          </label>
          <button
            type="button"
            className="tap ios-btn w-full bg-secondary"
            onClick={() => {
              setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}https://`);
              setAttach(false);
              window.setTimeout(() => composer.current?.focus(), 50);
            }}
          >
            Tempel link barang
          </button>
          <p className="text-[11px] text-muted-foreground">
            Foto JPG, PNG atau WebP maksimal 5 MB. Metadata lokasi dihapus sebelum dikirim.
          </p>
        </div>
      </ShopperSheet>

      <ShopperSheet open={menu} onOpenChange={setMenu} title="Percakapan">
        <div className="space-y-2 py-3">
          {thread?.orderId && (
            <Link
              to="/titip-belanja/pesanan/$id"
              params={{ id: thread.orderId }}
              className="tap ios-btn w-full bg-secondary"
            >
              Buka pesanan {thread.orderCode}
            </Link>
          )}
          {request?.status === "OFFERED" && (
            <button
              type="button"
              className="tap ios-btn w-full bg-secondary"
              onClick={() => void requestAction("decline")}
            >
              Tolak penawaran
            </button>
          )}
          {request &&
            ["SUBMITTED", "SEARCHING", "NEEDS_INFO", "OFFERED", "DECLINED"].includes(
              request.status,
            ) && (
              <button
                type="button"
                className="tap ios-btn w-full bg-secondary text-brand-red"
                onClick={() => void requestAction("cancel")}
              >
                Batalkan permintaan
              </button>
            )}
          {!thread?.orderId && !request && (
            <p className="text-[12px] text-muted-foreground">Tidak ada tindakan lain.</p>
          )}
        </div>
      </ShopperSheet>

      {request && latestOffer?.card?.type === "offer" && (
        <AcceptSheet
          open={accept}
          onClose={() => setAccept(false)}
          requestId={request.id}
          version={request.version}
          onDone={async (orderId, paymentUrl, info) => {
            setAccept(false);
            if (paymentUrl) {
              window.location.href = paymentUrl;
              return;
            }
            if (info) toast.info(info);
            await navigate({ to: "/titip-belanja/pesanan/$id", params: { id: orderId } });
          }}
          onError={() => void load()}
        />
      )}

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

/** The shipping address and consent that turn an offer into an order, then to payment. */
function AcceptSheet({
  open,
  onClose,
  requestId,
  version,
  onDone,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  requestId: string;
  version: number;
  onDone: (orderId: string, paymentUrl: string | null, info: string | null) => void | Promise<void>;
  onError: () => void;
}) {
  const [address, setAddress] = useState(emptyAddress);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function pay() {
    setBusy(true);
    setError("");
    try {
      const result = await acceptDiscoveryQuote({
        data: { id: requestId, expectedVersion: version, address },
      });
      await onDone(result.orderId, result.paymentUrl ?? null, result.error ?? null);
    } catch (e) {
      setError(authMessage(e) || "Belum bisa melanjutkan pembayaran.");
      onError();
    } finally {
      setBusy(false);
    }
  }
  return (
    <ShopperSheet
      open={open}
      onOpenChange={(v) => !v && !busy && onClose()}
      title="Setuju dan bayar"
      description="Isi alamat pengiriman, lalu lanjut ke pembayaran."
    >
      <div className="space-y-2.5 py-3">
        {(
          [
            ["recipientName", "Nama penerima"],
            ["whatsapp", "WhatsApp"],
            ["addressLine", "Alamat lengkap"],
            ["city", "Kota"],
            ["postalCode", "Kode pos"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-[12px]">
            {label}
            <input
              className={`${field} mt-1`}
              value={address[key]}
              onChange={(e) => setAddress((a) => ({ ...a, [key]: e.target.value }))}
            />
          </label>
        ))}
        <label className="flex items-start gap-2 text-[12px]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          Saya menyetujui barang, kondisi, varian, dan rincian harga penawaran ini.
        </label>
        {error && (
          <p role="alert" className="text-[12px] text-brand-red">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={!agreed || busy}
          onClick={() => void pay()}
          className="tap ios-btn w-full bg-brand-red text-white disabled:opacity-50"
        >
          {busy ? "Memproses…" : "Setujui & lanjut pembayaran"}
        </button>
      </div>
    </ShopperSheet>
  );
}
