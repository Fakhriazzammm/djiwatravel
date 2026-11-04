import { pool } from "@/db/client.server";
import { tripGoogleName } from "./google-trip-names";
import {
  GoogleAccessRevokedError,
  connectionFor,
  googleFetch,
  hasFeature,
  markGoogleWorkRevoked,
  redactError,
} from "./google-account.server";

/**
 * Receipt photos in the traveler's own Drive.
 *
 * The photo stays in Postgres until the upload is confirmed, so a failed or revoked Drive never
 * loses a receipt. After a confirmed upload the bytes are dropped (the row stays as the "has a
 * receipt" marker) and the photo is streamed back from Drive on demand.
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const ROOT_FOLDER_NAME = "Djiwa Travel";
const FOLDER_MIME = "application/vnd.google-apps.folder";
export const MAX_DRIVE_ATTEMPTS = 5;

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function safeName(value: string) {
  return (
    value
      .replace(/[\\/:*?"<>|\n\r]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "Trip"
  );
}

async function driveJson<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(
      `Google Drive ${action} ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`,
    );
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return (await response.json()) as T;
}

async function createFolder(subject: string, name: string, parentId?: string) {
  const response = await googleFetch(subject, `${DRIVE_API}/files?fields=id`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  return (await driveJson<{ id: string }>(response, "buat folder")).id;
}

/** "Djiwa Travel / <trip name · month year>" in the traveler's Drive, created once per trip. */
export async function ensureTripFolder(
  subject: string,
  tripId: string,
  tripName: string,
  force = false,
) {
  if (!force) {
    const known = await pool.query(
      "select trip_folder_id from travel_google_drive_folders where trip_id=$1 and customer_auth_subject=$2",
      [tripId, subject],
    );
    if (known.rows[0]) return String(known.rows[0].trip_folder_id);
  }
  let rootId: string | null = null;
  if (!force) {
    const other = await pool.query(
      "select root_folder_id from travel_google_drive_folders where customer_auth_subject=$1 limit 1",
      [subject],
    );
    rootId = other.rows[0] ? String(other.rows[0].root_folder_id) : null;
  }
  rootId ??= await createFolder(subject, ROOT_FOLDER_NAME);
  const tripFolderId = await createFolder(subject, safeName(tripName), rootId);
  await pool.query(
    `insert into travel_google_drive_folders (trip_id, customer_auth_subject, root_folder_id, trip_folder_id)
     values ($1,$2,$3,$4)
     on conflict (trip_id) do update set root_folder_id=excluded.root_folder_id, trip_folder_id=excluded.trip_folder_id`,
    [tripId, subject, rootId, tripFolderId],
  );
  return tripFolderId;
}

export function multipartBody(metadata: Record<string, unknown>, mime: string, bytes: Uint8Array) {
  const boundary = `djiwa${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--`);
  return { boundary, body: Buffer.concat([head, Buffer.from(bytes), tail]) };
}

