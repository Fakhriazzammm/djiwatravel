import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  consumeNavDirection,
  easeIos,
  enterFrom,
  springIos,
  springSnappy,
  staggerContainer,
} from "@/lib/motion";

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: springIos },
} as const;

export const revealVariants = itemVariants;

function exitTowards(direction: ReturnType<typeof consumeNavDirection>) {
  switch (direction) {
    case "forward":
      return { opacity: 0, x: -16, y: 0 };
    case "back":
      return { opacity: 0, x: 16, y: 0 };
    case "tab":
      return { opacity: 0, y: -8, x: 0 };
    default:
      return { opacity: 0, x: 0, y: 0 };
  }
}

/**
 * Wraps one page and plays its enter/exit motion. Keyed by pathname in the root
 * route, so the direction is decided once at mount and stays stable through exit.
 *
 * The first page of a session renders with `initial={false}`: the server has no
 * navigation history to animate from, and skipping `initial` keeps the SSR markup
 * visible instead of shipping an `opacity: 0` first paint.
 */
export function PageTransition({ pathname, children }: { pathname: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const first = useIsFirstPage();
  const direction = useMemo(() => consumeNavDirection(pathname), [pathname]);
  const enter = reduce ? { opacity: 0 } : enterFrom(direction);

  return (
    <motion.div
      initial={first ? false : enter}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={reduce ? { opacity: 0 } : exitTowards(direction)}
      transition={reduce ? { duration: 0.12, ease: easeIos } : springIos}
      style={{ minHeight: "100dvh" }}
      className="will-change-transform"
    >
      {children}
    </motion.div>
  );
}

let firstPageSeen = false;

/** True only for the first page rendered in this session (server and client each count once). */
function useIsFirstPage() {
  const [first] = useState(() => {
    const isFirst = !firstPageSeen;
    firstPageSeen = true;
    return isFirst;
  });
  return first;
}

/**
 * Entrance animations (list staggers) only run for client-side renders after the
 * first page: SSR/first paint must ship fully visible content, and a user who
 * asked for reduced motion must never get a moving list.
 */
function useEntranceAnimations() {
  const reduce = useReducedMotion();
  const [enabled] = useState(() => typeof document !== "undefined");
  return enabled && !reduce;
}

/** Container that staggers its `<Reveal>` children in on mount. */
export function Stagger({
  children,
  className,
  step = 0.045,
}: {
  children: ReactNode;
  className?: string;
  step?: number;
}) {
  const enabled = useEntranceAnimations();
  if (!enabled) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={staggerContainer(step)}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

/** One staggered item. Put the layout classes here (the wrapper is what lays out). */
export function Reveal({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "section";
}) {
  const Comp = as === "li" ? motion.li : as === "section" ? motion.section : motion.div;
  return (
    <Comp className={className} variants={itemVariants}>
      {children}
    </Comp>
  );
}

/** Spring-driven number, e.g. prices and totals. */
export function MotionCounter({
  value,
  format,
  className,
}: {
  value: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const number = useMotionValue(value);
  const text = useTransform(number, (current) =>
    format ? format(current) : Math.round(current).toLocaleString("id-ID"),
  );

  useEffect(() => {
    if (reduce) {
      number.set(value);
      return;
    }
    const controls = animate(number, value, { type: "spring", stiffness: 90, damping: 20 });
    return () => controls.stop();
  }, [number, reduce, value]);

  return <motion.span className={className}>{text}</motion.span>;
}

/** Scale-in used by popovers, toasts and success marks. */
export function popIn(delay = 0) {
  return {
    initial: { opacity: 0, scale: 0.94 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.96 },
    transition: { ...springSnappy, delay },
  } as const;
}

/**
 * Renders fixed-position chrome (tab bar, sticky CTA, splash) into `document.body`.
 *
 * A transformed ancestor becomes the containing block for `position: fixed`, so
 * chrome nested inside an animating page would slide and mis-position with it.
 * The first render stays inline so server-rendered markup and hydration agree;
 * the portal only takes over once mounted, before any transition can run.
 */
export function FixedLayer({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === "undefined") return <>{children}</>;
  return createPortal(children, document.body);
}
