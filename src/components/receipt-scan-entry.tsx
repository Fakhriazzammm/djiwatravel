import { Camera, ReceiptText } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

/** "Ada banyak struk?" card shown on the Biaya page when scan struk is available. */
export function ScanReceiptBanner({ onScan }: { onScan: () => void }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-2xl bg-surface px-3 py-2.5 ring-1 ring-border/50"
      data-testid="scan-banner"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-brand-red-soft text-brand-red">
        <ReceiptText className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold leading-tight">Ada banyak struk?</p>
        <p className="text-[11px] text-muted-foreground">Foto sekaligus, kami baca semuanya.</p>
      </div>
      <button
        type="button"
        onClick={onScan}
        className="tap inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[10px] bg-brand-red px-3.5 text-[13px] font-semibold text-white"
      >
        <Camera className="size-4" aria-hidden="true" />
        Scan
      </button>
    </div>
  );
}

/** The photo attached to a scanned expense (served only to the trip's owner). */
export function ReceiptPhotoSheet({
  scanId,
  title,
  onClose,
}: {
  scanId: string | null;
  title: string;
  onClose: () => void;
}) {
  return (
    <Sheet open={Boolean(scanId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[24px] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4"
      >
        <SheetTitle className="text-[16px]">Foto struk</SheetTitle>
        <SheetDescription className="text-[12px]">{title}</SheetDescription>
        {scanId && (
          <img
            src={`/api/receipt-photo/${scanId}`}
            alt={`Foto struk ${title}`}
            className="mt-3 max-h-[70dvh] w-full rounded-xl bg-secondary object-contain"
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
