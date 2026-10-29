import type { Transition, Variants } from "motion/react";

/**
 * Apple-ish motion presets shared by every animated surface.
 * Only `opacity` and `transform` are animated so work stays on the compositor.
 */

/** Settle/enter spring: fast, no visible rebound on layout-sized elements. */
export const springIos: Transition = { type: "spring", stiffness: 320, damping: 30, mass: 0.9 };

/** Tight spring for press feedback and small pop-ins. */
export const springSnappy: Transition = { type: "spring", stiffness: 520, damping: 34, mass: 0.6 };

/** Spring used by sheets/dialogs (a touch softer, matches iOS sheet feel). */
export const springSheet: Transition = { type: "spring", stiffness: 260, damping: 28, mass: 0.9 };

/** iOS-like ease-out for pure fades. */
export const easeIos = [0.32, 0.72, 0, 1] as [number, number, number, number];

/** Spread onto any motion element that should behave like a tappable iOS control. */
export const pressable = { whileTap: { scale: 0.96 }, transition: springSnappy } as const;

/** Fade + lift used by staggered lists and cards. */
export const enterUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
} as const;

/** Staggered container: children run in order, capped so long lists never crawl. */
export function staggerContainer(step = 0.045, cap = 0.35): Variants {
  return {
    hidden: { opacity: 1 },
    show: {
      opacity: 1,
      transition: { staggerChildren: step, delayChildren: 0, staggerDirection: 1 },
    },
  };
}

export type NavDirection = "forward" | "back" | "tab" | "initial";

/** Top-level tab routes: switching between them must not slide sideways. */
export const TAB_PATHS = ["/", "/explore", "/esim/finder", "/my-esim", "/profile"] as const;

const isTabPath = (pathname: string) =>
  TAB_PATHS.some((tab) =>
    tab === "/" ? pathname === "/" : pathname === tab || pathname.startsWith(`${tab}/`),
  );
const isTopLevelTab = (pathname: string) =>
  TAB_PATHS.includes(pathname as (typeof TAB_PATHS)[number]);
const sameTab = (a: string, b: string) =>
  TAB_PATHS.some((tab) => {
    const matches = (path: string) =>
      tab === "/" ? path === "/" : path === tab || path.startsWith(`${tab}/`);
    return matches(a) && matches(b);
  });

const depth = (pathname: string) => pathname.split("/").filter(Boolean).length;

/**
 * Pure, testable direction resolver.
 * - a tab switch (or landing on a tab from anywhere) fades + lifts, never slides
 * - a deeper path is a push (enters from the right)
 * - anything else is a pop (enters from the left)
 */
export function resolveNavDirection(prev: string | null, next: string): NavDirection {
  if (!prev || prev === next) return "initial";
  if (isTopLevelTab(prev) && isTopLevelTab(next)) return "tab";
  if (sameTab(prev, next) && depth(next) < depth(prev)) return "back";
  if (depth(next) > depth(prev)) return "forward";
  if (depth(next) < depth(prev)) return isTopLevelTab(next) ? "tab" : "back";
  return isTopLevelTab(next) ? "tab" : "forward";
}

/** Where a page starts from, per direction. */
export function enterFrom(direction: NavDirection) {
  switch (direction) {
    case "forward":
      return { opacity: 0, x: 24 };
    case "back":
      return { opacity: 0, x: -24 };
    case "tab":
      return { opacity: 0, y: 8 };
    default:
      return { opacity: 0 };
  }
}

let lastPath: string | null = null;
let lastDirection: NavDirection = "initial";

/** Direction of the transition that mounted this page (frozen for the page's lifetime). */
export function consumeNavDirection(pathname: string): NavDirection {
  if (lastPath === pathname) return lastDirection;
  const direction = resolveNavDirection(lastPath, pathname);
  lastPath = pathname;
  lastDirection = direction;
  return direction;
}

/** Test helper: reset the module-level memory between cases. */
export function resetNavMemory() {
  lastPath = null;
  lastDirection = "initial";
}
