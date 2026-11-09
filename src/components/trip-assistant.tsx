import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUp, Camera, MapPin, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useReducedMotion } from "motion/react";
import { FixedLayer } from "@/components/motion-primitives";
import { ConfirmDialog } from "@/components/trip-ios";
import {
  AssistantMascot,
  AssistantProfileSheet,
  type MascotMood,
} from "@/components/assistant-mascot";
import { ProposalCard } from "@/components/trip-assistant-cards";
import { AssistantBlocks, RichText } from "@/components/assistant-blocks";
import { TripSummaryCard } from "@/components/trip-summary-card";
import { ReceiptScanner } from "@/components/receipt-scanner";
import { getReceiptScanStatus } from "@/lib/receipt-scan.fn";
import type { ReceiptScanStatus } from "@/lib/receipt-scan";
import type { SummaryAction, TripSummary } from "@/lib/trip-summary";
import {
  applyTripAssistantProposal,
  dismissTripAssistantProposal,
  loadTripAssistant,
  recordTripSummary,
  pinTripPlaces,
  resetTripAssistant,
  sendTripAssistantMessage,
  streamTripAssistantMessage,
  undoTripAssistantProposal,
} from "@/lib/trip-assistant.fn";
import {
  ASSISTANT_MAX_TEXT,
  ASSISTANT_NAME,
  buildNudges,
  type AssistantIntent,
  type AssistantMessage,
  type AssistantNudge,
  type AssistantStatus,
  visibleChips,
  type ProposalView,
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

const QUICK: { label: string; intent: AssistantIntent; text: string }[] = [
  {
    label: "Buat itinerary",
    intent: "plan",
    text: "Buatkan itinerary untuk hari yang masih kosong.",
  },
  { label: "Atur anggaran", intent: "budget", text: "Bantu atur anggaran perjalanan ini." },
  {
    label: "Rapikan agenda",
    intent: "tidy",
    text: "Rapikan agenda saya: cek bentrok jam, jam buka, dan urutan.",
  },
  {
    label: "Cek checklist",
    intent: "checklist",
    text: "Apa saja persiapan yang belum ada di checklist saya?",
  },
];

function Bubble({
  role,
  children,
  mood = "idle",
  footer,
}: {
  role: "user" | "assistant";
  children: ReactNode;
  mood?: MascotMood;
  /** Extra content inside the assistant's balloon: a proposal card and quick replies. */
  footer?: ReactNode;
}) {
  if (role === "user")
    return (
      <div className="flex justify-end">
        <p className="max-w-[84%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-red px-3 py-2 text-[13px] leading-[1.4] text-white">
          {children}
        </p>
      </div>
    );
  return (
    <div className="flex items-end gap-1.5">
      <span className="mb-0.5">
        <AssistantMascot size={28} mood={mood} />
      </span>
      <div
        className={`overflow-hidden rounded-2xl rounded-bl-md bg-surface ring-1 ring-border/50 ${footer ? "min-w-0 flex-1" : "max-w-[84%]"}`}
      >
        <p className="whitespace-pre-wrap px-3 py-2 text-[13px] leading-[1.4]">
          {typeof children === "string" ? <RichText text={children} /> : children}
        </p>
        {footer}
      </div>
    </div>
  );
}

/** Dots shown while the assistant is thinking or typing; the mascot thinks along. */
function TypingBubble({ label }: { label: string }) {
  return (
    <div className="flex items-end gap-1.5" role="status" aria-label={label}>
      <span className="mb-0.5">
        <AssistantMascot size={28} mood="thinking" />
      </span>
      <span className="flex gap-1 rounded-2xl rounded-bl-md bg-surface px-3 py-3 ring-1 ring-border/50">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

/**
 * Types the streamed reply out smoothly: the model delivers text in bursts, so the screen catches
 * up a few characters per frame instead of jumping. Reduced motion shows it as it arrives.
 */
function useSmoothText(target: string, active: boolean) {
  const reduce = Boolean(useReducedMotion());
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!active || reduce) return;
    const timer = window.setInterval(() => {
      setShown((n) => {
        if (target.length === 0) return 0;
        if (n >= target.length) return n;
        return Math.min(target.length, n + Math.max(1, Math.ceil((target.length - n) / 8)));
      });
    }, 24);
    return () => window.clearInterval(timer);
  }, [target, active, reduce]);
  return reduce || !active ? target : target.slice(0, Math.min(shown, target.length));
}

/**
 * The AI conversation under the Ringkas map. The Ringkas cards (agenda, attention, budget) sit
 * inside it, then the conversation: the assistant asks, answers and proposes; the traveler taps
 * quick replies, types, and applies or undoes each proposal. When the assistant is off (Admin
 * switch, no key, guests not allowed) only the static cards render.
 */
