import { createHash } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/client.server";
import { getAuthenticatedUser } from "./customer-session.fn";

const requireBetterAuthUser = getAuthenticatedUser;

const listSchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
  view: z.enum(["inbox", "archived"]).default("inbox"),
  // z.coerce.boolean() turns the string "false" into true, so parse the literal explicitly.
  unreadOnly: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .default(false)
    .transform((value) => value === true || value === "true"),
});
const mutationSchema = z.object({
  action: z.enum(["read", "read_all", "archive", "unarchive", "delete", "restore"]),
  ids: z.array(z.string().uuid()).max(50).default([]),
});
export type CustomerNotificationCategory = "esim" | "bayar" | "trip" | "info";
export function notificationCategory(type: string): CustomerNotificationCategory {
  if (type.startsWith("esim")) return "esim";
  if (/^(payment|order|refund|wallet)/.test(type)) return "bayar";
  if (type.startsWith("trip")) return "trip";
  return "info";
}
const pushSchema = z.object({
  action: z.enum(["register", "deactivate"]),
  endpoint: z.string().url().max(2048),
  keys: z.record(z.string()).optional(),
});
type CustomerNotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  action_href: string | null;
  created_at: string;
  expires_at: string | null;
  read_at: string | null;
  archived_at: string | null;
};

const safe = (r: CustomerNotificationRow) => ({
  id: r.id,
  type: r.type,
  title: r.title,
  body: r.body,
  action_href: r.action_href,
  created_at: r.created_at,
  expires_at: r.expires_at,
  read_at: r.read_at,
  archived_at: r.archived_at,
  category: notificationCategory(r.type),
});
export async function listCustomerNotifications(input: unknown = {}) {
  const data = listSchema.parse(input);
  const user = await getAuthenticatedUser();
  const args: unknown[] = [user.id];
  let where = `n.recipient_customer_auth_subject = $1 and (n.expires_at is null or n.expires_at > now())`;
  if (data.cursor) {
    args.push(data.cursor);
    where += ` and n.created_at < $${args.length}`;
  }
  where += ` and s.deleted_at is null and s.archived_at is ${data.view === "archived" ? "not null" : "null"}`;
  if (data.unreadOnly) where += ` and s.read_at is null`;
  args.push(data.limit + 1);
  const rows = await pool.query(
    `select n.id,n.type,n.title,n.body,n.action_href,n.created_at,n.expires_at,s.read_at,s.archived_at from customer_notifications n left join customer_notification_states s on s.notification_id=n.id and s.recipient_customer_auth_subject=n.recipient_customer_auth_subject where ${where} order by n.created_at desc limit $${args.length}`,
    args,
  );
  const hasMore = rows.rows.length > data.limit;
  const items = rows.rows.slice(0, data.limit).map(safe);
  const unread = await pool.query(
    `select count(*)::int count from customer_notifications n left join customer_notification_states s on s.notification_id=n.id and s.recipient_customer_auth_subject=n.recipient_customer_auth_subject where n.recipient_customer_auth_subject=$1 and s.read_at is null and s.deleted_at is null and s.archived_at is null and (n.expires_at is null or n.expires_at > now())`,
    [user.id],
  );
  return {
    notifications: items,
    unread_count: unread.rows[0]?.count ?? 0,
    next_cursor: hasMore ? (items.at(-1)?.created_at ?? null) : null,
  };
}
export async function markCustomerNotificationRead(notificationId: string) {
  const id = z.string().uuid().parse(notificationId);
  const user = await getAuthenticatedUser();
  await pool.query(
    `insert into customer_notification_states(notification_id,recipient_customer_auth_subject,read_at) select id,$2,now() from customer_notifications where id=$1 and recipient_customer_auth_subject=$2 on conflict (notification_id,recipient_customer_auth_subject) do update set read_at=coalesce(customer_notification_states.read_at,excluded.read_at)`,
    [id, user.id],
  );
  return { ok: true };
}
/** Bulk inbox mutations. Ownership is the verified session subject; ids from other recipients are ignored. */
export async function mutateCustomerNotifications(input: unknown) {
  const data = mutationSchema.parse(input);
  const user = await getAuthenticatedUser();
  const set: Record<string, string> = {
    read: "read_at=coalesce(customer_notification_states.read_at,now())",
    read_all: "read_at=coalesce(customer_notification_states.read_at,now())",
    archive: "archived_at=now(),read_at=coalesce(customer_notification_states.read_at,now())",
    unarchive: "archived_at=null",
    delete: "deleted_at=now(),read_at=coalesce(customer_notification_states.read_at,now())",
    restore: "deleted_at=null",
  };
  const insertCols: Record<string, string> = {
    read: "now(),null,null",
    read_all: "now(),null,null",
    archive: "now(),now(),null",
    unarchive: "null,null,null",
    delete: "now(),null,now()",
    restore: "null,null,null",
  };
  if (data.action !== "read_all" && data.ids.length === 0) return { ok: true, count: 0 };
  const scope =
    data.action === "read_all"
      ? `n.recipient_customer_auth_subject=$1 and (n.expires_at is null or n.expires_at>now()) and not exists (select 1 from customer_notification_states x where x.notification_id=n.id and x.recipient_customer_auth_subject=$1 and (x.read_at is not null or x.deleted_at is not null or x.archived_at is not null))`
      : `n.recipient_customer_auth_subject=$1 and n.id = any($2::uuid[])`;
  const args: unknown[] = data.action === "read_all" ? [user.id] : [user.id, data.ids];
  const result = await pool.query(
    `insert into customer_notification_states(notification_id,recipient_customer_auth_subject,read_at,archived_at,deleted_at) select n.id,$1,${insertCols[data.action]} from customer_notifications n where ${scope} on conflict (notification_id,recipient_customer_auth_subject) do update set ${set[data.action]}`,
    args,
  );
  return { ok: true, count: result.rowCount ?? 0 };
}
export async function mutateCustomerPush(input: unknown) {
  const data = pushSchema.parse(input);
  const user = await getAuthenticatedUser();
  const hash = createHash("sha256").update(data.endpoint).digest("hex");
  if (data.action === "deactivate")
    await pool.query(
      `update customer_push_subscriptions set active=false,updated_at=now() where recipient_customer_auth_subject=$1 and endpoint_hash=$2`,
      [user.id, hash],
    );
  else
    await pool.query(
      `insert into customer_push_subscriptions(recipient_customer_auth_subject,endpoint_hash,endpoint,keys) values($1,$2,$3,$4) on conflict(recipient_customer_auth_subject,endpoint_hash) do update set endpoint=excluded.endpoint,keys=excluded.keys,active=true,updated_at=now()`,
      [user.id, hash, data.endpoint, data.keys ?? {}],
    );
  return { ok: true };
}
