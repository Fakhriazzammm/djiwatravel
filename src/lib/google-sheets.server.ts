import { pool } from "@/db/client.server";
import {
  GoogleAccessRevokedError,
  connectionFor,
  googleFetch,
  hasFeature,
  markGoogleWorkRevoked,
  redactError,
} from "./google-account.server";
import { ensureTripFolder } from "./google-drive.server";

/**
 * One-way export of a trip's budget to a spreadsheet in the traveler's own Drive.
 * Our database stays the source of truth; every sync rewrites the "Pengeluaran" tab from it, which
 * keeps retries idempotent. Edits made in the sheet are not read back.
 */

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const EXPENSE_TAB = "Pengeluaran";
const SUMMARY_TAB = "Ringkasan";
export const EXPENSE_HEADER = [
  "ID",
  "Tanggal",
  "Deskripsi",
  "Kategori",
  "Jumlah",
  "Mata uang",
  "Kurs",
  "Jumlah (IDR)",
  "Struk",
] as const;

type ExpenseRow = {
  id: string;
  transaction_date: Date | string;
  description: string;
  category_name: string | null;
  original_amount_minor: string | number;
  original_currency: string;
  exchange_rate: string | number | null;
  converted_amount_minor: string | number;
  has_receipt: boolean;
};

function dateOnly(value: Date | string) {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/**
 * Cells are written RAW (never parsed as formulas), so user text cannot turn into a formula. This
 * only adds a visible guard for text a spreadsheet user might otherwise copy back into a formula.
 */
export function plainCell(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function expenseValues(rows: readonly ExpenseRow[]) {
  return [
    [...EXPENSE_HEADER],
    ...rows.map((row) => [
      row.id,
      dateOnly(row.transaction_date),
      plainCell(row.description),
      plainCell(row.category_name ?? "Tanpa kategori"),
      Number(row.original_amount_minor) / 100,
      String(row.original_currency).trim(),
      row.exchange_rate === null ? "" : Number(row.exchange_rate),
      Number(row.converted_amount_minor) / 100,
      row.has_receipt ? "Ada" : "",
    ]),
  ];
}

export function summaryValues(categories: readonly string[]) {
  return [["Kategori", "Total (IDR)"], ...categories.map((name) => [plainCell(name)])];
}

async function sheetsJson<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(
      `Google Sheets ${action} ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`,
    );
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return (await response.json()) as T;
}

async function ownedTripName(subject: string, tripId: string) {
  const result = await pool.query(
    "select name from travel_trips where id=$1 and customer_auth_subject=$2",
    [tripId, subject],
  );
  return result.rows[0] ? String(result.rows[0].name) : null;
}

export async function sheetsActive(subject: string) {
  try {
    const connection = await connectionFor(subject);
    return Boolean(connection?.refresh_token_encrypted && hasFeature(connection, "sheets"));
  } catch {
    return false;
  }
}

async function createSpreadsheet(subject: string, tripName: string, tripId: string) {
  const response = await googleFetch(subject, SHEETS_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      properties: { title: `Budget - ${tripName}`.slice(0, 120) },
      sheets: [
        { properties: { title: EXPENSE_TAB, gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: SUMMARY_TAB, gridProperties: { frozenRowCount: 1 } } },
      ],
    }),
  });
  const created = await sheetsJson<{ spreadsheetId: string; spreadsheetUrl: string }>(
    response,
    "buat",
  );
  // Best effort: tidy it into the trip's Drive folder next to the receipts.
  try {
    const folderId = await ensureTripFolder(subject, tripId, tripName);
    await googleFetch(
      subject,
      `${DRIVE_API}/files/${encodeURIComponent(created.spreadsheetId)}?addParents=${encodeURIComponent(folderId)}&removeParents=root&fields=id`,
      { method: "PATCH" },
    );
  } catch (error) {
    console.error("[google-sheets] move to trip folder failed", { error: redactError(error) });
  }
  return created;
}

/** Creates (or re-links) the export for a trip and runs the first sync. */
export async function startSheetExport(subject: string, tripId: string) {
  const tripName = await ownedTripName(subject, tripId);
  if (!tripName) throw new Error("Perjalanan tidak ditemukan");
  const existing = await pool.query(
    "select spreadsheet_id from travel_google_sheet_exports where trip_id=$1 and customer_auth_subject=$2",
    [tripId, subject],
  );
  if (existing.rows[0]?.spreadsheet_id) {
    await markSheetDirty(subject, tripId);
    return syncTripSheet(subject, tripId);
  }
  await pool.query(
    `insert into travel_google_sheet_exports (trip_id, customer_auth_subject, status)
     values ($1,$2,'pending')
     on conflict (trip_id) do update set status='pending', updated_at=now()`,
    [tripId, subject],
  );
  try {
    const created = await createSpreadsheet(subject, tripName, tripId);
    await pool.query(
      "update travel_google_sheet_exports set spreadsheet_id=$1, spreadsheet_url=$2, updated_at=now() where trip_id=$3",
      [created.spreadsheetId, created.spreadsheetUrl, tripId],
    );
  } catch (error) {
    await recordFailure(subject, tripId, error);
    throw error;
  }
  return syncTripSheet(subject, tripId);
}

async function recordFailure(subject: string, tripId: string, error: unknown) {
  if (error instanceof GoogleAccessRevokedError) {
    await markGoogleWorkRevoked(subject);
    return;
  }
  console.error("[google-sheets] sync failed", { tripId, error: redactError(error) });
  await pool.query(
    "update travel_google_sheet_exports set status='failed', last_error=$1, updated_at=now() where trip_id=$2",
    [redactError(error), tripId],
  );
}

