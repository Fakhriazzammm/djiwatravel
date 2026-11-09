import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getReceiptScanStatus } from "@/lib/receipt-scan.fn";
import type { ReceiptScanStatus } from "@/lib/receipt-scan";
import { pinTripPlaces, recordTripSummary } from "@/lib/trip-assistant.fn";
import { QUICK } from "@/lib/trip-assistant";
import type { SummaryAction, TripSummary } from "@/lib/trip-summary";
import type { TravoChatState } from "@/hooks/use-travo-chat";

/**
 * What a trip chat can do besides talk: "Ringkas semua", pin places on the map, scan a receipt.
 * Used by the Ringkas chat and by /travo whenever the conversation is a trip, so both behave the same.
 */
export function useTripChatTools(o: {
  chat: TravoChatState;
  tripId: string | null;
  summary?: TripSummary | undefined;
  /** Reloads the trip data the page shows after pins or receipts change it. */
  onChanged: () => Promise<unknown>;
  /** Runs before the summary exchange starts (Ringkas skips its staged intro). */
  onStart?: (() => void) | undefined;
}) {
  const { chat, tripId } = o;
  const [summarizing, setSummarizing] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptScanStatus | null>(null);
  const [scanning, setScanning] = useState(false);
  const status = chat.status;

  // Receipt scanning is for members; a guest or a switched-off scanner has no camera chip.
  useEffect(() => {
    if (!tripId || status?.available !== true || status.guest) return;
    let cancelled = false;
    void Promise.resolve()
      .then(() => getReceiptScanStatus())
      .then((r) => !cancelled && setReceipt(r))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status, tripId]);

  /** "Ringkas semua": the whole trip as one balloon, built on the spot from the page data (no AI call). */
  async function summarize() {
    if (!o.summary || !tripId || chat.sending || summarizing) return;
    chat.setNotice(null);
    o.onStart?.();
    setSummarizing(true);
    const stamp = Date.now();
    chat.setMessages((list) => [
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
    chat.setMessages((list) => [
      ...list,
      {
        id: `local-a-${stamp}`,
        role: "assistant",
        content: `Ini ringkasan lengkap **${o.summary?.destination || o.summary?.name || "perjalananmu"}**. Semua datanya dari halaman Agenda, Biaya, Checklist, dan Booking.`,
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

  async function pinPlaces() {
    if (!tripId) return;
    setPinning(true);
    try {
      const result = await pinTripPlaces({ data: { tripId } });
      await o.onChanged();
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

  const runSummaryAction = (action: SummaryAction) => {
    if (action === "pin") return void pinPlaces();
    const q = QUICK.find((item) => item.intent === (action === "plan" ? "plan" : action));
    if (q) void chat.send(q.text, q.intent);
  };

  return {
    summarizing,
    pinning,
    receipt,
    scanning,
    setScanning,
    summarize,
    pinPlaces,
    runSummaryAction,
  };
}

export type TripChatTools = ReturnType<typeof useTripChatTools>;
