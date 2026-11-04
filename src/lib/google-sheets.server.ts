import { pool } from "@/db/client.server";
import {
  GoogleAccessRevokedError,
  connectionFor,
  googleFetch,
  hasFeature,
  markGoogleWorkRevoked,
  redactError,
} from "./google-account.server";
import {
  ensureTripFolder,
  moveToFolder,
  renameDriveFile,
  tripFolderUrl,
} from "./google-drive.server";
import {
  BUDGET_TAB,
  CATEGORY_FIRST_ROW,
  CATEGORY_HEADER_ROW,
  EXPENSE_TAB,
  ITEMS_TAB,
  LAYOUT_VERSION,
  LEGACY_SUMMARY_TAB,
  buildSheetWrite,
  managedRanges,
} from "./google-sheets-model";
import {
  applyPull,
  emptyReport,
  loadState,
  pulledAnything,
  saveSnapshot,
  type PullReport,
  type SheetData,
} from "./google-sheets-pull.server";
import { tripGoogleName, tripSheetTitle } from "./google-trip-names";

/**
 * Two-way sync between a trip and its spreadsheet in the traveler's own Drive.
 *
 * Each cycle first reads the sheet and applies what the traveler changed there to our database (rows
 * are matched by ID; see google-sheets-model.ts for how a sheet edit, an app edit and a clash are
 * told apart), then rewrites the managed columns from the database so formulas, IDs and totals are
 * always consistent. The database stays the source of truth: invalid rows are skipped and reported,
 * and a row changed on both sides keeps the app's version.
 */

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

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

/** "Bali · Des 2026": the name used for the trip's Drive folder and spreadsheet. */
async function ownedTripLabel(subject: string, tripId: string) {
  const result = await pool.query(
    "select name, departure_date::text as departure_date from travel_trips where id=$1 and customer_auth_subject=$2",
    [tripId, subject],
  );
  const row = result.rows[0] as { name: string; departure_date: Date | string | null } | undefined;
  return row ? tripGoogleName(String(row.name), row.departure_date) : null;
}

export async function sheetsActive(subject: string) {
  try {
    const connection = await connectionFor(subject);
    return Boolean(connection?.refresh_token_encrypted && hasFeature(connection, "sheets"));
  } catch {
    return false;
  }
}

async function createSpreadsheet(subject: string, label: string) {
  const response = await googleFetch(subject, SHEETS_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      properties: { title: tripSheetTitle(label) },
      sheets: [
        { properties: { title: EXPENSE_TAB, gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: ITEMS_TAB, gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: BUDGET_TAB } },
      ],
    }),
  });
  return sheetsJson<{ spreadsheetId: string; spreadsheetUrl: string }>(response, "buat");
}

type Tabs = { ids: Map<string, number>; added: boolean };

/**
 * Makes sure every tab Djiwa writes exists. The old "Ringkasan" tab becomes "Anggaran"; a tab the
 * traveler deleted is created again instead of failing the sync.
 */