async function uploadFile(
  subject: string,
  folderId: string,
  name: string,
  mime: string,
  bytes: Uint8Array,
) {
  const { boundary, body } = multipartBody({ name, parents: [folderId] }, mime, bytes);
  const response = await googleFetch(
    subject,
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`,
    {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body: new Uint8Array(body),
    },
  );
  return (await driveJson<{ id: string }>(response, "unggah")).id;
}

/** Whether new receipts of this traveler should go to Drive. */
export async function driveActive(subject: string) {
  try {
    const connection = await connectionFor(subject);
    return Boolean(
      connection?.refresh_token_encrypted &&
      hasFeature(connection, "drive") &&
      connection.drive_enabled !== false,
    );
  } catch {
    return false;
  }
}

/** Records the upload as pending (durable) so a failure is retryable instead of lost. */
export async function queueReceiptUploads(
  subject: string,
  tripId: string,
  scanIds: readonly string[],
) {
  for (const scanId of scanIds) {
    await pool.query(
      `insert into travel_google_drive_files (receipt_scan_id, trip_id, customer_auth_subject, status)
       select p.scan_id, p.trip_id, p.customer_auth_subject, 'pending'
         from public.travel_receipt_photos p
        where p.scan_id=$1 and p.trip_id=$2 and p.customer_auth_subject=$3 and p.expense_id is not null and p.bytes is not null
       on conflict (receipt_scan_id) do nothing`,
      [scanId, tripId, subject],
    );
  }
}

type Claimed = { receipt_scan_id: string; trip_id: string; attempts: number };

async function claim(subject: string, limit: number, retryFailed: boolean) {
  const statuses = retryFailed ? ["pending", "failed"] : ["pending"];
  const result = await pool.query(
    `update travel_google_drive_files f
        set status='uploading', attempts=f.attempts+1, updated_at=now()
      where f.receipt_scan_id in (
        select receipt_scan_id from travel_google_drive_files
         where customer_auth_subject=$1
           and (status = any($2::text[]) or (status='uploading' and updated_at < now() - interval '2 minutes'))
           and attempts < $3
         order by created_at
         limit $4
         for update skip locked)
      returning f.receipt_scan_id, f.trip_id, f.attempts`,
    [subject, statuses, MAX_DRIVE_ATTEMPTS, limit],
  );
  return result.rows as Claimed[];
}

async function uploadOne(subject: string, item: Claimed) {
  const photo = await pool.query(
    `select p.mime, p.bytes, t.name as trip_name, t.departure_date, e.description, e.transaction_date
       from public.travel_receipt_photos p
       join travel_trips t on t.id=p.trip_id
       left join travel_expenses e on e.id=p.expense_id
      where p.scan_id=$1 and p.customer_auth_subject=$2`,
    [item.receipt_scan_id, subject],
  );
  const row = photo.rows[0] as
    | {
        mime: string;
        bytes: Buffer | null;
        trip_name: string;
        departure_date: Date | string | null;
        description: string | null;
        transaction_date: Date | string | null;
      }
    | undefined;
  if (!row?.bytes) {
    // Photo is gone (expense deleted) or was already moved; nothing to upload.
    await pool.query(
      "delete from travel_google_drive_files where receipt_scan_id=$1 and drive_file_id is null",
      [item.receipt_scan_id],
    );
    return;
  }
  const date = row.transaction_date
    ? new Date(row.transaction_date).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const name = `${date} ${safeName(row.description ?? "Struk")}.${EXTENSION[row.mime] ?? "jpg"}`;
  const tripLabel = tripGoogleName(row.trip_name, row.departure_date);
  let folderId = await ensureTripFolder(subject, item.trip_id, tripLabel);
  let fileId: string;
  try {
    fileId = await uploadFile(subject, folderId, name, row.mime, row.bytes);
  } catch (error) {
    // The traveler deleted the folder in Drive: recreate it once and retry.
    if ((error as { status?: number }).status !== 404) throw error;
    folderId = await ensureTripFolder(subject, item.trip_id, tripLabel, true);
    fileId = await uploadFile(subject, folderId, name, row.mime, row.bytes);
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `update travel_google_drive_files
          set status='uploaded', drive_file_id=$1, drive_folder_id=$2, last_error=null, updated_at=now()
        where receipt_scan_id=$3`,
      [fileId, folderId, item.receipt_scan_id],
    );
    await client.query("update public.travel_receipt_photos set bytes=null where scan_id=$1", [
      item.receipt_scan_id,
    ]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Uploads waiting receipts. Failures are recorded per receipt and never throw to the caller. */
export async function processDriveQueue(
  subject: string,
  options: { limit?: number; retryFailed?: boolean } = {},
) {
  const claimed = await claim(subject, options.limit ?? 10, options.retryFailed ?? false);
  let uploaded = 0;
  let failed = 0;
  for (const item of claimed) {
    try {
      await uploadOne(subject, item);
      uploaded += 1;
    } catch (error) {
      if (error instanceof GoogleAccessRevokedError) {
        await markGoogleWorkRevoked(subject);
        failed += claimed.length - uploaded - failed;
        break;
      }
      failed += 1;
      console.error("[google-drive] receipt upload failed", {
        scanId: item.receipt_scan_id,
        attempts: item.attempts,
        error: redactError(error),
      });
      await pool.query(
        "update travel_google_drive_files set status='failed', last_error=$1, updated_at=now() where receipt_scan_id=$2",
        [redactError(error), item.receipt_scan_id],
      );
    }
  }
  return { uploaded, failed };
}

/** Fire-and-forget is safe here only because every row is already durable (pending/failed). */
export function kickDriveQueue(subject: string) {
  void processDriveQueue(subject).catch((error) =>
    console.error("[google-drive] queue run failed", { error: redactError(error) }),
  );
}

/** After a reconnect, work that was waiting on access goes back into the queue. */
export async function requeueRevokedDrive(subject: string) {
  await pool.query(
    "update travel_google_drive_files set status='pending', attempts=0, last_error=null, updated_at=now() where customer_auth_subject=$1 and status='revoked' and drive_file_id is null",
    [subject],
  );
}

/** Streams a receipt photo that lives in the traveler's Drive. Null when Drive cannot provide it. */
export async function readDrivePhoto(subject: string, scanId: string, mime: string) {
  const mapping = await pool.query(
    "select drive_file_id from travel_google_drive_files where receipt_scan_id=$1 and customer_auth_subject=$2 and status='uploaded'",
    [scanId, subject],
  );
  const fileId = mapping.rows[0]?.drive_file_id as string | undefined;
  if (!fileId) return null;
  try {
    const response = await googleFetch(
      subject,
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
    );
    if (!response.ok) return null;
    return { mime, bytes: Buffer.from(await response.arrayBuffer()) };
  } catch (error) {
    console.error("[google-drive] photo read failed", { scanId, error: redactError(error) });
    return null;
  }
}

export type DriveStatusMap = Record<string, "pending" | "uploaded" | "failed" | "revoked">;

/** Drive status per receipt of a trip, for the chips on the Biaya list. */
export async function driveStatusForTrip(subject: string, tripId: string): Promise<DriveStatusMap> {
  const result = await pool.query(
    "select receipt_scan_id, status from travel_google_drive_files where trip_id=$1 and customer_auth_subject=$2",
    [tripId, subject],
  );
  const map: DriveStatusMap = {};
  for (const row of result.rows)
    map[String(row.receipt_scan_id)] = row.status === "uploading" ? "pending" : row.status;
  return map;
}

export async function driveSummary(subject: string) {
  const result = await pool.query(
    "select status, count(*)::int as n from travel_google_drive_files where customer_auth_subject=$1 group by status",
    [subject],
  );
  const counts = { pending: 0, uploaded: 0, failed: 0, revoked: 0 };
  for (const row of result.rows) {
    const key = row.status === "uploading" ? "pending" : (row.status as keyof typeof counts);
    counts[key] += Number(row.n);
  }
  return counts;
}

/** Link to the trip's Drive folder, once it exists. */
export async function tripFolderUrl(subject: string, tripId: string) {
  const result = await pool.query(
    "select trip_folder_id from travel_google_drive_folders where trip_id=$1 and customer_auth_subject=$2",
    [tripId, subject],
  );
  return result.rows[0]
    ? `https://drive.google.com/drive/folders/${encodeURIComponent(String(result.rows[0].trip_folder_id))}`
    : null;
}

/** Renames a Drive file or folder. Cosmetic: callers treat a failure as "try again later". */
export async function renameDriveFile(subject: string, fileId: string, name: string) {
  const response = await googleFetch(
    subject,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: safeName(name) }),
    },
  );
  await driveJson(response, "ganti nama");
}

/** Moves a file into a folder (out of wherever it is) and confirms it landed there. */
export async function moveToFolder(subject: string, fileId: string, folderId: string) {
  const id = encodeURIComponent(fileId);
  const current = await driveJson<{ parents?: string[] }>(
    await googleFetch(subject, `${DRIVE_API}/files/${id}?fields=parents`),
    "baca lokasi",
  );
  const parents = current.parents ?? [];
  if (parents.length === 1 && parents[0] === folderId) return true;
  const remove = parents.filter((parent) => parent !== folderId);
  const query = new URLSearchParams({ addParents: folderId, fields: "parents" });
  if (remove.length) query.set("removeParents", remove.join(","));
  const moved = await driveJson<{ parents?: string[] }>(
    await googleFetch(subject, `${DRIVE_API}/files/${id}?${query.toString()}`, { method: "PATCH" }),
    "pindah",
  );
  return (moved.parents ?? []).includes(folderId);
}
