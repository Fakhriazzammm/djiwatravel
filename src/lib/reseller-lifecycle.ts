import { assertTransition, type ResellerOrderStatus } from "./reseller-order";

export function nextCancellationStatus(status: ResellerOrderStatus): "CANCELLED" | "REFUNDED" {
  if (status === "PAYMENT_PENDING" || status === "DRAFT") {
    assertTransition(status, "CANCELLED");
    return "CANCELLED";
  }
  if (status === "PAYMENT_CONFIRMED" || status === "PROVISIONING_FAILED" || status === "READY") {
    assertTransition(status, "REFUNDED");
    return "REFUNDED";
  }
  throw new Error(`Order tidak dapat dibatalkan dari status ${status}`);
}

export function canRetryProvisioning(status: ResellerOrderStatus) {
  return status === "PROVISIONING_FAILED";
}

export function isExpired(expiresAt: number, now = Date.now()) {
  return expiresAt <= now;
}
