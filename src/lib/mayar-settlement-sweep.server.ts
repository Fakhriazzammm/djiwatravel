import { sql } from "drizzle-orm";
import { db } from "@/db/client.server";
import { fetchMayarTransaction } from "./mayar-gateway";
import { settleVerifiedTravelPayment } from "./mayar-settlement.server";
import { provisionSettledTravelOrder } from "./mayar-provisioning.server";
import { refreshTravelOrderProvisioning } from "./esim-provisioning-refresh.server";
import { toIsoTimestamp } from "./payment-snapshot";

/**
 * Settlement safety net for provider-confirmed payments.
 *
 * Settlement is normally driven by the customer coming back to the order page after paying: the
 * browser calls `verifyMayarPayment`, which re-reads the transaction from Mayar and settles it.
 * A customer who pays inside the provider's app and never reopens the order leaves an order that
 * Mayar already confirmed sitting in `PAYMENT_PENDING` forever — no eSIM is provisioned, the
 * finance book never receives the revenue, and nothing retries, because every existing task only
 * looks at orders that already settled locally.
 *
 * This sweep closes that gap: it finds orders whose payment intent the provider already confirmed,
 * re-verifies each one against Mayar, and settles only the ones Mayar reports as paid for the exact
 * order amount. Settlement itself stays in one place (`settleVerifiedTravelPayment`), so the ledger
 * posting, order state transition and idempotency rules are unchanged.
 */

/** Orders older than this are swept; the grace window keeps us off the customer's own verify call. */
export const DEFAULT_GRACE_MINUTES = 5;
export const DEFAULT_SWEEP_LIMIT = 25;

export type ProviderConfirmedOrder = {
  orderId: string;
  orderNumber: string;
  amount: number;
  transactionId: string;
  invoiceId?: string;
};

export type SweepReport = {
  checked: number;
  settled: number;
  skipped: number;
  failed: number;
};

export type SettlementDecision =
  | { action: "settle"; amount: number; paidAt: number }
  | {
      action: "skip";
      reason: "not_paid" | "invalid_amount" | "amount_mismatch" | "invalid_paid_at";
    };

/**
 * Decides whether a provider transaction settles the order it belongs to.
 *
 * Kept pure so the money rules are covered by tests instead of being trusted: a payment settles only
 * when the provider reports it paid AND its amount equals the order total. Anything else stays
 * unsettled for a human, which is the safe direction for money.
 */
export function decidePendingSettlement(input: {
  localAmount: number;
  providerStatus: unknown;
  providerAmount: unknown;
  providerPaidAtMs: number | null;
}): SettlementDecision {
  if (
    String(input.providerStatus ?? "")
      .trim()
      .toLowerCase() !== "paid"
  ) {
    return { action: "skip", reason: "not_paid" };
  }
  const local = input.localAmount;
  const provider = Number(input.providerAmount);
  if (!Number.isSafeInteger(local) || local <= 0)
    return { action: "skip", reason: "invalid_amount" };
  if (!Number.isSafeInteger(provider) || provider !== local) {
    return { action: "skip", reason: "amount_mismatch" };
  }
  if (input.providerPaidAtMs === null || !Number.isSafeInteger(input.providerPaidAtMs)) {
    return { action: "skip", reason: "invalid_paid_at" };
  }
  return { action: "settle", amount: local, paidAt: input.providerPaidAtMs };
}

/** Provider payment timestamp in epoch ms, normalized through the shared snapshot helper. */
export function providerPaidAtMs(transaction: {
  updatedAt?: unknown;
  createdAt?: unknown;
}): number {
  return Date.parse(toIsoTimestamp(transaction.updatedAt ?? transaction.createdAt));
}

/**
 * Orders the provider already confirmed but that never settled locally.
 *
 * `paid_at is null` plus an unsettled status is what makes these invisible to every other task: the
 * finance reconcile only reads orders with `paid_at`, and the provisioning sync only reads orders
 * that already reached `PROVISIONING`/`READY`.
 */
export async function listProviderConfirmedUnpaidOrders(
  limit = DEFAULT_SWEEP_LIMIT,
  graceMinutes = DEFAULT_GRACE_MINUTES,
): Promise<ProviderConfirmedOrder[]> {
  const rows = await db.execute(sql`select o.id, o.public_order_code, o.total_amount,
      i.provider_transaction_id, i.provider_invoice_id
    from public.customer_orders o
    join public.payment_intents i on i.order_id = o.id and i.provider = 'mayar'
    where o.status in ('ORDER_CREATED', 'PAYMENT_PENDING')
      and o.paid_at is null
      and i.status = 'PROVIDER_CONFIRMED'
      and i.provider_transaction_id is not null
      and o.created_at < now() - (${graceMinutes} * interval '1 minute')
    order by o.created_at
    limit ${limit}`);
  return (rows.rows as Array<Record<string, unknown>>)
    .map((row) => ({
      orderId: String(row["id"] ?? ""),
      orderNumber: String(row["public_order_code"] ?? ""),
      amount: Math.round(Number(row["total_amount"] ?? 0)),
      transactionId: String(row["provider_transaction_id"] ?? ""),
      ...(row["provider_invoice_id"] ? { invoiceId: String(row["provider_invoice_id"]) } : {}),
    }))
    .filter((order) => order.orderId !== "" && order.transactionId !== "");
}

export async function sweepPendingProviderPayments(options?: {
  limit?: number;
  graceMinutes?: number;
}): Promise<SweepReport> {
  const orders = await listProviderConfirmedUnpaidOrders(
    options?.limit ?? DEFAULT_SWEEP_LIMIT,
    options?.graceMinutes ?? DEFAULT_GRACE_MINUTES,
  );
  const report: SweepReport = { checked: orders.length, settled: 0, skipped: 0, failed: 0 };
  for (const order of orders) {
    try {
      const transaction = await fetchMayarTransaction(order.transactionId);
      const decision = decidePendingSettlement({
        localAmount: order.amount,
        providerStatus: transaction.status,
        providerAmount: Number(transaction.amount),
        providerPaidAtMs: providerPaidAtMs(transaction),
      });
      if (decision.action === "skip") {
        report.skipped += 1;
        console.warn("[travel] payment sweep left an order unsettled", {
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          reason: decision.reason,
        });
        continue;
      }
      await settleVerifiedTravelPayment({
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        amount: decision.amount,
        paidAt: decision.paidAt,
        transactionId: order.transactionId,
        ...(order.invoiceId ? { invoiceId: order.invoiceId } : {}),
      });
      // The provider only pushes profiles over its own webhook, which is not registered here.
      await refreshTravelOrderProvisioning(order.orderId).catch(() => undefined);
      await provisionSettledTravelOrder(order.orderId).catch(() => undefined);
      report.settled += 1;
      console.info("[travel] payment sweep settled a provider-confirmed order", {
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        amount: decision.amount,
      });
    } catch (error) {
      report.failed += 1;
      console.error("[travel] payment sweep could not settle an order", {
        orderId: order.orderId,
        reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      });
    }
  }
  return report;
}
