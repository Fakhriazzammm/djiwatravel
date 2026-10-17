export type ResellerOrderStatus =
  | "DRAFT"
  | "ORDER_CREATED"
  | "PAYMENT_PENDING"
  | "PAYMENT_CONFIRMED"
  | "PROVISIONING"
  | "READY"
  | "INSTALLED"
  | "EXPIRED"
  | "PROVISIONING_FAILED"
  | "CANCELLED"
  | "REFUNDED";

const transitions: Record<ResellerOrderStatus, readonly ResellerOrderStatus[]> = {
  DRAFT: ["ORDER_CREATED", "PAYMENT_PENDING", "CANCELLED"],
  ORDER_CREATED: ["PAYMENT_PENDING", "CANCELLED"],
  PAYMENT_PENDING: ["PAYMENT_CONFIRMED", "CANCELLED", "REFUNDED"],
  PAYMENT_CONFIRMED: ["PROVISIONING", "REFUNDED"],
  PROVISIONING: ["READY", "PROVISIONING_FAILED", "CANCELLED"],
  READY: ["INSTALLED", "EXPIRED", "REFUNDED"],
  INSTALLED: ["EXPIRED", "REFUNDED"],
  EXPIRED: ["REFUNDED"],
  PROVISIONING_FAILED: ["PROVISIONING", "REFUNDED", "CANCELLED"],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: ResellerOrderStatus, to: ResellerOrderStatus) {
  return transitions[from].includes(to);
}
export function assertTransition(from: ResellerOrderStatus, to: ResellerOrderStatus) {
  if (!canTransition(from, to)) throw new Error(`Transisi order tidak valid: ${from} -> ${to}`);
}
export function buildProviderTransactionId(orderId: string) {
  return `DJIWA-${orderId.replace(/[^a-zA-Z0-9-]/g, "")}`.slice(0, 64);
}
export type ProvisioningOrderDraft = {
  orderId: string;
  transactionId: string;
  amountProviderUnits?: number;
  packageInfoList: Array<{
    packageCode: string;
    count: number;
    price?: number;
    periodNum?: number;
  }>;
};
export function buildProvisioningDraft(
  order: Omit<ProvisioningOrderDraft, "transactionId">,
): ProvisioningOrderDraft {
  if (!order.orderId || order.packageInfoList.length === 0)
    throw new Error("Order provisioning tidak lengkap");
  return { ...order, transactionId: buildProviderTransactionId(order.orderId) };
}