/** Marks the export as needing a sync (durable), without calling Google. */
export async function markSheetDirty(subject: string, tripId: string) {
  await pool.query(
    "update travel_google_sheet_exports set status='pending', updated_at=now() where trip_id=$1 and customer_auth_subject=$2 and spreadsheet_id is not null and status in ('synced','failed','pending')",
    [tripId, subject],
  );
}

export async function syncTripSheet(subject: string, tripId: string) {
  const claimed = await pool.query(
    `update travel_google_sheet_exports
        set status='syncing', attempts=attempts+1, updated_at=now()
      where trip_id=$1 and customer_auth_subject=$2 and spreadsheet_id is not null
        and (status in ('pending','failed') or (status='syncing' and updated_at < now() - interval '2 minutes'))
      returning spreadsheet_id, spreadsheet_url`,
    [tripId, subject],
  );
  const target = claimed.rows[0] as
    { spreadsheet_id: string; spreadsheet_url: string | null } | undefined;
  if (!target) return null;
  try {
    const [expenses, categories] = await Promise.all([
      pool.query(
        `select e.id, e.transaction_date, e.description, c.name as category_name,
                e.original_amount_minor, e.original_currency, e.exchange_rate, e.converted_amount_minor,
                exists (select 1 from public.travel_receipt_photos p where p.expense_id=e.id) as has_receipt
           from travel_expenses e left join travel_budget_categories c on c.id=e.category_id
          where e.trip_id=$1 order by e.transaction_date, e.created_at`,
        [tripId],
      ),
      pool.query("select name from travel_budget_categories where trip_id=$1 order by sort_order", [
        tripId,
      ]),
    ]);
    const names = [
      ...(categories.rows as Array<{ name: string }>).map((row) => row.name),
      "Tanpa kategori",
    ];
    const id = encodeURIComponent(target.spreadsheet_id);
    const range = (tab: string, cells: string) => encodeURIComponent(`${tab}!${cells}`);

    await sheetsJson(
      await googleFetch(subject, `${SHEETS_API}/${id}/values/${range(EXPENSE_TAB, "A:Z")}:clear`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      "bersihkan",
    );
    await sheetsJson(
      await googleFetch(subject, `${SHEETS_API}/${id}/values:batchUpdate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: [
            { range: `${EXPENSE_TAB}!A1`, values: expenseValues(expenses.rows as ExpenseRow[]) },
            { range: `${SUMMARY_TAB}!A1`, values: summaryValues(names) },
          ],
        }),
      }),
      "tulis",
    );
    // Totals per category are live formulas over the expense tab (names are cell references, not text).
    const totals = names.map((_, index) => [
      `=SUMIF(${EXPENSE_TAB}!$D:$D,A${index + 2},${EXPENSE_TAB}!$H:$H)`,
    ]);
    await sheetsJson(
      await googleFetch(
        subject,
        `${SHEETS_API}/${id}/values/${range(SUMMARY_TAB, `B2:B${names.length + 1}`)}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ values: totals }),
        },
      ),
      "rumus",
    );
    await pool.query(
      "update travel_google_sheet_exports set status='synced', last_synced_at=now(), last_error=null, updated_at=now() where trip_id=$1 and status='syncing'",
      [tripId],
    );
    return { spreadsheetUrl: target.spreadsheet_url };
  } catch (error) {
    await recordFailure(subject, tripId, error);
    return null;
  }
}

/** Called after every expense change. Durable first (pending), then a non-blocking sync. */
export async function queueSheetSync(subject: string, tripId: string) {
  await markSheetDirty(subject, tripId);
  void syncTripSheet(subject, tripId).catch((error) =>
    console.error("[google-sheets] queued sync failed", { error: redactError(error) }),
  );
}

export async function stopSheetExport(subject: string, tripId: string) {
  // The spreadsheet itself stays in the traveler's Drive; only our link to it is removed.
  await pool.query(
    "delete from travel_google_sheet_exports where trip_id=$1 and customer_auth_subject=$2",
    [tripId, subject],
  );
}

export async function sheetExportStatus(subject: string, tripId: string) {
  const result = await pool.query(
    "select status, spreadsheet_url, last_synced_at, last_error from travel_google_sheet_exports where trip_id=$1 and customer_auth_subject=$2",
    [tripId, subject],
  );
  const row = result.rows[0] as
    | {
        status: string;
        spreadsheet_url: string | null;
        last_synced_at: string | null;
        last_error: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    status: row.status === "syncing" ? "pending" : row.status,
    spreadsheetUrl: row.spreadsheet_url,
    lastSyncedAt: row.last_synced_at,
    error: row.last_error,
  };
}

/** After a reconnect, revoked exports go back to pending and sync again. */
export async function requeueRevokedSheets(subject: string) {
  const result = await pool.query(
    "update travel_google_sheet_exports set status='pending', attempts=0, last_error=null, updated_at=now() where customer_auth_subject=$1 and status='revoked' returning trip_id",
    [subject],
  );
  for (const row of result.rows as Array<{ trip_id: string }>)
    await syncTripSheet(subject, row.trip_id);
}

export async function drainSheetQueue(subject: string) {
  const result = await pool.query(
    "select trip_id from travel_google_sheet_exports where customer_auth_subject=$1 and status in ('pending','failed')",
    [subject],
  );
  for (const row of result.rows as Array<{ trip_id: string }>)
    await syncTripSheet(subject, row.trip_id);
}
