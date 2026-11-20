import { pool } from "../db/client.server";
import {
  deliveryStatusFor,
  eventKey,
  overridesDelivered,
  parseHelipodEvent,
  verifyHelipodSignature,
} from "./helipod-email-webhook";

const MAX_BODY_BYTES = 256 * 1024;

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Receives Helipod Email webhook events. The signature is checked over the raw body before anything
 * is parsed. Each event is recorded once (a repeat is acknowledged and skipped) in the same
 * transaction that updates the outbox row, so a failure rolls both back and Helipod's retry (it
 * retries 5xx, never 4xx) still applies the event.
 */
export async function handleHelipodEmailWebhook(request: Request): Promise<Response> {
  const secret = process.env["HELIPOD_EMAIL_WEBHOOK_SECRET"]?.trim();
  if (!secret) return json({ error: "webhook_unconfigured" }, 503);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
    return json({ error: "payload_too_large" }, 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES)
    return json({ error: "payload_too_large" }, 413);
  if (!verifyHelipodSignature(raw, request.headers.get("helipod-signature"), secret))
    return json({ error: "invalid_signature" }, 401);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const event = parseHelipodEvent(body);
  // Events we do not use (received mail, unknown types) are acknowledged so they are not retried.
  if (!event || event.type === "email.received") return json({ ok: true, ignored: true });

  const status = deliveryStatusFor(event.type);
  const recipients = event.recipients.length ? event.recipients : [""];
  const client = await pool.connect();
  let recorded = 0;
  let applied = 0;
  try {
    await client.query("begin");
    for (const recipient of recipients) {
      const inserted = await client.query(
        `insert into public.travel_email_events (event_key, event_type, recipient, message_id, occurred_at)
         values ($1,$2,$3,$4,$5) on conflict (event_key) do nothing returning event_key`,
        [
          eventKey(event.type, event.messageId, recipient),
          event.type,
          recipient || null,
          event.messageId,
          event.occurredAt,
        ],
      );
      if (!inserted.rows[0]) continue;
      recorded += 1;
      if (!status || !recipient) continue;
      const match = await client.query(
        `select id from public.travel_email_outbox
          where status = 'sent'
            and (($1::text is not null and provider_email_id = $1)
              or (lower(recipient_email) = $2 and sent_at > now() - interval '7 days'
                  and ($3::text is null or subject = $3)))
          order by (provider_email_id is not distinct from $1) desc, sent_at desc
          limit 1`,
        [event.messageId, recipient, event.subject],
      );
      const outboxId = match.rows[0]?.["id"] as string | undefined;
      if (!outboxId) continue;
      const updated = await client.query(
        `update public.travel_email_outbox
            set delivery_status = $2, delivery_at = coalesce($3::timestamptz, now()),
                delivery_detail = $4, updated_at = now()
          where id = $1 and ($5::boolean or delivery_status is null or delivery_status = 'delivered')
          returning id`,
        [outboxId, status, event.occurredAt, event.detail, overridesDelivered(status)],
      );
      if (updated.rows[0]) applied += 1;
      await client.query(
        "update public.travel_email_events set outbox_id = $2 where event_key = $1",
        [eventKey(event.type, event.messageId, recipient), outboxId],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    console.error("[helipod-email-webhook] failed", error instanceof Error ? error.message : error);
    // A 5xx makes Helipod retry the same body.
    return json({ error: "processing_failed" }, 500);
  } finally {
    client.release();
  }
  return json({ ok: true, recorded, applied });
}