export function TripAssistant(props: Props) {
  const { tripId, onAvailability } = props;
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busyProposal, setBusyProposal] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [streamText, setStreamText] = useState("");
  const typed = useSmoothText(streamText, streamText.length > 0);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptScanStatus | null>(null);
  const [scanning, setScanning] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [cheer, setCheer] = useState(0);
  // How many intro messages are on screen. They arrive one by one, like the assistant talking.
  const introLength = props.intro?.length ?? 0;
  const [introShown, setIntroShown] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTripAssistant({ data: { tripId } })
      .then((result) => {
        if (cancelled) return;
        setStatus(result.status);
        setMessages(result.messages);
        if (result.status.available) setRemaining(result.status.remaining);
        onAvailability(result.status.available);
        // Receipt scanning is for members; a guest or a switched-off scanner has no camera chip.
        if (result.status.available && !result.status.guest)
          void Promise.resolve()
            .then(() => getReceiptScanStatus())
            .then((r) => !cancelled && setReceipt(r))
            .catch(() => undefined);
      })
      .catch(() => {
        if (!cancelled) onAvailability(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId, onAvailability]);

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

  const send = useCallback(
    async (text: string, intent?: AssistantIntent) => {
      const value = text.trim().slice(0, ASSISTANT_MAX_TEXT);
      if (!value || sending) return;
      setNotice(null);
      setPicked([]);
      setIntroShown(introLength);
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
      setStatusText(null);
      const input = { tripId, text: value, ...(intent ? { intent } : {}) };
      const finish = (result: Awaited<ReturnType<typeof sendTripAssistantMessage>>) => {
        if (result.status === "ok") {
          setMessages((list) => [...list.filter((m) => m.id !== temp.id), ...result.messages]);
          setRemaining(result.remaining);
        } else {
          setMessages((list) => list.filter((m) => m.id !== temp.id));
          setDraft(value);
          setNotice(result.message);
          if (result.status === "limit") setRemaining(0);
        }
      };
      let started = false;
      try {
        try {
          // The reply arrives while the model writes it; `done` carries the stored messages.
          const stream = await streamTripAssistantMessage({ data: input });
          let result: Awaited<ReturnType<typeof sendTripAssistantMessage>> | null = null;
          for await (const event of stream) {
            started = true;
            if (event.type === "delta") setStreamText((text) => text + event.text);
            else if (event.type === "status") setStatusText(event.text);
            else result = event.result;
          }
          if (!result) throw new Error("stream_incomplete");
          finish(result);
        } catch (streamError) {
          if (started) {
            // The connection broke mid-answer: the server may have stored it, so look before resending.
            const fresh = await loadTripAssistant({ data: { tripId } }).catch(() => null);
            const last = fresh?.messages[fresh.messages.length - 1];
            if (
              fresh &&
              last?.role === "assistant" &&
              fresh.messages.some((m) => m.content === value)
            ) {
              setMessages(fresh.messages);
              return;
            }
            throw streamError;
          }
          // Streaming is an extra: without it the same turn runs as one request.
          finish(await sendTripAssistantMessage({ data: input }));
        }
      } catch {
        setMessages((list) => list.filter((m) => m.id !== temp.id));
        setDraft(value);
        setNotice("Pesan belum terkirim. Periksa koneksi lalu coba lagi.");
      } finally {
        setSending(false);
        setStreamText("");
        setStatusText(null);
      }
    },
    [sending, tripId, introLength],
  );

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

  const setProposalStatus = (id: string, next: ProposalView["status"]) =>
    setMessages((list) =>
      list.map((m) =>
        m.proposal?.id === id ? { ...m, proposal: { ...m.proposal, status: next } } : m,
      ),
    );

  async function undo(proposalId: string) {
    setBusyProposal(proposalId);
    try {
      await undoTripAssistantProposal({ data: { proposalId } });
      setProposalStatus(proposalId, "undone");
      await props.onChanged();
      toast.success("Dikembalikan seperti semula");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Belum bisa dikembalikan. Coba lagi.");
    } finally {
      setBusyProposal(null);
    }
  }

  async function apply(proposalId: string) {
    setBusyProposal(proposalId);
    try {
      const result = await applyTripAssistantProposal({ data: { proposalId } });
      setProposalStatus(proposalId, "applied");
      setCheer((n) => n + 1);
      const applied = messages.find((m) => m.proposal?.id === proposalId)?.proposal?.payload;
      if (applied?.kind === "agenda")
        props.onFocusDays?.([...new Set(applied.items.map((i) => i.date).filter(Boolean))].sort());
      await props.onChanged();
      toast.success(
        result.pinned > 0
          ? `Usulan diterapkan · ${result.pinned} pin ditambahkan di peta`
          : "Usulan diterapkan",
        {
          action: { label: "Urungkan", onClick: () => void undo(proposalId) },
          duration: 6000,
        },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Usulan belum bisa diterapkan.");
    } finally {
      setBusyProposal(null);
    }
  }

  async function dismiss(proposalId: string) {
    setProposalStatus(proposalId, "dismissed");
    try {
      await dismissTripAssistantProposal({ data: { proposalId } });
    } catch {
      /* the card is already dimmed; a failed save only means it shows again next time */
    }
  }

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

  const mood: MascotMood = sending
    ? streamText
      ? "talking"
      : "thinking"
    : !introDone
      ? "talking"
      : "idle";
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
          cheer={cheer}
          label={`Profil ${ASSISTANT_NAME}`}
          onPress={() => setProfileOpen(true)}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight">{ASSISTANT_NAME}</p>
          <p className="truncate text-[11px] text-muted-foreground" aria-live="polite">
            {statusLine}
          </p>
        </div>
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
        {(introDone ? messages : []).map((m) => {
          const chips =
            !sending && m.id === messages[messages.length - 1]?.id
              ? visibleChips(m.chips, m.proposal?.status ?? null)
              : null;
          const isSummary =
            m.role === "assistant" && m.local === "summary" && Boolean(props.summary);
          const footer =
            m.proposal || chips || m.blocks.length > 0 || isSummary ? (
              <>
                {isSummary && props.summary && (
                  <TripSummaryCard
                    summary={props.summary}
                    tripId={tripId}
                    onAction={runSummaryAction}
                  />
                )}
                {m.blocks.length > 0 && (
                  <AssistantBlocks blocks={m.blocks} onAsk={(text) => void send(text)} />
                )}
                {m.proposal && (
                  <ProposalCard
                    embedded
                    proposal={m.proposal}
                    currency={props.currency}
                    busy={busyProposal === m.proposal.id}
                    onApply={() => void apply(m.proposal!.id)}
                    onUndo={() => void undo(m.proposal!.id)}
                    onDismiss={() => void dismiss(m.proposal!.id)}
                  />
                )}
                {chips && (
                  <div
                    className="flex flex-wrap gap-1.5 border-t border-border/60 px-3 py-2"
                    data-testid="assistant-chips"
                  >
                    {chips.options.map((option) => {
                      const on = picked.includes(option);
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() =>
                            chips.multi
                              ? setPicked((list) =>
                                  on ? list.filter((x) => x !== option) : [...list, option],
                                )
                              : void send(option)
                          }
                          aria-pressed={chips.multi ? on : undefined}
                          className={`tap min-h-8 rounded-full px-3 text-xs font-semibold ring-1 ${
                            on
                              ? "bg-brand-red-soft text-brand-red ring-brand-red"
                              : "bg-secondary ring-transparent"
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                    {chips.multi && picked.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void send(picked.join(", "))}
                        className="tap min-h-8 rounded-full bg-brand-red px-3 text-xs font-bold text-white"
                      >
                        Kirim ({picked.length})
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : undefined;
          return (
            <Bubble key={m.id} role={m.role} footer={footer}>
              {m.content}
            </Bubble>
          );
        })}
        {sending &&
          (streamText ? (
            <div
              className="flex items-end gap-1.5"
              role="status"
              aria-label={`${ASSISTANT_NAME} sedang menjawab`}
            >
              <span className="mb-0.5">
                <AssistantMascot size={28} mood="talking" />
              </span>
              <p
                className="max-w-[84%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-surface px-3 py-2 text-[13px] leading-[1.4] ring-1 ring-border/50"
                data-testid="assistant-streaming"
              >
                {typed}
                {typed.length < streamText.length && (
                  <span
                    className="ml-0.5 inline-block h-3 w-0.5 translate-y-0.5 animate-pulse bg-brand-red"
                    aria-hidden="true"
                  />
                )}
                {statusText && (
                  <span className="mt-1 block text-[11px] text-muted-foreground">{statusText}</span>
                )}
              </p>
            </div>
          ) : (
            <TypingBubble label={`${ASSISTANT_NAME} sedang menjawab`} />
          ))}
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
                  setDraft("Catat ");
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
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void send(draft);
              }}
            >
              <button
                type="button"
                onClick={props.onAdd}
                aria-label="Tambah manual"
                className="tap grid size-10 shrink-0 place-items-center rounded-full bg-secondary"
              >
                <Plus className="size-4" aria-hidden="true" />
              </button>
              <input
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={ASSISTANT_MAX_TEXT}
                placeholder="Tanya Travo apa saja…"
                aria-label={`Pesan untuk ${ASSISTANT_NAME}`}
                enterKeyHint="send"
                className="min-h-10 min-w-0 flex-1 rounded-full border border-border bg-surface px-3.5 text-[13px] outline-none focus:border-brand-red"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                aria-label="Kirim"
                className="tap grid size-10 shrink-0 place-items-center rounded-full bg-brand-red text-white disabled:opacity-40"
              >
                <ArrowUp className="size-4" aria-hidden="true" />
              </button>
            </form>
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
