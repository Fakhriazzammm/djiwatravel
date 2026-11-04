import { z } from "zod";
import { pool } from "@/db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { recordAdminAction } from "./admin-audit.server";
import {
  disconnectGoogle,
  featuresFromScopes,
  googleConfigured,
  redactError,
} from "./google-account.server";

/** Admin view and controls for the travelers' Google Drive / Sheets work. Never exposes tokens. */

const mask = (subject: string) => `${subject.slice(0, 6)}…`;

export type GoogleAdminOverview = {
  configured: boolean;
  connectedUsers: number;
  driveUsers: number;
  drive: { pending: number; uploaded: number; failed: number; revoked: number };
  sheets: { pending: number; synced: number; failed: number; revoked: number };
  photosInPostgres: number;
  bytesInPostgres: number;
  issues: Array<{
    id: string;
    kind: "drive" | "sheets";
    status: string;
    subject: string;
    subjectLabel: string;
    error: string | null;
    updatedAt: string;
  }>;
};

export async function readGoogleAdmin(): Promise<GoogleAdminOverview> {
  await requireAdmin();
  const empty: GoogleAdminOverview = {
    configured: googleConfigured(),
    connectedUsers: 0,
    driveUsers: 0,
    drive: { pending: 0, uploaded: 0, failed: 0, revoked: 0 },
    sheets: { pending: 0, synced: 0, failed: 0, revoked: 0 },
    photosInPostgres: 0,
    bytesInPostgres: 0,
    issues: [],
  };
  try {
    const [connections, drive, sheets, photos, issues] = await Promise.all([
      pool.query(
        "select granted_scopes from customer_google_calendar_connections where refresh_token_encrypted is not null",
      ),
      pool.query(
        "select status, count(*)::int as n from travel_google_drive_files group by status",
      ),
      pool.query(
        "select status, count(*)::int as n from travel_google_sheet_exports group by status",
      ),
      pool.query(
        "select count(*)::int as n, coalesce(sum(length(bytes)),0)::bigint as bytes from public.travel_receipt_photos where bytes is not null",
      ),
      pool.query(
        `(select receipt_scan_id::text as id, 'drive' as kind, status, customer_auth_subject as subject, last_error, updated_at
            from travel_google_drive_files where status in ('failed','revoked') order by updated_at desc limit 20)
         union all
         (select trip_id::text, 'sheets', status, customer_auth_subject, last_error, updated_at
            from travel_google_sheet_exports where status in ('failed','revoked') order by updated_at desc limit 20)
         order by updated_at desc limit 20`,
      ),
    ]);
    const out = { ...empty };
    out.connectedUsers = connections.rows.length;
    out.driveUsers = connections.rows.filter(
      (row) => featuresFromScopes((row.granted_scopes as string[]) ?? []).drive,
    ).length;
    for (const row of drive.rows) {
      const key = row.status === "uploading" ? "pending" : (row.status as keyof typeof out.drive);
      out.drive[key] += Number(row.n);
    }
    for (const row of sheets.rows) {
      const key = row.status === "syncing" ? "pending" : (row.status as keyof typeof out.sheets);
      out.sheets[key] += Number(row.n);
    }
    out.photosInPostgres = Number(photos.rows[0]?.n ?? 0);
    out.bytesInPostgres = Number(photos.rows[0]?.bytes ?? 0);
    out.issues = issues.rows.map((row) => ({
      id: String(row.id),
      kind: row.kind as "drive" | "sheets",
      status: String(row.status),
      subject: String(row.subject),
      subjectLabel: mask(String(row.subject)),
      error: row.last_error ? redactError(row.last_error) : null,
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
    return out;
  } catch (error) {
    // Migration 040 may not be applied yet; the panel then shows an empty, configured-only state.
    console.error("[google-admin] overview unavailable", redactError(error));
    return empty;
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("retry-failed"), reason: z.string().trim().min(4).max(300) }),
  z.object({
    action: z.literal("disconnect"),
    subject: z.string().min(1).max(200),
    reason: z.string().trim().min(4).max(300),
  }),
]);
export const googleAdminActionInput = (data: unknown) => actionSchema.parse(data);

export async function runGoogleAdminAction(data: ReturnType<typeof googleAdminActionInput>) {
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  if (data.action === "disconnect") {
    await disconnectGoogle(data.subject);
    await recordAdminAction({
      actor,
      action: "google.disconnect",
      entityType: "customer_google_connection",
      entityId: data.subject,
      reason: data.reason,
    });
    return { ok: true as const, retried: 0 };
  }
  const { processDriveQueue } = await import("./google-drive.server");
  const { syncTripSheet } = await import("./google-sheets.server");
  await pool.query("update travel_google_drive_files set attempts=0 where status='failed'");
  await pool.query("update travel_google_sheet_exports set attempts=0 where status='failed'");
  const users = await pool.query(
    `select distinct customer_auth_subject as subject from travel_google_drive_files where status='failed'
     union select distinct customer_auth_subject from travel_google_sheet_exports where status='failed' limit 25`,
  );
  let retried = 0;
  for (const row of users.rows as Array<{ subject: string }>) {
    const result = await processDriveQueue(row.subject, { retryFailed: true, limit: 20 });
    retried += result.uploaded;
    const trips = await pool.query(
      "select trip_id from travel_google_sheet_exports where customer_auth_subject=$1 and status='failed'",
      [row.subject],
    );
    for (const trip of trips.rows as Array<{ trip_id: string }>) {
      if (await syncTripSheet(row.subject, trip.trip_id)) retried += 1;
    }
  }
  await recordAdminAction({
    actor,
    action: "google.retry-failed",
    entityType: "google_drive_sheets",
    entityId: null,
    reason: data.reason,
    after: { users: users.rows.length, recovered: retried },
  });
  return { ok: true as const, retried };
}
