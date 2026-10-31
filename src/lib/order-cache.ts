import { GUEST_ACCESS_TTL_MS } from "./guest-access-policy";
import { isPaymentExpired } from "./payment-expiry";

type CachedOrder = {
  status: string;
  createdAt: number;
  paymentExpiresAt?: number | null | undefined;
  fromMemberAccount?: boolean | undefined;
};

const TERMINAL = new Set(["EXPIRED", "CANCELLED", "REFUNDED"]);

/**
 * A locally cached guest order the server no longer returns for its own token.
 *
 * The cache used to keep such orders forever, so each browser showed ghosts (and stale statuses)
 * that other devices never saw. Pruning is conservative: only orders that are already finished
 * locally, or older than the whole access window, are dropped; a recent live order stays through a
 * transient miss.
 */
export function isGhostGuestOrder(order: CachedOrder, serverReturnedIt: boolean, now = Date.now()) {
  if (serverReturnedIt || order.fromMemberAccount === true) return false;
  return (
    TERMINAL.has(order.status) ||
    isPaymentExpired(order.status, order.paymentExpiresAt, now) ||
    now - order.createdAt > GUEST_ACCESS_TTL_MS
  );
}
