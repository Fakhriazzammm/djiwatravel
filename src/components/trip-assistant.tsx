import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Camera, MapPin, Plus, Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { FixedLayer } from "@/components/motion-primitives";
import { ConfirmDialog } from "@/components/trip-ios";
import { AssistantMascot, AssistantProfileSheet } from "@/components/assistant-mascot";
import {
  Bubble,
  TravoComposer,
  TravoLive,
  TravoMessage,
  TypingBubble,
} from "@/components/travo-parts";
import { TripSummaryCard } from "@/components/trip-summary-card";
import { ReceiptScanner } from "@/components/receipt-scanner";
import { travoMood, useTravoChat } from "@/hooks/use-travo-chat";
import { getReceiptScanStatus } from "@/lib/receipt-scan.fn";
import type { ReceiptScanStatus } from "@/lib/receipt-scan";
import type { SummaryAction, TripSummary } from "@/lib/trip-summary";
import { pinTripPlaces, recordTripSummary, resetTripAssistant } from "@/lib/trip-assistant.fn";
import {
  ASSISTANT_NAME,
  QUICK,
  buildNudges,
  type AssistantIntent,
  type AssistantNudge,
} from "@/lib/trip-assistant";

/** One thing the assistant tells at the start of the chat: a sentence, then the live card. */
export type IntroPart = { id: string; lead: string; node: ReactNode };

type Props = {
  tripId: string;
  destination: string;
  currency: string;
  nudgeInput: Parameters<typeof buildNudges>[0];
  /** What Ringkas shows without the chat (agenda, attention, budget...): used when the chat is off. */
  children: ReactNode;
  /** The same cards as chat messages, revealed one by one when the chat opens. */
  intro?: IntroPart[];
  /** Opens the share sheet (link, social, Instagram story). */
  onShare?: () => void;
  /** Everything on the trip, for the one-tap "Ringkas semua" balloon. */
  summary?: TripSummary;
  /** Activities that have no point on the map yet (the "Pasang pin" button shows while > 0). */
  unpinned?: number;
  /** Called after an agenda proposal is applied, with the days it touched (the map follows). */
  onFocusDays?: (dates: string[]) => void;
  /** Budget categories and totals, for the receipt scanner opened from the chat. */
  categories?: { id: string; name: string }[];
  budget?: { budgetMinor: number; spentMinor: number } | null;
  onChanged: () => Promise<unknown>;
  onAdd: () => void;
  /** Tells Ringkas whether the chat is live, so it can keep its own "+" button when it is not. */
  onAvailability: (on: boolean) => void;
};

/** "bagikan itinerary", "share perjalanan", ...: opens the share sheet instead of asking the model. */
const SHARE_WORDS = /\b(bagikan|share|kirim)\b.*\b(itinerar\w*|perjalanan|rencana|trip)\b/i;

/**
 * The AI conversation under the Ringkas map. The Ringkas cards (agenda, attention, budget) sit
 * inside it, then the conversation: the assistant asks, answers and proposes; the traveler taps
 * quick replies, types, and applies or undoes each proposal. When the assistant is off (Admin
 * switch, no key, guests not allowed) only the static cards render.
 */
