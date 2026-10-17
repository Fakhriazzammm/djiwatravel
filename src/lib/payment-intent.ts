export type PaymentIntentStatus =
  "CLAIMED" | "REQUESTING" | "PROVIDER_CONFIRMED" | "UNKNOWN" | "FAILED" | "EXPIRED";

export type PaymentIntentRecord = {
  orderId: string;
  provider: string;
  idempotencyKey: string;
  status: PaymentIntentStatus;
  providerInvoiceId?: string | null;
  providerTransactionId?: string | null;
  paymentUrl?: string | null;
  amount: number;
  currency: string;
  lastError?: string | null;
};

/** Provider idempotency is intentionally not assumed; the database claim is authoritative. */
export function claimPaymentIntent(
  existing: PaymentIntentRecord | null,
  next: Omit<PaymentIntentRecord, "status">,
): { action: "reuse" | "create"; intent: PaymentIntentRecord } {
  if (existing) return { action: "reuse", intent: existing };
  return { action: "create", intent: { ...next, status: "CLAIMED" } };
}

export function canCreateProviderInvoice(intent: PaymentIntentRecord) {
  return !intent.providerInvoiceId && ["CLAIMED", "REQUESTING", "UNKNOWN"].includes(intent.status);
}

export function markProviderTimeout(
  intent: PaymentIntentRecord,
  message = "provider_timeout",
): PaymentIntentRecord {
  return { ...intent, status: "UNKNOWN", lastError: message };
}
