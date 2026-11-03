import { z } from "zod";
import { pool } from "../db/client.server";
import { getAdminEmailHandler } from "./admin-guard.server";
import { requireAdmin } from "./admin-guard";
import { recordAdminAction } from "./admin-audit.server";
import { notificationCategory } from "./customer-notifications.server";

const revokeSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(4).max(500),
});
export const adminNotificationRevokeInput = (data: unknown) => revokeSchema.parse(data);

const mask = (subject: string) =>
  subject.length <= 8 ? "••••" : `${subject.slice(0, 4)}…${subject.slice(-3)}`;

/** Monitoring read model: 30-day funnel plus the latest notifications with delivery/read state. Recipient ids are masked. */
export async function getAdminNotificationsHandler() {
  await requireAdmin();
  const [stats, types, rows] = await Promise.all([
    pool.query(`
      select count(*)::int total,
        count(*) filter (where s.read_at is not null)::int read,
        count(*) filter (where s.deleted_at is not null)::int deleted,
        count(*) filter (where s.archived_at is not null)::int archived,
        count(*) filter (where n.expires_at is not null and n.expires_at <= now())::int revoked
      from customer_notifications n
      left join customer_notification_states s on s.notification_id = n.id
        and s.recipient_customer_auth_subject = n.recipient_customer_auth_subject
      where n.created_at > now() - interval '30 days'`),
    pool.query(`select type, count(*)::int count from customer_notifications
      where created_at > now() - interval '30 days' group by type order by count desc limit 12`),
    pool.query(`
      select n.id, n.type, n.title, n.recipient_customer_auth_subject subject, n.created_at, n.expires_at,
        s.read_at, s.archived_at, s.deleted_at,
        coalesce((select count(*) from notification_delivery_attempts d where d.notification_id = n.id and d.status = 'SENT'), 0)::int sent,
        coalesce((select count(*) from notification_delivery_attempts d where d.notification_id = n.id and d.status = 'FAILED'), 0)::int failed
      from customer_notifications n
      left join customer_notification_states s on s.notification_id = n.id
        and s.recipient_customer_auth_subject = n.recipient_customer_auth_subject
      order by n.created_at desc limit 100`),
  ]);
  const subs = await pool.query(
    `select count(*)::int count from customer_push_subscriptions where active`,
  );
  return {
    stats: stats.rows[0] as {
      total: number;
      read: number;
      deleted: number;
      archived: number;
      revoked: number;
    },
    activePushSubscriptions: (subs.rows[0]?.count ?? 0) as number,
    types: types.rows.map((r) => ({
      type: r.type as string,
      category: notificationCategory(r.type as string),
      count: r.count as number,
    })),
    items: rows.rows.map((r) => ({
      id: r.id as string,
      type: r.type as string,
      category: notificationCategory(r.type as string),
      title: r.title as string,
      recipient: mask(r.subject as string),
      createdAt: new Date(r.created_at as string).toISOString(),
      expired: !!r.expires_at && new Date(r.expires_at as string) <= new Date(),
      read: !!r.read_at,
      archived: !!r.archived_at,
      deleted: !!r.deleted_at,
      sent: r.sent as number,
      failed: r.failed as number,
    })),
  };
}

/** Pulls a notification back from the customer inbox by expiring it; audited, idempotent. */
export async function revokeAdminNotificationHandler({ data }: { data: unknown }) {
  const input = adminNotificationRevokeInput(data);
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const row = await client.query(
      "select id, type, expires_at from customer_notifications where id = $1 for update",
      [input.id],
    );
    if (!row.rows[0]) throw new Error("Notifikasi tidak ditemukan");
    const already = row.rows[0].expires_at && new Date(row.rows[0].expires_at) <= new Date();
    if (!already) {
      await client.query("update customer_notifications set expires_at = now() where id = $1", [
        input.id,
      ]);
      await recordAdminAction(
        {
          actor,
          action: "notification.revoke",
          entityType: "customer_notification",
          entityId: input.id,
          reason: input.reason,
          before: { expiresAt: row.rows[0].expires_at },
          after: { expired: true },
        },
        client,
      );
    }
    await client.query("commit");
    return { id: input.id, replayed: !!already };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
