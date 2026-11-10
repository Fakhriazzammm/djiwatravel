import { pool } from "@/db/client.server";
import { googleFetch, redactError } from "./google-account.server";
import { syncItineraryItem } from "./google-calendar.server";
import { deletionsAllowed, planRows, type SheetIssue } from "./google-sheets-model";
import { loadSnapshot } from "./google-sheets-pull.server";
import {
  PLAN_LAYOUT_VERSION,
  PLAN_TAB,
  PREP_TAB,
  SUMMARY_TAB,
  TICKET_TAB,
  buildPlanFormat,
  buildPlanWrite,
  parsePlanItems,
  parsePrep,
  planItemHash,
  prepHash,
  type PlanFacts,
  type PlanSheetState,
} from "./google-sheets-plan";
import { normalizeTripAssistantConfig } from "./trip-assistant";
import { pinMissingPlaces } from "./trip-assistant-places.server";

/**
 * The plan tabs of the trip spreadsheet (Ringkasan, Itinerary, Persiapan, Tiket & Transport), kept
 * in step with the database inside the same sync cycle as Anggaran / Pengeluaran / Rincian: first the
 * traveler's edits are read (itinerary rows and the checklist checkbox), then the tabs are rewritten.
 * A failure here never fails the budget sync; it is reported and tried again next time.
 */

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const TABS = [SUMMARY_TAB, PLAN_TAB, PREP_TAB, TICKET_TAB] as const;

async function sheets<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Google Sheets ${action} ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`,
    );
  }
  return (await response.json()) as T;
}

export type PlanReport = {
  items: { updated: number; created: number; deleted: number };
  prep: { updated: number };
  conflicts: number;
  heldDeletions: number;
  issues: SheetIssue[];
};
export const emptyPlanReport = (): PlanReport => ({
  items: { updated: 0, created: 0, deleted: 0 },
  prep: { updated: 0 },
  conflicts: 0,
  heldDeletions: 0,
  issues: [],
});
export const planPulledAnything = (r: PlanReport) =>
  r.items.updated + r.items.created + r.items.deleted + r.prep.updated > 0;

export async function planTabsEnabled() {
  const row = await pool.query(
    "select value_json from public.admin_settings where setting_key='tripAssistant'",
  );
  return normalizeTripAssistantConfig(row.rows[0]?.value_json).sheetsPlanTabs;
}

async function ensurePlanTabs(subject: string, spreadsheetId: string) {
  const id = encodeURIComponent(spreadsheetId);
  const meta = await sheets<{
    sheets?: Array<{ properties?: { title?: string; sheetId?: number } }>;
  }>(
    await googleFetch(subject, `${SHEETS_API}/${id}?fields=sheets.properties(title,sheetId)`),
    "baca tab",
  );
  const ids = new Map<string, number>();
  for (const sheet of meta.sheets ?? [])
    if (sheet.properties?.title !== undefined && sheet.properties.sheetId !== undefined)
      ids.set(sheet.properties.title, sheet.properties.sheetId);
  const missing = TABS.filter((title) => !ids.has(title));
  if (!missing.length) return { ids, added: false };
  const result = await sheets<{
    replies?: Array<{ addSheet?: { properties?: { title?: string; sheetId?: number } } }>;
  }>(
    await googleFetch(subject, `${SHEETS_API}/${id}:batchUpdate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requests: missing.map((title) => ({
          addSheet: { properties: { title, ...(title === SUMMARY_TAB ? { index: 0 } : {}) } },
        })),
      }),
    }),
    "siapkan tab rencana",
  );
  for (const reply of result.replies ?? [])
    if (
      reply.addSheet?.properties?.title !== undefined &&
      reply.addSheet.properties.sheetId !== undefined
    )
      ids.set(reply.addSheet.properties.title, reply.addSheet.properties.sheetId);
  return { ids, added: true };
}

