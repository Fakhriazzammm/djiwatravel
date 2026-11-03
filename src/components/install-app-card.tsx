import { useEffect, useState } from "react";
import { Download, PlusSquare, Share, X } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa";
import { trackPwa } from "@/lib/pwa-client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * "Pasang aplikasi" card. Renders nothing when installing is not possible or wanted (already
 * installed, Admin turned the prompt off, snoozed, or an unsupported browser), so it is safe to
 * mount anywhere. Copy and snooze window come from the Admin PWA settings.
 */
export function InstallAppCard({
  variant = "card",
  className = "",
}: {
  variant?: "card" | "row";
  className?: string;
}) {
  const { config, mode, install, dismiss } = usePwaInstall();
  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode) trackPwa("install_prompt_shown");
  }, [mode]);

  if (!mode) return null;

  const act = async () => {
    if (mode === "ios-guide") {
      trackPwa("ios_guide_opened");
      setGuideOpen(true);
      return;
    }
    setBusy(true);
    try {
      await install();
    } finally {
      setBusy(false);
    }
  };

  const cta = mode === "ios-guide" ? "Lihat caranya" : "Pasang";
  const guide = (
    <Sheet open={guideOpen} onOpenChange={setGuideOpen}>
      <SheetContent
        side="bottom"
        className="rounded-t-[28px] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader>
          <SheetTitle>Pasang di iPhone</SheetTitle>
          <SheetDescription>Buka lewat Safari, lalu ikuti tiga langkah ini.</SheetDescription>
        </SheetHeader>
        <ol className="mt-4 space-y-3 text-[15px]">
          <li className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-secondary">
              <Share className="size-4" aria-hidden="true" />
            </span>
            Ketuk tombol <strong>Bagikan</strong> di bilah Safari.
          </li>
          <li className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-secondary">
              <PlusSquare className="size-4" aria-hidden="true" />
            </span>
            Pilih <strong>Tambah ke Layar Utama</strong>.
          </li>
          <li className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-secondary">
              <Download className="size-4" aria-hidden="true" />
            </span>
            Ketuk <strong>Tambah</strong>. Djiwa Travel muncul seperti aplikasi biasa.
          </li>
        </ol>
        <button
          type="button"
          onClick={() => setGuideOpen(false)}
          className="mt-5 min-h-10 w-full rounded-xl bg-primary text-[14px] font-semibold text-primary-foreground"
        >
          Mengerti
        </button>
      </SheetContent>
    </Sheet>
  );

  if (variant === "row") {
    return (
      <>
        <button
          type="button"
          onClick={act}
          disabled={busy}
          data-testid="install-app-row"
          className={`flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left text-[15px] ${className}`}
        >
          <Download className="size-5 text-primary" aria-hidden="true" />
          <span className="flex-1">{config.promptTitle}</span>
          <span className="text-sm font-medium text-primary">{cta}</span>
        </button>
        {guide}
      </>
    );
  }

  return (
    <>
      <section
        aria-label={config.promptTitle}
        data-testid="install-app-card"
        className={`relative flex items-center gap-3 rounded-[22px] bg-surface p-4 shadow-[0_12px_28px_-22px_rgba(0,0,0,0.35)] ring-1 ring-border/60 ${className}`}
      >
        <img src="/icon-192.png" alt="" width={40} height={40} className="size-10 rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight">{config.promptTitle}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
            {config.promptBody}
          </p>
        </div>
        <button
          type="button"
          onClick={act}
          disabled={busy}
          className="min-h-10 shrink-0 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {cta}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Sembunyikan"
          className="absolute -right-1 -top-1 grid size-7 place-items-center rounded-full bg-secondary text-muted-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </section>
      {guide}
    </>
  );
}
