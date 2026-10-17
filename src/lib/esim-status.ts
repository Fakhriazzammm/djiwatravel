import type { OrderStatus } from "./orders";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  ORDER_CREATED: "Pesanan dibuat",
  WAITING_PAYMENT: "Menunggu pembayaran",
  PAID: "Pembayaran berhasil",
  PROVISIONING: "eSIM sedang diproses",
  READY: "Siap dipasang",
  INSTALLED: "Sudah terpasang",
  EXPIRED: "Sudah kedaluwarsa",
  PROVISIONING_FAILED: "Pemrosesan gagal",
  CANCELLED: "Dibatalkan",
  REFUNDED: "Dana dikembalikan",
};

export const ORDER_STATUS_TONE: Record<
  OrderStatus,
  "muted" | "info" | "success" | "warning" | "danger"
> = {
  ORDER_CREATED: "muted",
  WAITING_PAYMENT: "warning",
  PAID: "info",
  PROVISIONING: "info",
  READY: "success",
  INSTALLED: "success",
  EXPIRED: "muted",
  PROVISIONING_FAILED: "danger",
  CANCELLED: "muted",
  REFUNDED: "muted",
};

export function effectiveOrderStatus(
  status: OrderStatus,
  expiresAt?: number,
  now = Date.now(),
): OrderStatus {
  if ((status === "READY" || status === "INSTALLED") && expiresAt && expiresAt <= now)
    return "EXPIRED";
  return status;
}

export function isSensitiveStatus(status: OrderStatus) {
  return status === "READY" || status === "INSTALLED";
}
