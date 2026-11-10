/**
 * The plan tabs of the trip spreadsheet, end to end against a real Postgres and an in-memory fake of
 * the Sheets API: first write and format, the traveler's edits coming back (itinerary rows, new rows,
 * the checklist checkbox), conflicts, mass-deletion guard, bad rows reported. Skipped unless
 * TEST_DATABASE_URL points at a throwaway database.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 60_000 });
const url = process.env["TEST_DATABASE_URL"];
const holder = vi.hoisted(() => ({
  pool: null as unknown,
  store: new Map<string, (string | number | boolean | null)[][]>(),
  tabs: new Map<string, number>(),
  formatCalls: 0,
  failFormat: false,
  features: ["sheets", "drive"] as string[],
  connected: true,
  driveCalls: [] as { method: string; path: string; type: string }[],
  patchFails: false,
}));
vi.mock("@/db/client.server", () => ({
  get pool() {
    return holder.pool;
  },
}));
vi.mock("@/lib/google-calendar.server", () => ({ syncItineraryItem: async () => undefined }));

const col = (letters: string) =>
  [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const place = (
  tab: string,
  startCol: number,
  startRow: number,
  values: (string | number | boolean | null)[][],
) => {
  const grid = holder.store.get(tab) ?? [];
  values.forEach((row, r) =>
    row.forEach((cell, c) => {
      const rr = startRow + r;
      grid[rr] ??= [];
      grid[rr]![startCol + c] = cell;
    }),
  );
  holder.store.set(tab, grid);
};
const parseRange = (range: string) => {
  const [tab, ref] = range.split("!") as [string, string];
  const m = ref.match(/^([A-Z]+)(\d+)?/)!;
  return { tab, col: col(m[1]!), row: m[2] ? Number(m[2]) - 1 : 0 };
};

vi.mock("@/lib/google-account.server", () => ({
  redactError: (e: unknown) => String(e),
  connectionFor: async () => (holder.connected ? { refresh_token_encrypted: "x" } : null),
  hasFeature: (_c: unknown, feature: string) => holder.features.includes(feature),
  googleFetch: async (_subject: string, input: string, init?: RequestInit) => {
    const url = new URL(input);
    if (url.host === "www.googleapis.com") {
      const method = init?.method ?? "GET";
      holder.driveCalls.push({
        method,
        path: url.pathname,
        type: String((init?.headers as Record<string, string> | undefined)?.["content-type"] ?? ""),
      });
      if (method === "PATCH" && holder.patchFails) return new Response("gone", { status: 404 });
      return new Response(
        JSON.stringify({
          id:
            url.pathname.includes("/upload/") && method === "PATCH"
              ? "doc-1"
              : `file-${holder.driveCalls.length}`,
        }),
        { status: 200 },
      );
    }
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const ok = (json: unknown) => new Response(JSON.stringify(json), { status: 200 });
    if (url.pathname.endsWith(":batchUpdate") && !url.pathname.endsWith("/values:batchUpdate")) {
      const replies = (body.requests as Record<string, { properties?: { title: string } }>[]).map(
        (r) => {
          if (r["addSheet"]) {
            const title = r["addSheet"].properties!.title;
            const id = holder.tabs.size + 1;
            holder.tabs.set(title, id);
            return { addSheet: { properties: { title, sheetId: id } } };
          }
          return {};
        },
      );
      if (!body.requests.some((r: Record<string, unknown>) => r["addSheet"])) {
        holder.formatCalls += 1;
        if (holder.failFormat) return new Response("nope", { status: 500 });
      }
      return ok({ replies });
    }
    if (url.pathname.endsWith("/values:batchClear")) {
      for (const range of body.ranges as string[]) holder.store.set(range.split("!")[0]!, []);
      return ok({});
    }
    if (url.pathname.endsWith("/values:batchUpdate")) {
      for (const d of body.data as {
        range: string;
        values: (string | number | boolean | null)[][];
      }[]) {
        const p = parseRange(d.range);
        place(p.tab, p.col, p.row, d.values);
      }
      return ok({});
    }
    if (url.pathname.endsWith("/values:batchGet")) {
      return ok({
        valueRanges: url.searchParams.getAll("ranges").map((r) => ({
          values: (holder.store.get(r.split("!")[0]!) ?? []).map((row) => [...row]),
        })),
      });
    }
    return ok({
      sheets: [...holder.tabs].map(([title, sheetId]) => ({ properties: { title, sheetId } })),
    });
  },
}));

import { syncPlanTabs } from "@/lib/google-sheets-plan.server";
import { openTripGoogle, refreshPlanDoc } from "@/lib/google-plan-doc.server";

const TRIP = "33333333-3333-4333-8333-333333333333";
const SHEET = "sheet-1";
let pool: pg.Pool;
const count = async (sql: string) => Number((await pool.query(sql)).rows[0].n);
const row = (tab: string, n: number) => holder.store.get(tab)?.[n];

describe.skipIf(!url)("plan tabs in the spreadsheet (real Postgres, fake Sheets)", () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    holder.pool = pool;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("[]", { status: 200 })),
    );
    await pool.query("drop schema public cascade; create schema public;");
    await pool.query(
      "do $$ begin create role djiwatravel_app; exception when duplicate_object then null; end $$;",
    );
    for (const file of [
      "004_admin_operations",
      "008_customer_profiles",
      "021_customer_traveler_profile",
      "018_my_trips",
      "022_travel_trip_shares",
      "019_google_calendar_sync",
      "020_allow_overnight_itinerary",
      "027_restore_admin_settings",
      "037_itinerary_map_points",
      "038_itinerary_place_image",
      "039_receipt_scans",
      "040_google_drive_sheets",
      "043_expense_items",
      "044_sheet_two_way",
      "045_place_ideas",
      "048_trip_cities",
      "058_trip_assistant",
      "059_assistant_blocks",
      "060_travo_conversations",
      "061_travo_cards",
      "062_travo_run_cards",
      "063_trip_origin",
      "064_trip_plan",
      "065_trip_plan_sheets",
    ])
      await pool.query(readFileSync(resolve(`migrations/${file}.sql`), "utf8"));
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await pool?.end();
  });
  beforeEach(async () => {
    holder.store.clear();
    holder.tabs.clear();
    holder.formatCalls = 0;
    holder.failFormat = false;
    holder.features = ["sheets", "drive"];
    holder.connected = true;
    holder.driveCalls = [];
    holder.patchFails = false;
    await pool.query("delete from travel_trips");
    await pool.query("delete from admin_settings");
    await pool.query(
      `insert into travel_trips (id,customer_auth_subject,name,destination_code,destination_name,departure_date,return_date,primary_currency,total_budget_minor,travelers_count)
       values ($1,'u1','Tokyo','JP','Jepang','2026-12-10','2026-12-12','IDR',1500000000,2)`,
      [TRIP],
    );
    await pool.query(
      "insert into travel_budget_categories (trip_id,name,category_key,allocated_minor,currency,sort_order) values ($1,'Akomodasi','akomodasi',400000000,'IDR',0)",
      [TRIP],
    );
    await pool.query(
      `insert into travel_itinerary_items (id,trip_id,activity_date,start_time,end_time,title,location,latitude,longitude,estimated_cost_minor,currency)
       values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',$1,'2026-12-10','09:30','11:00','Senso-ji','Asakusa',35.71,139.79,5000000,'IDR'),
              ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',$1,'2026-12-11',null,null,'Bebas','',null,null,null,null)`,
      [TRIP],
    );
    await pool.query(
      "insert into travel_checklist_items (id,trip_id,title,due_date,sort_order,is_default) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',$1,'Cek visa','2026-11-20',0,false)",
      [TRIP],
    );
    await pool.query(
      `insert into travel_trip_plans (trip_id, city, tier, budget, research, costs) values ($1,'Tokyo','nyaman',$2::jsonb,$3::jsonb,$4::jsonb)`,
      [
        TRIP,
        JSON.stringify([{ name: "Akomodasi", amountIdr: 4_400_000, basis: "perkiraan" }]),
        JSON.stringify({
          outbound: { priceIdr: 3_000_000, date: "2026-12-10" },
          originCode: "CGK",
          destinationCode: "TYO",
        }),
        JSON.stringify({ foodMid: 300_000 }),
      ],
    );
    await pool.query("delete from travel_google_sheet_exports");
    await pool.query(
      "insert into travel_google_sheet_exports (trip_id, customer_auth_subject, spreadsheet_id, status) values ($1,'u1',$2,'syncing')",
      [TRIP, SHEET],
    );
  });

  it("creates the four tabs, writes them from the database and dresses them once", async () => {
    const report = await syncPlanTabs("u1", TRIP, SHEET);
    expect(report).not.toBeNull();
    expect([...holder.tabs.keys()].sort()).toEqual([
      "Itinerary",
      "Persiapan",
      "Ringkasan",
      "Tiket & Transport",
    ]);
    expect(row("Itinerary", 0)!.slice(0, 5)).toEqual([
      "ID",
      "Tanggal",
      "Mulai",
      "Selesai",
      "Aktivitas",
    ]);
    expect(row("Itinerary", 1)!.slice(1, 8)).toEqual([
      "2026-12-10",
      "09:30",
      "11:00",
      "Senso-ji",
      "Asakusa",
      "",
      50_000,
    ]);
    expect(row("Itinerary", 1)![10]).toBe("Ya");
    expect(row("Itinerary", 2)![10]).toBe("Belum");
    expect(row("Persiapan", 1)!.slice(1, 4)).toEqual(["Cek visa", "2026-11-20", false]);
    expect(row("Ringkasan", 0)![0]).toBe("Tokyo");
    expect(row("Ringkasan", 8)![1]).toBe(4_400_000); // Travo's estimate beside the Anggaran category
    expect(row("Tiket & Transport", 1)![0]).toContain("CGK → TYO");
    expect(holder.formatCalls).toBe(1);
    expect(
      Number(
        (await pool.query("select plan_layout from travel_google_sheet_exports")).rows[0]
          .plan_layout,
      ),
    ).toBe(1);
    // Fingerprints are kept for the next sync.
    expect(
      await count(
        "select count(*)::int n from travel_google_sheet_rows where tab in ('Itinerary','Persiapan')",
      ),
    ).toBe(3);
    // A second sync does not dress the sheet again.
    await syncPlanTabs("u1", TRIP, SHEET);
    expect(holder.formatCalls).toBe(1);
  });

  it("takes the traveler's edits into the app: itinerary fields, a new row, a deletion, the checkbox", async () => {
    await syncPlanTabs("u1", TRIP, SHEET);
    const it = holder.store.get("Itinerary")!;
    it[1]![2] = "10:00"; // start time
    it[1]![4] = "Senso-ji pagi"; // title
    it[1]![7] = 75000; // cost
    it.splice(2, 1); // the traveler deletes "Bebas"
    it.push([
      "",
      "2026-12-12",
      "13:00",
      "14:00",
      "Ramen Ichiran",
      "Shibuya",
      "antri",
      "",
      "",
      "",
      "",
      "",
    ]);
    holder.store.get("Persiapan")![1]![3] = true;
    const report = (await syncPlanTabs("u1", TRIP, SHEET))!;
    expect(report.items).toEqual({ updated: 1, created: 1, deleted: 1 });
    expect(report.prep.updated).toBe(1);
    const moved = (
      await pool.query(
        "select to_char(start_time,'HH24:MI') s, title, estimated_cost_minor::int c from travel_itinerary_items where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'",
      )
    ).rows[0];
    expect(moved).toEqual({ s: "10:00", title: "Senso-ji pagi", c: 7_500_000 });
    expect(
      await count("select count(*)::int n from travel_itinerary_items where title='Bebas'"),
    ).toBe(0);
    expect(
      await count(
        "select count(*)::int n from travel_itinerary_items where title='Ramen Ichiran' and activity_date='2026-12-12'",
      ),
    ).toBe(1);
    expect(
      await count("select count(*)::int n from travel_checklist_items where is_completed"),
    ).toBe(1);
    // The rewrite shows the new truth, including the new row's ID.
    expect(
      holder.store
        .get("Itinerary")!
        .some((r) => r[4] === "Ramen Ichiran" && /^[0-9a-f-]{36}$/.test(String(r[0]))),
    ).toBe(true);
    // A new title means the old map point no longer applies: it was cleared (no lookup found a new one in the test).
    const pin = (
      await pool.query(
        "select latitude from travel_itinerary_items where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'",
      )
    ).rows[0];
    expect(pin.latitude).toBeNull();
  });

  it("keeps the app's version when both sides changed, and reports rows it cannot read", async () => {
    await syncPlanTabs("u1", TRIP, SHEET);
    await pool.query(
      "update travel_itinerary_items set title='Dari app' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'",
    );
    holder.store.get("Itinerary")![1]![4] = "Dari sheet";
    holder.store.get("Itinerary")!.push(["", "2027-01-01", "", "", "Di luar tanggal", "", "", ""]);
    const report = (await syncPlanTabs("u1", TRIP, SHEET))!;
    expect(report.conflicts).toBe(1);
    expect(report.issues.map((i) => i.reason)).toContain("Tanggal di luar tanggal perjalanan.");
    expect(
      (
        await pool.query(
          "select title from travel_itinerary_items where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'",
        )
      ).rows[0].title,
    ).toBe("Dari app");
    expect(holder.store.get("Itinerary")![1]![4]).toBe("Dari app");
  });

  it("holds back a mass deletion and a damaged header instead of wiping the trip", async () => {
    for (let i = 3; i <= 9; i += 1)
      await pool.query(
        "insert into travel_itinerary_items (trip_id,activity_date,title) values ($1,'2026-12-11',$2)",
        [TRIP, `Tambahan ${i}`],
      );
    await syncPlanTabs("u1", TRIP, SHEET);
    holder.store.set("Itinerary", [holder.store.get("Itinerary")![0]!]); // every row gone
    const report = (await syncPlanTabs("u1", TRIP, SHEET))!;
    expect(report.heldDeletions).toBeGreaterThan(0);
    expect(await count("select count(*)::int n from travel_itinerary_items")).toBe(9);
    holder.store.get("Itinerary")![0]![4] = "Rusak";
    const damaged = (await syncPlanTabs("u1", TRIP, SHEET))!;
    expect(damaged.items.deleted).toBe(0);
    expect(await count("select count(*)::int n from travel_itinerary_items")).toBe(9);
  });

  it("stays off when Admin switches the plan tabs off", async () => {
    await pool.query(
      `insert into admin_settings (setting_key, value_json, version) values ('tripAssistant','{"sheetsPlanTabs": false}'::jsonb, 1)`,
    );
    expect(await syncPlanTabs("u1", TRIP, SHEET)).toBeNull();
    expect(holder.tabs.size).toBe(0);
  });

  it("retries the look next time when dressing the sheet fails, without failing the sync", async () => {
    holder.failFormat = true;
    await syncPlanTabs("u1", TRIP, SHEET);
    expect(
      Number(
        (await pool.query("select plan_layout from travel_google_sheet_exports")).rows[0]
          .plan_layout,
      ),
    ).toBe(0);
    holder.failFormat = false;
    await syncPlanTabs("u1", TRIP, SHEET);
    expect(
      Number(
        (await pool.query("select plan_layout from travel_google_sheet_exports")).rows[0]
          .plan_layout,
      ),
    ).toBe(1);
  });

  it("creates the Drive document once in the trip folder, then refreshes the same one", async () => {
    const first = await refreshPlanDoc("u1", TRIP);
    expect(first.status).toBe("ok");
    const create = holder.driveCalls.find(
      (c) => c.path.includes("/upload/") && c.method === "POST",
    );
    expect(create?.type).toContain("multipart/related");
    expect(await count("select count(*)::int n from travel_google_plan_docs")).toBe(1);
    holder.driveCalls = [];
    const second = await refreshPlanDoc("u1", TRIP);
    expect(second.status).toBe("ok");
    expect(holder.driveCalls.map((c) => c.method)).toEqual(["PATCH"]); // same doc, new content
    expect(holder.driveCalls[0]!.type).toContain("text/html");
    expect(await count("select count(*)::int n from travel_google_plan_docs")).toBe(1);
  });

  it("makes a new document when the old one was deleted in Drive", async () => {
    await refreshPlanDoc("u1", TRIP);
    holder.patchFails = true;
    holder.driveCalls = [];
    const again = await refreshPlanDoc("u1", TRIP);
    expect(again.status).toBe("ok");
    expect(holder.driveCalls.map((c) => c.method)).toEqual(["PATCH", "POST"]);
  });

  it("skips quietly without a plan, without Google, or when Admin switched it off", async () => {
    await pool.query("delete from travel_trip_plans");
    expect((await refreshPlanDoc("u1", TRIP)).status).toBe("no_plan");
    await pool.query("insert into travel_trip_plans (trip_id, city) values ($1,'Tokyo')", [TRIP]);
    holder.connected = false;
    expect((await refreshPlanDoc("u1", TRIP)).status).toBe("no_google");
    holder.connected = true;
    await pool.query(
      `insert into admin_settings (setting_key, value_json, version) values ('tripAssistant','{"driveDoc": false}'::jsonb, 1)`,
    );
    expect((await refreshPlanDoc("u1", TRIP)).status).toBe("off");
    expect(holder.driveCalls).toEqual([]);
    // A manual "Simpan ke Drive" still works when the automatic refresh is off.
    expect((await refreshPlanDoc("u1", TRIP, { force: true })).status).toBe("ok");
  });

  it("answers the chat's Google taps: login for guests, connect first, the link when ready", async () => {
    expect((await openTripGoogle("guest-1", true, TRIP, "sheet")).status).toBe("login");
    expect((await openTripGoogle("someone-else", false, TRIP, "sheet")).status).toBe("failed");
    holder.features = ["drive"];
    expect((await openTripGoogle("u1", false, TRIP, "sheet")).status).toBe("connect");
    holder.features = ["sheets", "drive"];
    await pool.query(
      "update travel_google_sheet_exports set spreadsheet_url='https://docs.google.com/spreadsheets/d/sheet-1'",
    );
    const sheet = await openTripGoogle("u1", false, TRIP, "sheet");
    expect(sheet).toMatchObject({
      status: "ok",
      url: "https://docs.google.com/spreadsheets/d/sheet-1",
    });
    const drive = await openTripGoogle("u1", false, TRIP, "drive");
    expect(drive.status).toBe("ok");
    expect((drive as { url: string }).url).toContain("docs.google.com/document/d/");
  });
});
