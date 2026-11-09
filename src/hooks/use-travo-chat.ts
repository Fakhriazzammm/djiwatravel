import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { MascotMood } from "@/components/assistant-mascot";
import {
  applyTripAssistantProposal,
  dismissTripAssistantProposal,
  loadTravo,
  loadTripAssistant,
  sendTripAssistantMessage,
  streamTripAssistantMessage,
  undoTripAssistantProposal,
} from "@/lib/trip-assistant.fn";
import {
  ASSISTANT_MAX_TEXT,
  type AssistantIntent,
  type AssistantMessage,
  type AssistantStatus,
  type ProposalView,
  type TravoScope,
} from "@/lib/trip-assistant";

type Options = {
  /** The trip chat embedded in Ringkas. Without it the hook drives the standalone Travo page. */
  tripId?: string | undefined;
  /** Standalone: the conversation to open (`?c=`). */
  conversationId?: string | undefined;
  /** Standalone: open the chat of this trip (`?trip=`). */
  tripParam?: string | undefined;
  /** Standalone: the topic a brand new conversation starts with. */
  scope?: TravoScope | undefined;
  onAvailability?: ((on: boolean) => void) | undefined;
  /** A message the page handles itself (for example "bagikan itinerary" opens the share sheet): true = not sent. */
  intercept?: ((text: string) => boolean) | undefined;
  /** Runs when a send starts (Ringkas uses it to skip the staged intro). */
  onSend?: (() => void) | undefined;
  /** A proposal was applied or undone: the page reloads the data it shows. */
  onChanged?: (() => Promise<unknown>) | undefined;
  /** A proposal was applied: its payload, so the page can follow it (map focus). */
  onApplied?: ((proposal: ProposalView) => void) | undefined;
  /** The first message of a general conversation created it. */
  onConversationCreated?: ((id: string) => void) | undefined;
};

/**
 * The one engine behind every Travo chat: loading, sending with streaming, quick replies and the
 * apply / undo / dismiss of proposals. The Ringkas chat and the /travo page only choose how it looks,
 * so a feature added here shows up in both.
 */
