import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowUp, ChevronLeft, History, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AssistantMascot } from "@/components/assistant-mascot";
import { AssistantBlocks } from "@/components/assistant-blocks";
import { Bubble, TypingBubble, useSmoothText } from "@/components/trip-assistant";
import { ConfirmDialog } from "@/components/trip-ios";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  deleteTravoConversation,
  listTravoConversations,
  loadTravo,
  sendTripAssistantMessage,
  streamTripAssistantMessage,
} from "@/lib/trip-assistant.fn";
import {
  ASSISTANT_MAX_TEXT,
  ASSISTANT_NAME,
  TRAVO_SCOPES,
  TRAVO_SCOPE_LABEL,
  TRAVO_SCOPE_LINK,
  visibleChips,
  type AssistantMessage,
  type AssistantStatus,
  type TravoConversationSummary,
  type TravoScope,
} from "@/lib/trip-assistant";

const STARTERS: { title: string; hint: string; scope: TravoScope; text: string }[] = [
  {
    title: "eSIM terbaik",
    hint: "Pilih paket sesuai negara",
    scope: "esim",
    text: "eSIM terbaik buat liburan saya?",
  },
  {
    title: "Tiket pesawat",
    hint: "Cari rute dan harga",
    scope: "tiket",
    text: "Tips cari tiket pesawat yang murah?",
  },
  {
    title: "Rencana trip",
    hint: "Buat itinerary baru",
    scope: "all",
    text: "Bantu saya merencanakan perjalanan.",
  },
  {
    title: "Cek trip saya",
    hint: "Ringkas semua trip",
    scope: "trip",
    text: "Ringkas trip-trip saya.",
  },
];

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return "Hari ini";
  if (days < 7) return "Minggu ini";
  return "Lebih lama";
};

/**
 * The standalone Travo page. Same engine, same stored conversations as the trip chat: a trip chat
 * shows up in the history here, and a chat opened from here with a trip keeps working on the trip page.
 */
