import { useEffect, useRef, useState, type ReactNode } from "react";

/** True when the visitor asked the system for less motion; every animation here then jumps to its end state. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Becomes true once the element has scrolled into view (and stays true). */
export function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, seen];
}

/** Fades and lifts its content in when it scrolls into view. `delay` staggers siblings (ms). */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const show = seen || reduced;
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "none" : "translateY(10px)",
        transition: reduced
          ? "none"
          : `opacity 520ms ease-out ${delay}ms, transform 520ms ease-out ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/** Counts a number up (or between values) when visible. */
export function CountUp({
  value,
  format = (v: number) => v.toLocaleString("id-ID"),
  duration = 850,
}: {
  value: number;
  format?: (v: number) => string;
  duration?: number;
}) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!seen) return;
    if (reduced) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(origin + (value - origin) * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [seen, value, reduced, duration]);
  return (
    <span ref={ref} className="tabular-nums">
      {format(Math.round(shown))}
    </span>
  );
}

/** A horizontal bar whose width grows from zero when visible. */
export function GrowBar({
  percent,
  className = "",
  delay = 0,
}: {
  percent: number;
  className?: string;
  delay?: number;
}) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const width = seen || reduced ? Math.max(0, Math.min(100, percent)) : 0;
  return (
    <div
      ref={ref}
      className={className}
      style={{
        width: `${width}%`,
        transition: reduced ? "none" : `width 750ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
      }}
    />
  );
}
