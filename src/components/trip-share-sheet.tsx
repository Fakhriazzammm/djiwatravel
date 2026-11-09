import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { btnRed, btnSoft } from "@/components/shell";
import { ConfirmDialog } from "@/components/trip-ios";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { deleteTripShare, getTripShare, postTripShare } from "@/lib/my-trips.fn";
import { isTripAuthenticationError } from "@/lib/trip-actions";

export type ShareLink = { token: string; createdAt: string; handle?: string } | null;
export type ShareTripInfo = { id: string; name: string; destination_name: string };

export function ShareTripSheet({
  open,
  onOpenChange,
  trip,
  share,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: ShareTripInfo;
  share: ShareLink;
  onChanged: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl(
      share
        ? `${window.location.origin}/share/${share.handle ? `${share.handle}/` : ""}${share.token}`
        : "",
    );
  }, [share]);

  async function create() {
    setBusy(true);
    try {
      await postTripShare({ data: { tripId: trip.id } });
      toast.success("Tautan itinerary dibuat");
      await onChanged();
    } catch (cause) {
      toast.error(
        isTripAuthenticationError(cause)
          ? "Sesi berakhir. Masuk kembali untuk membagikan itinerary."
          : "Tautan belum dapat dibuat. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Tautan disalin");
    } catch {
      toast.error("Tautan belum dapat disalin.");
    }
  }

  async function shareNative() {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${trip.name} — itinerary`,
          text: `Itinerary ${trip.name} ke ${trip.destination_name}`,
          url,
        });
        return;
      } catch {
        // The user may dismiss the native sheet; fall back to copying.
      }
    }
    await copy();
  }

  async function revoke() {
    setBusy(true);
    try {
      await deleteTripShare({ data: { tripId: trip.id } });
      toast.success("Tautan dibagikan dicabut");
      setConfirmRevoke(false);
      await onChanged();
    } catch (cause) {
      toast.error(
        isTripAuthenticationError(cause)
          ? "Sesi berakhir. Masuk kembali untuk mencabut tautan."
          : "Tautan belum dapat dicabut. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-7"
      >
        <div
          className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/25"
          aria-hidden="true"
        />
        <SheetHeader className="mb-4 text-left">
          <SheetTitle>Bagikan itinerary</SheetTitle>
          <SheetDescription>
            Tautan baca-saja berisi nama perjalanan, tanggal, dan agenda. Pengeluaran, checklist,
            dan data pribadi tidak ikut dibagikan.
          </SheetDescription>
        </SheetHeader>

        {share ? (
          <div className="space-y-3">
            <div className="rounded-2xl bg-secondary/70 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tautan aktif
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Link2 className="size-4 shrink-0 text-brand-red" />
                <input
                  readOnly
                  value={url}
                  aria-label="Tautan itinerary"
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-h-10 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void copy()}
                className={`${btnSoft} min-h-10 rounded-xl`}
              >
                <Copy className="size-4" /> Salin
              </button>
              <button
                type="button"
                onClick={() => void shareNative()}
                className={`${btnRed} min-h-10 rounded-xl`}
              >
                <Share2 className="size-4" /> Bagikan
              </button>
            </div>
            <p className="px-1 text-[11px] leading-5 text-muted-foreground">
              Siapa pun yang memiliki tautan dapat membuka itinerary ini. Cabut tautan jika sudah
              tidak ingin dibagikan.
            </p>
            <button
              type="button"
              onClick={() => setConfirmRevoke(true)}
              disabled={busy}
              className="tap min-h-11 w-full rounded-xl text-sm font-semibold text-brand-red disabled:opacity-50"
            >
              {busy ? "Memproses…" : "Cabut tautan"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl bg-secondary/70 p-4 text-sm text-muted-foreground">
              Buat tautan baca-saja yang bisa dibuka tanpa login. Isinya hanya itinerary perjalanan.
            </div>
            <button
              type="button"
              onClick={() => void create()}
              disabled={busy}
              className={`${btnRed} min-h-10 rounded-xl`}
            >
              {busy ? "Membuat tautan…" : "Buat tautan bagikan"}
            </button>
          </div>
        )}
      </SheetContent>
      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Cabut tautan?"
        description="Orang lain tidak bisa lagi membuka itinerary ini."
        confirmLabel="Cabut"
        destructive
        busy={busy}
        onConfirm={revoke}
      />
    </Sheet>
  );
}

/**
 * Share sheet for a trip whose link is not loaded yet (the My Trips list and its tickets): it reads
 * the trip's current link when opened and re-reads after creating or revoking.
 */
export function TripShareDialog({
  trip,
  onOpenChange,
}: {
  trip: ShareTripInfo | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [share, setShare] = useState<ShareLink>(null);
  const tripId = trip?.id ?? null;

  const load = useCallback(async () => {
    if (!tripId) return;
    try {
      setShare(await getTripShare({ data: { tripId } }));
    } catch (cause) {
      setShare(null);
      toast.error(
        isTripAuthenticationError(cause)
          ? "Sesi berakhir. Masuk kembali untuk membagikan perjalanan."
          : "Status tautan belum bisa dimuat. Coba lagi.",
      );
    }
  }, [tripId]);

  useEffect(() => {
    setShare(null);
    void load();
  }, [load]);

  if (!trip) return null;
  return (
    <ShareTripSheet open onOpenChange={onOpenChange} trip={trip} share={share} onChanged={load} />
  );
}
