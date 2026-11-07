import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { buildSettingAudit } from "./admin-settings";
import {
  DEFAULT_FLIGHTS_CONFIG,
  FLIGHTS_SETTING_KEY,
  normalizeFlightsConfig,
  parseFlightsConfig,
  type FlightsConfig,
} from "./flights";

const CACHE_MS = 60_000;
let cached: { at: number; config: FlightsConfig } | null = null;

async function readFlightsRecord() {
  try {
    const result = await pool.query(
      "select value_json, version from public.admin_settings where setting_key = $1",
      [FLIGHTS_SETTING_KEY],
    );
    const row = result.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    if (!row) return { config: DEFAULT_FLIGHTS_CONFIG, version: 0 };
    return { config: normalizeFlightsConfig(row.value_json), version: Number(row.version) || 0 };
  } catch {
    return { config: DEFAULT_FLIGHTS_CONFIG, version: 0 };
  }
}

/** Customer-safe config, held for a minute because every page render asks for it. */
export async function getFlightsConfigHandler(): Promise<FlightsConfig> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.config;
  const { config } = await readFlightsRecord();
  cached = { at: Date.now(), config };
  return config;
}

/* ------------------------------------------------------------------ admin */

const saveSchema = z.object({
  config: z.unknown(),
  reason: z.string().trim().min(4).max(300),
  expectedVersion: z.number().int().min(0),
});

export const saveFlightsConfigInput = (data: unknown) => saveSchema.parse(data);

export const getAdminFlightsHandler = async () => {
  await requireAdmin();
  return readFlightsRecord();
};

export async function saveFlightsConfigHandler({
  data,
}: {
  data: ReturnType<typeof saveFlightsConfigInput>;
}) {
  await requireAdmin();
  const config = parseFlightsConfig(data.config);
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      "select value_json, version from public.admin_settings where setting_key = $1 for update",
      [FLIGHTS_SETTING_KEY],
    );
    const row = current.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    const version = row ? Number(row.version) : 0;
    if (version !== data.expectedVersion) {
      await client.query("rollback");
      return { ok: false as const, conflict: true as const, version };
    }
    const audit = buildSettingAudit(
      FLIGHTS_SETTING_KEY,
      row?.value_json ?? null,
      config,
      actor,
      data.reason,
    );
    await client.query(
      `insert into public.admin_settings (setting_key, value_json, version, updated_at)
       values ($1, $2::jsonb, 1, now())
       on conflict (setting_key) do update
       set value_json = excluded.value_json, version = admin_settings.version + 1, updated_at = now()`,
      [FLIGHTS_SETTING_KEY, JSON.stringify(config)],
    );
    await client.query(
      `insert into public.admin_audit_logs
         (id, action, entity_type, entity_id, reason, before_json, after_json)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [
        randomUUID(),
        audit.action,
        audit.entityType,
        audit.entityId,
        `${actor}: ${audit.reason}`,
        JSON.stringify(audit.beforeJson),
        JSON.stringify(audit.afterJson),
      ],
    );
    await client.query("commit");
    cached = null;
    return { ok: true as const, conflict: false as const, version: version + 1, config };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
