import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { googleConnectHref } from "@/lib/google-status";

/**
 * Plain-language explanation shown before the Google consent screen, so travelers know what
 * Djiwa can and cannot touch in their Drive. Used by Profil and by the Biaya page.
 */
export function GoogleConsentSheet({
  open,
  onOpenChange,
  features,
  returnTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "drive" or "sheets": both ask for the same file-level access. */
  features: "drive" | "sheets" | "drive,sheets";
  returnTo?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto w-full max-w-md rounded-t-[24px] px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-3"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-border" aria-hidden="true" />
        <SheetTitle className="text-[18px] font-bold">Izinkan akses file Djiwa</SheetTitle>
        <SheetDescription className="text-[12px] text-muted-foreground">
          Kamu akan diarahkan ke Google untuk menyetujui.
        </SheetDescription>
        <p className="mb-1.5 mt-3 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Yang bisa dilakukan Djiwa
        </p>
        <ul className="space-y-1.5 rounded-2xl bg-surface px-3 py-2.5 text-[13px]">
          <li className="flex gap-2">
            <span className="text-success" aria-hidden="true">
              ✓
            </span>
            Membuat folder &ldquo;Djiwa Travel&rdquo; dan menyimpan foto struk di sana
          </li>
          <li className="flex gap-2">
            <span className="text-success" aria-hidden="true">
              ✓
            </span>
            Menulis budget trip ke spreadsheet yang dibuat Djiwa
          </li>
        </ul>
        <p className="mb-1.5 mt-3 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Yang tidak bisa
        </p>
        <ul className="space-y-1.5 rounded-2xl bg-surface px-3 py-2.5 text-[13px]">
          <li className="flex gap-2">
            <span className="text-destructive" aria-hidden="true">
              ✕
            </span>
            Membaca file lain di Drive-mu
          </li>
          <li className="flex gap-2">
            <span className="text-destructive" aria-hidden="true">
              ✕
            </span>
            Menghapus file milikmu saat koneksi diputus
          </li>
        </ul>
        <p className="mt-3 rounded-xl bg-secondary px-3 py-2 text-[12px] text-muted-foreground">
          Kamu bisa memutus kapan saja dari Profil → Google.
        </p>
        <a
          href={googleConnectHref(features, returnTo)}
          className="tap mt-3 flex min-h-10 w-full items-center justify-center rounded-xl bg-brand-red text-[14px] font-semibold text-white"
        >
          Lanjut ke Google
        </a>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="tap mt-1.5 min-h-9 w-full rounded-xl text-[13px] font-semibold text-muted-foreground"
        >
          Nanti saja
        </button>
      </SheetContent>
    </Sheet>
  );
}
