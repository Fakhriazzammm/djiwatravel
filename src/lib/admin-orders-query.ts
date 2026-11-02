/** Client-safe constants for the Orders list query; the SQL lives in admin-read-model.server.ts. */
export const ADMIN_ORDERS_PAGE_SIZE = 25;
export const ADMIN_ORDER_STATUSES = [
  "ALL",
  "ORDER_CREATED",
  "PAYMENT_PENDING",
  "PAYMENT_CONFIRMED",
  "PROVISIONING",
  "PROVISIONING_FAILED",
  "READY",
  "INSTALLED",
  "EXPIRED",
  "CANCELLED",
  "REFUNDED",
] as const;
