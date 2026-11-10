import { pool } from "@/db/client.server";
import { connectionFor, googleFetch, hasFeature, redactError } from "./google-account.server";
import { buildPlanDocHtml } from "./google-plan-doc";
import { ensureTripFolder, multipartBody } from "./google-drive.server";
import { loadPlanState } from "./google-sheets-plan.server";
import { tripGoogleName } from "./google-trip-names";
import { normalizeTripAssistantConfig } from "./trip-assistant";

const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const DOC_MIME = "application/vnd.google-apps.document";

const driveDocEnabled = async () => {
  const row = await pool.query(
    "select value_json from public.admin_settings where setting_key='tripAssistant'",
  );
  return normalizeTripAssistantConfig(row.rows[0]?.value_json).driveDoc;
};

const madeAt = () =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(
    new Date(),
  );

export type PlanDocResult =
  | { status: "ok"; url: string }
  | { status: "off" | "no_google" | "no_plan" | "failed"; message: string };

/**
 * Creates or refreshes the one Google Doc "Rencana perjalanan" in the trip's Drive folder (the doc is
 * made once per trip, then its content is replaced). Only the Drive file scope is used; a traveler
 * without a connection, or a trip without a plan, is simply skipped.
 */
export async function refreshPlanDoc(
  subject: string,
  tripId: string,
  options: { force?: boolean } = {},
): Promise<PlanDocResult> {
  if (!options.force && !(await driveDocEnabled()))
    return { status: "off", message: "Dokumen rencana dimatikan." };
  const connection = await connectionFor(subject).catch(() => null);
  if (!connection?.refresh_token_encrypted || !hasFeature(connection, "drive"))
    return { status: "no_google", message: "Hubungkan Google Drive dulu di halaman Biaya." };
  const plan = await pool.query("select 1 from public.travel_trip_plans where trip_id=$1", [
    tripId,
  ]);
  if (!plan.rows[0])
    return {
      status: "no_plan",
      message: "Belum ada rencana. Minta Travo membuat Rencana lengkap.",
    };
  try {
    const state = await loadPlanState(tripId);
    const owned = await pool.query(
      "select name, departure_date::text as departure_date from public.travel_trips where id=$1 and customer_auth_subject=$2",
      [tripId, subject],
    );
    if (!owned.rows[0]) return { status: "failed", message: "Perjalanan tidak ditemukan." };
    const html = new TextEncoder().encode(buildPlanDocHtml(state, madeAt()));
    const label = tripGoogleName(String(owned.rows[0].name), owned.rows[0].departure_date);
    const name = `Rencana perjalanan - ${label}`.slice(0, 120);
    const known = await pool.query(
      "select doc_id from public.travel_google_plan_docs where trip_id=$1",
      [tripId],
    );
    let docId: string | null = known.rows[0] ? String(known.rows[0].doc_id) : null;
    if (docId) {
      const updated = await googleFetch(
        subject,
        `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(docId)}?uploadType=media&fields=id`,
        { method: "PATCH", headers: { "content-type": "text/html; charset=UTF-8" }, body: html },
      );
      if (!updated.ok) docId = null; // deleted or not editable: make a new one
    }
    if (!docId) {
      const folderId = await ensureTripFolder(subject, tripId, label);
      const { boundary, body } = multipartBody(
        { name, mimeType: DOC_MIME, parents: [folderId] },
        "text/html",
        html,
      );
      const created = await googleFetch(
        subject,
        `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`,
        {
          method: "POST",
          headers: { "content-type": `multipart/related; boundary=${boundary}` },
          body: new Uint8Array(body),
        },
      );
      if (!created.ok) throw new Error(`Google Drive dokumen ${created.status}`);
      docId = String(((await created.json()) as { id: string }).id);
    }
    const url = `https://docs.google.com/document/d/${encodeURIComponent(docId)}/edit`;
    await pool.query(
      `insert into public.travel_google_plan_docs (trip_id, customer_auth_subject, doc_id, doc_url, status, last_error, updated_at)
       values ($1,$2,$3,$4,'ok',null,now())
       on conflict (trip_id) do update set doc_id=excluded.doc_id, doc_url=excluded.doc_url, status='ok', last_error=null, updated_at=now()`,
      [tripId, subject, docId, url],
    );
    return { status: "ok", url };
  } catch (error) {
    console.error("[google-plan-doc] failed", { tripId, error: redactError(error) });
    await pool
      .query(
        "update public.travel_google_plan_docs set status='failed', last_error=$2 where trip_id=$1",
        [tripId, redactError(error)],
      )
      .catch(() => undefined);
    return { status: "failed", message: "Dokumen belum bisa dibuat. Coba lagi sebentar lagi." };
  }
}

