import { z } from "zod";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { buildSettingAudit } from "./admin-settings";
import {
  DEFAULT_GEO_CONFIG,
  normalizeGeoConfig,
  parseGeoConfig,
  type GeoConfig,
} from "./geo-config";

const SETTING_KEY = "aiSearch";

export type GeoConfigRecord = { config: GeoConfig; version: number };

/** Public-route read (robots/llms): any failure falls back to the open defaults. */
export async function readGeoConfig(): Promise<GeoConfigRecord> {
  try {
    const { pool } = await import("../db/client.server");
    const result = await pool.query(
      "select value_json, version from admin_settings where setting_key = $1",
      [SETTING_KEY],
    );
    const row = result.rows[0];
    if (!row) return { config: DEFAULT_GEO_CONFIG, version: 0 };
    return { config: normalizeGeoConfig(row.value_json), version: Number(row.version) || 0 };
  } catch {
    return { config: DEFAULT_GEO_CONFIG, version: 0 };
  }
}

const saveSchema = z.object({
  config: z.unknown(),
  reason: z.string().trim().min(4).max(300),
  expectedVersion: z.number().int().min(0),
});
export const saveGeoConfigInput = (data: unknown) => saveSchema.parse(data);

export async function saveGeoConfigHandler({ data }: { data: unknown }) {
  const input = saveGeoConfigInput(data);
  await requireAdmin();
  const config = parseGeoConfig(input.config);
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

export const getAdminGeoConfigHandler = async () => {
  await requireAdmin();
  return readGeoConfig();
};
