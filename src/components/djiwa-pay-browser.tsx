import { ExternalLink, RefreshCw, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { FixedLayer } from "@/components/motion-primitives";

export const DJIWA_PAY_URL = "https://djiwapay.web.id";

type DjiwaPayBrowserProps = {
  open: boolean;
  layout?: "sheet" | "page";
  sharedAuth?: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DjiwaPayBrowser({
  open,
  layout = "sheet",
  sharedAuth = false,
  onOpenChange,
}: DjiwaPayBrowserProps) {
  const reduce = useReducedMotion();
  const pageLayout = layout === "page";
  const [frameVersion, setFrameVersion] = useState(0);
  const [frameSrc, setFrameSrc] = useState(DJIWA_PAY_URL);

  useEffect(() => {
    if (!open || !sharedAuth) return;
    let cancelled = false;
    void fetch("/api/djiwa-pay/bridge", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = (await response.json()) as { url?: unknown };
        return typeof payload.url === "string" ? payload.url : null;
      })
      .then((url) => {
        if (!cancelled && url) setFrameSrc(url);
      })
      .catch(() => {
        // Keep the normal Pay page as a safe fallback when bridge SSO is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [open, sharedAuth]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onOpenChange, open]);

  return (
    <FixedLayer>
      <AnimatePresence>
        {open && (
          <motion.div
            className={
              pageLayout
                ? "fixed inset-x-0 top-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-80 bg-background"
                : "fixed inset-x-0 top-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 bg-black/35 p-3 sm:bottom-4 sm:bg-black/20"
            }
            initial={reduce ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0 }}
            transition={{ duration: reduce ? 0.12 : 0.2 }}
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) onOpenChange(false);
            }}
          >
            <motion.section
              role="dialog"
              data-layout={layout}
              aria-modal="true"
              aria-labelledby="djiwa-pay-browser-title"
              className={
                "mx-auto flex h-full w-full max-w-md flex-col overflow-hidden bg-surface " +
                (pageLayout ? "" : "rounded-[26px] shadow-2xl ring-1 ring-black/10")
              }
              initial={reduce ? { y: 0, scale: 1 } : { y: 24, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={reduce ? { y: 8, scale: 0.99 } : { y: 18, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
            >
              <header className="flex shrink-0 items-center justify-between border-b border-border/70 px-4 py-3 safe-top">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-red">
                    Djiwa Travel
                  </p>
                  <h2 id="djiwa-pay-browser-title" className="truncate text-lg font-bold">
                    Djiwa Pay
                  </h2>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="tap flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Refresh Djiwa Pay"
                    onClick={() => setFrameVersion((current) => current + 1)}
                  >
                    <RefreshCw className="size-5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="tap flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Tutup Djiwa Pay"
                    onClick={() => onOpenChange(false)}
                  >
                    <X className="size-5" aria-hidden="true" />
                  </button>
                </div>
              </header>

              <div className="min-h-0 flex-1 bg-background">
                <iframe
                  key={`${frameSrc}-${frameVersion}`}
                  title="Djiwa Pay"
                  src={frameSrc}
                  className="size-full border-0 bg-background"
                  loading="eager"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="payment *; clipboard-read; clipboard-write"
                />
              </div>

              <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border/70 bg-surface px-4 py-2.5 safe-bottom">
                <p className="min-w-0 text-[11px] leading-4 text-muted-foreground">
                  Tidak tampil atau perlu pembayaran?
                </p>
                <a
                  href={DJIWA_PAY_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="tap inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-brand-red px-3 text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red"
                >
                  Buka di browser
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </FixedLayer>
  );
}
