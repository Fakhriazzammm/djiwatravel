import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { springIos } from "@/lib/motion";

export type ShareMood = "wave" | "cheer" | "think";

const SRC: Record<ShareMood, string> = {
  wave: "/assets/home-hero/mascot-v6.png",
  cheer: "/assets/home-hero/mascot-v6.png",
  think: "/assets/home-hero/mascot-ai-think-v1.png",
};

/**
 * Travo on the shared-eSIM pages: a speech bubble with tips, and the mascot itself is the button
 * that moves to the next tip (and hops). It bobs gently while idle, hops when `cheer` changes
 * (the moment a claim lands) and wobbles once when it has bad news. Only transform and opacity
 * animate; reduced motion keeps everything still.
 */
export function ShareMascot({
  mood,
  tips,
  cheer = 0,
  celebrate = false,
  size = 76,
}: {
  mood: ShareMood;
  tips: readonly string[];
  /** Change this number to make Travo hop once. */
  cheer?: number;
  /** Hop once as soon as the mascot appears (a claim has just landed). */
  celebrate?: boolean;
  size?: number;
}) {
  const reduce = Boolean(useReducedMotion());
  const controls = useAnimationControls();
  const [index, setIndex] = useState(0);
  const first = useRef(true);

  const hop = useCallback(() => {
    if (reduce) return;
    void controls.start({
      y: [0, -size * 0.28, 0, -size * 0.09, 0],
      rotate: [0, -9, 7, -3, 0],
      scale: [1, 1.1, 0.97, 1.03, 1],
      transition: { duration: 0.7, ease: "easeOut" },
    });
  }, [controls, reduce, size]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (celebrate) hop();
      if (!reduce && mood === "think")
        void controls.start({
          rotate: [0, -8, 8, -5, 3, 0],
          transition: { duration: 0.9, delay: 0.25, ease: "easeInOut" },
        });
      return;
    }
    hop();
  }, [cheer, hop, mood, reduce, controls, celebrate]);

  const tip = tips[index % Math.max(tips.length, 1)] ?? "";
  const ambient = reduce
    ? {}
    : mood === "think"
      ? {}
      : {
          y: [0, -4, 0],
          rotate: [0, 1.5, 0, -1.5, 0],
          transition: { duration: 3.6, repeat: Infinity, ease: "easeInOut" as const },
        };

  return (
    <div className="flex items-end gap-2">
      <motion.span animate={ambient} className="block shrink-0">
        <motion.button
          type="button"
          aria-label="Tanya Travo"
          onClick={() => {
            hop();
            setIndex((value) => (value + 1) % Math.max(tips.length, 1));
          }}
          animate={controls}
          {...(reduce ? {} : { whileTap: { scale: 0.92 } })}
          className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src={SRC[mood]}
            alt="Maskot Djiwa Travel Travo"
            width={size}
            height={Math.round(size * (mood === "think" ? 1.1 : 0.86))}
            draggable={false}
            loading="eager"
            className="select-none object-contain"
            style={{ width: size }}
          />
        </motion.button>
      </motion.span>
      <div className="relative mb-2 min-w-0 flex-1">
        <span
          aria-hidden="true"
          className="absolute -left-1 bottom-3 size-2.5 rotate-45 rounded-[2px] bg-surface shadow-[-1px_1px_0_rgb(0_0_0/0.04)]"
        />
        <div className="relative rounded-2xl bg-surface px-3 py-2 shadow-[0_1px_6px_rgb(0_0_0/0.07)]">
          <AnimatePresence initial={false} mode="wait">
            <motion.p
              key={index}
              role="status"
              initial={{ opacity: 0, y: reduce ? 0 : 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -4 }}
              transition={reduce ? { duration: 0 } : springIos}
              className="text-[12px] leading-[1.35] text-foreground"
            >
              {tip}
            </motion.p>
          </AnimatePresence>
          {tips.length > 1 && (
            <div className="mt-1.5 flex items-center gap-1" aria-hidden="true">
              {tips.map((_, dot) => (
                <span
                  key={dot}
                  className={`h-1 rounded-full transition-all ${dot === index ? "w-3.5 bg-brand-red" : "w-1 bg-border"}`}
                />
              ))}
              <span className="ml-auto text-[10px] text-muted-foreground">Ketuk Travo</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
