import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, FileDown, HardDriveUpload } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { openTripGoogleLink } from "@/lib/trip-assistant.fn";

type Result =
  | { kind: "idle" }
  | { kind: "saved"; url: string }
  | { kind: "message"; text: string; connect?: boolean };

/**
 * The two ways to get the whole trip (itinerary, budget and spending, preparation, bookings) as a
 * PDF: download it from the browser's print sheet, or save the PDF into the trip's folder in the
 * traveler's Google Drive. Used by the export sheet and inside the share sheet.
 */
export function TripExportActions({
  tripId,
  tripName,
  onNavigate,
}: {
  tripId: string;
  tripName: string;
  /** Called when a link inside leaves the sheet (so the caller can close it). */
  onNavigate?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>({ kind: "idle" });

  async function saveToDrive() {
    setBusy(true);
    setResult({ kind: "idle" });
    try {
      const out = await openTripGoogleLink({ data: { tripId, target: "pdf" } });
      if (out.status === "ok") {
        setResult({ kind: "saved", url: out.url });
        toast.success("PDF tersimpan di Google Drive");
      } else setResult({ kind: "message", text: out.message, connect: out.status === "connect" });
    } catch {
      setResult({ kind: "message", text: "Belum bisa menyimpan ke Drive. Coba lagi." });
    } finally {
      setBusy(false);
    }
  }

  const row =
    "tap flex min-h-14 w-full items-center gap-3 rounded-2xl bg-secondary/70 px-3 text-left";
  return (
    <div data-testid="export-actions">
      <div className="space-y-2">
        <a
          href={`/my-trips/${tripId}/print?auto=1`}
          target="_blank"
          rel="noopener"
          className={row}
          data-testid="export-download"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-red-soft">
            <FileDown className="size-5 text-brand-red" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">Unduh PDF</span>
            <span className="block text-[11px] text-muted-foreground">
              Buka lembar cetak, pilih “Simpan sebagai PDF”
            </span>
          </span>
        </a>
        <button
          type="button"
          onClick={() => void saveToDrive()}
          disabled={busy}
          className={`${row} disabled:opacity-60`}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-red-soft">
            <HardDriveUpload className="size-5 text-brand-red" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">
              {busy ? "Menyimpan ke Drive…" : "Simpan PDF ke Google Drive"}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              Masuk ke folder Djiwa Travel/{tripName} di Drive-mu
            </span>
          </span>
        </button>
      </div>
      {result.kind === "saved" && (
        <a
          href={result.url}
          target="_blank"
          rel="noopener"
          className="tap mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-red px-4 text-[14px] font-bold text-white"
          data-testid="export-open-drive"
        >
          Buka PDF di Drive <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      )}
      {result.kind === "message" && (
        <div
          className="mt-3 rounded-xl bg-brand-red-soft px-3 py-2 text-[12px] text-brand-red"
          role="status"
        >
          {result.text}
          {result.connect && (
            <Link
              to="/my-trips/$tripId/$section"
              params={{ tripId, section: "budget" }}
              className="ml-1 font-bold underline"
              onClick={onNavigate}
            >
              Hubungkan di Biaya
            </Link>
          )}
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        PDF ini untuk dirimu sendiri: isinya lengkap (anggaran, pengeluaran, booking), tidak seperti
        tautan bagikan. Angka bertanda perkiraan adalah taksiran.
      </p>
    </div>
  );
}

/** Export the whole trip as a PDF (download or Google Drive) in its own sheet. */
export function TripExportSheet({
  open,
  onOpenChange,
  tripId,
  tripName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  tripName: string;
}) {
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
        <SheetHeader className="mb-3 text-left">
          <SheetTitle>Ekspor PDF</SheetTitle>
          <SheetDescription>
            {tripName}: itinerary per hari, anggaran dan pengeluaran, persiapan, booking, dan tiket
            dalam satu dokumen.
          </SheetDescription>
        </SheetHeader>
        <TripExportActions
          tripId={tripId}
          tripName={tripName}
          onNavigate={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
