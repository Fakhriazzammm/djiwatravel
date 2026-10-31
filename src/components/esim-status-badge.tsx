import { esimStatusBadge, type EsimBadgeTone } from "@/lib/esim-status";
import type { OrderStatus } from "@/lib/orders";

const TONES: Record<EsimBadgeTone, { chip: string; dot: string }> = {
  success: { chip: "bg-[#E8F6EE] text-[#1E7A4D]", dot: "bg-[#34C759]" },
  warning: { chip: "bg-[#FFF4E5] text-[#9A5B00]", dot: "bg-[#FF9F0A]" },
  info: { chip: "bg-[#E9F2FF] text-[#0057B8]", dot: "bg-[#0A84FF]" },
  danger: { chip: "bg-brand-red-soft text-brand-red", dot: "bg-brand-red" },
  muted: { chip: "bg-secondary text-muted-foreground", dot: "bg-[#8E8E93]" },
};

/** Status chip shared by every eSIM surface; colour never carries the meaning alone. */
export function EsimStatusBadge({ status, low }: { status: OrderStatus; low?: boolean }) {
  const badge = esimStatusBadge(status, { low: low === true });
  const tone = TONES[badge.tone];
  return (
    <span
      data-testid="esim-home-summary-badge"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${tone.chip}`}
    >
      <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
      {badge.label}
    </span>
  );
}
