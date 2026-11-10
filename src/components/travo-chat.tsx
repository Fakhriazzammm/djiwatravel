import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronLeft, History, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AssistantMascot, AssistantProfileSheet } from "@/components/assistant-mascot";
import { TravoComposer, TravoLive, TravoMessage } from "@/components/travo-parts";
import { TravoPlanWizard } from "@/components/travo-plan-wizard";
import { TripToolsBar, TripToolsOverlays } from "@/components/trip-chat-tools";
import { ShareTripSheet } from "@/components/trip-share-sheet";
import { TripExportSheet } from "@/components/trip-export-sheet";
import { TripSummaryCard } from "@/components/trip-summary-card";
import { ConfirmDialog } from "@/components/trip-ios";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { travoMood, useTravoChat } from "@/hooks/use-travo-chat";
import { useTripChatTools } from "@/hooks/use-trip-chat-tools";
import { useTripContext } from "@/hooks/use-trip-context";
import { deleteTravoConversation, listTravoConversations } from "@/lib/trip-assistant.fn";
import {
  ASSISTANT_NAME,
  SHARE_WORDS,
  TRAVO_SCOPE_LABEL,
  type TravoConversationSummary,
  type TravoScope,
} from "@/lib/trip-assistant";

const STARTERS: { title: string; hint: string; scope: TravoScope; text: string }[] = [
  {
    title: "eSIM terbaik",
    hint: "Pilih paket sesuai negara",
    scope: "esim",
    text: "Carikan eSIM terbaik untuk liburan saya",
  },
  {
    title: "Tiket pesawat",
    hint: "Cari rute dan harga",
    scope: "tiket",
    text: "Carikan tiket pesawat yang murah",
  },
  {
    title: "Rencana trip",
    hint: "Buat itinerary baru",
    scope: "trip",
    text: "Bantu saya merencanakan perjalanan.",
  },
  {
    title: "Titip belanja",
    hint: "Belanja dari Jepang, Korea",
    scope: "titip",
    text: "Saya mau titip belanja dari luar negeri",
  },
  {
    title: "Panduan",
    hint: "Visa, tax refund, tips",
    scope: "panduan",
    text: "Panduan apa yang perlu saya baca sebelum berangkat?",
  },
  {
    title: "Pesanan & saldo",
    hint: "Cek eSIM dan Djiwa Pay",
    scope: "all",
    text: "Cek pesanan eSIM dan saldo saya",
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
 * The standalone Travo page: the same engine (`useTravoChat`) and the same message pieces as the
 * Ringkas chat, in a full-screen layout. A trip chat opened here keeps every trip feature (apply,
 * undo, shortcuts) and a general chat has none, since it changes no trip.
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
  const [shareOpen, setShareOpen] = useState(false);
  // "bagikan itinerary" opens the share sheet, but only once the trip is loaded.
  const shareReady = useRef(false);
  const chat = useTravoChat({
    intercept: (text) => {
      if (!shareReady.current || !SHARE_WORDS.test(text)) return false;
      setShareOpen(true);
      return true;
    },
    conversationId,
    tripParam,
    scope: initialScope,
    // The address follows the conversation, so a refresh or a shared tab opens the same chat.
    onConversationCreated: (id) =>
      void navigate({ to: "/travo", search: { c: id } as never, replace: true }),
  });
  const { status, loggedIn, ready, messages, sending, notice, convId, chatTrip } = chat;
  // A trip chat has the same trip tools as Ringkas, from the same trip data.
  const tripCtx = useTripContext(chatTrip);
  shareReady.current = tripCtx.ready;
  const tools = useTripChatTools({
    chat,
    tripId: chatTrip,
    summary: tripCtx.ready ? tripCtx.summary : undefined,
    onChanged: async () => tripCtx.reload(),
  });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [history, setHistory] = useState<TravoConversationSummary[] | null>(null);
  const [deleting, setDeleting] = useState<TravoConversationSummary | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const autoSent = useRef(false);
  const available = status?.available === true;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending, chat.streamText]);

  // A question carried from the Home search line is sent once, when the chat is ready.
  const { send } = chat;
  useEffect(() => {
    if (!ready || autoSent.current || !initialQuery || conversationId || tripParam) return;
    if (!available) return;
    autoSent.current = true;
    void send(initialQuery);
  }, [ready, initialQuery, conversationId, tripParam, available, send]);

  async function openHistory() {
    setHistoryOpen(true);
    setHistory(null);
    setHistory(await listTravoConversations().catch(() => []));
  }

  function startNew() {
    setHistoryOpen(false);
    chat.startNew();
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

  const lastId = messages[messages.length - 1]?.id;
  const grouped = (history ?? []).reduce<Record<string, TravoConversationSummary[]>>((acc, c) => {
    (acc[dayLabel(c.lastMessageAt)] ||= []).push(c);
    return acc;
  }, {});

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-background safe-top">
      <header className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-surface px-3 py-2">
        <Link
          to="/"
          aria-label="Kembali ke Beranda"
          className="tap grid size-9 place-items-center rounded-full bg-secondary"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
        <AssistantMascot
          size={34}
          mood={travoMood(chat)}
          cheer={chat.cheer}
          label={`Profil ${ASSISTANT_NAME}`}
          onPress={() => setProfileOpen(true)}
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-[14px] font-bold leading-tight">{ASSISTANT_NAME}</h1>
          <p className="truncate text-[11px] text-muted-foreground">
            Siap membantu · ketuk untuk kenalan
          </p>
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
              search={{ returnTo: "/travo" } as never}
              className="tap mt-1 inline-flex min-h-10 items-center rounded-xl bg-brand-red px-4 text-[14px] font-semibold text-white"
            >
              Masuk
            </Link>
          </div>
        ) : !available ? (
          <div className="m-auto max-w-[280px] text-center text-[12px] text-muted-foreground">
            {ASSISTANT_NAME} sedang tidak tersedia. Coba lagi nanti.
          </div>
        ) : wizardOpen ? (
          <TravoPlanWizard onExit={() => setWizardOpen(false)} />
        ) : messages.length === 0 && !sending ? (
          <div className="m-auto flex w-full flex-col items-center gap-1 text-center">
            <AssistantMascot size={64} />
            <h2 className="mt-1 text-[17px] font-bold">Hai, aku {ASSISTANT_NAME}</h2>
            <p className="text-[12px] text-muted-foreground">
              Tanya soal eSIM, tiket, trip, atau titip belanja.
            </p>
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              data-testid="plan-hero"
              className="tap relative mt-2 flex w-full items-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-red to-[#b3222a] p-3 text-left text-white"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold leading-tight">
                  Buat itinerary lengkap
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-white/90">
                  Tiket, anggaran, eSIM, dan rute per hari. Aku tanya satu-satu.
                </span>
                <span className="mt-2 inline-flex min-h-8 items-center rounded-full bg-white px-3 text-[12px] font-bold text-brand-red">
                  Mulai
                </span>
              </span>
              <span className="shrink-0">
                <AssistantMascot size={52} />
              </span>
            </button>
            <div className="mt-2 grid w-full grid-cols-2 gap-1.5">
              {STARTERS.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => {
                    // The topic is picked here, so the Admin topic stats count it.
                    chat.setScope(s.scope);
                    void send(s.text, undefined, s.scope);
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
              <TravoMessage
                key={m.id}
                message={m}
                last={m.id === lastId}
                chat={chat}
                currency={tripCtx.ready ? tripCtx.currency : (chat.tripCurrency ?? "IDR")}
                onShare={tripCtx.ready ? () => setShareOpen(true) : undefined}
                extra={
                  m.role === "assistant" && m.local === "summary" && tripCtx.ready && chatTrip ? (
                    <TripSummaryCard
                      summary={tripCtx.summary}
                      tripId={chatTrip}
                      onAction={tools.runSummaryAction}
                      onShare={() => setShareOpen(true)}
                      onExport={() => setExportOpen(true)}
                    />
                  ) : undefined
                }
              />
            ))}
            <TravoLive chat={chat} />
            {tools.summarizing && (
              <p className="ml-8 text-[11px] text-muted-foreground">Travo sedang meringkas…</p>
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

      {available && loggedIn && !wizardOpen && (
        <footer className="shrink-0 border-t border-border/60 bg-background px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
          {chatTrip && (
            <TripToolsBar
              chat={chat}
              tools={tools}
              summary={tripCtx.ready ? tripCtx.summary : undefined}
              unpinned={tripCtx.ready ? tripCtx.unpinned : 0}
              onShare={tripCtx.ready ? () => setShareOpen(true) : undefined}
              onExport={tripCtx.ready ? () => setExportOpen(true) : undefined}
              onCatat={() => {
                chat.setDraft("Catat ");
                inputRef.current?.focus();
              }}
            />
          )}
          <TravoComposer chat={chat} inputRef={inputRef} forTrip={Boolean(chatTrip)} />
        </footer>
      )}

      {chatTrip && tripCtx.ready && (
        <>
          <TripToolsOverlays
            tools={tools}
            tripId={chatTrip}
            currency={tripCtx.currency}
            categories={tripCtx.categories}
            budget={{ budgetMinor: tripCtx.budgetMinor, spentMinor: tripCtx.spentMinor }}
            onChanged={async () => tripCtx.reload()}
          />
          <TripExportSheet
            open={exportOpen}
            onOpenChange={setExportOpen}
            tripId={chatTrip}
            tripName={tripCtx.trip.name}
          />
          <ShareTripSheet
            open={shareOpen}
            onOpenChange={setShareOpen}
            trip={tripCtx.trip}
            share={tripCtx.share}
            onChanged={async () => tripCtx.reload()}
          />
        </>
      )}
      <AssistantProfileSheet
        variant="general"
        open={profileOpen}
        onOpenChange={setProfileOpen}
        mood={travoMood(chat)}
        remaining={chat.remaining}
        dailyLimit={status?.available ? status.dailyLimit : undefined}
        guest={status?.available === true && status.guest}
        hasConversation={messages.length > 0}
        onReset={() => {
          setProfileOpen(false);
          startNew();
        }}
      />
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
        onConfirm={() => (deleting ? removeConversation(deleting) : undefined)}
      />
    </div>
  );
}
