import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUp, Camera, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { FixedLayer } from "@/components/motion-primitives";
import { ConfirmDialog, iosHeading } from "@/components/trip-ios";
import { ProposalCard } from "@/components/trip-assistant-cards";
import { ReceiptScanner } from "@/components/receipt-scanner";
import { getReceiptScanStatus } from "@/lib/receipt-scan.fn";
import type { ReceiptScanStatus } from "@/lib/receipt-scan";
import {
  applyTripAssistantProposal,
  dismissTripAssistantProposal,
  loadTripAssistant,
  resetTripAssistant,
  sendTripAssistantMessage,
  streamTripAssistantMessage,
  undoTripAssistantProposal,
} from "@/lib/trip-assistant.fn";
import {
  ASSISTANT_MAX_TEXT,
  buildNudges,
  type AssistantIntent,
  type AssistantMessage,
  type AssistantNudge,
  type AssistantStatus,
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

function Bubble({ role, children }: { role: "user" | "assistant"; children: ReactNode }) {
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
      <span className="mb-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-red text-white">
        <Sparkles className="size-3" aria-hidden="true" />
      </span>
      <p className="max-w-[84%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-surface px-3 py-2 text-[13px] leading-[1.4] ring-1 ring-border/50">
        {children}
      </p>
    </div>
  );
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
  const [statusText, setStatusText] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptScanStatus | null>(null);
  const [scanning, setScanning] = useState(false);
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

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const liveChips =
    !sending && lastAssistant && lastAssistant.id === messages[messages.length - 1]?.id
      ? lastAssistant.chips
      : null;

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
      await applyTripAssistantProposal({ data: { proposalId } });
      setProposalStatus(proposalId, "applied");
      const applied = messages.find((m) => m.proposal?.id === proposalId)?.proposal?.payload;
      if (applied?.kind === "agenda")
        props.onFocusDays?.([...new Set(applied.items.map((i) => i.date).filter(Boolean))].sort());
      await props.onChanged();
      toast.success("Usulan diterapkan", {
        action: { label: "Urungkan", onClick: () => void undo(proposalId) },
        duration: 6000,
      });
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

  const greeting = `Hai! Saya asisten perjalananmu ke ${props.destination}. Saya rangkum dulu kondisi perjalananmu ya.`;
  const introDone = introShown >= introLength;
  const outro = nudges.length
    ? `${nudges.map((n) => n.text).join(" ")} Mau mulai dari mana?`
    : "Tanya apa saja, atau minta saya menyusun agenda, anggaran, dan checklist.";

  return (
    <>
      <div className="mt-3 flex items-end justify-between">
        <h2 className={`${iosHeading} px-1`}>Asisten Djiwa</h2>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setResetOpen(true)}
            className="tap px-1 pb-1.5 text-xs font-semibold text-muted-foreground"
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
        {!introDone && (
          <div
            className="flex items-end gap-1.5"
            role="status"
            aria-label="Asisten sedang mengetik"
          >
            <span className="mb-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-red text-white">
              <Sparkles className="size-3" aria-hidden="true" />
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
        )}
        {introDone && <Bubble role="assistant">{outro}</Bubble>}
      </div>

      <div className="mt-3 space-y-2">
        {(introDone ? messages : []).map((m) => (
          <div key={m.id} className="space-y-2">
            <Bubble role={m.role}>{m.content}</Bubble>
            {m.proposal && (
              <ProposalCard
                proposal={m.proposal}
                currency={props.currency}
                busy={busyProposal === m.proposal.id}
                onApply={() => void apply(m.proposal!.id)}
                onUndo={() => void undo(m.proposal!.id)}
                onDismiss={() => void dismiss(m.proposal!.id)}
              />
            )}
          </div>
        ))}
        {sending && (
          <div
            className="flex items-end gap-1.5"
            role="status"
            aria-label="Asisten sedang menjawab"
          >
            <span className="mb-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-red text-white">
              <Sparkles className="size-3" aria-hidden="true" />
            </span>
            {streamText ? (
              <p
                className="max-w-[84%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-surface px-3 py-2 text-[13px] leading-[1.4] ring-1 ring-border/50"
                data-testid="assistant-streaming"
              >
                {streamText}
                {statusText && (
                  <span className="mt-1 block text-[11px] text-muted-foreground">{statusText}</span>
                )}
              </p>
            ) : (
              <span className="flex gap-1 rounded-2xl rounded-bl-md bg-surface px-3 py-3 ring-1 ring-border/50">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </span>
            )}
          </div>
        )}
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
        {liveChips && (
          <div className="ml-8 flex flex-wrap gap-1.5" data-testid="assistant-chips">
            {liveChips.options.map((option) => {
              const on = picked.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() =>
                    liveChips.multi
                      ? setPicked((list) =>
                          on ? list.filter((x) => x !== option) : [...list, option],
                        )
                      : void send(option)
                  }
                  aria-pressed={liveChips.multi ? on : undefined}
                  className={`tap min-h-8 rounded-full px-3 text-xs font-semibold ring-1 ${
                    on
                      ? "bg-brand-red-soft text-brand-red ring-brand-red"
                      : "bg-surface ring-border/50"
                  }`}
                >
                  {option}
                </button>
              );
            })}
            {liveChips.multi && picked.length > 0 && (
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
        <div ref={endRef} className="scroll-mb-44" />
      </div>

      <FixedLayer>
        <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40">
          <div className="mx-auto max-w-md border-t border-border/60 bg-background/95 px-3 pb-2 pt-1.5 backdrop-blur-xl">
            <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1.5 [scrollbar-width:none]">
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
                placeholder="Tanya atau minta apa saja…"
                aria-label="Pesan untuk asisten"
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
