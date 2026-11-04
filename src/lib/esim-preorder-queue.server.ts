import { getBalanceSnapshot } from "./sellability.server";
import { pool } from "@/db/client.server";
import { notifyPreorderOrder } from "./preorder-notifications.server";
import { provisionSettledTravelOrder } from "./mayar-provisioning.server";

/** Moves overdue, unpaid-to-provider preorders into the Admin review queue; never executes a refund. */
export async function sweepExpiredPreorders() {
  const result = await pool.query(
    `update public.customer_orders o
        set preorder_status = 'refund_review', updated_at = now()
      where o.fulfillment_mode = 'preorder'
        and o.preorder_status in ('pending', 'processing')
        and o.preorder_deadline_at <= now()
        and o.status <> 'READY'
        and not exists (
          select 1 from public.esim_provisioning_orders p
           where p.order_id = o.id and p.status = 'PROVISIONING'
             and p.lease_expires_at > now()
        )
      returning o.id`,
  );
  const orderIds = (result.rows as Array<{ id?: string }>).map((row) => String(row.id ?? ""));
  await Promise.allSettled(
    orderIds.map((orderId) => notifyPreorderOrder(orderId, "refund_review")),
  );
  return { movedToReview: orderIds.length };
}

/** Buys queued preorders oldest-first after each fresh provider-balance check. */
export async function processPreorderQueue(limit = 10) {
  const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 50));
  const queue = await pool.query(
    `select o.id from public.customer_orders o
      where o.fulfillment_mode = 'preorder'
        and o.preorder_status in ('pending', 'processing')
        and o.preorder_deadline_at > now()
        and o.status in ('PAYMENT_CONFIRMED', 'PROVISIONING_FAILED', 'PROVISIONING')
        and not exists (
          select 1 from public.esim_provisioning_orders p
           where p.order_id = o.id and (p.provider_order_no is not null or p.lease_expires_at > now())
        )
      order by o.paid_at asc nulls last, o.created_at asc
      limit $1`,
    [boundedLimit],
  );
  const snapshot = await getBalanceSnapshot({ forceRefresh: true });
  let remainingUnits = snapshot.balanceUnits ?? 0;
  let started = 0;
  let waitingBalance = 0;
  let busy = false;
  const failed: string[] = [];
  for (const row of queue.rows as Array<{ id?: string }>) {
    const orderId = String(row.id ?? "");
    if (!orderId) continue;
    try {
      const result = await provisionSettledTravelOrder(orderId, {
        balanceLimitUnits: remainingUnits,
      });
      if (
        result.status === "PREORDER_WAITING_BALANCE" ||
        result.status === "PREORDER_BALANCE_UNKNOWN"
      ) {
        waitingBalance += 1;
        // Preserve FIFO priority; later, cheaper packages should not jump the oldest paid order.
        break;
      }
      if (result.status === "PREORDER_WORKER_BUSY") {
        busy = true;
        break;
      }
      if (result.status === "PREORDER_REFUND_REVIEW") continue;
      if (result.started) {
        started += 1;
        remainingUnits = Math.max(
          0,
          remainingUnits - ("spentUnits" in result ? Number(result.spentUnits) : 0),
        );
      }
      // An uncertain provider failure can mean an order was accepted. Stop before spending on a
      // later preorder; the deterministic provider transaction id makes the first one retryable.
      if (
        result.status === "PROVISIONING_FAILED" ||
        result.status === "PREORDER_PRICE_UNAVAILABLE"
      ) {
        failed.push(orderId);
        break;
      }
    } catch {
      failed.push(orderId);
      break;
    }
  }
  return { checked: queue.rows.length, started, waitingBalance, busy, failed };
}