export function TravoChat({
  conversationId,
  tripParam,
  initialQuery,
  initialScope,
}: {
  conversationId?: string | undefined;
  tripParam?: string | undefined;
  initialQuery?: string | undefined;
  initialScope?: TravoScope | undefined;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [loggedIn, setLoggedIn] = useState(true);
  const [ready, setReady] = useState(false);
  const [convId, setConvId] = useState<string | undefined>(conversationId);
  const [tripId, setTripId] = useState<string | null>(null);
  const [scope, setScope] = useState<TravoScope>(initialScope ?? "all");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const typed = useSmoothText(streamText, streamText.length > 0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<TravoConversationSummary[] | null>(null);
  const [deleting, setDeleting] = useState<TravoConversationSummary | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const autoSent = useRef(false);
  const convRef = useRef<string | undefined>(conversationId);
  convRef.current = convId;

  useEffect(() => {
    // The address just caught up with a chat that is already on screen: nothing to reload.
    if (conversationId && conversationId === convRef.current && ready) return;
    let cancelled = false;
    setReady(false);
    loadTravo({
      data: conversationId ? { conversationId } : tripParam ? { tripId: tripParam } : {},
    })
      .then((r) => {
        if (cancelled) return;
        setStatus(r.status);
        setLoggedIn(r.loggedIn);
        setConvId(r.conversation?.id ?? conversationId);
        setTripId(r.conversation?.tripId ?? null);
        if (r.conversation) setScope(r.conversation.scope);
        setMessages(r.messages);
        setReady(true);
      })
      .catch(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, tripParam]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending, typed]);

  const send = useCallback(
    async (text: string) => {
      const value = text.trim().slice(0, ASSISTANT_MAX_TEXT);
      if (!value || sending) return;
      setNotice(null);
      setSending(true);
      setDraft("");
      const temp: AssistantMessage = {
        id: `tmp-${Date.now()}`,
        role: "user",
        content: value,
        chips: null,
        proposal: null,
        blocks: [],
        createdAt: new Date().toISOString(),
      };
      setMessages((list) => [...list, temp]);
      setStreamText("");
      const input = {
        text: value,
        ...(convId ? { conversationId: convId } : tripId ? { tripId } : { scope }),
      };
      const finish = (result: Awaited<ReturnType<typeof sendTripAssistantMessage>>) => {
        if (result.status === "ok") {
          setMessages((list) => [...list.filter((m) => m.id !== temp.id), ...result.messages]);
          if (result.conversationId && !convId) {
            setConvId(result.conversationId);
            // The address follows the conversation, so a refresh or a shared tab opens the same chat.
            void navigate({
              to: "/travo",
              search: { c: result.conversationId } as never,
              replace: true,
            });
          }
        } else {
          setMessages((list) => list.filter((m) => m.id !== temp.id));
          setDraft(value);
          setNotice(result.message);
        }
      };
      let started = false;
      try {
        try {
          const stream = await streamTripAssistantMessage({ data: input });
          let result: Awaited<ReturnType<typeof sendTripAssistantMessage>> | null = null;
          for await (const event of stream) {
            started = true;
            if (event.type === "delta") setStreamText((t) => t + event.text);
            else if (event.type === "done") result = event.result;
          }
          if (!result) throw new Error("stream_incomplete");
          finish(result);
        } catch (error) {
          if (started) throw error;
          finish(await sendTripAssistantMessage({ data: input }));
        }
      } catch {
        setMessages((list) => list.filter((m) => m.id !== temp.id));
        setDraft(value);
        setNotice("Pesan belum terkirim. Periksa koneksi lalu coba lagi.");
      } finally {
        setSending(false);
        setStreamText("");
      }
    },
    [sending, convId, tripId, scope, navigate],
  );

  // A question carried from the Home search line is sent once, when the chat is ready.
  useEffect(() => {
    if (!ready || autoSent.current || !initialQuery || conversationId || tripParam) return;
    if (status?.available !== true) return;
    autoSent.current = true;
    void send(initialQuery);
  }, [ready, initialQuery, conversationId, status, send]);

  async function openHistory() {
    setHistoryOpen(true);
    setHistory(null);
    setHistory(await listTravoConversations().catch(() => []));
  }

  function startNew() {
    setHistoryOpen(false);
    setMessages([]);
    setConvId(undefined);
    setTripId(null);
    setScope("all");
    setNotice(null);
    void navigate({ to: "/travo", search: {} as never });
  }

  async function removeConversation(c: TravoConversationSummary) {
    try {
      await deleteTravoConversation({ data: { conversationId: c.id } });
      setHistory((list) => (list ?? []).filter((x) => x.id !== c.id));
      if (c.id === convId) startNew();
      void router.invalidate();
    } catch {
      toast.error("Obrolan belum terhapus. Coba lagi.");
    }
    setDeleting(null);
  }

  const available = status?.available === true;
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const link = TRAVO_SCOPE_LINK[scope];
  const grouped = (history ?? []).reduce<Record<string, TravoConversationSummary[]>>((acc, c) => {
    (acc[dayLabel(c.lastMessageAt)] ||= []).push(c);
    return acc;
  }, {});

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-background safe-top">
      <header className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-surface px-3 py-2">
        <button
          type="button"
          aria-label="Kembali"
          onClick={() =>
            window.history.length > 1 ? router.history.back() : void navigate({ to: "/" })
          }
          className="tap grid size-9 place-items-center rounded-full bg-secondary"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <AssistantMascot size={34} mood={sending ? "thinking" : "idle"} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[14px] font-bold leading-tight">{ASSISTANT_NAME}</h1>
          <p className="truncate text-[11px] text-muted-foreground">Asisten perjalanan Djiwa</p>
        </div>
        <button
          type="button"
          aria-label="Riwayat obrolan"
          onClick={() => void openHistory()}
          className="tap grid size-9 place-items-center rounded-full bg-secondary"
        >
          <History className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Obrolan baru"
          onClick={startNew}
          className="tap grid size-9 place-items-center rounded-full bg-secondary"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </header>

      {!tripId && (
        <div
          className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border/60 bg-surface px-3 py-2 [scrollbar-width:none]"
          role="tablist"
          aria-label="Topik obrolan"
        >
          {TRAVO_SCOPES.filter((s) => s !== "trip").map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scope === s}
              disabled={Boolean(convId)}
              onClick={() => setScope(s)}
              className={`tap min-h-8 shrink-0 rounded-full px-3 text-[12px] font-semibold disabled:opacity-60 ${
                scope === s ? "bg-brand-red text-white" : "bg-secondary"
              }`}
            >
              {TRAVO_SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
      )}
      {tripId && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-surface px-3 py-2 text-[12px]">
          <span className="text-muted-foreground">
            Obrolan trip: sama dengan chat di halaman trip.
          </span>
          <Link
            to="/my-trips/$tripId"
            params={{ tripId }}
            className="tap shrink-0 font-semibold text-brand-red"
          >
            Buka trip
          </Link>
        </div>
      )}

      <main className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3 [scrollbar-width:none]">
        {!ready ? (
          <div className="h-10 w-2/3 animate-pulse rounded-2xl bg-secondary" />
        ) : !loggedIn ? (
          <div className="m-auto flex max-w-[280px] flex-col items-center gap-2 text-center">
            <AssistantMascot size={64} />
            <h2 className="text-[17px] font-bold">Masuk untuk ngobrol</h2>
            <p className="text-[12px] text-muted-foreground">
              Riwayat obrolanmu tersimpan dan ikut ke halaman trip.
            </p>
            <Link
              to="/profile"
              className="tap mt-1 inline-flex min-h-10 items-center rounded-xl bg-brand-red px-4 text-[14px] font-semibold text-white"
            >
              Masuk
            </Link>
          </div>
        ) : !available ? (
          <div className="m-auto max-w-[280px] text-center text-[12px] text-muted-foreground">
            {ASSISTANT_NAME} sedang tidak tersedia. Coba lagi nanti.
          </div>
        ) : messages.length === 0 && !sending ? (
          <div className="m-auto flex w-full flex-col items-center gap-1 text-center">
            <AssistantMascot size={64} />
            <h2 className="mt-1 text-[17px] font-bold">Hai, aku {ASSISTANT_NAME}</h2>
            <p className="text-[12px] text-muted-foreground">
              Tanya soal eSIM, tiket, trip, atau titip belanja.
            </p>
            <div className="mt-3 grid w-full grid-cols-2 gap-1.5">
              {STARTERS.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => {
                    setScope(s.scope === "trip" ? "all" : s.scope);
                    void send(s.text);
                  }}
                  className="tap min-h-[52px] rounded-2xl bg-surface p-2.5 text-left ring-1 ring-border/50"
                >
                  <span className="block text-[12px] font-semibold">{s.title}</span>
                  <span className="block text-[10.5px] text-muted-foreground">{s.hint}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m) => (
              <Bubble
                key={m.id}
                role={m.role}
                footer={
                  m.role === "assistant" && (m.blocks.length > 0 || m.proposal) ? (
                    <div className="space-y-1.5 px-3 pb-2">
                      {m.blocks.length > 0 && (
                        <AssistantBlocks blocks={m.blocks} onAsk={(t) => void send(t)} />
                      )}
                      {m.proposal && tripId && (
                        <Link
                          to="/my-trips/$tripId"
                          params={{ tripId }}
                          className="tap block rounded-xl bg-secondary px-3 py-2 text-[12px] font-semibold"
                        >
                          Usulan: {m.proposal.title}. Tinjau dan terapkan di halaman trip.
                        </Link>
                      )}
                    </div>
                  ) : undefined
                }
              >
                {m.content}
              </Bubble>
            ))}
            {sending &&
              (typed ? (
                <Bubble role="assistant">{typed}</Bubble>
              ) : (
                <TypingBubble label="Travo mengetik" />
              ))}
            {!sending && lastAssistant && link && messages.length > 0 && !tripId && (
              <Link
                to={link.to as never}
                className="tap ml-8 inline-flex min-h-9 w-fit items-center rounded-xl bg-secondary px-3 text-[12px] font-semibold"
              >
                {link.label}
              </Link>
            )}
          </>
        )}
        {notice && (
          <p
            role="alert"
            className="rounded-xl bg-brand-red-soft px-3 py-2 text-[12px] text-brand-red"
          >
            {notice}
          </p>
        )}
        <div ref={endRef} />
      </main>

      {available && loggedIn && (
        <footer className="shrink-0 border-t border-border/60 bg-background pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {!sending &&
            lastAssistant &&
            visibleChips(lastAssistant.chips, lastAssistant.proposal?.status ?? null) && (
              <div className="flex gap-1.5 overflow-x-auto px-3 pt-2 [scrollbar-width:none]">
                {visibleChips(
                  lastAssistant.chips,
                  lastAssistant.proposal?.status ?? null,
                )!.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => void send(o)}
                    className="tap min-h-8 shrink-0 rounded-full bg-surface px-3 text-[12px] font-semibold ring-1 ring-border/60"
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}
          <form
            className="flex items-center gap-2 px-3 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={ASSISTANT_MAX_TEXT}
              placeholder={`Tanya ${ASSISTANT_NAME} apa saja…`}
              aria-label={`Pesan untuk ${ASSISTANT_NAME}`}
              className="min-h-10 min-w-0 flex-1 rounded-full bg-surface px-4 text-[14px] ring-1 ring-border/60 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              aria-label="Kirim"
              disabled={sending || !draft.trim()}
              className="tap grid size-10 shrink-0 place-items-center rounded-full bg-brand-red text-white disabled:opacity-40"
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </button>
          </form>
        </footer>
      )}

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[80dvh] max-w-md overflow-y-auto rounded-t-3xl px-4 pb-6"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="text-[17px]">Riwayat</SheetTitle>
            <SheetDescription className="text-[12px]">
              Semua obrolan dengan {ASSISTANT_NAME}, termasuk chat di halaman trip.
            </SheetDescription>
          </SheetHeader>
          {history === null ? (
            <div className="mt-3 h-12 animate-pulse rounded-2xl bg-secondary" />
          ) : history.length === 0 ? (
            <p className="mt-4 text-center text-[12px] text-muted-foreground">Belum ada obrolan.</p>
          ) : (
            Object.entries(grouped).map(([label, list]) => (
              <section key={label} className="mt-3">
                <h3 className="text-[11px] font-bold uppercase text-muted-foreground">{label}</h3>
                <ul className="mt-1.5 space-y-1.5">
                  {list.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-1 rounded-2xl bg-surface ring-1 ring-border/50"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setHistoryOpen(false);
                          void navigate({ to: "/travo", search: { c: c.id } as never });
                        }}
                        className="tap min-h-12 min-w-0 flex-1 px-3 py-2 text-left"
                      >
                        <span className="block truncate text-[13px] font-semibold">{c.title}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {c.tripId ? "Trip" : TRAVO_SCOPE_LABEL[c.scope]} · {c.preview}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Hapus ${c.title}`}
                        onClick={() => setDeleting(c)}
                        className="tap grid size-11 shrink-0 place-items-center text-muted-foreground"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Hapus obrolan?"
        description={
          deleting?.tripId
            ? "Chat di halaman trip ini juga ikut terhapus. Agenda dan data trip tidak berubah."
            : "Obrolan ini dihapus permanen."
        }
        confirmLabel="Hapus"
        destructive
        onConfirm={() => deleting && removeConversation(deleting)}
      />
    </div>
  );
}
