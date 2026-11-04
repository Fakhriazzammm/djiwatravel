import { pool } from "@/db/client.server";
import { buildPreorderEmail, type PreorderEmailState } from "./esim-preorder-email";

const APP_ORIGIN = (process.env["TRAVEL_PUBLIC_ORIGIN"] ?? "https://djiwatravel.com").replace(
  /\/$/,
  "",
);

const notificationCopy: Record<PreorderEmailState, { title: string; body: string; href: string }> =
  {
    awaiting_balance: {
      title: "Pre-order diterima",
      body: "Pembayaran diterima. Kami sedang menunggu saldo provider untuk membeli paket ini.",
      href: "/my-orders",
    },
    processing: {
      title: "Paket eSIM sedang dibeli",
      body: "Saldo mencukupi dan pembelian paket sedang diproses oleh eSIM Access.",
      href: "/my-orders",
    },
    refund_review: {
      title: "Pre-order ditinjau Admin",
      body: "Batas 3 hari terlewati. Pesanan masuk antrean Admin untuk tindak lanjut.",
      href: "/my-orders",
    },
    ready: {
      title: "eSIM kamu siap dipasang",
      body: "Buka pesanan untuk melihat QR code dan panduan pemasangan eSIM.",
      href: "",
    },
  };

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

/** Queues an idempotent email and in-app member notification for a preorder state transition. */
export async function notifyPreorderOrder(orderId: string, state: PreorderEmailState) {
  const result = await pool.query(
    `select o.public_order_code, o.customer_auth_subject,
            coalesce(access.email, payment.email, profile.email) as email
       from public.customer_orders o
       left join public.guest_order_access access on access.order_id = o.id
       left join public.customer_order_payment_details payment on payment.order_id = o.id
       left join public.customer_profiles profile on profile.auth_user_id = o.customer_auth_subject
      where o.id = $1::uuid and o.fulfillment_mode = 'preorder'
      limit 1`,
    [orderId],
  );
  const order = result.rows[0] as
    | { public_order_code?: string; customer_auth_subject?: string | null; email?: string | null }
    | undefined;
  if (!order) return { emailQueued: false, notificationQueued: false };
  const publicOrderCode = String(order.public_order_code ?? "");
  const copy = notificationCopy[state];
  const memberOrderHref = `/order/${orderId}`;
  const guestOrderHref = "/order-status";
  const href = state === "ready" ? memberOrderHref : copy.href;
  const eventKey = `preorder:${state}:${orderId}`;
  let emailQueued = false;
  if (typeof order.email === "string" && order.email.trim()) {
    const email = buildPreorderEmail({
      state,
      publicOrderCode,
      href: `${APP_ORIGIN}${order.customer_auth_subject ? memberOrderHref : guestOrderHref}`,
    });
    const queued = await pool.query(
      `insert into public.travel_email_outbox
         (idempotency_key, order_id, recipient_email, subject, html_body, text_body)
       values ($1, $2::uuid, $3, $4, $5, $6)
       on conflict (idempotency_key) do nothing returning id`,
      [eventKey, orderId, order.email.trim(), email.subject, email.html, email.text],
    );
    emailQueued = queued.rowCount === 1;
  }

  let notificationQueued = false;
  if (order.customer_auth_subject) {
    const notification = await import("./push.server");
    const created = await notification.createCustomerNotification({
      subject: String(order.customer_auth_subject),
      orderId,
      type: `preorder_${state}`,
      title: copy.title,
      body: copy.body,
      href,
      eventKey,
      source: "preorder",
    });
    notificationQueued = created.created;
  }

  return { emailQueued, notificationQueued };
}

/** Drains a durable transactional email queue through Helipod Email without exposing credentials. */
export async function drainTravelEmailOutbox(limit = 20) {
  const apiKey =
    process.env["HELIPOD_EMAIL_API_KEY"]?.trim() || process.env["HELIPOD_API_KEY"]?.trim();
  const from = process.env["HELIPOD_EMAIL_FROM"]?.trim();
  if (!apiKey || !from) return { sent: 0, failed: 0, configured: false };
  const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
  const claimed = await pool.query(
    `with batch as (
       select id from public.travel_email_outbox
        where ((status in ('queued', 'failed') and available_at <= now())
           or (status = 'sending' and updated_at < now() - interval '5 minutes'))
          and attempt_count < 8
        order by created_at asc
        for update skip locked
        limit $1
     )
     update public.travel_email_outbox o
        set status = 'sending', attempt_count = attempt_count + 1, updated_at = now()
       from batch where o.id = batch.id
     returning o.id, o.idempotency_key, o.order_id, o.recipient_email, o.subject, o.html_body, o.text_body, o.attempt_count`,
    [boundedLimit],
  );
  let sent = 0;
  let failed = 0;
  for (const row of claimed.rows as Array<Record<string, unknown>>) {
    const id = String(row["id"]);
    const idempotencyKey = String(row["idempotency_key"]);
    try {
      const headers: Record<string, string> = {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
      };
      const projectId = process.env["HELIPOD_EMAIL_PROJECT_ID"]?.trim();
      if (projectId) headers["X-Helipod-Project"] = projectId;
      const response = await fetch("https://mail.helipod.io/api/email/send", {
        method: "POST",
        headers,
        body: JSON.stringify({
          from,
          to: [String(row["recipient_email"])],
          subject: String(row["subject"]),
          html: String(row["html_body"]),
          text: String(row["text_body"]),
          idempotencyKey,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`helipod_email_http_${response.status}`);
      await pool.query(
        `update public.travel_email_outbox set status = 'sent', sent_at = now(), last_error = null, updated_at = now() where id = $1::uuid`,
        [id],
      );
      sent += 1;
    } catch (error) {
      const attempts = Number(row["attempt_count"] ?? 1);
      const retryMinutes = Math.min(6 * 60, 2 ** Math.min(attempts, 8));
      const message =
        error instanceof Error ? error.message.slice(0, 180) : "email_delivery_failed";
      await pool.query(
        `update public.travel_email_outbox
            set status = case when attempt_count >= 8 then 'failed' else 'queued' end,
                available_at = now() + ($2::text || ' minutes')::interval,
                last_error = $3, updated_at = now()
          where id = $1::uuid`,
        [id, retryMinutes, message],
      );
      failed += 1;
    }
  }
  return { sent, failed, configured: true };
}

export function safePreorderAdminEmailLabel(email: string) {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "Kontak email tersimpan";
  return `${htmlEscape(localPart.slice(0, 1))}•••@${htmlEscape(domain)}`;
}

/** Repairs a transition whose notification insert was interrupted after the order committed. */
export async function repairPreorderNotifications() {
  const rows = await pool.query(`select id, preorder_status from public.customer_orders
    where fulfillment_mode = 'preorder' and preorder_status in ('pending','processing','refund_review','fulfilled')
    order by updated_at desc limit 200`);
  for (const row of rows.rows) {
    const state: PreorderEmailState =
      row.preorder_status === "fulfilled"
        ? "ready"
        : row.preorder_status === "refund_review"
          ? "refund_review"
          : row.preorder_status === "processing"
            ? "processing"
            : "awaiting_balance";
    await notifyPreorderOrder(String(row.id), state).catch(() => undefined);
  }
}