export function useTravoChat(options: Options) {
  const { tripId: embeddedTrip, conversationId, tripParam } = options;
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [loggedIn, setLoggedIn] = useState(true);
  const [ready, setReady] = useState(false);
  const [convId, setConvId] = useState<string | undefined>(conversationId);
  const [chatTrip, setChatTrip] = useState<string | null>(embeddedTrip ?? null);
  const [tripCurrency, setTripCurrency] = useState<string | null>(null);
  const [scope, setScope] = useState<TravoScope>(options.scope ?? "all");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busyProposal, setBusyProposal] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [streamText, setStreamText] = useState("");
  const [statusText, setStatusText] = useState<string | null>(null);
  const [cheer, setCheer] = useState(0);
  const latest = useRef(options);
  latest.current = options;
  const convRef = useRef<string | undefined>(conversationId);
  convRef.current = convId;
  const readyRef = useRef(false);
  readyRef.current = ready;

  /** Loads the conversation the page points at (trip chat, or a general one by id / trip). */
  const fetchConversation = useCallback(async () => {
    if (embeddedTrip) {
      const r = await loadTripAssistant({ data: { tripId: embeddedTrip } });
      return { status: r.status, loggedIn: true, messages: r.messages } as const;
    }
    const r = await loadTravo({
      data: conversationId ? { conversationId } : tripParam ? { tripId: tripParam } : {},
    });
    return {
      status: r.status,
      loggedIn: r.loggedIn,
      messages: r.messages,
      conversation: r.conversation,
    } as const;
  }, [embeddedTrip, conversationId, tripParam]);

  useEffect(() => {
    // The address just caught up with a chat that is already on screen: nothing to reload.
    if (!embeddedTrip && conversationId && conversationId === convRef.current && readyRef.current)
      return;
    let cancelled = false;
    setReady(false);
    fetchConversation()
      .then((r) => {
        if (cancelled) return;
        setStatus(r.status);
        setLoggedIn(r.loggedIn);
        setMessages(r.messages);
        if (r.status.available) setRemaining(r.status.remaining);
        if ("conversation" in r && r.conversation) {
          setConvId(r.conversation.id ?? conversationId);
          setChatTrip(r.conversation.tripId);
          setTripCurrency(r.conversation.tripCurrency ?? null);
          setScope(r.conversation.scope);
        }
        setReady(true);
        latest.current.onAvailability?.(r.status.available);
      })
      .catch(() => {
        if (cancelled) return;
        setReady(true);
        latest.current.onAvailability?.(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchConversation, embeddedTrip, conversationId]);

  const send = useCallback(
    async (text: string, intent?: AssistantIntent, topic?: TravoScope) => {
      const value = text.trim().slice(0, ASSISTANT_MAX_TEXT);
      if (!value || sending) return;
      if (latest.current.intercept?.(value)) {
        setDraft("");
        return;
      }
      latest.current.onSend?.();
      setNotice(null);
      setPicked([]);
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
      const input = embeddedTrip
        ? { tripId: embeddedTrip, text: value, ...(intent ? { intent } : {}) }
        : {
            text: value,
            ...(convId
              ? { conversationId: convId }
              : chatTrip
                ? { tripId: chatTrip }
                : { scope: topic ?? scope }),
            ...(intent ? { intent } : {}),
          };
      const finish = async (result: Awaited<ReturnType<typeof sendTripAssistantMessage>>) => {
        if (result.status === "ok") {
          const [first, ...later] = result.messages.filter((m) => m.role === "assistant");
          const asked = result.messages.filter((m) => m.role !== "assistant");
          // A double chat arrives bubble by bubble, with the typing dots in between, like a person texting.
          const staged = later.length > 0 && first !== undefined;
          setMessages((list) => [
            ...list.filter((m) => m.id !== temp.id),
            ...asked,
            ...(staged ? [first] : result.messages.filter((m) => m.role === "assistant")),
          ]);
          if (staged) {
            setStreamText("");
            for (const bubble of later) {
              await new Promise((resolve) => window.setTimeout(resolve, 650));
              setMessages((list) => [...list, bubble]);
            }
          }
          setRemaining(result.remaining);
          if (!embeddedTrip && result.conversationId && !convId) {
            setConvId(result.conversationId);
            latest.current.onConversationCreated?.(result.conversationId);
          }
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
            if (event.type === "delta") setStreamText((t) => t + event.text);
            else if (event.type === "status") setStatusText(event.text);
            else result = event.result;
          }
          if (!result) throw new Error("stream_incomplete");
          await finish(result);
        } catch (streamError) {
          if (started) {
            // The connection broke mid-answer: the server may have stored it, so look before resending.
            const fresh = await fetchConversation().catch(() => null);
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
          await finish(await sendTripAssistantMessage({ data: input }));
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
    [sending, embeddedTrip, convId, chatTrip, scope, fetchConversation],
  );

  const setProposalStatus = (id: string, next: ProposalView["status"]) =>
    setMessages((list) =>
      list.map((m) =>
        m.proposal?.id === id ? { ...m, proposal: { ...m.proposal, status: next } } : m,
      ),
    );

  const undo = async (proposalId: string) => {
    setBusyProposal(proposalId);
    try {
      await undoTripAssistantProposal({ data: { proposalId } });
      setProposalStatus(proposalId, "undone");
      await latest.current.onChanged?.();
      toast.success("Dikembalikan seperti semula");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Belum bisa dikembalikan. Coba lagi.");
    } finally {
      setBusyProposal(null);
    }
  };

  const apply = async (proposalId: string) => {
    setBusyProposal(proposalId);
    try {
      const result = await applyTripAssistantProposal({ data: { proposalId } });
      setProposalStatus(proposalId, "applied");
      setCheer((n) => n + 1);
      const applied = messages.find((m) => m.proposal?.id === proposalId)?.proposal;
      if (applied) latest.current.onApplied?.(applied);
      await latest.current.onChanged?.();
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
  };

  const dismiss = async (proposalId: string) => {
    setProposalStatus(proposalId, "dismissed");
    try {
      await dismissTripAssistantProposal({ data: { proposalId } });
    } catch {
      /* the card is already dimmed; a failed save only means it shows again next time */
    }
  };

  /** A fresh empty chat on the standalone page (the history keeps the old one). */
  const startNew = () => {
    setMessages([]);
    setConvId(undefined);
    setChatTrip(null);
    setTripCurrency(null);
    setScope("all");
    setNotice(null);
  };

  return {
    status,
    loggedIn,
    ready,
    convId,
    chatTrip,
    tripCurrency,
    scope,
    setScope,
    messages,
    setMessages,
    draft,
    setDraft,
    sending,
    busyProposal,
    picked,
    setPicked,
    notice,
    setNotice,
    remaining,
    streamText,
    statusText,
    cheer,
    send,
    apply,
    undo,
    dismiss,
    startNew,
  };
}

export type TravoChatState = ReturnType<typeof useTravoChat>;

/** What the mascot should be doing, from the chat state. */
export function travoMood(chat: TravoChatState, idle: MascotMood = "idle"): MascotMood {
  return chat.sending ? (chat.streamText ? "talking" : "thinking") : idle;
}
