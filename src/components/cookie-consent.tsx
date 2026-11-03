import { useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { Cookie } from "lucide-react";
import { useEffect, useState } from "react";
import { FixedLayer } from "@/components/motion-primitives";
import { CONSENT_EVENT, CONSENT_KEY, readConsent, saveConsent } from "@/lib/cookie-consent";

/**
 * One small, non-blocking cookie notice. It appears once per device (the choice is stored in
 * localStorage and a cookie, so signing in or registering never brings it back), never in Admin,
 * and closes itself if another tab already answered.
 */
export function CookieConsent() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [visible, setVisible] = useState(false);
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  useEffect(() => {
    if (isAdmin || readConsent() !== null) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => {
      if (readConsent() === null) setVisible(true);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [isAdmin]);

  useEffect(() => {
    const sync = () => {
      if (readConsent() !== null) setVisible(false);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === CONSENT_KEY) sync();
    };
    window.addEventListener(CONSENT_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CONSENT_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return (
    <FixedLayer>
      <AnimatePresence>
        {visible && (
          <motion.section
            key="cookie-consent"
            role="dialog"
            aria-modal="false"
            aria-labelledby="cookie-consent-title"
            data-testid="cookie-consent"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            className="glass fixed bottom-[calc(5.4rem+env(safe-area-inset-bottom))] left-1/2 z-[45] w-[calc(100%-1.5rem)] max-w-[24rem] -translate-x-1/2 rounded-2xl border border-white/65 p-3.5 shadow-[0_14px_38px_rgb(40_30_90/0.22)]"
          >
            <div className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-red-soft text-brand-red"
              >
                <Cookie className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <h2 id="cookie-consent-title" className="text-[14px] font-bold tracking-[-0.01em]">
                  Kami memakai cookie
                </h2>
                <p className="mt-0.5 text-[12px] leading-[1.35] text-muted-foreground">
                  Cookie penting menjaga sesi masuk dan akses pesananmu. Dengan “Setuju”, kamu juga
                  mengizinkan cookie analitik agar kami tahu halaman mana yang berguna. Pilihan
                  tersimpan di perangkat ini dan hanya ditanyakan sekali.{" "}
                  <a href="/privacy" className="font-semibold text-brand-red underline-offset-2">
                    Kebijakan privasi
                  </a>
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  saveConsent("essential");
                  setVisible(false);
                }}
                className="tap min-h-10 rounded-full bg-secondary text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Hanya yang penting
              </button>
              <button
                type="button"
                onClick={() => {
                  saveConsent("all");
                  setVisible(false);
                }}
                className="tap min-h-10 rounded-full bg-brand-red text-[13px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Setuju
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </FixedLayer>
  );
}
