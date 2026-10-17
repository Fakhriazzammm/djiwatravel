import { CloudOff, Trash2, WifiOff } from "lucide-react";
import { snapshotAgeLabel, type TravelSnapshot } from "@/lib/offline-travel-snapshot";

/**
 * Tells the customer, in plain words, that what they are looking at was cached on the device
 * and when — an offline copy must never read as live state.
 */
export function OfflineSnapshotBanner({
  snapshot,
  stale,
  onClear,
}: {
  snapshot: TravelSnapshot | null;
  stale: boolean;
  onClear?: (() => void) | undefined;
}) {
  if (!snapshot) return null;
  const age = snapshotAgeLabel(snapshot.savedAt);

  return (
    <section
      className={`mt-4 flex items-start gap-3 rounded-2xl p-4 ${
        stale ? "bg-brand-red-soft" : "bg-secondary"
      }`}
      data-testid="offline-snapshot"
    >
      {stale ? (
        <WifiOff className="mt-0.5 size-4 shrink-0 text-brand-red" aria-hidden="true" />
      ) : (
        <CloudOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">
          {stale ? "Salinan offline sudah lama" : "Salinan offline tersimpan"}
        </p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {snapshot.qr
            ? `QR dan struk bisa dibuka tanpa internet. Tersimpan ${age}.`
            : `Struk bisa dibuka tanpa internet. Tersimpan ${age}.`}
          {stale ? " Sambungkan internet untuk memperbarui statusnya." : ""}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Ini bukan status langsung — status asli hanya dari server Djiwa Travel.
        </p>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="tap mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-surface px-3 text-[12px] font-semibold"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Hapus salinan di perangkat ini
          </button>
        )}
      </div>
    </section>
  );
}
