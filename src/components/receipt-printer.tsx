"use client";

import { CheckCircle2, Loader2, Printer } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ReceiptStage = "processing" | "complete";

const TEETH = 40;
const TOOTH_DEPTH = 4;
const toothPoints = Array.from({ length: TEETH * 2 }, (_, index) => {
  const x = 100 - ((index + 1) * 100) / (TEETH * 2);
  const y = index % 2 === 0 ? "100%" : `calc(100% - ${TOOTH_DEPTH}px)`;
  return `${x}% ${y}`;
}).join(", ");

/** Torn bottom edge of the paper roll, shared with the printable receipt markup. */
export const RECEIPT_CLIP_PATH = `polygon(0 0, 100% 0, 100% calc(100% - ${TOOTH_DEPTH}px), ${toothPoints})`;

/** Indonesian copy for the machine's little screen. */
export const RECEIPT_STAGE_LABEL: Record<ReceiptStage, string> = {
  processing: "Menunggu pembayaran",
  complete: "Pembayaran selesai",
};

/**
 * A receipt printer: the machine, its status screen and the paper that feeds out once the order
 * is paid. Purely presentational — the caller decides the stage and supplies the receipt body.
 * Only `transform` and `opacity` animate, and reduced motion removes the feed entirely.
 */
export function ReceiptPrinter({
  stage,
  statusText,
  footer,
  children,
}: {
  stage: ReceiptStage;
  statusText?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const complete = stage === "complete";
  const label = statusText ?? RECEIPT_STAGE_LABEL[stage];

  return (
    <section
      aria-label="Struk pembayaran"
      data-receipt-stage={stage}
      className="relative isolate flex w-full flex-col items-center"
    >
      {/* Machine body */}
      <div className="print-hide relative isolate w-full overflow-hidden rounded-[1.5rem] border border-border bg-secondary p-3 pb-7 shadow-[0_18px_30px_-18px_rgba(15,23,42,0.35),inset_0_1px_0_rgba(255,255,255,0.55)]">
        <div className="relative z-10 flex h-9 items-start justify-between">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Printer className="size-3.5" aria-hidden="true" />
            Djiwa Travel
          </span>
        </div>

        {/* Status screen */}
        <div className="relative z-10 rounded-[1rem] bg-foreground px-4 py-3.5 text-background shadow-inner">
          <div className="flex items-center gap-2.5">
            {complete ? (
              <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <Loader2
                className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            <p
              aria-live="polite"
              className="min-w-0 truncate text-xs font-medium tracking-wide text-background/85"
            >
              {label}
            </p>
          </div>
        </div>

        {/* Paper slot */}
        <div
          aria-hidden="true"
          className="relative z-20 mx-auto mt-3 h-1.5 w-[62%] rounded-full bg-foreground/25"
        />
      </div>

      {/* Paper output */}
      <div className="receipt-output relative z-10 -mt-3 h-[26rem] w-[calc(78%+3rem)] max-w-full overflow-hidden px-1">
        <motion.div
          initial={false}
          animate={{
            opacity: complete || reduce ? 1 : 0,
            transform: complete ? "translateY(0%)" : "translateY(calc(-100% + 6px))",
          }}
          transition={{
            opacity: { duration: reduce ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] },
            transform: { duration: reduce ? 0 : 1.5, ease: [0.23, 1, 0.32, 1] },
          }}
          className="relative"
        >
          <article
            data-testid="receipt-paper"
            className="min-h-[22rem] bg-surface px-6 pt-7 pb-8 font-mono text-[13px] leading-relaxed text-foreground shadow-[0_10px_28px_-14px_rgba(15,23,42,0.4)]"
            style={{ clipPath: RECEIPT_CLIP_PATH }}
          >
            {children}
          </article>
        </motion.div>
      </div>

      {footer ? (
        <div className={cn("mt-2 flex w-full flex-col items-stretch gap-2")}>{footer}</div>
      ) : null}
    </section>
  );
}

/** One dotted-key line of the receipt. */
export function ReceiptLine({
  label,
  value,
  strong,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "text-right font-semibold" : "text-right"}>{value}</span>
    </div>
  );
}

/** Dashed separator, like the torn perforation between receipt sections. */
export function ReceiptRule() {
  return <div aria-hidden="true" className="my-3 border-t border-dashed border-border" />;
}
