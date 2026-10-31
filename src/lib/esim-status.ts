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

export type EsimBadgeTone = "success" | "warning" | "info" | "danger" | "muted";

/**
 * The compact status chip shown on Home passes and lists. Labels and tones derive from the same
 * order-status tables above (one vocabulary); only the shortened wording lives here, once.
 */
export function esimStatusBadge(
  status: OrderStatus,
  options: { low?: boolean } = {},
): { label: string; tone: EsimBadgeTone } {
  if (status === "INSTALLED" && options.low) return { label: "Kuota menipis", tone: "warning" };
  switch (status) {
    case "INSTALLED":
      return { label: "Aktif", tone: "success" };
    case "READY":
      return { label: "Siap dipasang", tone: "info" };
    case "ORDER_CREATED":
    case "WAITING_PAYMENT":
      return { label: "Menunggu bayar", tone: "warning" };
    case "PAID":
    case "PROVISIONING":
      return { label: "Sedang disiapkan", tone: "info" };
    case "PROVISIONING_FAILED":
      return { label: "Butuh bantuan", tone: "danger" };
    default:
      return { label: ORDER_STATUS_LABEL[status], tone: ORDER_STATUS_TONE[status] };
  }
}