async function ensureTabs(subject: string, spreadsheetId: string): Promise<Tabs> {
  const id = encodeURIComponent(spreadsheetId);
  const meta = await sheetsJson<{
    sheets?: Array<{ properties?: { title?: string; sheetId?: number } }>;
  }>(
    await googleFetch(subject, `${SHEETS_API}/${id}?fields=sheets.properties(title,sheetId)`),
    "baca tab",
  );
  const ids = new Map<string, number>();
  for (const sheet of meta.sheets ?? [])
    if (sheet.properties?.title !== undefined && sheet.properties.sheetId !== undefined)
      ids.set(sheet.properties.title, sheet.properties.sheetId);
  const requests: Array<Record<string, unknown>> = [];
  const legacy = ids.get(LEGACY_SUMMARY_TAB);
  if (!ids.has(BUDGET_TAB) && legacy !== undefined) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: legacy, title: BUDGET_TAB },
        fields: "title",
      },
    });
    ids.set(BUDGET_TAB, legacy);
    ids.delete(LEGACY_SUMMARY_TAB);
  }
  const missing = [EXPENSE_TAB, ITEMS_TAB, BUDGET_TAB].filter((title) => !ids.has(title));
  for (const title of missing)
    requests.push({
      addSheet: {
        properties: {
          title,
          ...(title === BUDGET_TAB ? {} : { gridProperties: { frozenRowCount: 1 } }),
        },
      },
    });
  if (!requests.length) return { ids, added: false };
  const result = await sheetsJson<{
    replies?: Array<{ addSheet?: { properties?: { title?: string; sheetId?: number } } }>;
  }>(
    await googleFetch(subject, `${SHEETS_API}/${id}:batchUpdate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requests }),
    }),
    "siapkan tab",
  );
  for (const reply of result.replies ?? [])
    if (
      reply.addSheet?.properties?.title !== undefined &&
      reply.addSheet.properties.sheetId !== undefined
    )
      ids.set(reply.addSheet.properties.title, reply.addSheet.properties.sheetId);
  return { ids, added: missing.length > 0 };
}

/** The three tabs as the traveler currently has them (formulas as their computed values). */
async function readSheet(subject: string, spreadsheetId: string): Promise<SheetData> {
  const ranges = [`${EXPENSE_TAB}!A1:I`, `${ITEMS_TAB}!A1:G`, `${BUDGET_TAB}!A1:F`];
  const query = new URLSearchParams();
  for (const range of ranges) query.append("ranges", range);
  query.set("valueRenderOption", "UNFORMATTED_VALUE");
  query.set("dateTimeRenderOption", "SERIAL_NUMBER");
  const result = await sheetsJson<{ valueRanges?: Array<{ values?: SheetData["expenses"] }> }>(
    await googleFetch(
      subject,
      `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${query.toString()}`,
    ),
    "baca",
  );
  const [expenses, items, budget] = result.valueRanges ?? [];
  return {
    expenses: expenses?.values ?? [],
    items: items?.values ?? [],
    budget: budget?.values ?? [],
  };
}

const sameData = (a: SheetData, b: SheetData) => JSON.stringify(a) === JSON.stringify(b);

/** Writes the managed columns from the database: values as plain text, formulas evaluated by Sheets. */
async function writeSheet(subject: string, spreadsheetId: string, tripId: string) {
  const id = encodeURIComponent(spreadsheetId);
  const state = await loadState(pool, tripId);
  const write = buildSheetWrite(state);
  const json = { "content-type": "application/json" };
  await sheetsJson(
    await googleFetch(subject, `${SHEETS_API}/${id}/values:batchClear`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ ranges: managedRanges() }),
    }),
    "bersihkan",
  );
  await sheetsJson(
    await googleFetch(subject, `${SHEETS_API}/${id}/values:batchUpdate`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ valueInputOption: "RAW", data: write.raw }),
    }),
    "tulis",
  );
  await sheetsJson(
    await googleFetch(subject, `${SHEETS_API}/${id}/values:batchUpdate`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: write.formulas }),
    }),
    "rumus",
  );
  return state;
}

/**
 * One-time look and safety for a spreadsheet: bold headers, a category dropdown on expenses, and
 * warning-only protection on the cells Djiwa computes (IDs, formulas, totals). Cosmetic: a failure
 * is logged and tried again on a later sync.
 */
async function formatSheet(subject: string, spreadsheetId: string, ids: Map<string, number>) {
  const expense = ids.get(EXPENSE_TAB);
  const items = ids.get(ITEMS_TAB);
  const budget = ids.get(BUDGET_TAB);
  if (expense === undefined || items === undefined || budget === undefined) return false;
  const range = (sheetId: number, r0: number, r1: number, c0: number, c1: number) => ({
    sheetId,
    startRowIndex: r0,
    endRowIndex: r1,
    startColumnIndex: c0,
    endColumnIndex: c1,
  });
  const bold = (r: ReturnType<typeof range>) => ({
    repeatCell: {
      range: r,
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: "userEnteredFormat.textFormat.bold",
    },
  });
  const guard = (r: ReturnType<typeof range>, description: string) => ({
    addProtectedRange: { protectedRange: { range: r, description, warningOnly: true } },
  });
  const rows = 5000;
  const requests = [
    bold(range(expense, 0, 1, 0, 9)),
    bold(range(items, 0, 1, 0, 7)),
    bold(range(budget, 0, 7, 0, 1)),
    bold(range(budget, CATEGORY_HEADER_ROW - 1, CATEGORY_HEADER_ROW, 0, 6)),
    {
      setDataValidation: {
        range: range(expense, 1, rows, 3, 4),
        rule: {
          condition: {
            type: "ONE_OF_RANGE",
            values: [{ userEnteredValue: `=${BUDGET_TAB}!$A$${CATEGORY_FIRST_ROW}:$A$300` }],
          },
          strict: false,
          showCustomUi: true,
        },
      },
    },
    guard(range(expense, 0, rows, 0, 1), "ID dikelola Djiwa Travel"),
    guard(range(expense, 0, rows, 7, 9), "Dihitung otomatis oleh Djiwa Travel"),
    guard(range(items, 0, rows, 0, 3), "Diisi otomatis dari pengeluaran"),
    guard(range(items, 0, rows, 5, 7), "Dikelola Djiwa Travel"),
    guard(range(budget, 0, 7, 0, 1), "Label"),
    guard(range(budget, 1, 7, 1, 2), "Dihitung otomatis oleh Djiwa Travel"),
    guard(range(budget, CATEGORY_HEADER_ROW - 1, CATEGORY_HEADER_ROW, 0, 6), "Judul kolom"),
    guard(range(budget, CATEGORY_FIRST_ROW - 1, rows, 2, 6), "Dihitung otomatis oleh Djiwa Travel"),
  ];
  try {
    await sheetsJson(
      await googleFetch(subject, `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requests }),
      }),
      "format",
    );
    return true;
  } catch (error) {
    console.error("[google-sheets] format failed", { error: redactError(error) });
    return false;
  }
}