export function TripAssistant(props: Props) {
  const { tripId } = props;
  // How many intro messages are on screen. They arrive one by one, like the assistant talking.
  const introLength = props.intro?.length ?? 0;
  const [introShown, setIntroShown] = useState(0);
  const chat = useTravoChat({
    tripId,
    onAvailability: props.onAvailability,
    // "bagikan itinerary" opens the share sheet instead of asking the model.
    intercept: (text) => {
      if (!props.onShare || !SHARE_WORDS.test(text)) return false;
      props.onShare();
      return true;
    },
    onSend: () => setIntroShown(introLength),
    onChanged: props.onChanged,
    onApplied: (proposal) => {
      const applied = proposal.payload;
      if (applied?.kind === "agenda")
        props.onFocusDays?.([...new Set(applied.items.map((i) => i.date).filter(Boolean))].sort());
    },
  });
  const { status, messages, setMessages, sending, notice, setNotice, remaining, streamText } = chat;
  const [resetOpen, setResetOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptScanStatus | null>(null);
  const [scanning, setScanning] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Receipt scanning is for members; a guest or a switched-off scanner has no camera chip.
  useEffect(() => {
    if (status?.available !== true || status.guest) return;
    let cancelled = false;
    void Promise.resolve()
      .then(() => getReceiptScanStatus())
      .then((r) => !cancelled && setReceipt(r))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status]);

  const live = status?.available === true;
  useEffect(() => {
    if (!live) return;
    if (introShown >= introLength) {
      try {
        window.sessionStorage.setItem(`djiwa-assistant-intro-${tripId}`, "1");
      } catch {
        /* only a convenience */
      }
      return;
    }
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(`djiwa-assistant-intro-${tripId}`) === "1";
    } catch {
      /* treat as not seen */
    }
    const calm =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Coming back to the page in the same visit, or reduced motion: no staging, everything is there.
    if (seen || calm) {
      setIntroShown(introLength);
      return;
    }
    const timer = window.setTimeout(
      () => setIntroShown((n) => n + 1),
      introShown === 0 ? 500 : 750,
    );
    return () => window.clearTimeout(timer);
  }, [live, introShown, introLength, tripId]);
  const guest = status?.available === true && status.guest;

  useEffect(() => {
    if (!messages.length && !sending) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  const nudges = useMemo<AssistantNudge[]>(() => buildNudges(props.nudgeInput), [props.nudgeInput]);
  const quick = useMemo(() => {
    const first = nudges.map((n) => QUICK.find((q) => q.intent === n.intent)).filter(Boolean);
    const rest = QUICK.filter((q) => !first.includes(q));
    return [...new Set([...first, ...rest])] as typeof QUICK;
  }, [nudges]);

  const send = chat.send;

  const [summarizing, setSummarizing] = useState(false);
  /** "Ringkas semua": the whole trip as one balloon, built on the spot from the page data (no AI call). */
  async function summarize() {
    if (!props.summary || sending || summarizing) return;
    setNotice(null);
    setIntroShown(introLength);
    setSummarizing(true);
    const stamp = Date.now();
    setMessages((list) => [
      ...list,
      {
        id: `local-u-${stamp}`,
        role: "user",
        content: "Ringkas semua perjalananku",
        chips: null,
        proposal: null,
        blocks: [],
        local: "summary",
        createdAt: new Date(stamp).toISOString(),
      },
    ]);
    await new Promise((resolve) => window.setTimeout(resolve, 750));
    setMessages((list) => [
      ...list,
      {
        id: `local-a-${stamp}`,
        role: "assistant",
        content: `Ini ringkasan lengkap **${props.summary?.destination || props.summary?.name || "perjalananmu"}**. Semua datanya dari halaman Agenda, Biaya, Checklist, dan Booking.`,
        chips: null,
        proposal: null,
        blocks: [],
        local: "summary",
        createdAt: new Date(stamp + 1).toISOString(),
      },
    ]);
    setSummarizing(false);
    // Remember the exchange so a refresh brings the (freshly built) card back.
    void recordTripSummary({ data: { tripId } }).catch(() => undefined);
  }

  const runSummaryAction = (action: SummaryAction) => {
    if (action === "pin") return void pinPlaces();
    const q = QUICK.find((item) => item.intent === (action === "plan" ? "plan" : action));
    if (q) void send(q.text, q.intent);
  };

  const [pinning, setPinning] = useState(false);
  async function pinPlaces() {
    setPinning(true);
    try {
      const result = await pinTripPlaces({ data: { tripId } });
      await props.onChanged();
      toast.success(
        result.pinned
          ? `${result.pinned} pin ditambahkan di peta${result.approximate ? ` (${result.approximate} perkiraan)` : ""}`
          : "Semua aktivitas sudah punya titik di peta",
      );
      if (result.remaining) toast.error("Lokasi belum bisa dicari. Coba lagi sebentar lagi.");
    } catch {
      toast.error("Pin belum bisa dipasang. Coba lagi.");
    } finally {
      setPinning(false);
    }
  }

  async function reset() {
    try {
      await resetTripAssistant({ data: { tripId } });
      setMessages([]);
      setResetOpen(false);
      setNotice(null);
    } catch {
      toast.error("Obrolan belum terhapus. Coba lagi.");
    }
  }

  if (!live) return <>{props.children}</>;

  const greeting = `Hai! Aku ${ASSISTANT_NAME}, asisten perjalananmu ke ${props.destination}. Aku rangkum dulu kondisi perjalananmu ya.`;
  const introDone = introShown >= introLength;
  const outro = nudges.length
    ? `${nudges.map((n) => n.text).join(" ")} Mau mulai dari mana?`
    : "Tanya apa saja, atau minta saya menyusun agenda, anggaran, dan checklist.";

  const mood = travoMood(chat, introDone ? "idle" : "talking");
  const statusLine = sending
    ? streamText
      ? "Sedang menjawab…"
      : "Sedang berpikir…"
    : !introDone
      ? "Sedang mengetik…"
      : "Siap membantu · ketuk untuk kenalan";

  return (
    <>
      <div className="mt-3 flex items-center gap-2.5 px-1 pb-2" data-testid="assistant-profile-row">
        <AssistantMascot
          size={44}
          mood={mood}
          cheer={chat.cheer}
          label={`Profil ${ASSISTANT_NAME}`}
          onPress={() => setProfileOpen(true)}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight">{ASSISTANT_NAME}</p>
          <p className="truncate text-[11px] text-muted-foreground" aria-live="polite">
            {statusLine}
          </p>
        </div>
        <Link
          to="/travo"
          search={{ trip: tripId } as never}
          className="tap px-1 text-xs font-semibold text-brand-red"
        >
          Buka di Travo
        </Link>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setResetOpen(true)}
            className="tap px-1 text-xs font-semibold text-muted-foreground"
          >
            Obrolan baru
          </button>
        )}
      </div>
      <div className="space-y-2" aria-live="polite" data-testid="assistant-thread">
        <Bubble role="assistant">{greeting}</Bubble>
        {(props.intro ?? []).slice(0, introShown).map((part) => (
          <div key={part.id} className="space-y-2" data-testid={`assistant-intro-${part.id}`}>
            <Bubble role="assistant">{part.lead}</Bubble>
            <div className="ml-8 [&>*:first-child]:mt-0">{part.node}</div>
          </div>
        ))}
        {!introDone && <TypingBubble label={`${ASSISTANT_NAME} sedang mengetik`} />}
        {introDone && <Bubble role="assistant">{outro}</Bubble>}
      </div>

      <div className="mt-3 space-y-2">
        {(introDone ? messages : []).map((m) => (
          <TravoMessage
            key={m.id}
            message={m}
            last={m.id === messages[messages.length - 1]?.id}
            chat={chat}
            currency={props.currency}
            onShare={props.onShare}
            extra={
              m.role === "assistant" && m.local === "summary" && props.summary ? (
                <TripSummaryCard
                  summary={props.summary}
                  tripId={tripId}
                  onAction={runSummaryAction}
                  {...(props.onShare ? { onShare: props.onShare } : {})}
                />
              ) : undefined
            }
          />
        ))}
        <TravoLive chat={chat} />
        {summarizing && <TypingBubble label={`${ASSISTANT_NAME} sedang meringkas`} />}
        {notice && (
          <p
            role="alert"
            className="mx-auto max-w-[90%] rounded-xl bg-secondary px-3 py-2 text-center text-[12px] text-muted-foreground"
          >
            {notice}
            {guest && remaining === 0 && (
              <>
                {" "}
                <Link
                  to="/profile"
                  search={{ returnTo: `/my-trips/${tripId}` } as never}
                  className="font-semibold text-brand-red"
                >
                  Masuk
                </Link>
              </>
            )}
          </p>
        )}
        <div ref={endRef} className="scroll-mb-44" />
      </div>

      <FixedLayer>
        <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40">
          <div className="mx-auto max-w-md border-t border-border/60 bg-background/95 px-3 pb-2 pt-1.5 backdrop-blur-xl">
            <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1.5 [scrollbar-width:none]">
              {props.summary && (
                <button
                  type="button"
                  disabled={sending || summarizing}
                  onClick={() => void summarize()}
                  className="tap inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-brand-red px-3 text-xs font-bold text-white disabled:opacity-50"
                >
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  Ringkas semua
                </button>
              )}
              {props.onShare && (
                <button
                  type="button"
                  onClick={props.onShare}
                  className="tap inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-surface px-3 text-xs font-semibold ring-1 ring-border/50"
                >
                  <Share2 className="size-3.5 text-brand-red" aria-hidden="true" />
                  Bagikan
                </button>
              )}
              {quick.map((q) => (
                <button
                  key={q.intent}
                  type="button"
                  disabled={sending}
                  onClick={() => void send(q.text, q.intent)}
                  className="tap min-h-8 shrink-0 rounded-full bg-surface px-3 text-xs font-semibold ring-1 ring-border/50 disabled:opacity-50"
                >
                  {q.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  chat.setDraft("Catat ");
                  inputRef.current?.focus();
                }}
                className="tap min-h-8 shrink-0 rounded-full bg-surface px-3 text-xs font-semibold ring-1 ring-border/50"
              >
                Catat biaya
              </button>
              {(props.unpinned ?? 0) > 0 && (
                <button
                  type="button"
                  disabled={pinning || sending}
                  onClick={() => void pinPlaces()}
                  className="tap inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-brand-red-soft px-3 text-xs font-semibold text-brand-red ring-1 ring-brand-red/30 disabled:opacity-50"
                >
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {pinning ? "Memasang pin…" : `Pasang pin (${props.unpinned})`}
                </button>
              )}
              {receipt?.available && (
                <button
                  type="button"
                  onClick={() => setScanning(true)}
                  className="tap inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-surface px-3 text-xs font-semibold ring-1 ring-border/50"
                >
                  <Camera className="size-3.5" aria-hidden="true" />
                  Foto struk
                </button>
              )}
            </div>
            <TravoComposer
              chat={chat}
              inputRef={inputRef}
              leading={
                <button
                  type="button"
                  onClick={props.onAdd}
                  aria-label="Tambah manual"
                  className="tap grid size-10 shrink-0 place-items-center rounded-full bg-secondary"
                >
                  <Plus className="size-4" aria-hidden="true" />
                </button>
              }
            />
            {(guest || (remaining !== null && remaining <= 5)) && (
              <p className="mt-1 text-center text-[10px] text-muted-foreground">
                {guest ? "Mode tamu · " : ""}
                Sisa {remaining ?? 0} pesan hari ini
              </p>
            )}
          </div>
        </div>
      </FixedLayer>

      {scanning && receipt?.available && (
        <ReceiptScanner
          tripId={tripId}
          tripCurrency={props.currency}
          categories={props.categories ?? []}
          status={receipt}
          budget={props.budget ?? null}
          onClose={() => setScanning(false)}
          onChanged={async () => {
            await props.onChanged();
            toast.success("Struk dicatat di Biaya");
          }}
        />
      )}

      <AssistantProfileSheet
        open={profileOpen}
        onOpenChange={setProfileOpen}
        mood={mood}
        remaining={remaining}
        dailyLimit={status?.available ? status.dailyLimit : undefined}
        guest={guest}
        hasConversation={messages.length > 0}
        onReset={() => {
          setProfileOpen(false);
          setResetOpen(true);
        }}
      />

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Mulai obrolan baru?"
        description="Riwayat obrolan ini dihapus. Perubahan yang sudah diterapkan ke agenda dan anggaran tetap ada."
        confirmLabel="Hapus"
        destructive
        onConfirm={reset}
      />
    </>
  );
}
