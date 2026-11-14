import { useEffect, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "motion/react";

/** A number that counts up from zero once when it appears (instant with reduced motion). */
export function CountUp({
  value,
  decimals = 0,
  duration = 0.9,
}: {
  value: number;
  decimals?: number;
  duration?: number;
}) {
  const reduce = Boolean(useReducedMotion());
  const ref = useRef<HTMLSpanElement>(null);
  const final = value.toFixed(decimals);
  useEffect(() => {
    const node = ref.current;
    if (!node || reduce) return;
    node.textContent = (0).toFixed(decimals);
    const controls = animate(0, value, {
      duration,
      ease: [0.32, 0.72, 0, 1],
      onUpdate: (current) => {
        node.textContent = current.toFixed(decimals);
      },
      onComplete: () => {
        node.textContent = final;
      },
    });
    return () => controls.stop();
  }, [value, decimals, duration, reduce, final]);
  return <span ref={ref}>{final}</span>;
}

/** A circled check that draws itself once. */
export function CheckDraw({ size = 36 }: { size?: number }) {
  const reduce = Boolean(useReducedMotion());
  const draw = (delay: number) => ({
    initial: { pathLength: reduce ? 1 : 0 },
    animate: { pathLength: 1 },
    transition: { duration: reduce ? 0 : 0.5, delay: reduce ? 0 : delay, ease: "easeOut" as const },
  });
  return (
    <motion.span
      aria-hidden="true"
      className="inline-flex shrink-0"
      initial={{ scale: reduce ? 1 : 0.6, opacity: reduce ? 1 : 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
    >
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
        <circle cx="18" cy="18" r="16" fill="rgb(23 128 61 / 0.12)" />
        <motion.circle
          cx="18"
          cy="18"
          r="16"
          stroke="rgb(23 128 61)"
          strokeWidth="2"
          strokeLinecap="round"
          {...draw(0)}
        />
        <motion.path
          d="M11 18.5l5 5 9-10.5"
          stroke="rgb(23 128 61)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...draw(0.28)}
        />
      </svg>
    </motion.span>
  );
}

const CONFETTI_COLORS = ["#c8343a", "#f5b301", "#17803d", "#5a8fc0", "#b85a8a", "#7a6ac0"];

/** One burst of paper pieces, played once, never with reduced motion. */
export function Confetti({ run }: { run: boolean }) {
  const reduce = Boolean(useReducedMotion());
  const [alive, setAlive] = useState(run && !reduce);
  useEffect(() => {
    if (!run || reduce) return;
    setAlive(true);
    const timer = window.setTimeout(() => setAlive(false), 1800);
    return () => window.clearTimeout(timer);
  }, [run, reduce]);
  if (!alive) return null;
  const pieces = Array.from({ length: 22 }, (_, i) => {
    const angle = (-95 + ((i * 360) / 22 + (i % 3) * 7)) * (Math.PI / 180);
    const reach = 70 + (i % 5) * 18;
    return {
      key: i,
      x: Math.cos(angle) * reach,
      y: Math.sin(angle) * reach * 0.8,
      rotate: (i % 2 ? 1 : -1) * (120 + i * 17),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
      wide: i % 3 === 0,
    };
  });
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-12 z-10 block size-0"
    >
      {pieces.map((piece) => (
        <motion.span
          key={piece.key}
          className={`absolute block rounded-[2px] ${piece.wide ? "h-1 w-2.5" : "size-1.5"}`}
          style={{ backgroundColor: piece.color }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.6, rotate: 0 }}
          animate={{
            x: piece.x,
            y: [0, piece.y - 18, piece.y + 46],
            opacity: [1, 1, 0],
            scale: 1,
            rotate: piece.rotate,
          }}
          transition={{ duration: 1.35, ease: "easeOut", times: [0, 0.45, 1] }}
        />
      ))}
    </span>
  );
}