const lastRefresh = new Map<string, number>();

/**
 * After a plan proposal is applied or undone: the spreadsheet is queued for a sync and the Drive
 * document is refreshed (at most every 20 seconds per trip). Fire and forget; never throws.
 */
export function afterPlanChange(subject: string, tripId: string) {
  void (async () => {
    try {
      const { queueSheetSync } = await import("./google-sheets.server");
      await queueSheetSync(subject, tripId);
    } catch (error) {
      console.error("[google-plan-doc] sheet queue failed", { error: redactError(error) });
    }
    const now = Date.now();
    if (now - (lastRefresh.get(tripId) ?? 0) < 20_000) return;
    lastRefresh.set(tripId, now);
    await refreshPlanDoc(subject, tripId);
  })();
}

export type TripGoogleLinks =
  | { status: "ok"; url: string; created?: boolean }
  | { status: "login" | "connect" | "off" | "no_plan" | "failed"; message: string };

/** The link behind the chat's "Buka Google Sheets" / "Simpan ke Drive" taps. */
export async function openTripGoogle(
  subject: string,
  guest: boolean,
  tripId: string,
  target: "sheet" | "drive",
): Promise<TripGoogleLinks> {
  if (guest)
    return {
      status: "login",
      message: "Masuk atau daftar dulu untuk memakai Google Sheets dan Drive.",
    };
  const owned = await pool.query(
    "select 1 from public.travel_trips where id=$1 and customer_auth_subject=$2",
    [tripId, subject],
  );
  if (!owned.rows[0]) return { status: "failed", message: "Perjalanan tidak ditemukan." };
  const connection = await connectionFor(subject).catch(() => null);
  const feature = target === "sheet" ? "sheets" : "drive";
  if (!connection?.refresh_token_encrypted || !hasFeature(connection, feature))
    return {
      status: "connect",
      message: "Hubungkan Google dulu di halaman Biaya, lalu minta lagi.",
    };
  if (target === "drive") {
    const done = await refreshPlanDoc(subject, tripId, { force: true });
    return done.status === "ok"
      ? { status: "ok", url: done.url }
      : {
          status: done.status === "no_plan" ? "no_plan" : done.status === "off" ? "off" : "failed",
          message: done.message,
        };
  }
  const existing = await pool.query(
    "select spreadsheet_url from public.travel_google_sheet_exports where trip_id=$1 and customer_auth_subject=$2 and spreadsheet_id is not null",
    [tripId, subject],
  );
  if (existing.rows[0]?.spreadsheet_url) {
    const { queueSheetSync } = await import("./google-sheets.server");
    await queueSheetSync(subject, tripId);
    return { status: "ok", url: String(existing.rows[0].spreadsheet_url) };
  }
  try {
    const { startSheetExport } = await import("./google-sheets.server");
    await startSheetExport(subject, tripId);
    const fresh = await pool.query(
      "select spreadsheet_url from public.travel_google_sheet_exports where trip_id=$1",
      [tripId],
    );
    return fresh.rows[0]?.spreadsheet_url
      ? { status: "ok", url: String(fresh.rows[0].spreadsheet_url), created: true }
      : { status: "failed", message: "Spreadsheet belum bisa dibuat. Coba lagi sebentar lagi." };
  } catch {
    return { status: "failed", message: "Spreadsheet belum bisa dibuat. Coba lagi sebentar lagi." };
  }
}
