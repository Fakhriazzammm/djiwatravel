import { Camera, MapPin, Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ReceiptScanner } from "@/components/receipt-scanner";
import type { TravoChatState } from "@/hooks/use-travo-chat";
import type { TripChatTools } from "@/hooks/use-trip-chat-tools";
import { QUICK } from "@/lib/trip-assistant";
import type { TripSummary } from "@/lib/trip-summary";

/** The row of trip shortcuts above the text field: the same chips on Ringkas and on /travo. */
export function TripToolsBar({
  chat,
  tools,
  summary,
  unpinned,
  quick = QUICK,
  onShare,
  onCatat,
}: {
  chat: TravoChatState;
  tools: TripChatTools;
  summary?: TripSummary | undefined;
  unpinned: number;
  /** The shortcuts, in the order the page wants them first. */
  quick?: typeof QUICK;
  onShare?: (() => void) | undefined;
  /** "Catat biaya" fills the field and focuses it. */
  onCatat: () => void;
}) {
  const { sending } = chat;
  return (
    <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1.5 [scrollbar-width:none]">
      {summary && (
        <button
          type="button"
          disabled={sending || tools.summarizing}
          onClick={() => void tools.summarize()}
          className="tap inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-brand-red px-3 text-xs font-bold text-white disabled:opacity-50"
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          Ringkas semua
        </button>
      )}
      {onShare && (
        <button
          type="button"
          onClick={onShare}
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
          onClick={() => void chat.send(q.text, q.intent)}
          className="tap min-h-8 shrink-0 rounded-full bg-surface px-3 text-xs font-semibold ring-1 ring-border/50 disabled:opacity-50"
        >
          {q.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onCatat}
        className="tap min-h-8 shrink-0 rounded-full bg-surface px-3 text-xs font-semibold ring-1 ring-border/50"
      >
        Catat biaya
      </button>
      {unpinned > 0 && (
        <button
          type="button"
          disabled={tools.pinning || sending}
          onClick={() => void tools.pinPlaces()}
          className="tap inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-brand-red-soft px-3 text-xs font-semibold text-brand-red ring-1 ring-brand-red/30 disabled:opacity-50"
        >
          <MapPin className="size-3.5" aria-hidden="true" />
          {tools.pinning ? "Memasang pin…" : `Pasang pin (${unpinned})`}
        </button>
      )}
      {tools.receipt?.available && (
        <button
          type="button"
          onClick={() => tools.setScanning(true)}
          className="tap inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-surface px-3 text-xs font-semibold ring-1 ring-border/50"
        >
          <Camera className="size-3.5" aria-hidden="true" />
          Foto struk
        </button>
      )}
    </div>
  );
}

/** The receipt scanner, opened from the "Foto struk" chip. */
export function TripToolsOverlays({
  tools,
  tripId,
  currency,
  categories,
  budget,
  onChanged,
}: {
  tools: TripChatTools;
  tripId: string;
  currency: string;
  categories: { id: string; name: string }[];
  budget: { budgetMinor: number; spentMinor: number } | null;
  onChanged: () => Promise<unknown>;
}) {
  if (!tools.scanning || !tools.receipt?.available) return null;
  return (
    <ReceiptScanner
      tripId={tripId}
      tripCurrency={currency}
      categories={categories}
      status={tools.receipt}
      budget={budget}
      onClose={() => tools.setScanning(false)}
      onChanged={async () => {
        await onChanged();
        toast.success("Struk dicatat di Biaya");
      }}
    />
  );
}
