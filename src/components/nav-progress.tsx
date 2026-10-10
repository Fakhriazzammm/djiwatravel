import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { easeIos } from "@/lib/motion";

/**
 * Slim progress bar for navigations that are waiting on a loader.
 *
 * The pending screen explains long loads; this keeps the feedback pinned to the top of
 * the viewport for every route, including ones that keep the current layout (tab
 * switches, revalidation) and admin routes that have no customer shell.
 *
 * Fast navigations must not flash a bar: nothing renders until the pending phase
 * outlives `PROGRESS_SHOW_DELAY_MS`, and once shown the bar is held for
 * `PROGRESS_MIN_VISIBLE_MS` so the finish is readable instead of a blink.
 */
export const PROGRESS_SHOW_DELAY_MS = 140;
export const PROGRESS_MIN_VISIBLE_MS = 360;

export type ProgressPhase = "hidden" | "showing" | "finishing";

/**
 * Pure phase machine, kept out of the component so it is unit-testable without timers.
 * `visibleForMs` is -1 when the bar was never shown.
 */
export function progressPhase(input: {
  stillPending: boolean;
  pendingForMs: number;
  visibleForMs: number;
}): ProgressPhase {
  const { stillPending, pendingForMs, visibleForMs } = input;
  if (stillPending) return pendingForMs >= PROGRESS_SHOW_DELAY_MS ? "showing" : "hidden";
  return visibleForMs >= 0 && visibleForMs < PROGRESS_MIN_VISIBLE_MS ? "finishing" : "hidden";
}

export function NavProgress() {
  const pending = useRouterState({ select: (state) => state.isLoading || state.status === "pending" });
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<ProgressPhase>("hidden");
  const pendingSince = useRef<number | null>(null);
  const visibleSince = useRef<number | null>(null);

  useEffect(() => {
    const now = () => performance.now();

    if (pending) {
      if (pendingSince.current === null) pendingSince.current = now();
      const tick = () => {
        const startedAt = pendingSince.current;
        if (startedAt === null) return;
        const pendingForMs = now() - startedAt;
        if (pendingForMs >= PROGRESS_SHOW_DELAY_MS && visibleSince.current === null) visibleSince.current = now();
        const visibleForMs = visibleSince.current === null ? -1 : now() - visibleSince.current;
        setPhase(progressPhase({ stillPending: true, pendingForMs, visibleForMs }));
      };
      tick();
      const intervalId = window.setInterval(tick, 60);
      return () => window.clearInterval(intervalId);
    }

    // The load is done: hold the bar for whatever is left of the minimum visible window.
    const shownAt = visibleSince.current;
    if (shownAt === null) {
      pendingSince.current = null;
      setPhase("hidden");
      return;
    }
    setPhase("finishing");
    const remaining = Math.max(0, PROGRESS_MIN_VISIBLE_MS - (now() - shownAt));
    const timeoutId = window.setTimeout(() => {
      pendingSince.current = null;
      visibleSince.current = null;
      setPhase("hidden");
    }, remaining);
    return () => window.clearTimeout(timeoutId);
  }, [pending]);

  return (
    <AnimatePresence>
      {phase !== "hidden" && (
        <motion.div
          key="nav-progress"
          data-testid="nav-progress"
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-[60]"
          initial={{ opacity: reduce ? 1 : 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.18, ease: easeIos }}
        >
          <motion.div
            className="h-[3px] origin-left rounded-r-full bg-gradient-to-r from-brand-red to-primary"
            initial={{ scaleX: 0.08 }}
            animate={{ scaleX: 0.9 }}
            exit={{ scaleX: 1 }}
            transition={reduce ? { duration: 0 } : { duration: 0.9, ease: easeIos }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
