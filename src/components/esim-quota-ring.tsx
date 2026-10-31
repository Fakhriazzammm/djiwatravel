import { motion, useReducedMotion } from "motion/react";
import { springIos } from "@/lib/motion";

/**
 * The one circular quota gauge (Home passes and the eSIM detail usage card).
 * Only measured usage may be drawn; callers pass `null` for unknown and render nothing.
 */
export function QuotaRing({
  percent,
  label,
  valueText,
  low = false,
  size = 56,
  testId,
}: {
  percent: number;
  /** Visible percentage text inside the ring, e.g. "64%" or "<1%". */
  label: string;
  /** Accessible value, e.g. "Sisa 3.2 GB (64%)". */
  valueText?: string;
  low?: boolean;
  size?: number;
  testId?: string;
}) {
  const reduce = useReducedMotion();
  const progress = Math.max(0, Math.min(100, percent));
  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label="Sisa kuota eSIM"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      aria-valuetext={valueText ?? `${progress}%`}
      data-testid={testId}
    >
      <svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(60,60,67,.12)" strokeWidth="4" />
        <motion.circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke={low ? "#FF9F0A" : "#B63D4B"}
          strokeWidth="4"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100 100"
          initial={reduce ? false : { strokeDashoffset: 100 }}
          animate={{ strokeDashoffset: 100 - progress }}
          transition={reduce ? { duration: 0 } : { ...springIos, duration: 1 }}
        />
      </svg>
      <span className="text-[10.5px] font-bold text-foreground">{label}</span>
    </div>
  );
}
