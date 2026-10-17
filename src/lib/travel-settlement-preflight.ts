export const SETTLEABLE_TRAVEL_ORDER_STATUSES = new Set([
  "ORDER_CREATED",
  "PAYMENT_PENDING",
  "PAYMENT_CONFIRMED",
  "PROVISIONING",
  // The payment settled here too; a failed eSIM provisioning must stay retryable.
  "PROVISIONING_FAILED",
  "READY",
  "INSTALLED",
]);

type TravelSettlementPreflightInput = {
  status: string;
  totalAmount: string | number;
  paymentReference: string | null;
  payloadAmount: number;
  payloadInvoiceId: string;
  paidAt: string;
};

export function validateTravelSettlementPreflight(
  input: TravelSettlementPreflightInput,
): string | null {
  const totalAmount = Number(input.totalAmount);
  if (
    !Number.isSafeInteger(totalAmount) ||
    totalAmount <= 0 ||
    input.payloadAmount !== totalAmount
  ) {
    return "amount_mismatch";
  }
  if (input.paymentReference && input.paymentReference !== input.payloadInvoiceId) {
    return "invoice_mismatch";
  }
  if (!SETTLEABLE_TRAVEL_ORDER_STATUSES.has(input.status)) return "invalid_order_status";
  const paidAt = Date.parse(input.paidAt);
  if (!Number.isSafeInteger(paidAt)) return "invalid_paid_at";
  return null;
}
