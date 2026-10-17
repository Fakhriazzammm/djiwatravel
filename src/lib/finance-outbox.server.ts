import { sql } from "drizzle-orm";
import { db } from "../db/client.server";
import { retryDecision, safeErrorSummary } from "./retry-policy";
import {
  postTravelFinanceSettlement,
  type TravelFinanceGatewayPayload,
} from "./mayar-settlement.server";

/**
 * Finance posting outbox.
 *
 * Posting the ledger entry used to be best-effort inside settlement: when Djiwa Finance was
 * unreachable the order still settled (correct — the money did arrive) but the accounting
 * obligation vanished with a log line and nobody could retry it.
 *
 * A settled order with an unposted entry is now a durable row. `idempotency_key` is derived from the
 * order and the provider transaction, so a retry after a timeout that actually succeeded cannot
 * double-post.
 */

export function financeIdempotencyKey(orderId: string, transactionId: string) {
  return `travel:settlement:${orderId}:${transactionId}`;
}

/**
 * Enqueue the posting obligation. Idempotent on (order_id, purpose): an order that already has an
 * outbox row returns the existing one instead of creating a second obligation.
 */
export async function enqueueFinancePosting(input: {
  orderId: string;
  transactionId: string;
  amount: number;
  payload: TravelFinanceGatewayPayload;
}) {
  const key = financeIdempotencyKey(input.orderId, input.transactionId);
  const inserted =
    await db.execute(sql`insert into public.finance_outbox(order_id, purpose, idempotency_key, status, amount, currency_code, payload, attempt_count, next_retry_at, created_at, updated_at)
    values (${input.orderId}::uuid, 'SETTLEMENT', ${key}, 'PENDING', ${input.amount}, 'IDR', ${JSON.stringify(input.payload)}::jsonb, 0, now(), now(), now())
    on conflict (order_id, purpose) do nothing
    returning id`);
  if (inserted.rows.length > 0) return { created: true };
  const existing = await db.execute(
    sql`select status from public.finance_outbox where order_id = ${input.orderId}::uuid and purpose = 'SETTLEMENT' limit 1`,
  );
  const status = String((existing.rows[0] as { status?: string } | undefined)?.status ?? "");
  // A posted entry is final; nothing to do and nothing to retry.
  return { created: false, status };
}

/** Claim due outbox work. Single conditional UPDATE so concurrent workers cannot double-post. */
export async function claimFinancePosting(leaseOwner: string, leaseSeconds = 120) {
  const claimed = await db.execute(sql`update public.finance_outbox
    set status = 'POSTING',
        lease_owner = ${leaseOwner},
        locked_until = now() + (${leaseSeconds} * interval '1 second'),
        attempt_count = attempt_count + 1,
        updated_at = now()
    where id = (
      select id from public.finance_outbox
      where status in ('PENDING', 'FAILED')
        and (next_retry_at is null or next_retry_at <= now())
        and (locked_until is null or locked_until < now())
      order by created_at
      for update skip locked
      limit 1
    )
    returning id, order_id, payload, attempt_count`);
  return claimed.rows[0] as
    | { id: string; order_id: string; payload: TravelFinanceGatewayPayload; attempt_count: number }
    | undefined;
}

/** Post one claimed row and persist the outcome, including the retry schedule. */
export async function processFinancePosting(row: {
  id: string;
  payload: TravelFinanceGatewayPayload;
  attempt_count: number;
}) {
  try {
    const response = await postTravelFinanceSettlement(row.payload);
    await db.execute(sql`update public.finance_outbox
      set status = 'POSTED', posted_at = now(), last_error_safe = null, next_retry_at = null,
          lease_owner = null, locked_until = null, updated_at = now()
      where id = ${row.id}::uuid`);
    return { posted: true, dedup: response.dedup };
  } catch (error) {
    const decision = retryDecision({ attemptCount: row.attempt_count }, Date.now());
    const summary = safeErrorSummary(error);
    if (decision.action === "dead_letter") {
      await db.execute(sql`update public.finance_outbox
        set status = 'DEAD_LETTER', last_error_safe = ${summary}, lease_owner = null, locked_until = null, updated_at = now()
        where id = ${row.id}::uuid`);
      console.error("[travel] finance outbox dead-lettered", {
        outboxId: row.id,
        orderId: row.payload.orderId,
        summary,
      });
      return { posted: false, deadLetter: true };
    }
    await db.execute(sql`update public.finance_outbox
      set status = 'FAILED', last_error_safe = ${summary},
          next_retry_at = ${new Date(decision.nextRetryAtMs).toISOString()}::timestamptz,
          lease_owner = null, locked_until = null, updated_at = now()
      where id = ${row.id}::uuid`);
    return { posted: false, nextRetryAtMs: decision.nextRetryAtMs };
  }
}

/** Drain at most `limit` due postings; used by the scheduled recovery task. */
export async function drainFinanceOutbox(leaseOwner: string, limit = 20) {
  let posted = 0;
  let failed = 0;
  let deadLetter = 0;
  for (let i = 0; i < limit; i += 1) {
    const row = await claimFinancePosting(leaseOwner);
    if (!row) break;
    const result = await processFinancePosting(row);
    if (result.posted) posted += 1;
    else if ("deadLetter" in result && result.deadLetter) deadLetter += 1;
    else failed += 1;
  }
  return { posted, failed, deadLetter };
}

/** Safe operator view of unresolved finance obligations. */
export async function financeOutboxReview() {
  const result = await db.execute(sql`select status, count(*)::int as count
    from public.finance_outbox
    where status in ('PENDING', 'POSTING', 'FAILED', 'DEAD_LETTER')
    group by status`);
  const counts: Record<string, number> = {};
  for (const row of result.rows as Array<{ status?: string; count?: number }>) {
    if (row.status) counts[row.status] = Number(row.count ?? 0);
  }
  return counts;
}
