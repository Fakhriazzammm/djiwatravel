import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { PendingSpinner } from "@/components/route-loading";
import { Wordmark } from "@/components/shell";
import { easeIos } from "@/lib/motion";

/**
 * First-paint splash.
 *
 * Rendered on the server, so it is on screen from the moment the HTML arrives and it
 * stays until the client has hydrated. That covers the window where the app root is
 * still empty — a bare white page reads as broken, especially on a phone. Route-to-route
 * navigation in the client never mounts it again (the state starts false after the first
 * mount and the effect only ever hides it).
 */
const SPLASH_MIN_VISIBLE_MS = 240;

export function AppSplash() {
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = window.setTimeout(() => setVisible(false), reduce ? 0 : SPLASH_MIN_VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [reduce]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          data-testid="app-splash"
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-background px-6 text-center"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.25, ease: easeIos }}
        >
          <Wordmark className="h-12" />
          <PendingSpinner reduce={!!reduce} className="size-14" />
          <div className="flex flex-col gap-1">
            <p className="text-[15px] font-semibold text-foreground">Menyiapkan Djiwa Travel…</p>
            <p className="text-[13px] text-muted-foreground">Sebentar ya, paket eSIM sedang dimuat.</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
