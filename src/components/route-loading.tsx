import { motion, useReducedMotion } from "motion/react";
import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { TabBar } from "@/components/shell";
import { easeIos, springIos } from "@/lib/motion";

/**
 * Loading feedback for route transitions.
 *
 * TanStack Router renders a route's `pendingComponent` (or the router default) while a
 * loader is still resolving, so this replaces the page for the duration of the fetch.
 * The catalog loader can take seconds; without this surface the previous page just sat
 * there looking frozen. A slow load must read as "still working", never as "stuck".
 *
 * House rules kept here: only opacity/transform animate, every animation has a
 * reduced-motion path, and nothing touches `window` during render because these
 * components render on the server too.
 */

const cardBars = [
  "h-3.5 w-3/4",
  "mt-2 h-3 w-1/3",
  "mt-3 h-6 w-16 rounded-lg",
  "mt-2 h-2.5 w-full",
  "mt-3 h-9 w-full rounded-xl",
];

/** One shimmering placeholder card. The sweep is a transform-only overlay. */
function PendingCard({ index, reduce }: { index: number; reduce: boolean }) {
  const delay = Math.min(index * 0.07, 0.4);
  return (
    <motion.div
      data-testid="pending-card"
      className="relative min-w-0 overflow-hidden rounded-2xl border border-border/80 border-t-2 border-t-primary/40 bg-card p-2.5 shadow-sm sm:p-3"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { ...springIos, delay }}
    >
      {cardBars.map((bar, barIndex) => (
        <div key={barIndex} className={`${bar} rounded-full bg-muted`} />
      ))}
      {!reduce && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent"
          initial={{ x: "0%" }}
          animate={{ x: "320%" }}
          transition={{ duration: 1.6, ease: easeIos, repeat: Infinity, repeatDelay: 0.4, delay }}
        />
      )}
    </motion.div>
  );
}

/** Card-grid placeholder, reused by routes that want a shape-matching skeleton. */
export function SkeletonCards({ count = 6, className = "" }: { count?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div
      data-testid="pending-cards"
      aria-hidden="true"
      className={`grid min-w-0 grid-cols-2 gap-2 lg:gap-2.5 lg:grid-cols-3 ${className}`}
    >
      {Array.from({ length: count }, (_unused, index) => (
        <PendingCard key={index} index={index} reduce={!!reduce} />
      ))}
    </div>
  );
}

/** Brand spinner: a rotating ring around a solid dot, static when motion is reduced. */
export function PendingSpinner({ reduce, className = "size-12" }: { reduce: boolean; className?: string }) {
  const ring = "absolute inset-0 rounded-full border-2 border-brand-red border-b-transparent border-r-transparent";
  return (
    <span className={`relative flex ${className} items-center justify-center`} aria-hidden="true">
      <span className="absolute inset-0 rounded-full border-2 border-border" />
      {reduce ? (
        <span className={ring} />
      ) : (
        <motion.span
          className={ring}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, ease: "linear", repeat: Infinity }}
        />
      )}
      <span className="size-2 rounded-full bg-brand-red" />
    </span>
  );
}

export type RoutePendingScreenProps = {
  label?: string;
  hint?: string;
  /** Chrome that must stay on screen while the page loads (usually the tab bar). */
  chrome?: ReactNode;
};

/**
 * Pending state: the spinner and its label sit in the middle of the screen.
 *
 * Deliberately just the indicator — no skeleton grid under it. Anything placed below
 * grows the element past the viewport, which drags a "centred" indicator off centre
 * (measured: 487px on a 757px viewport). Routes that want a shape-matching skeleton can
 * still render `SkeletonCards` inside their own pending component.
 */
export function RoutePendingScreen({
  label = "Memuat data…",
  hint = "Menyiapkan paket internet untukmu.",
  chrome = null,
}: RoutePendingScreenProps) {
  const reduce = useReducedMotion();
  return (
    <>
      <main
        role="status"
        aria-live="polite"
        aria-busy="true"
        data-testid="route-pending"
        className="mx-auto flex min-h-[100dvh] w-full min-w-0 max-w-md flex-col items-center justify-center gap-3 px-4 pb-4 text-center safe-top sm:max-w-2xl"
      >
        <PendingSpinner reduce={!!reduce} className="size-16" />
        <p className="text-[15px] font-semibold text-foreground">{label}</p>
        <p className="text-[13px] text-muted-foreground">{hint}</p>
      </main>
      {chrome}
    </>
  );
}

export function CatalogRoutePending() {
  return (
    <RoutePendingScreen
      label="Menyiapkan paket internet…"
      hint="Memastikan katalog dan ketersediaan paket terbaru."
    />
  );
}

/**
 * Router-wide pending UI. The customer tab bar stays mounted so a tab switch never drops
 * the bottom navigation mid-load; admin routes run their own shell, so they get the
 * skeleton alone.
 */
export function DefaultRoutePending() {
  const isAdmin = useRouterState({ select: (state) => state.location.pathname.startsWith("/admin") });
  return <RoutePendingScreen chrome={isAdmin ? null : <TabBar />} />;
}
