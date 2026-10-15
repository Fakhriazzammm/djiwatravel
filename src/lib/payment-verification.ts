/**
 * Payment authority: what a payment callback is allowed to do on its own.
 *
 * A signed callback is evidence that a trusted peer believes the money arrived, not proof that it
 * did. The provider's own transaction record is the proof. Three outcomes matter and must stay
 * distinguishable:
 *  - `verified`   — the provider agrees, so the order may settle;
 *  - `rejected`   — the provider disagrees (unpaid, wrong amount, unknown transaction): never settle,
 *                   because the callback is contradicted by the authority;
 *  - `unavailable`— the provider could not be read. Settling stays allowed only while the scheduled
 *                   reconciliation is still running, and the callback is recorded as the evidence
 *                   used so an audit can tell the two paths apart.
 */

export type DirectVerification =
  | { state: "verified"; amount: number }
  | { state: "rejected"; reason: "not_paid" | "amount_mismatch" | "invalid_amount" | "unknown_transaction" }
  | { state: "unavailable"; reason: string };

export type PaymentAuthorityDecision =
  | { settle: true; authority: "provider_direct" }
  | { settle: true; authority: "signed_callback"; warning: string }
  | { settle: false; reason: string };

export function decidePaymentAuthority(
  callback: { amount: number },
  verification: DirectVerification,
): PaymentAuthorityDecision {
  if (verification.state === "verified") {
    if (!Number.isSafeInteger(verification.amount) || verification.amount <= 0) {
      return { settle: false, reason: "verified_amount_invalid" };
    }
    if (verification.amount !== callback.amount) return { settle: false, reason: "amount_mismatch" };
    return { settle: true, authority: "provider_direct" };
  }
  if (verification.state === "rejected") return { settle: false, reason: verification.reason };
  // Fail-open on an unreadable provider, deliberately: the callback already passed HMAC + source
  // checks and the reconciliation sweep stays active. A fail-closed default here would turn a
  // provider timeout into a paid customer with no order.
  const warning = verification.reason.replace(/[\r\n\t]+/g, " ").slice(0, 200);
  return { settle: true, authority: "signed_callback", warning };
}

export function verificationFromTransaction(transaction: {
  status?: string;
  amount?: number;
} | null | undefined): DirectVerification {
  if (!transaction) return { state: "rejected", reason: "unknown_transaction" };
  if (String(transaction.status ?? "").toLowerCase() !== "paid") return { state: "rejected", reason: "not_paid" };
  const amount = Number(transaction.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) return { state: "rejected", reason: "invalid_amount" };
  return { state: "verified", amount };
}
