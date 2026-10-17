import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { PendingSpinner } from "@/components/route-loading";
import { Wordmark } from "@/components/shell";

/**
 * First-paint splash.
 *
 * Rendered on the server, so it is on screen from the moment the HTML arrives; it covers
 * the window where the app root is still empty. Client-side navigation never mounts it.
 *
 * It has TWO independent hide paths on purpose, because a splash that fails to clear
 * covers the whole app and swallows every tap:
 *   1. React hides it shortly after mount.
 *   2. A CSS animation on the same node forces it hidden at ~1.1 s and stays hidden
 *      (`forwards`). Animation rules outrank inline styles, so this works even when
 *      hydration never completes. No AnimatePresence: an unkeyed exiting child stayed
 *      mounted at opacity 1 forever, which is exactly the failure this avoids.
 */
const SPLASH_MIN_VISIBLE_MS = 240;

const FALLBACK_CSS = `
@keyframes djiwa-splash-out { from { opacity: 1; visibility: visible; } to { opacity: 0; visibility: hidden; } }
.djiwa-splash { animation: djiwa-splash-out 240ms ease 1100ms forwards; }
@media (prefers-reduced-motion: reduce) { .djiwa-splash { animation-duration: 1ms; animation-delay: 1200ms; } }
`;

export function AppSplash() {
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const hideId = window.setTimeout(() => setVisible(false), reduce ? 0 : SPLASH_MIN_VISIBLE_MS);
    const unmountId = window.setTimeout(
      () => setMounted(false),
      reduce ? 0 : SPLASH_MIN_VISIBLE_MS + 180,
    );
    return () => {
      window.clearTimeout(hideId);
      window.clearTimeout(unmountId);
    };
  }, [reduce]);

  if (!mounted) return <style dangerouslySetInnerHTML={{ __html: FALLBACK_CSS }} />;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FALLBACK_CSS }} />
      <div
        data-testid="app-splash"
        role="status"
        aria-live="polite"
        aria-hidden={!visible}
        style={{ visibility: visible ? "visible" : "hidden" }}
        className={`djiwa-splash pointer-events-none fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-background px-6 text-center transition-opacity ${
          reduce ? "duration-0" : "duration-150"
        } ${visible ? "opacity-100" : "opacity-0"}`}
      >
        <Wordmark className="h-12" />
        <PendingSpinner reduce={!!reduce} className="size-14" />
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-semibold text-foreground">Menyiapkan Djiwa Travel…</p>
          <p className="text-[13px] text-muted-foreground">
            Sebentar ya, paket eSIM sedang dimuat.
          </p>
        </div>
      </div>
    </>
  );
}
