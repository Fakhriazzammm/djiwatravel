import webpush from "web-push";
import { pool } from "../db/client.server";
import { readPwaConfig } from "./pwa.server";

/**
 * Web Push delivery. VAPID keys are server-only env (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
 * `VAPID_SUBJECT`); only the public key ever reaches the browser. Generate a pair with
 * `npx web-push generate-vapid-keys`.
 */
export function vapidPublicKey(): string | null {
  return process.env["VAPID_PUBLIC_KEY"]?.trim() || null;
}

export function isPushConfigured(): boolean {
  return Boolean(
    vapidPublicKey() &&
    process.env["VAPID_PRIVATE_KEY"]?.trim() &&
    process.env["VAPID_SUBJECT"]?.trim(),
  );
}

let configured = false;
function ensureConfigured() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env["VAPID_SUBJECT"]!.trim(),
    process.env["VAPID_PUBLIC_KEY"]!.trim(),
    process.env["VAPID_PRIVATE_KEY"]!.trim(),
  );
  configured = true;
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };

type NotificationInput = {
  subject: string;
  orderId?: string | null;
  type: string;
  title: string;
  body: string;
  href: string;
  /** Idempotency key: the same event never notifies twice. */
  eventKey: string;
  source: string;
};

/** Inserts the in-app notification (idempotent on `eventKey`), then pushes it to the customer's devices. */
export async function createCustomerNotification(
  input: NotificationInput,
): Promise<{ created: boolean; notificationId: string | null; sent: number }> {
  const client = await pool.connect();
  let notificationId: string | null = null;
  try {
    await client.query("begin");
    const event = await client.query(
      `insert into notification_events (event_key, event_type, safe_payload, authoritative_source)
       values ($1, $2, $3::jsonb, $4) on conflict (event_key) do nothing returning id`,
      [input.eventKey, input.type, JSON.stringify({ href: input.href }), input.source],
    );
    const eventId = event.rows[0]?.id as string | undefined;
    if (eventId) {
      const row = await client.query(
        `insert into customer_notifications
           (event_id, recipient_customer_auth_subject, order_id, type, title, body, action_href)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [
          eventId,
          input.subject,
          input.orderId ?? null,
          input.type,
          input.title,
          input.body,
          input.href,
        ],
      );
      notificationId = row.rows[0].id as string;
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  if (!notificationId) return { created: false, notificationId: null, sent: 0 };
  const sent = await dispatchPush(notificationId, {
    title: input.title,
    body: input.body,
    url: input.href,
    tag: input.type,
  }).catch(() => 0);
  return { created: true, notificationId, sent };
}

/** Sends one notification to every active subscription of its recipient; prunes dead endpoints. */
export async function dispatchPush(notificationId: string, payload: PushPayload): Promise<number> {
  if (!isPushConfigured()) return 0;
  const { config } = await readPwaConfig();
  if (!config.pushEnabled) return 0;
  ensureConfigured();
  const subs = await pool.query(
    `select s.id, s.endpoint, s.keys from customer_push_subscriptions s
     join customer_notifications n on n.recipient_customer_auth_subject = s.recipient_customer_auth_subject
     where n.id = $1 and s.active`,
    [notificationId],
  );
  let sent = 0;
  for (const sub of subs.rows) {
    let status = "SENT";
    let lastError: string | null = null;
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 24, urgency: "normal" },
      );
      sent += 1;
    } catch (error) {
      status = "FAILED";
      const code = (error as { statusCode?: number }).statusCode;
      lastError = `${code ?? "error"}`;
      // 404/410: the browser dropped the subscription, so stop trying it.
      if (code === 404 || code === 410) {
        await pool.query(
          "update customer_push_subscriptions set active=false, updated_at=now() where id=$1",
          [sub.id],
        );
      }
    }
    await pool
      .query(
        `insert into notification_delivery_attempts (notification_id, channel, subscription_id, status, last_error)
         values ($1, 'webpush', $2, $3, $4)
         on conflict (notification_id, channel, subscription_id)
         do update set status = excluded.status, last_error = excluded.last_error,
           retry_count = notification_delivery_attempts.retry_count + 1, updated_at = now()`,
        [notificationId, sub.id, status, lastError],
      )
      .catch(() => undefined);
  }
  return sent;
}
