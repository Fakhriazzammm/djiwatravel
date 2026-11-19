import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { TRUCK_SRC } from "@/components/shipping/shipping-ui";

const PUFFS = [0, 0.45, 0.9, 1.35];

/**
 * The Travo truck driving along a road: it bobs, exhaust puffs drift back, speed lines and road
 * dashes stream past. Tapping it revs the engine (faster, bigger puffs, a "Tiin!" bubble).
 */
export function ShippingHeroTruck({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  const [rev, setRev] = useState(0);
  const [honk, setHonk] = useState(false);
  const fast = rev > 0;
  const speed = fast ? 0.45 : 1.1;

  const onTap = () => {
    setRev((n) => n + 1);
    setHonk(true);
    window.setTimeout(() => setHonk(false), 900);
    window.setTimeout(() => setRev((n) => (n > 0 ? 0 : n)), 1800);
    try {
      navigator.vibrate?.(12);
    } catch {
      /* vibration is optional */
    }
  };

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label="Truk Travo. Ketuk untuk membunyikan klakson"
      className={`relative block select-none outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      {/* Road dashes */}
      <span className="absolute inset-x-0 bottom-[10px] h-[3px] overflow-hidden" aria-hidden="true">
        <motion.span
          className="absolute inset-y-0 left-0 w-[200%]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(23,24,28,.22) 0 14px, transparent 14px 32px)",
          }}
          animate={reduced ? {} : { x: ["0%", "-16%"] }}
          transition={{ duration: speed, ease: "linear", repeat: Infinity }}
        />
      </span>

      {/* Speed lines */}
      {!reduced &&
        [28, 52, 76].map((top, i) => (
          <motion.span
            key={top}
            aria-hidden="true"
            className="absolute h-[2px] rounded-full bg-foreground/25"
            style={{ top: `${top}%`, left: 0, width: 26 - i * 5 }}
            animate={{ x: [0, -18], opacity: [0, 0.8, 0] }}
            transition={{ duration: speed + i * 0.15, repeat: Infinity, delay: i * 0.25 }}
          />
        ))}

      {/* Exhaust smoke, drifting back (to the left) and up */}
      {!reduced &&
        PUFFS.map((delay) => (
          <motion.span
            key={delay}
            aria-hidden="true"
            className="absolute bottom-[26px] left-[10px] size-3 rounded-full bg-foreground/20 blur-[1px]"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{
              opacity: [0, 0.55, 0],
              scale: fast ? [0.4, 2.4] : [0.4, 1.7],
              x: fast ? [0, -38] : [0, -24],
              y: [0, -22],
            }}
            transition={{
              duration: fast ? 0.9 : 1.8,
              repeat: Infinity,
              delay: delay / (fast ? 2 : 1),
            }}
          />
        ))}

      {/* The truck */}
      <motion.img
        src={TRUCK_SRC}
        alt=""
        draggable={false}
        decoding="async"
        className="relative size-full object-contain"
        animate={
          reduced
            ? {}
            : fast
              ? { y: [0, -3, 0, -2, 0], x: [0, 4, 0], rotate: [0, -1.5, 0] }
              : { y: [0, -2.5, 0], rotate: [0, -0.6, 0] }
        }
        transition={{ duration: fast ? 0.35 : 0.9, repeat: Infinity, ease: "easeInOut" }}
        whileTap={reduced ? {} : { scale: 0.96 }}
      />

      <AnimatePresence>
        {honk && (
          <motion.span
            role="status"
            initial={{ opacity: 0, y: 6, scale: 0.7 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: "spring", stiffness: 500, damping: 26 }}
            className="absolute -top-1 right-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-brand-red shadow"
          >
            Tiin tiin!
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
