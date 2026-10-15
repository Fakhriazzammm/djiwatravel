import { sql } from "drizzle-orm";
import { db } from "../db/client.server";
import { expiryDecision, ABANDONED_DRAFT_GRACE_MS } from "./order-expiry";

/**
 * Durable order expiry.
 *
 * Invariant enforced here: only an UNPAID order can expire. The scan is restricted to unpaid
 * statuses in SQL (not just in the pure decision) so a bug in the caller can never mark a settled
 * order expired and strand a paid customer's money.
 *
 * Unpaid orders with an elapsed payment window are marked EXPIRED. A draft with no window at all is
 * swept after a grace period, otherwise it sits in the pending queue forever and operations cannot
 * tell "abandoned" from "in progress".
 */

export type ExpirySweepResult = {
  scanned: number;
  expired: number;
  skipped: number;
};

/** Unpaid statuses only — the guard that keeps expiry away from settled money. */
const EXPIRABLE_STATUSES = ["DRAFT", "ORDER_CREATED", "PAYMENT_PENDING"] as const;

export async function sweepExpiredOrders(limit = 200, nowMs = Date.now()): Promise<ExpirySweepResult> {
  const candidates = await db.execute(sql`select id, status, payment_expires_at, created_at
    from public.customer_orders
    where status = any(${sql.raw(`array['${EXPIRABLE_STATUSES.join("','")}']::text[]`)})
      and (
        (payment_expires_at is not null and payment_expires_at <= now())
        or (
          payment_expires_at is null
          and created_at <= now() - (${ABANDONED_DRAFT_GRACE_MS} * interval '1 millisecond')
        )
      )
    order by created_at
    limit ${limit}`);

  let expired = 0;
  let skipped = 0;
  for (const row of candidates.rows as Array<{
    id: string;
    status: string;
    payment_expires_at: string | null;
    created_at: string | null;
  }>) {
    const decision = expiryDecision(
      { status: row.status, paymentExpiresAt: row.payment_expires_at },
      nowMs,
      row.created_at ? Date.parse(row.created_at) : null,
    );
    if (!decision.expire) {
      skipped += 1;
      continue;
    }
    // The UPDATE repeats the unpaid guard: between the scan and this write the order may have been
    // settled by a payment callback, and expiring it then would lose a paid order.
    const updated = await db.execute(sql`update public.customer_orders
      set status = 'EXPIRED', updated_at = now()
      where id = ${row.id}::uuid
        and status = any(${sql.raw(`array['${EXPIRABLE_STATUSES.join("','")}']::text[]`)})
      returning id`);
    if (updated.rows.length > 0) expired += 1;
    else skipped += 1;
  }
  return { scanned: candidates.rows.length, expired, skipped };
}

/** Unpaid orders that are still pending past their window — the operationally ambiguous ones. */
export async function countStalePendingOrders(nowMs = Date.now()): Promise<number> {
  const result = await db.execute(sql`select count(*)::int as count
    from public.customer_orders
    where status = any(${sql.raw(`array['${EXPIRABLE_STATUSES.join("','")}']::text[]`)})
      and payment_expires_at is not null
      and payment_expires_at <= to_timestamp(${nowMs} / 1000.0)`);
  return Number((result.rows[0] as { count?: number } | undefined)?.count ?? 0);
}
