import { z } from "zod";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { buildSettingAudit } from "./admin-settings";
import {
  DEFAULT_PWA_CONFIG,
  PWA_EVENT_NAMES,
  PWA_PLATFORMS,
  normalizePwaConfig,
  parsePwaConfig,
  type PwaConfig,
  type PwaEventName,
  type PwaStats,
} from "./pwa-config";

const SETTING_KEY = "pwa";

export type PwaConfigRecord = { config: PwaConfig; version: number };

/** Public read: any failure falls back to the defaults so the app stays installable. */
export async function readPwaConfig(): Promise<PwaConfigRecord> {
  try {
    const { pool } = await import("../db/client.server");
    const result = await pool.query(
      "select value_json, version from admin_settings where setting_key = $1",
      [SETTING_KEY],
    );
    const row = result.rows[0];
    if (!row) return { config: DEFAULT_PWA_CONFIG, version: 0 };
    return { config: normalizePwaConfig(row.value_json), version: Number(row.version) || 0 };
  } catch {
    return { config: DEFAULT_PWA_CONFIG, version: 0 };
  }
}

export const getPwaConfigHandler = async () => {
  const { config } = await readPwaConfig();
  const { isPushConfigured, vapidPublicKey } = await import("./push.server");
  return {
    config,
    // The VAPID public key is not a secret; push stays off until the server has the full pair.
    pushPublicKey: config.pushEnabled && isPushConfigured() ? vapidPublicKey() : null,
  };
};

const saveSchema = z.object({
  config: z.unknown(),
  reason: z.string().trim().min(4).max(300),
  expectedVersion: z.number().int().min(0),
});
export const savePwaConfigInput = (data: unknown) => saveSchema.parse(data);

export async function savePwaConfigHandler({ data }: { data: unknown }) {
  const input = savePwaConfigInput(data);
  await requireAdmin();
  const config = parsePwaConfig(input.config);
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const { pool } = await import("../db/client.server");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      "select value_json, version from admin_settings where setting_key = $1 for update",
      [SETTING_KEY],
    );
    const row = current.rows[0];
    const version = row ? Number(row.version) : 0;
    if (version !== input.expectedVersion) {
      await client.query("rollback");
      return { ok: false as const, conflict: true as const, version };
    }
    const audit = buildSettingAudit(
      SETTING_KEY,
      row?.value_json ?? null,
      config,
      actor,
      input.reason,
    );
    await client.query(
      `insert into admin_settings (setting_key, value_json, version, updated_at)
       values ($1, $2::jsonb, 1, now())
       on conflict (setting_key) do update
       set value_json = excluded.value_json, version = admin_settings.version + 1, updated_at = now()`,
      [SETTING_KEY, JSON.stringify(config)],
    );
    await client.query(
      `insert into admin_audit_logs (id, action, entity_type, entity_id, reason, before_json, after_json)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [
        crypto.randomUUID(),
        audit.action,
        audit.entityType,
        audit.entityId,
        `${actor}: ${audit.reason}`,
        JSON.stringify(audit.beforeJson),
        JSON.stringify(audit.afterJson),
      ],
    );
    await client.query("commit");
    return { ok: true as const, conflict: false as const, version: version + 1, config };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const eventSchema = z.object({
  name: z.enum(PWA_EVENT_NAMES),
  platform: z.enum(PWA_PLATFORMS).default("other"),
  standalone: z.boolean().default(false),
});

/** One anonymous funnel event. Invalid input is rejected; storage failures never reach the user. */
export async function recordPwaEvent(raw: unknown): Promise<{ ok: true }> {
  const input = eventSchema.parse(raw);
  try {
    const { pool } = await import("../db/client.server");
    await pool.query(
      "insert into pwa_events (event_name, platform, standalone) values ($1,$2,$3)",
      [input.name, input.platform, input.standalone],
    );
  } catch (error) {
    console.warn("[travel] pwa event not stored", error instanceof Error ? error.message : "");
  }
  return { ok: true };
}

export async function getAdminPwaHandler(): Promise<PwaConfigRecord & { stats: PwaStats | null }> {
  await requireAdmin();
  const record = await readPwaConfig();
  const { isPushConfigured } = await import("./push.server");
  const days = 30;
  try {
    const { pool } = await import("../db/client.server");
    const events = await pool.query(
      `select event_name, count(*)::int n, count(*) filter (where standalone)::int standalone_n
       from pwa_events where created_at >= now() - ($1::int * interval '1 day') group by event_name`,
      [days],
    );
    const counts = Object.fromEntries(PWA_EVENT_NAMES.map((name) => [name, 0])) as Record<
      PwaEventName,
      number
    >;
    for (const row of events.rows) {
      if (row.event_name in counts) counts[row.event_name as PwaEventName] = Number(row.n);
    }
    const subs = await pool.query(
      "select count(*)::int n from customer_push_subscriptions where active",
    );
    const attempts = await pool.query(
      `select status, count(*)::int n from notification_delivery_attempts
       where channel='webpush' and created_at >= now() - ($1::int * interval '1 day') group by status`,
      [days],
    );
    const attempt = (status: string) =>
      Number(attempts.rows.find((row) => row.status === status)?.n ?? 0);
    return {
      ...record,
      stats: {
        days,
        counts,
        standaloneOpens: events.rows.reduce((sum, row) => sum + Number(row.standalone_n), 0),
        activePushSubscriptions: Number(subs.rows[0]?.n ?? 0),
        pushSent: attempt("SENT"),
        pushFailed: attempt("FAILED"),
        pushConfigured: isPushConfigured(),
      },
    };
  } catch {
    return { ...record, stats: null };
  }
}

const sendSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().min(2).max(200),
  href: z
    .string()
    .trim()
    .regex(/^\/(?!\/)[\w\-./?=&%]*$/, "href harus path internal")
    .default("/notifications"),
  reason: z.string().trim().min(4).max(300),
});
export const sendPwaNotificationInput = (data: unknown) => sendSchema.parse(data);

/** Admin: one targeted, audited notification to a single customer (never a broadcast). */
export async function sendPwaNotificationHandler({ data }: { data: unknown }) {
  const input = sendPwaNotificationInput(data);
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const { createCustomerNotification } = await import("./push.server");
  const { pool } = await import("../db/client.server");
  const result = await createCustomerNotification({
    subject: input.subject,
    type: "admin_message",
    title: input.title,
    body: input.body,
    href: input.href,
    eventKey: `admin_message:${crypto.randomUUID()}`,
    source: "admin",
  });
  await pool.query(
    `insert into admin_audit_logs (id, action, entity_type, entity_id, reason, after_json)
     values ($1, 'notification.send', 'customer_notification', $2, $3, $4::jsonb)`,
    [
      crypto.randomUUID(),
      result.notificationId,
      `${actor}: ${input.reason}`,
      JSON.stringify({ subject: input.subject, title: input.title, pushSent: result.sent }),
    ],
  );
  return { ok: true as const, pushSent: result.sent, created: result.created };
}