const dateLabel = (from: string | null, to: string | null) => {
  if (!from || !to) return "Tanggal belum diatur";
  const f = (d: string) =>
    new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${d}T00:00:00Z`),
    );
  return `${f(from)} – ${f(to)} ${to.slice(0, 4)}`;
};

export async function loadPlanState(tripId: string): Promise<PlanSheetState> {
  const [trip, cats, items, prep, plan, budgetRows, spentTotal, bookings] = await Promise.all([
    pool.query(
      `select name, destination_name, travelers_count, primary_currency, total_budget_minor, updated_at,
              departure_date::text as d, return_date::text as r from travel_trips where id=$1`,
      [tripId],
    ),
    pool.query(
      "select name from travel_budget_categories where trip_id=$1 order by sort_order, created_at",
      [tripId],
    ),
    pool.query(
      `select id, activity_date::text as d, coalesce(to_char(start_time,'HH24:MI'),'') as s,
              coalesce(to_char(end_time,'HH24:MI'),'') as e, title, coalesce(location,'') as loc,
              coalesce(notes,'') as notes, coalesce(estimated_cost_minor,0) as cost,
              coalesce(currency,'') as cur, coalesce(activity_category,'') as cat, latitude, longitude
         from travel_itinerary_items where trip_id=$1 order by activity_date, start_time nulls last, created_at`,
      [tripId],
    ),
    pool.query(
      "select id, title, coalesce(due_date::text,'') as due, is_completed from travel_checklist_items where trip_id=$1 order by sort_order, created_at",
      [tripId],
    ),
    pool.query(
      "select city, tier, budget, research, costs, updated_at from travel_trip_plans where trip_id=$1",
      [tripId],
    ),
    pool.query(
      `select c.name as name, c.allocated_minor as alloc,
              coalesce((select sum(e.converted_amount_minor) from travel_expenses e where e.category_id=c.id),0) as spent
         from travel_budget_categories c where c.trip_id=$1 order by c.sort_order, c.created_at`,
      [tripId],
    ),
    pool.query(
      "select coalesce(sum(converted_amount_minor),0) as spent from travel_expenses where trip_id=$1",
      [tripId],
    ),
    pool.query(
      "select title, category, status, coalesce(reference_number,'') as reference from travel_bookings where trip_id=$1 and status <> 'cancelled' order by created_at",
      [tripId],
    ),
  ]);
  const t = trip.rows[0] as Record<string, unknown>;
  const currency = String(t["primary_currency"] ?? "IDR").trim();
  const planRow = plan.rows[0] as Record<string, unknown> | undefined;
  let fx = 1;
  if (planRow && currency !== "IDR") {
    const { fetchFxRate } = await import("./receipt-scan.server");
    fx = (await fetchFxRate({ from: "IDR", to: currency }))?.rate ?? 0;
  }
  const facts: PlanFacts | null = planRow
    ? {
        city: String(planRow["city"]),
        tier: String(planRow["tier"]),
        budget: (planRow["budget"] as PlanFacts["budget"]) ?? [],
        research: (planRow["research"] as PlanFacts["research"]) ?? {},
        costs: (planRow["costs"] as Record<string, number>) ?? {},
        updatedAt: new Date(String(planRow["updated_at"])).toISOString(),
      }
    : null;
  return {
    tripName: String(t["name"]),
    destination: String(t["destination_name"]),
    dates: dateLabel((t["d"] as string | null) ?? null, (t["r"] as string | null) ?? null),
    travelers: Number(t["travelers_count"]) || 1,
    currency,
    departure: (t["d"] as string | null) ?? null,
    totalMinor: Number(t["total_budget_minor"]) || 0,
    categories: cats.rows.map((c) => ({ name: String(c["name"]) })),
    items: items.rows.map((i) => ({
      id: String(i["id"]),
      date: String(i["d"]),
      start: String(i["s"]),
      end: String(i["e"]),
      title: String(i["title"]),
      location: String(i["loc"]),
      notes: String(i["notes"]),
      costMinor: Number(i["cost"]) || 0,
      currency: String(i["cur"]),
      category: String(i["cat"]),
      lat: i["latitude"] === null ? null : Number(i["latitude"]),
      lng: i["longitude"] === null ? null : Number(i["longitude"]),
    })),
    prep: prep.rows.map((p) => ({
      id: String(p["id"]),
      title: String(p["title"]),
      due: String(p["due"]),
      done: Boolean(p["is_completed"]),
    })),
    plan: facts,
    tripId,
    tripUpdatedAt: new Date(String(t["updated_at"])).toISOString(),
    budgetRows: budgetRows.rows.map((r) => ({
      name: String(r["name"]),
      allocatedMinor: Number(r["alloc"]) || 0,
      spentMinor: Number(r["spent"]) || 0,
    })),
    spentMinor: Number(spentTotal.rows[0]?.["spent"]) || 0,
    bookings: bookings.rows.map((b) => ({
      title: String(b["title"]),
      category: String(b["category"]),
      status: String(b["status"]),
      reference: String(b["reference"]),
    })),
    fxFromIdr: fx || 1,
  };
}

type Cells = Array<Array<string | number | boolean | null>>;

async function readTabs(subject: string, spreadsheetId: string) {
  const query = new URLSearchParams();
  query.append("ranges", `${PLAN_TAB}!A1:L`);
  query.append("ranges", `${PREP_TAB}!A1:E`);
  query.set("valueRenderOption", "UNFORMATTED_VALUE");
  query.set("dateTimeRenderOption", "SERIAL_NUMBER");
  const result = await sheets<{ valueRanges?: Array<{ values?: Cells }> }>(
    await googleFetch(
      subject,
      `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${query.toString()}`,
    ),
    "baca rencana",
  );
  return {
    items: result.valueRanges?.[0]?.values ?? [],
    prep: result.valueRanges?.[1]?.values ?? [],
  };
}

/** Applies the traveler's edits in Itinerary and Persiapan to the database. */
async function pullPlanTabs(
  subject: string,
  tripId: string,
  data: { items: Cells; prep: Cells },
  report: PlanReport,
) {
  const trip = await pool.query(
    "select primary_currency, departure_date::text as d, return_date::text as r from travel_trips where id=$1",
    [tripId],
  );
  const t = trip.rows[0] as { primary_currency: string; d: string | null; r: string | null };
  const snap = await loadSnapshot(tripId);
  let needsPins = false;

  const parsed = parsePlanItems(data.items, { from: t.d, to: t.r });
  report.issues.push(...parsed.issues);
  const db = await pool.query(
    `select id, activity_date::text as d, coalesce(to_char(start_time,'HH24:MI'),'') as s,
            coalesce(to_char(end_time,'HH24:MI'),'') as e, title, coalesce(location,'') as loc,
            coalesce(notes,'') as notes, coalesce(estimated_cost_minor,0) as cost
       from travel_itinerary_items where trip_id=$1`,
    [tripId],
  );
  const dbMap = new Map(
    db.rows.map((r) => [
      String(r["id"]),
      {
        date: String(r["d"]),
        start: String(r["s"]),
        end: String(r["e"]),
        title: String(r["title"]),
        location: String(r["loc"]),
        notes: String(r["notes"]),
        costMinor: Number(r["cost"]) || 0,
      },
    ]),
  );
  const plan = planRows({
    sheet: parsed.keyed,
    present: parsed.presentKeys,
    db: dbMap,
    snapshot: snap(PLAN_TAB),
    sheetHash: planItemHash,
    dbHash: planItemHash,
  });
  report.conflicts += plan.conflicts.length;
  for (const { key, value } of plan.update) {
    const before = dbMap.get(key)!;
    const placeChanged = before.title !== value.title || before.location !== value.location;
    await pool.query(
      `update travel_itinerary_items
          set activity_date=$3, start_time=nullif($4,'')::time, end_time=nullif($5,'')::time, title=$6,
              location=nullif($7,''), notes=nullif($8,''), estimated_cost_minor=nullif($9::bigint,0),
              currency=case when $9::bigint > 0 then $10 else currency end,
              latitude=case when $11 then null else latitude end,
              longitude=case when $11 then null else longitude end,
              place_label=case when $11 then null else place_label end,
              updated_at=now()
        where id=$1 and trip_id=$2`,
      [
        key,
        tripId,
        value.date,
        value.start,
        value.end,
        value.title,
        value.location,
        value.notes,
        value.costMinor,
        t.primary_currency.trim(),
        placeChanged,
      ],
    );
    if (placeChanged) needsPins = true;
    report.items.updated += 1;
    await syncItineraryItem(key, subject).catch(() => undefined);
  }
  if (plan.remove.length) {
    if (deletionsAllowed(plan.remove.length, snap(PLAN_TAB).size, parsed.headerIntact)) {
      await pool.query(
        "delete from travel_itinerary_items where trip_id=$1 and id = any($2::uuid[])",
        [tripId, plan.remove],
      );
      report.items.deleted += plan.remove.length;
    } else report.heldDeletions += plan.remove.length;
  }
  if (parsed.headerIntact)
    for (const fresh of parsed.fresh.slice(0, 50)) {
      const created = await pool.query(
        `insert into travel_itinerary_items (trip_id, activity_date, start_time, end_time, title, location, notes, estimated_cost_minor, currency)
         values ($1,$2,nullif($3,'')::time,nullif($4,'')::time,$5,nullif($6,''),nullif($7,''),nullif($8::bigint,0), case when $8::bigint > 0 then $9 else null end) returning id`,
        [
          tripId,
          fresh.date,
          fresh.start,
          fresh.end,
          fresh.title,
          fresh.location,
          fresh.notes,
          fresh.costMinor,
          t.primary_currency.trim(),
        ],
      );
      report.items.created += 1;
      needsPins = true;
      await syncItineraryItem(String(created.rows[0]["id"]), subject).catch(() => undefined);
    }
  if (needsPins) await pinMissingPlaces(tripId, { budgetMs: 6000 }).catch(() => undefined);

  // Persiapan: only the checkbox.
  const prep = parsePrep(data.prep);
  if (prep.headerIntact) {
    const rows = await pool.query(
      "select id, is_completed from travel_checklist_items where trip_id=$1",
      [tripId],
    );
    const prepDb = new Map(
      rows.rows.map((r) => [String(r["id"]), { done: Boolean(r["is_completed"]) }]),
    );
    const prepPlan = planRows({
      sheet: prep.keyed,
      present: prep.presentKeys,
      db: prepDb,
      snapshot: snap(PREP_TAB),
      sheetHash: prepHash,
      dbHash: prepHash,
    });
    report.conflicts += prepPlan.conflicts.length;
    for (const { key, value } of prepPlan.update) {
      await pool.query(
        "update travel_checklist_items set is_completed=$3, updated_at=now() where id=$1 and trip_id=$2",
        [key, tripId, value.done],
      );
      report.prep.updated += 1;
    }
  }
}

async function saveSnapshotRows(tripId: string, state: PlanSheetState) {
  const rows = [
    ...state.items.map((i) => ({ tab: PLAN_TAB, key: i.id, hash: planItemHash(i) })),
    ...state.prep.map((p) => ({ tab: PREP_TAB, key: p.id, hash: prepHash(p) })),
  ];
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "delete from travel_google_sheet_rows where trip_id=$1 and tab = any($2::text[])",
      [tripId, [PLAN_TAB, PREP_TAB]],
    );
    if (rows.length)
      await client.query(
        `insert into travel_google_sheet_rows (trip_id, tab, row_key, hash)
         select $1, t, k, h from unnest($2::text[], $3::text[], $4::text[]) as x(t, k, h)`,
        [tripId, rows.map((r) => r.tab), rows.map((r) => r.key), rows.map((r) => r.hash)],
      );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Reads the plan tabs' edits, rewrites them from the database, dresses them once. Null when switched off. */
export async function syncPlanTabs(
  subject: string,
  tripId: string,
  spreadsheetId: string,
): Promise<PlanReport | null> {
  if (!(await planTabsEnabled())) return null;
  const report = emptyPlanReport();
  const tabs = await ensurePlanTabs(subject, spreadsheetId);
  const layout = await pool.query(
    "select plan_layout from travel_google_sheet_exports where trip_id=$1",
    [tripId],
  );
  const current = Number(layout.rows[0]?.["plan_layout"]) || 0;
  if (current >= PLAN_LAYOUT_VERSION && !tabs.added) {
    const data = await readTabs(subject, spreadsheetId);
    await pullPlanTabs(subject, tripId, data, report);
  }

  const state = await loadPlanState(tripId);
  const write = buildPlanWrite(state);
  const id = encodeURIComponent(spreadsheetId);
  const json = { "content-type": "application/json" };
  await sheets(
    await googleFetch(subject, `${SHEETS_API}/${id}/values:batchClear`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({
        ranges: [`${SUMMARY_TAB}!A:H`, `${PLAN_TAB}!A:L`, `${PREP_TAB}!A:E`, `${TICKET_TAB}!A:C`],
      }),
    }),
    "bersihkan rencana",
  );
  await sheets(
    await googleFetch(subject, `${SHEETS_API}/${id}/values:batchUpdate`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ valueInputOption: "RAW", data: write.raw }),
    }),
    "tulis rencana",
  );
  await sheets(
    await googleFetch(subject, `${SHEETS_API}/${id}/values:batchUpdate`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: write.formulas }),
    }),
    "rumus rencana",
  );
  await saveSnapshotRows(tripId, state);

  if (current < PLAN_LAYOUT_VERSION || tabs.added) {
    try {
      await sheets(
        await googleFetch(subject, `${SHEETS_API}/${id}:batchUpdate`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({
            requests: buildPlanFormat({
              ids: tabs.ids,
              currency: state.currency,
              categoryCount: write.rows.categories,
              itemCount: write.rows.items,
              prepCount: write.rows.prep,
            }),
          }),
        }),
        "format rencana",
      );
      await pool.query("update travel_google_sheet_exports set plan_layout=$2 where trip_id=$1", [
        tripId,
        PLAN_LAYOUT_VERSION,
      ]);
    } catch (error) {
      console.error("[google-sheets] plan format failed", { error: redactError(error) });
    }
  }
  return report;
}
