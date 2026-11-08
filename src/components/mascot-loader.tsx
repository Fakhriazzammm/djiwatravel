import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { easeIos, springIos } from "@/lib/motion";

/** Mascot holding a paper map, made with the mascot skill (see ASSET-MANIFEST.md). */
const LOADER_MASCOT = "/assets/home-hero/mascot-map-v1.png";

/** Friendly status lines that rotate while something loads, so the wait reads as progress. */
export const LOADING_LINES = {
  ideas: [
    "Membuka peta kota…",
    "Mencari tempat terkenal di sekitar…",
    "Membaca cerita tempatnya…",
    "Memilih foto yang pas…",
    "Hampir siap!",
  ],
  page: ["Menyiapkan perjalananmu…", "Mengambil data terbaru…", "Sebentar lagi mendarat…"],
} as const;

/**
 * The plush airplane mascot flying over drifting clouds, with a status line that changes every
 * couple of seconds. Only opacity and transform animate; with reduced motion it stays still and
 * the line still changes. `compact` fits inside a carousel row, the default fills a page.
 */
export function MascotLoader({
  lines = LOADING_LINES.page,
  compact = false,
  label = "Memuat",
  intervalMs = 2200,
}: {
  lines?: readonly string[];
  compact?: boolean;
  label?: string;
  intervalMs?: number;
}) {
  const reduce = Boolean(useReducedMotion());
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (lines.length < 2) return;
    const timer = setInterval(() => setIndex((n) => (n + 1) % lines.length), intervalMs);
    return () => clearInterval(timer);
  }, [lines.length, intervalMs]);
  const size = compact ? 56 : 96;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      data-testid="mascot-loader"
      className={`relative flex flex-col items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b from-sky-50 to-surface text-center ${
        compact ? "h-[104px] w-full px-3" : "min-h-[260px] w-full px-6 py-8"
      }`}
    >
      {[0, 1, 2].map((n) => (
        <motion.span
          key={n}
          aria-hidden="true"
          className="absolute h-3 rounded-full bg-white/80"
          style={{ top: `${14 + n * 24}%`, width: 28 + n * 14, left: "-20%" }}
          animate={reduce ? { x: "120%" } : { x: ["0%", "1400%"] }}
          transition={{ duration: 7 + n * 2, ease: "linear", repeat: Infinity, delay: n * 1.6 }}
        />
      ))}
      <motion.img
        src={LOADER_MASCOT}
        alt=""
        width={size}
        height={Math.round(size * 0.94)}
        className="relative drop-shadow-md"
        draggable={false}
        {...(reduce ? {} : { animate: { y: [0, -7, 0], rotate: [-3, 3, -3] } })}
        transition={{ duration: 2.6, ease: easeIos, repeat: Infinity }}
      />
      <div className={`relative h-5 ${compact ? "mt-1" : "mt-3"}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={springIos}
            className="text-[12px] font-semibold text-foreground/80"
          >
            {lines[index % lines.length]}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="relative mt-1.5 flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((n) => (
          <motion.span
            key={n}
            className="size-1.5 rounded-full bg-brand-red/70"
            {...(reduce ? {} : { animate: { opacity: [0.3, 1, 0.3], scale: [0.8, 1.15, 0.8] } })}
            transition={{ duration: 1.1, repeat: Infinity, delay: n * 0.18 }}
          />
        ))}
      </div>
    </div>
  );
}
