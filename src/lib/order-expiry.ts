import { isUnpaidOrderStatus } from "./payment-expiry";

/**
 * Durable order expiry.
 *
 * Only an unpaid order may expire. A settled order that is still provisioning is NOT an expiry
 * candidate: its money is in, and marking it expired would strand a paid customer and hide the
 * order from operations. Activation validity is separate from the payment window.
 */
export type ExpiryCandidate = {
  status: string;
  paymentExpiresAt?: string | number | Date | null;
};

export type ExpiryDecision =
  | { expire: true; reason: "payment_window_elapsed" | "draft_abandoned" }
  | { expire: false; reason: "settled" | "not_due" | "no_window" | "terminal" };

export const ABANDONED_DRAFT_GRACE_MS = 24 * 60 * 60 * 1000;

export function expiryDecision(
  candidate: ExpiryCandidate,
  nowMs: number,
  createdAtMs?: number | null,
): ExpiryDecision {
  const status = (candidate.status ?? "").toUpperCase();
  // Terminal states are already resolved; re-writing them would corrupt history.
  if (status === "CANCELLED" || status === "REFUNDED" || status === "EXPIRED") {
    return { expire: false, reason: "terminal" };
  }
  if (!isUnpaidOrderStatus(status)) return { expire: false, reason: "settled" };

  if (candidate.paymentExpiresAt != null) {
    const raw = candidate.paymentExpiresAt;
    const at =
      raw instanceof Date ? raw.getTime() : typeof raw === "number" ? raw : Date.parse(String(raw));
    if (!Number.isFinite(at)) return { expire: false, reason: "no_window" };
    return at <= nowMs
      ? { expire: true, reason: "payment_window_elapsed" }
      : { expire: false, reason: "not_due" };
  }

  // A draft with no window at all is exempt from the window rule, but an abandoned draft still
  // needs to leave the pending queue or operations sees it forever.
  if (typeof createdAtMs === "number" && Number.isFinite(createdAtMs)) {
    return nowMs - createdAtMs >= ABANDONED_DRAFT_GRACE_MS
      ? { expire: true, reason: "draft_abandoned" }
      : { expire: false, reason: "not_due" };
  }
  return { expire: false, reason: "no_window" };
}

/** SQL the expiry worker uses; exported so a test can assert the settled-order guard is present. */
export const EXPIRY_SCAN_SQL = [
  "status in ('DRAFT','ORDER_CREATED','PAYMENT_PENDING')",
  "payment_expires_at is not null",
  "payment_expires_at <= now()",
].join("\n  and ");
