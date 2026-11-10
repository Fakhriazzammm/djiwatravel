import type { ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { Link } from "@tanstack/react-router";
import { ArrowUp } from "lucide-react";
import { AssistantMascot, type MascotMood } from "@/components/assistant-mascot";
import { AssistantBlocks, RichText } from "@/components/assistant-blocks";
import { InlineAnswer } from "@/components/inline-answer";
import { TravoCards } from "@/components/travo-cards";
import { ProposalCard } from "@/components/trip-assistant-cards";
import type { TravoChatState } from "@/hooks/use-travo-chat";
import { useSmoothText } from "@/hooks/use-smooth-text";
import { useTypedHint } from "@/hooks/use-typed-hint";
import {
  ASSISTANT_MAX_TEXT,
  ASSISTANT_NAME,
  TRAVO_HINTS_GENERAL,
  TRAVO_HINTS_TRIP,
  visibleChips,
  type AssistantMessage,
} from "@/lib/trip-assistant";

/* The pieces of every Travo chat. The Ringkas chat and the /travo page assemble these, so a change here shows in both. */

type TravoChat = TravoChatState;

export function Bubble({
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
export function TypingBubble({ label }: { label: string }) {
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

/** One chat message with everything under it: summary card (slot), blocks, proposal and quick replies. */
export function TravoMessage({
  message: m,
  last,
  chat,
  currency,
  extra,
  onShare,
  proposalHref,
}: {
  message: AssistantMessage;
  /** The last message shows its quick replies. */
  last: boolean;
  chat: TravoChat;
  currency: string;
  /** A card only this page knows (the "Ringkas semua" summary). */
  extra?: ReactNode;
  onShare?: (() => void) | undefined;
  /** When the page cannot apply proposals itself it links to where they can be. */
  proposalHref?: { tripId: string } | undefined;
}) {
  const chips = !chat.sending && last ? visibleChips(m.chips, m.proposal?.status ?? null) : null;
  const { picked, setPicked, send } = chat;
  // A plan comes as several proposals: the last one carries "Terapkan semua".
  const openProposals = chat.messages.filter((x) => x.proposal?.status === "proposed");
  const applyAllIds =
    openProposals.length >= 2 && openProposals[openProposals.length - 1]?.id === m.id
      ? openProposals.map((x) => x.proposal!.id)
      : null;
  const footer =
    m.proposal || chips || m.blocks.length > 0 || extra || m.cards?.length || applyAllIds ? (
      <>
        {extra}
        {m.cards?.length ? <TravoCards cards={m.cards} chat={chat} /> : null}
        {m.blocks.length > 0 && (
          <AssistantBlocks blocks={m.blocks} onAsk={(text) => void send(text)} />
        )}
        {m.proposal && proposalHref ? (
          <Link
            to="/my-trips/$tripId"
            params={{ tripId: proposalHref.tripId }}
            className="tap mx-3 mb-2 block rounded-xl bg-secondary px-3 py-2 text-[12px] font-semibold"
          >
            Usulan: {m.proposal.title}. Tinjau dan terapkan di halaman trip.
          </Link>
        ) : (
          m.proposal && (
            <ProposalCard
              embedded
              proposal={m.proposal}
              currency={currency}
              busy={chat.busyProposal === m.proposal.id}
              onApply={() => void chat.apply(m.proposal!.id)}
              onUndo={() => void chat.undo(m.proposal!.id)}
              onDismiss={() => void chat.dismiss(m.proposal!.id)}
              onSwap={(index) => void chat.swapPlace(m.proposal!.id, index)}
              {...(onShare ? { onShare } : {})}
            />
          )
        )}
        {chips && chips.options.length > 0 && (
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
        {applyAllIds && !proposalHref && (
          <div className="border-t border-border/60 px-3 py-2">
            <button
              type="button"
              disabled={chat.busyProposal !== null}
              onClick={() => void chat.applyAll(applyAllIds)}
              className="tap min-h-10 w-full rounded-xl bg-brand-red px-3 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {chat.busyProposal !== null
                ? "Menerapkan…"
                : `Terapkan semua (${applyAllIds.length})`}
            </button>
          </div>
        )}
        {chips?.input && (
          <InlineAnswer placeholder={chips.input} onSubmit={(value) => void send(value)} />
        )}
      </>
    ) : undefined;
  return (
    <Bubble role={m.role} footer={footer}>
      {m.content}
    </Bubble>
  );
}

/** The answer while it is being written: dots first, then the streamed text. */
export function TravoLive({ chat }: { chat: TravoChat }) {
  const typed = useSmoothText(chat.streamText, chat.streamText.length > 0);
  if (!chat.sending) return null;
  if (!chat.streamText) return <TypingBubble label={`${ASSISTANT_NAME} sedang menjawab`} />;
  return (
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
        {typed.length < chat.streamText.length && (
          <span
            className="ml-0.5 inline-block h-3 w-0.5 translate-y-0.5 animate-pulse bg-brand-red"
            aria-hidden="true"
          />
        )}
        {chat.statusText && (
          <span className="mt-1 block text-[11px] text-muted-foreground">{chat.statusText}</span>
        )}
      </p>
    </div>
  );
}

/** The text line and the send button, the same everywhere. */
export function TravoComposer({
  chat,
  inputRef,
  leading,
  forTrip = false,
}: {
  chat: TravoChat;
  inputRef?: React.Ref<HTMLInputElement>;
  /** A button before the field (Ringkas puts its manual-add "+" here). */
  leading?: ReactNode;
  /** A trip chat suggests trip questions; a general chat suggests eSIM, flights, orders... */
  forTrip?: boolean;
}) {
  // The placeholder types the examples out while the field is empty; still text with reduced motion.
  const reduce = useReducedMotion();
  const placeholder = useTypedHint(
    chat.draft === "" && !chat.sending,
    reduce,
    forTrip ? TRAVO_HINTS_TRIP : TRAVO_HINTS_GENERAL,
    `Tanya ${ASSISTANT_NAME} apa saja…`,
    `Tanya ${ASSISTANT_NAME}: `,
  );
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void chat.send(chat.draft);
      }}
    >
      {leading}
      <input
        ref={inputRef}
        value={chat.draft}
        onChange={(event) => chat.setDraft(event.target.value)}
        maxLength={ASSISTANT_MAX_TEXT}
        placeholder={placeholder}
        aria-label={`Pesan untuk ${ASSISTANT_NAME}`}
        enterKeyHint="send"
        className="min-h-10 min-w-0 flex-1 rounded-full border border-border bg-surface px-3.5 text-[13px] outline-none focus:border-brand-red"
      />
      <button
        type="submit"
        disabled={chat.sending || !chat.draft.trim()}
        aria-label="Kirim"
        className="tap grid size-10 shrink-0 place-items-center rounded-full bg-brand-red text-white disabled:opacity-40"
      >
        <ArrowUp className="size-4" aria-hidden="true" />
      </button>
    </form>
  );
}
