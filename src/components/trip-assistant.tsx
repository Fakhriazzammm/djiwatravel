import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
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
import { TripToolsBar, TripToolsOverlays } from "@/components/trip-chat-tools";
import { travoMood, useTravoChat } from "@/hooks/use-travo-chat";
import { useTripChatTools } from "@/hooks/use-trip-chat-tools";
import type { TripSummary } from "@/lib/trip-summary";
import { resetTripAssistant } from "@/lib/trip-assistant.fn";
import {
  ASSISTANT_NAME,
  QUICK,
  SHARE_WORDS,
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
  const [profileOpen, setProfileOpen] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const tools = useTripChatTools({
    chat,
    tripId,
    summary: props.summary,
    onChanged: props.onChanged,
    onStart: () => setIntroShown(introLength),
  });

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
                  onAction={tools.runSummaryAction}
                  {...(props.onShare ? { onShare: props.onShare } : {})}
                />
              ) : undefined
            }
          />
        ))}
        <TravoLive chat={chat} />
        {tools.summarizing && <TypingBubble label={`${ASSISTANT_NAME} sedang meringkas`} />}
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
            <TripToolsBar
              chat={chat}
              tools={tools}
              summary={props.summary}
              unpinned={props.unpinned ?? 0}
              quick={quick}
              onShare={props.onShare}
              onCatat={() => {
                chat.setDraft("Catat ");
                inputRef.current?.focus();
              }}
            />
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

      <TripToolsOverlays
        tools={tools}
        tripId={tripId}
        currency={props.currency}
        categories={props.categories ?? []}
        budget={props.budget ?? null}
        onChanged={props.onChanged}
      />

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