/** Creates (or re-links) the export for a trip and runs the first sync. */
export async function startSheetExport(subject: string, tripId: string) {
  const label = await ownedTripLabel(subject, tripId);
  if (!label) throw new Error("Perjalanan tidak ditemukan");
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
    const created = await createSpreadsheet(subject, label);
    await pool.query(
      "update travel_google_sheet_exports set spreadsheet_id=$1, spreadsheet_url=$2, layout_version=1, formatted=false, updated_at=now() where trip_id=$3",
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

export type SyncOutcome = {
  spreadsheetUrl: string | null;
  report: PullReport;
  /** The sheet changed the app's data, so the app screens should refresh. */
  changed: boolean;
};

const MAX_PULL_ROUNDS = 3;

/**
 * One sync cycle: pull the traveler's edits from the sheet into the database, then rewrite the sheet
 * from the database. Returns null when another cycle already runs, or when it fails (recorded).
 */
export async function syncTripSheet(subject: string, tripId: string): Promise<SyncOutcome | null> {
  const claimed = await pool.query(
    `update travel_google_sheet_exports
        set status='syncing', attempts=attempts+1, updated_at=now()
      where trip_id=$1 and customer_auth_subject=$2 and spreadsheet_id is not null
        and (status in ('pending','failed') or (status='syncing' and updated_at < now() - interval '2 minutes'))
      returning spreadsheet_id, spreadsheet_url, in_trip_folder, named_as, layout_version, formatted`,
    [tripId, subject],
  );
  const target = claimed.rows[0] as
    | {
        spreadsheet_id: string;
        spreadsheet_url: string | null;
        in_trip_folder: boolean;
        named_as: string | null;
        layout_version: number;
        formatted: boolean;
      }
    | undefined;
  if (!target) return null;
  try {
    // Older scanned expenses get their items from the note first, so Rincian covers them too.
    const { backfillTripItems } = await import("./expense-items.server");
    await backfillTripItems(tripId);
    const tabs = await ensureTabs(subject, target.spreadsheet_id);

    // Pull only from a sheet that already has the current layout; an older one is upgraded by the rewrite.
    const canPull = target.layout_version >= LAYOUT_VERSION && !tabs.added;
    const report = emptyReport();
    let read: SheetData | null = canPull ? await readSheet(subject, target.spreadsheet_id) : null;
    let settled = !canPull;
    for (let round = 0; read && round < MAX_PULL_ROUNDS; round += 1) {
      const pulled = await applyPull(tripId, read);
      mergeReport(report, pulled);
      // If the traveler edited the sheet while we worked, take that edit in too instead of overwriting it.
      const again = await readSheet(subject, target.spreadsheet_id);
      if (sameData(read, again)) {
        settled = true;
        break;
      }
      read = again;
    }
    if (!settled) {
      await pool.query(
        "update travel_google_sheet_exports set status='pending', updated_at=now() where trip_id=$1 and status='syncing'",
        [tripId],
      );
      return null;
    }

    const written = await writeSheet(subject, target.spreadsheet_id, tripId);
    await saveSnapshot(tripId, written);
    let formatted = target.formatted && !tabs.added;
    if (!formatted) formatted = await formatSheet(subject, target.spreadsheet_id, tabs.ids);
    const pulledRows =
      report.applied.trip +
      report.applied.categories +
      report.applied.expenses +
      report.applied.items +
      report.created +
      report.deleted;
    await pool.query(
      `update travel_google_sheet_exports
          set status='synced', last_synced_at=now(), last_error=null, updated_at=now(),
              layout_version=$2, formatted=$3, last_report=$4::jsonb,
              pulled_rows_total=pulled_rows_total+$5, conflicts_total=conflicts_total+$6
        where trip_id=$1 and status='syncing'`,
      [
        tripId,
        LAYOUT_VERSION,
        formatted,
        JSON.stringify({ ...report, issues: report.issues.slice(0, 20) }),
        pulledRows,
        report.conflicts,
      ],
    );
    await tidyTripFiles(subject, tripId, target);
    return {
      spreadsheetUrl: target.spreadsheet_url,
      report,
      changed: pulledAnything(report),
    };
  } catch (error) {
    await recordFailure(subject, tripId, error);
    return null;
  }
}

function mergeReport(into: PullReport, from: PullReport) {
  into.applied.trip += from.applied.trip;
  into.applied.categories += from.applied.categories;
  into.applied.expenses += from.applied.expenses;
  into.applied.items += from.applied.items;
  into.created += from.created;
  into.deleted += from.deleted;
  into.conflicts += from.conflicts;
  into.heldDeletions += from.heldDeletions;
  // A later round reads the same sheet again, so keep each problem once.
  const seen = new Set(into.issues.map((issue) => `${issue.tab}:${issue.row}:${issue.reason}`));
  for (const issue of from.issues)
    if (!seen.has(`${issue.tab}:${issue.row}:${issue.reason}`)) into.issues.push(issue);
}

/**
 * Housekeeping after a successful sync: the spreadsheet sits in the trip's folder and both carry the
 * current trip name. A failure here never fails the sync; the flags stay false and the next sync retries.
 */
async function tidyTripFiles(
  subject: string,
  tripId: string,
  target: { spreadsheet_id: string; in_trip_folder: boolean; named_as: string | null },
) {
  const label = await ownedTripLabel(subject, tripId);
  if (!label) return;
  try {
    if (!target.in_trip_folder) {
      let folderId = await ensureTripFolder(subject, tripId, label);
      let placed: boolean;
      try {
        placed = await moveToFolder(subject, target.spreadsheet_id, folderId);
      } catch (error) {
        // The traveler deleted the trip folder: make a new one and place the sheet there.
        if ((error as { status?: number }).status !== 404) throw error;
        folderId = await ensureTripFolder(subject, tripId, label, true);
        placed = await moveToFolder(subject, target.spreadsheet_id, folderId);
      }
      if (placed)
        await pool.query(
          "update travel_google_sheet_exports set in_trip_folder=true where trip_id=$1",
          [tripId],
        );
      else console.error("[google-sheets] spreadsheet not in trip folder after move", { tripId });
    }
    if (target.named_as !== label) await renameTripGoogleFiles(subject, tripId, label);
  } catch (error) {
    console.error("[google-sheets] tidy trip files failed", { tripId, error: redactError(error) });
  }
}

/** Renames the trip's Drive folder and spreadsheet to the trip's current name. */
export async function renameTripGoogleFiles(subject: string, tripId: string, known?: string) {
  const label = known ?? (await ownedTripLabel(subject, tripId));
  if (!label) return;
  const folder = await pool.query(
    "select trip_folder_id from travel_google_drive_folders where trip_id=$1 and customer_auth_subject=$2",
    [tripId, subject],
  );
  if (folder.rows[0]) await renameDriveFile(subject, String(folder.rows[0].trip_folder_id), label);
  const sheet = await pool.query(
    "select spreadsheet_id from travel_google_sheet_exports where trip_id=$1 and customer_auth_subject=$2 and spreadsheet_id is not null",
    [tripId, subject],
  );
  if (sheet.rows[0]) {
    await renameDriveFile(subject, String(sheet.rows[0].spreadsheet_id), tripSheetTitle(label));
    await pool.query("update travel_google_sheet_exports set named_as=$1 where trip_id=$2", [
      label,
      tripId,
    ]);
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
    "select status, spreadsheet_url, last_synced_at, last_error, last_report from travel_google_sheet_exports where trip_id=$1 and customer_auth_subject=$2",
    [tripId, subject],
  );
  const row = result.rows[0] as
    | {
        status: string;
        spreadsheet_url: string | null;
        last_synced_at: string | null;
        last_error: string | null;
        last_report: Partial<PullReport> | null;
      }
    | undefined;
  if (!row) return null;
  const report = row.last_report;
  return {
    status: row.status === "syncing" ? "pending" : row.status,
    spreadsheetUrl: row.spreadsheet_url,
    lastSyncedAt: row.last_synced_at,
    error: row.last_error,
    // What the last sync took from the sheet and what it could not use, for the card on the Biaya page.
    report: report
      ? {
          conflicts: Number(report.conflicts ?? 0),
          heldDeletions: Number(report.heldDeletions ?? 0),
          issues: (report.issues ?? []).slice(0, 5),
          issueCount: (report.issues ?? []).length,
        }
      : null,
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
