export const UNPAID_ORDER_STATUSES = ["DRAFT", "ORDER_CREATED", "PAYMENT_PENDING"] as const;

export function isUnpaidOrderStatus(status: string) {
  return (UNPAID_ORDER_STATUSES as readonly string[]).includes(status);
}

/** Payment expiry applies only before settlement; activation expiry is separate. */
export function isPaymentExpired(status: string, paymentExpiresAt: string | number | Date | null | undefined, now = Date.now()) {
  if (!isUnpaidOrderStatus(status) || paymentExpiresAt == null) return false;
  const expiresAtMs = paymentExpiresAt instanceof Date ? paymentExpiresAt.getTime() : typeof paymentExpiresAt === "number" ? paymentExpiresAt : Date.parse(paymentExpiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs <= now;
}

export function effectivePaymentStatus(status: string, paymentExpiresAt: string | number | Date | null | undefined, now = Date.now()) {
  return isPaymentExpired(status, paymentExpiresAt, now) ? "EXPIRED" : status;
}

export function assertPaymentNotExpired(status: string, paymentExpiresAt: string | number | Date | null | undefined, now = Date.now()) {
  if (isPaymentExpired(status, paymentExpiresAt, now)) throw new Error("Pesanan pembayaran sudah kedaluwarsa");
}
