import type { ReactNode } from "react";
import { EsimStatusCard } from "@/components/esim-status-card";
import type { OrderStatus } from "@/lib/orders";
import type { ActivationTimeline } from "@/lib/travel-journey";

/**
 * Status card for orders that ended without a usable eSIM (failed, refunded, expired,
 * cancelled). Same light card as the ready and preparing screens, so the order page reads as
 * one family; actions are passed as children.
 */
export function OrderOutcomeCard({
  status,
  summary,
  headline,
  hint,
  timeline,
  children,
}: {
  status: OrderStatus;
  summary: string;
  headline: string;
  hint: string;
  timeline?: ActivationTimeline | undefined;
  children?: ReactNode;
}) {
  return (
    <EsimStatusCard
      testId="order-outcome-card"
      status={status}
      summary={summary}
      headline={headline}
      hint={hint}
      timeline={timeline}
      hideStrip={status === "REFUNDED" || status === "CANCELLED" || status === "EXPIRED"}
    >
      {children}
    </EsimStatusCard>
  );
}
