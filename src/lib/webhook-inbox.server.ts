import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db/client.server";
import { retryDecision, safeErrorSummary, type RetryDecision } from "./retry-policy";

/**
 * Durable webhook inbox.
 *
 * The callback used to do all its bookkeeping inline, so a process restart between "receipt
 * accepted" and "writes finished" lost the event, and a redelivery was only suppressed by a unique
 * key on a row that had already been written. Receipt is now recorded first and processing happens
 * after, so the event survives a crash and a redelivery is a no-op.
 *
 * This is transport state only. `customer_orders` stays the source of truth for whether an order is
 * paid, so a duplicate can never settle an order twice.
 */

export const WEBHOOK_INBOX_PROVIDER = "mayar";

export function payloadHash(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

/**
 * Record a receipt. Returns `false` when this exact event was already received, which the caller
 * must treat as "already handled" rather than as an error — providers retry aggressively and a
 * non-2xx response just makes them retry harder.
 */
export async function recordWebhookReceipt(input: {
  provider: string;
  eventId: string;
  eventType: string;
  payload: unknown;
  rawBody: string;
}): Promise<boolean> {
  const inserted =
    await db.execute(sql`insert into public.webhook_inbox(provider, event_id, event_type, payload_hash, payload, status, attempt_count, received_at, updated_at)
    values (${input.provider}, ${input.eventId}, ${input.eventType}, ${payloadHash(input.rawBody)}, ${JSON.stringify(input.payload)}::jsonb, 'RECEIVED', 0, now(), now())
    on conflict (provider, event_id) do nothing
    returning id`);
  return inserted.rows.length > 0;
}

/**
 * Claim one receipt for processing.
 *
 * The claim is a single conditional UPDATE, so two workers cannot both take the same event: the
 * loser sees zero rows. `locked_until` is the lease, which means a worker that dies mid-processing
 * releases its event automatically instead of stranding it.
 */
export async function claimWebhookReceipt(leaseOwner: string, leaseSeconds = 60) {
  const claimed = await db.execute(sql`update public.webhook_inbox
    set status = 'PROCESSING',
        lease_owner = ${leaseOwner},
        locked_until = now() + (${leaseSeconds} * interval '1 second'),
        attempt_count = attempt_count + 1,
        updated_at = now()
    where id = (
      select id from public.webhook_inbox
      where status in ('RECEIVED', 'FAILED')
        and (next_retry_at is null or next_retry_at <= now())
        and (locked_until is null or locked_until < now())
      order by received_at
      for update skip locked
      limit 1
    )
    returning id, provider, event_id, event_type, payload, attempt_count`);
  return claimed.rows[0] as
    | {
        id: string;
        provider: string;
        event_id: string;
        event_type: string;
        payload: unknown;
        attempt_count: number;
      }
    | undefined;
}

/**
 * Finish a receipt. A successful finish marks it PROCESSED only after the caller's writes committed,
 * which is the property the inline version lacked.
 */
export async function finishWebhookReceipt(id: string, decision: RetryDecision, error?: unknown) {
  const summary = error === undefined ? null : safeErrorSummary(error);
  if (decision.action === "dead_letter") {
    await db.execute(sql`update public.webhook_inbox
      set status = 'DEAD_LETTER', last_error_safe = ${summary}, lease_owner = null, locked_until = null, updated_at = now()
      where id = ${id}::uuid`);
    return;
  }
  await db.execute(sql`update public.webhook_inbox
    set status = ${decision.action === "retry" ? "FAILED" : "RECEIVED"},
        last_error_safe = ${summary},
        next_retry_at = ${new Date(decision.nextRetryAtMs).toISOString()}::timestamptz,
        lease_owner = null,
        locked_until = null,
        updated_at = now()
    where id = ${id}::uuid`);
}

export async function markWebhookReceiptProcessed(id: string) {
  await db.execute(sql`update public.webhook_inbox
    set status = 'PROCESSED', processed_at = now(), last_error_safe = null,
        next_retry_at = null, lease_owner = null, locked_until = null, updated_at = now()
    where id = ${id}::uuid`);
}

/** Operator/readiness view: what needs a human, with safe summaries only. */
export async function webhookInboxReviewCounts() {
  const result = await db.execute(sql`select status, count(*)::int as count
    from public.webhook_inbox
    where status in ('FAILED', 'DEAD_LETTER', 'PROCESSING')
    group by status`);
  const counts: Record<string, number> = {};
  for (const row of result.rows as Array<{ status?: string; count?: number }>) {
    if (row.status) counts[row.status] = Number(row.count ?? 0);
  }
  return counts;
}

/** Convenience for callers that already know the attempt count. */
export function inboxRetryDecision(attemptCount: number, terminal = false) {
  return retryDecision({ attemptCount, terminal }, Date.now());
}
