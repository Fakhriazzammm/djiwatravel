import { sql } from "drizzle-orm";
import { db } from "../db/client.server";
import { HEARTBEAT_WINDOW_MS, isWorkerStale, safeErrorSummary } from "./retry-policy";

/**
 * Worker liveness.
 *
 * "No failures" and "the worker has not run since Tuesday" are indistinguishable in a queue table,
 * so readiness reads an explicit heartbeat instead of inferring health from the absence of rows.
 */

export const TRAVEL_TASK_WORKER = "travel-esim-sync";

export async function recordHeartbeat(workerName: string, migrationVersion: string | null = null) {
  await db.execute(sql`insert into public.worker_heartbeats(worker_name, last_heartbeat_at, migration_version, updated_at)
    values (${workerName}, now(), ${migrationVersion}, now())
    on conflict (worker_name) do update
      set last_heartbeat_at = now(), migration_version = coalesce(${migrationVersion}, public.worker_heartbeats.migration_version), updated_at = now()`);
}

export async function recordSuccess(workerName: string) {
  await db.execute(sql`insert into public.worker_heartbeats(worker_name, last_heartbeat_at, last_success_at, last_error_safe, updated_at)
    values (${workerName}, now(), now(), null, now())
    on conflict (worker_name) do update
      set last_heartbeat_at = now(), last_success_at = now(), last_error_safe = null, updated_at = now()`);
}

export async function recordFailure(workerName: string, error: unknown) {
  await db.execute(sql`insert into public.worker_heartbeats(worker_name, last_heartbeat_at, last_error_safe, updated_at)
    values (${workerName}, now(), ${safeErrorSummary(error)}, now())
    on conflict (worker_name) do update
      set last_heartbeat_at = now(), last_error_safe = ${safeErrorSummary(error)}, updated_at = now()`);
}

export type WorkerHealth = {
  workerName: string;
  lastHeartbeatAt: string | null;
  lastSuccessAt: string | null;
  healthy: boolean;
};

export async function readWorkerHealth(
  workerName: string,
  nowMs = Date.now(),
): Promise<WorkerHealth> {
  const result = await db.execute(
    sql`select last_heartbeat_at, last_success_at from public.worker_heartbeats where worker_name = ${workerName} limit 1`,
  );
  const row = result.rows[0] as
    { last_heartbeat_at?: string | null; last_success_at?: string | null } | undefined;
  const lastHeartbeatAt = row?.last_heartbeat_at ?? null;
  const heartbeatMs = lastHeartbeatAt ? Date.parse(lastHeartbeatAt) : null;
  return {
    workerName,
    lastHeartbeatAt,
    lastSuccessAt: row?.last_success_at ?? null,
    healthy: !isWorkerStale(heartbeatMs, nowMs, HEARTBEAT_WINDOW_MS),
  };
}
