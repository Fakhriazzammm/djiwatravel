import { randomUUID } from "node:crypto";
import { pool } from "../db/client.server";

export type AdminActionInput = {
  actor: string;
  action: string;
  entityType: string;
  entityId: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
};

type Queryable = { query: (text: string, values?: unknown[]) => Promise<unknown> };

/**
 * Append one admin action to `admin_audit_logs`. Pass the transaction client so the audit row commits
 * or rolls back together with the change it describes. The actor is stored in the reason prefix, the
 * same convention the settings panels use.
 */
export async function recordAdminAction(input: AdminActionInput, client: Queryable = pool) {
  await client.query(
    `insert into admin_audit_logs (id, action, entity_type, entity_id, reason, before_json, after_json)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      randomUUID(),
      input.action,
      input.entityType,
      input.entityId,
      `${input.actor}: ${input.reason?.trim() || "-"}`,
      JSON.stringify(input.before ?? null),
      JSON.stringify(input.after ?? null),
    ],
  );
}

export type AdminActionRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: string;
  reason: string;
  createdAt: string;
};

export async function listAdminActions(limit = 50, offset = 0) {
  const result = await pool.query(
    `select id, action, entity_type, entity_id, reason, created_at::text as created_at,
            count(*) over()::int as total
       from admin_audit_logs order by created_at desc limit $1 offset $2`,
    [limit, offset],
  );
  const rows: AdminActionRow[] = result.rows.map((row) => {
    const raw = String(row.reason ?? "");
    const split = raw.indexOf(": ");
    return {
      id: String(row.id),
      action: String(row.action),
      entityType: String(row.entity_type),
      entityId: row.entity_id ? String(row.entity_id) : null,
      actor: split > 0 ? raw.slice(0, split) : "admin",
      reason: split > 0 ? raw.slice(split + 2) : raw,
      createdAt: String(row.created_at),
    };
  });
  return { rows, total: Number(result.rows[0]?.total ?? 0) };
}
