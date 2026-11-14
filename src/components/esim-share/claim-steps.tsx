import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";

const STEPS = [
  { id: 1, label: "Klaim", detail: "Simpan eSIM ini ke akun Djiwa Travel-mu. Cukup sekali." },
  {
    id: 2,
    label: "Pasang",
    detail: "Scan QR atau masukkan kodenya di Pengaturan eSIM HP. Pakai Wi-Fi saat memasang.",
  },
  {
    id: 3,
    label: "Pakai",
    detail: "Aktifkan eSIM dan data roaming begitu kamu tiba di tujuan.",
  },
] as const;

/**
 * Klaim → Pasang → Pakai. Steps before `current` show a check, the current one pulses once, and
 * tapping any step explains it. The line fills as the journey moves forward.
 */
export function ClaimSteps({ current }: { current: 1 | 2 | 3 }) {
  const reduce = Boolean(useReducedMotion());
  const [picked, setPicked] = useState<number | null>(null);
  const shown = picked ?? current;
  const progress = (current - 1) / (STEPS.length - 1);
  return (
    <div role="group" aria-label="Langkah memakai eSIM">
      <div className="relative">
        <span
          aria-hidden="true"
          className="absolute inset-x-[16.6%] top-[15px] h-0.5 rounded-full bg-border"
        />
        <motion.span
          aria-hidden="true"
          className="absolute left-[16.6%] top-[15px] h-0.5 w-[66.8%] origin-left rounded-full bg-success"
          initial={{ scaleX: reduce ? progress : 0 }}
          animate={{ scaleX: progress }}
          transition={{
            duration: reduce ? 0 : 0.7,
            ease: [0.32, 0.72, 0, 1],
            delay: reduce ? 0 : 0.15,
          }}
        />
        <div className="relative grid grid-cols-3">
          {STEPS.map((step) => {
            const done = step.id < current;
            const active = step.id === current;
            return (
              <button
                key={step.id}
                type="button"
                aria-expanded={shown === step.id}
                aria-current={active ? "step" : undefined}
                onClick={() => setPicked(shown === step.id && picked !== null ? null : step.id)}
                className="tap flex min-h-12 flex-col items-center gap-1 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <motion.span
                  initial={active && !reduce ? { scale: 0.7 } : false}
                  animate={active && !reduce ? { scale: [0.7, 1.18, 1] } : { scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className={`flex size-[30px] items-center justify-center rounded-full text-[12px] font-bold ${
                    done
                      ? "bg-success text-white"
                      : active
                        ? "bg-brand-red text-white shadow-[0_0_0_4px_rgb(200_52_58/0.14)]"
                        : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : step.id}
                </motion.span>
                <span className={shown === step.id ? "text-foreground" : "text-muted-foreground"}>
                  {step.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-1 min-h-[2.5rem] rounded-xl bg-secondary/60 px-3 py-2">
        <AnimatePresence initial={false} mode="wait">
          <motion.p
            key={shown}
            initial={{ opacity: 0, y: reduce ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.16 }}
            className="text-[12px] leading-[1.35] text-muted-foreground"
          >
            {STEPS[shown - 1]!.detail}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
