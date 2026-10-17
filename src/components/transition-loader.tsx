import { useReducedMotion } from "motion/react";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { PendingSpinner } from "@/components/route-loading";

/**
 * Page-change loader.
 *
 * Every client-side navigation shows this: the page dims behind a spinner that sits in the
 * middle of the screen, so a transition is never silent — even when the next route has no
 * loader at all, or its data is already cached. If a load is still running when the minimum
 * window ends, the overlay simply stays until it finishes.
 *
 * The cold load (first render) is deliberately skipped: the server-rendered splash and the
 * route pending screen already own that. Only opacity animates and reduced motion is honoured.
 */
export const TRANSITION_MIN_VISIBLE_MS = 320;
export const TRANSITION_TICK_MS = 40;

/** Pure: visible while a load runs, and always for the minimum window after a page change. */
export function transitionVisible(input: {
  stillLoading: boolean;
  sinceChangeMs: number;
}): boolean {
  return input.stillLoading || input.sinceChangeMs < TRANSITION_MIN_VISIBLE_MS;
}

/**
 * Opaque on purpose: a translucent overlay let the route pending indicator show through, so one
 * page change looked like two loaders stacked on top of each other.
 */
export const TRANSITION_OVERLAY_CLASS =
  "pointer-events-none fixed inset-0 z-[65] flex flex-col items-center justify-center gap-3 bg-background px-6 text-center transition-opacity";

/**
 * Marks the document while this overlay owns the screen. styles.css hides the route pending
 * indicator behind it, so exactly one loader is visible during a page change.
 */
export function setTransitionActive(
  active: boolean,
  root: HTMLElement | null = typeof document === "undefined" ? null : document.documentElement,
) {
  if (!root) return;
  if (active) root.dataset["routeTransition"] = "1";
  else delete root.dataset["routeTransition"];
}

export function TransitionLoader() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const loading = useRouterState({
    select: (state) => state.isLoading || state.status === "pending",
  });
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const changedAt = useRef<number | null>(null);
  const currentPath = useRef<string | null>(null);

  // A page change starts the window. The first render only records the starting route.
  useEffect(() => {
    if (currentPath.current === null || currentPath.current === pathname) {
      currentPath.current = pathname;
      return;
    }
    currentPath.current = pathname;
    changedAt.current = performance.now();
    setVisible(true);
  }, [pathname]);

  // Hold the overlay for the minimum window, and longer for as long as a load is running.
  useEffect(() => {
    if (!visible) return;
    const tick = () => {
      const startedAt = changedAt.current;
      if (startedAt === null) {
        setVisible(false);
        return;
      }
      if (
        !transitionVisible({ stillLoading: loading, sinceChangeMs: performance.now() - startedAt })
      ) {
        changedAt.current = null;
        setVisible(false);
      }
    };
    tick();
    const intervalId = window.setInterval(tick, TRANSITION_TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [visible, loading]);

  // One loading UI at a time: tell the pending screen behind us to stay hidden.
  useEffect(() => setTransitionActive(visible), [visible]);

  // Kept mounted and toggled with CSS instead of AnimatePresence: an exiting overlay stayed
  // in the DOM at opacity 0 (invisible but still hit-testable), which could swallow taps.
  // `visibility: hidden` plus `pointer-events-none` makes a hidden overlay inert for sure.
  return (
    <div
      data-testid="transition-loader"
      role="status"
      aria-live="polite"
      aria-busy={visible}
      aria-hidden={!visible}
      style={{ visibility: visible ? "visible" : "hidden" }}
      className={`${TRANSITION_OVERLAY_CLASS} ${reduce ? "duration-0" : "duration-150"} ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <PendingSpinner reduce={!!reduce} className="size-14" />
      <p className="text-[15px] font-semibold text-foreground">Memuat halaman…</p>
    </div>
  );
}
