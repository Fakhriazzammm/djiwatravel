import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Types the streamed reply out smoothly: the model delivers text in bursts, so the screen catches
 * up a few characters per frame instead of jumping. Reduced motion shows it as it arrives.
 */
export function useSmoothText(target: string, active: boolean) {
  const reduce = Boolean(useReducedMotion());
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!active || reduce) return;
    const timer = window.setInterval(() => {
      setShown((n) => {
        if (target.length === 0) return 0;
        if (n >= target.length) return n;
        return Math.min(target.length, n + Math.max(1, Math.ceil((target.length - n) / 8)));
      });
    }, 24);
    return () => window.clearInterval(timer);
  }, [target, active, reduce]);
  return reduce || !active ? target : target.slice(0, Math.min(shown, target.length));
}
