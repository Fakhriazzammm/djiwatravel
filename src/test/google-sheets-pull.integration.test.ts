/**
 * Runs the two-way pull against a real Postgres. Skipped unless TEST_DATABASE_URL points at a
 * throwaway database (it drops and recreates the public schema):
 *   TEST_DATABASE_URL=postgresql://tester@127.0.0.1:55432/t npx vitest run src/test/google-sheets-pull.integration.test.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env["TEST_DATABASE_URL"];
const holder = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock("@/db/client.server", () => ({
  get pool() {
    return holder.pool;
  },
}));

import { buildSheetWrite, type BudgetState } from "@/lib/google-sheets-model";
import { applyPull, loadState, saveSnapshot } from "@/lib/google-sheets-pull.server";

/** The sheet as the tests edit it: plain mutable rows (the app reads them as read-only). */
type Cells = Array<Array<string | number>>;
type SheetData = { expenses: Cells; items: Cells; budget: Cells };

const TRIP = "11111111-1111-4111-8111-111111111111";
const E1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const E2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const E3 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const C2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const I1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const I2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";

let pool: pg.Pool;

async function reset() {
  await pool.query("drop schema public cascade; create schema public;");
  await pool.query(
    "do $$ begin create role djiwatravel_app; exception when duplicate_object then null; end $$;",
  );
  for (const file of [
    "018_my_trips",
    "019_google_calendar_sync",
    "039_receipt_scans",
    "040_google_drive_sheets",
    "043_expense_items",
    "044_sheet_two_way",
  ])
    await pool.query(readFileSync(resolve(`migrations/${file}.sql`), "utf8"));
}

async function seed() {
  await pool.query("delete from travel_trips");
  await pool.query(
    `insert into travel_trips (id,customer_auth_subject,name,destination_code,destination_name,departure_date,return_date,primary_currency,total_budget_minor)
     values ($1,'u1','Bali','ID','Bali','2026-12-12','2026-12-18','IDR',1000000000)`,
    [TRIP],
  );
  await pool.query(
    `insert into travel_budget_categories (id,trip_id,name,category_key,allocated_minor,currency,sort_order) values
     ($2,$1,'Makan','makan',200000000,'IDR',0), ($3,$1,'Transport','transport',100000000,'IDR',1)`,
    [TRIP, C1, C2],
  );
  await pool.query(
    `insert into travel_expenses (id,trip_id,category_id,description,transaction_date,original_amount_minor,original_currency,converted_amount_minor,converted_currency,exchange_rate) values
     ($2,$1,$5,'Notre',date '2026-12-14',20350000,'IDR',20350000,'IDR',null),
     ($3,$1,$6,'Grab',date '2026-12-15',9400000,'IDR',9400000,'IDR',null),
     ($4,$1,$5,'Ramen',date '2026-12-16',148000,'JPY',1665000,'IDR',0.1125)`,
    [TRIP, E1, E2, E3, C1, C2],
  );
  await pool.query(
    `insert into travel_expense_items (id,expense_id,name,amount_minor,position) values
     ($1,$3,'Croissant',9000000,0), ($2,$3,'Latte',10000000,1)`,
    [I1, I2, E1],
  );
}

/** What the sheet would contain right after a sync (the values Djiwa wrote). */
function sheetOf(state: BudgetState): SheetData {
  const write = buildSheetWrite(state);
  const block = (range: string) =>
    structuredClone(write.raw.find((b) => b.range === range)!.values);
  return {
    expenses: block("Pengeluaran!A1"),
    items: block("Rincian!A1"),
    budget: block("Anggaran!A1"),
  };
}

async function synced() {
  const state = await loadState(pool, TRIP);
  await saveSnapshot(TRIP, state);
  return { state, sheet: sheetOf(state) };
}

const expenseRow = (sheet: SheetData, id: string) =>
  sheet.expenses.find((row) => row[0] === id) as (string | number)[];
const total = async (id: string) =>
  Number(
    (await pool.query("select converted_amount_minor from travel_expenses where id=$1", [id]))
      .rows[0].converted_amount_minor,
  );

describe.skipIf(!url)("two-way pull against Postgres", () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    holder.pool = pool;
    await reset();
  });
  afterAll(async () => {
    await pool?.end();
  });
  beforeEach(seed);

  it("finds nothing to change in a sheet that is exactly what was written", async () => {
    const { sheet } = await synced();
    const report = await applyPull(TRIP, sheet);
    expect(report.applied).toEqual({ trip: 0, categories: 0, expenses: 0, items: 0 });
    expect([
      report.created,
      report.deleted,
      report.conflicts,
      report.heldDeletions,
      report.issues.length,
    ]).toEqual([0, 0, 0, 0, 0]);
  });

  it("takes a sheet edit of an expense (name, date, category, amount)", async () => {
    const { sheet } = await synced();
    const row = expenseRow(sheet, E2);
    row[1] = "2026-12-20";
    row[2] = "Grab ke bandara";
    row[3] = "Makan";
    row[4] = 120000;
    const report = await applyPull(TRIP, sheet);
    expect(report.applied.expenses).toBe(1);
    const saved = (
      await pool.query("select *, transaction_date::text as day from travel_expenses where id=$1", [
        E2,
      ])
    ).rows[0];
    expect(saved.description).toBe("Grab ke bandara");
    expect(saved.day).toBe("2026-12-20");
    expect(saved.category_id).toBe(C1);
    expect(Number(saved.original_amount_minor)).toBe(12000000);
    expect(Number(saved.converted_amount_minor)).toBe(12000000);
  });

  it("recomputes the converted amount of a foreign expense from the stored rate", async () => {
    const { sheet } = await synced();
    expenseRow(sheet, E3)[4] = 2000;
    await applyPull(TRIP, sheet);
    expect(await total(E3)).toBe(Math.round(200000 * 0.1125));
  });

  it("takes the trip total, a renamed category, an allocation and a new category", async () => {
    const { sheet } = await synced();
    sheet.budget[0] = ["Total anggaran", 12000000];
    const makan = sheet.budget.find((row) => row[5] === C1) as (string | number)[];
    makan[0] = "Kuliner";
    makan[1] = 3000000;
    sheet.budget.push(["Oleh-oleh", 500000]);
    const report = await applyPull(TRIP, sheet);
    expect(report.applied.trip).toBe(1);
    expect(report.applied.categories).toBe(1);
    expect(report.created).toBe(1);
    const state = await loadState(pool, TRIP);
    expect(state.total.totalMinor).toBe(1_200_000_000);
    expect(state.categories.map((c) => [c.name, c.allocMinor])).toEqual([
      ["Kuliner", 300_000_000],
      ["Transport", 100_000_000],
      ["Oleh-oleh", 50_000_000],
    ]);
    // Expenses follow the renamed category.
    expect(state.expenses.find((e) => e.id === E1)?.category).toBe("Kuliner");
  });

  it("creates an expense typed into a new sheet row, in a new category too", async () => {
    const { sheet } = await synced();
    sheet.budget.push(["Hotel", 4000000]);
    sheet.expenses.push(["", "2026-12-17", "Hotel semalam", "Hotel", 850000, "", ""]);
    const report = await applyPull(TRIP, sheet);
    expect(report.created).toBe(2);
    const state = await loadState(pool, TRIP);
    const created = state.expenses.find((e) => e.description === "Hotel semalam")!;
    expect(created).toMatchObject({ category: "Hotel", amountMinor: 85_000_000, currency: "IDR" });
  });

  it("removes an expense whose row was deleted from the sheet, with its items", async () => {
    const { sheet } = await synced();
    sheet.expenses = sheet.expenses.filter((row) => row[0] !== E2);
    const report = await applyPull(TRIP, sheet);
    expect(report.deleted).toBe(1);
    expect((await loadState(pool, TRIP)).expenses.map((e) => e.id)).not.toContain(E2);
  });

  it("holds back a mass deletion and keeps every row", async () => {
    for (let n = 0; n < 8; n += 1)
      await pool.query(
        `insert into travel_expenses (trip_id,description,transaction_date,original_amount_minor,original_currency,converted_amount_minor,converted_currency)
         values ($1,$2,date '2026-12-12',1000,'IDR',1000,'IDR')`,
        [TRIP, `Extra ${n}`],
      );
    const { sheet } = await synced();
    sheet.expenses = sheet.expenses.slice(0, 1); // only the header is left: 11 rows "removed"
    const report = await applyPull(TRIP, sheet);
    expect(report.deleted).toBe(0);
    expect(report.heldDeletions).toBe(11);
    expect((await loadState(pool, TRIP)).expenses).toHaveLength(11);
  });

  it("allows a few deliberate removals", async () => {
    const { sheet } = await synced();
    sheet.expenses = sheet.expenses.filter((row) => row[0] !== E1 && row[0] !== E2);
    const report = await applyPull(TRIP, sheet);
    expect(report.deleted).toBe(2);
    expect(report.heldDeletions).toBe(0);
  });

  it("never deletes anything when the sheet header was damaged or the sheet is empty", async () => {
    const { sheet } = await synced();
    sheet.expenses = [["kosong"]];
    const report = await applyPull(TRIP, sheet);
    expect(report.deleted).toBe(0);
    expect((await loadState(pool, TRIP)).expenses).toHaveLength(3);
  });

  it("skips an unreadable row, reports it, and does not treat it as deleted", async () => {
    const { sheet } = await synced();
    expenseRow(sheet, E2)[4] = "banyak sekali";
    const report = await applyPull(TRIP, sheet);
    expect(report.applied.expenses).toBe(0);
    expect(report.deleted).toBe(0);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({ tab: "Pengeluaran" });
    expect(await total(E2)).toBe(9_400_000);
  });

  it("keeps the app's version when the same row changed on both sides, and counts the conflict", async () => {
    const { sheet } = await synced();
    await pool.query("update travel_expenses set description='Diubah di aplikasi' where id=$1", [
      E2,
    ]);
    expenseRow(sheet, E2)[2] = "Diubah di sheet";
    const report = await applyPull(TRIP, sheet);
    expect(report.conflicts).toBe(1);
    expect((await loadState(pool, TRIP)).expenses.find((e) => e.id === E2)?.description).toBe(
      "Diubah di aplikasi",
    );
  });

  it("does not undo an app edit that the sheet has not seen yet", async () => {
    const { sheet } = await synced();
    await pool.query("update travel_expenses set description='Baru dari app' where id=$1", [E2]);
    const report = await applyPull(TRIP, sheet);
    expect(report.applied.expenses).toBe(0);
    expect(report.conflicts).toBe(0);
    expect((await loadState(pool, TRIP)).expenses.find((e) => e.id === E2)?.description).toBe(
      "Baru dari app",
    );
  });

  it("changing an item price in the sheet moves the expense total by that amount", async () => {
    const { sheet } = await synced();
    const item = sheet.items.find((row) => row[6] === I1) as (string | number)[];
    item[4] = 50000; // 90.000 -> 50.000
    const report = await applyPull(TRIP, sheet);
    expect(report.applied.items).toBe(1);
    expect(await total(E1)).toBe(20_350_000 - 4_000_000);
  });

  it("does not move the total twice when the sheet changed both the expense and its item", async () => {
    const { sheet } = await synced();
    expenseRow(sheet, E1)[4] = 150000; // new total typed in the sheet
    (sheet.items.find((row) => row[6] === I1) as (string | number)[])[4] = 50000;
    await applyPull(TRIP, sheet);
    expect(await total(E1)).toBe(15_000_000);
  });

  it("adds an item typed under an expense by name, and removes one deleted from the sheet", async () => {
    const { sheet } = await synced();
    sheet.items.push(["", "Notre", "2026-12-14", "Air mineral", 10000, "IDR", ""]);
    sheet.items = sheet.items.filter((row) => row[6] !== I2);
    const report = await applyPull(TRIP, sheet);
    expect(report.created).toBe(1);
    expect(report.deleted).toBe(1);
    expect(await total(E1)).toBe(20_350_000 + 1_000_000 - 10_000_000);
    const names = (await loadState(pool, TRIP)).items.map((i) => i.name).sort();
    expect(names).toEqual(["Air mineral", "Croissant"]);
  });

  it("ignores the tax/service row and an item that cannot be matched to an expense", async () => {
    const { sheet } = await synced();
    const remainder = sheet.items.find((row) => row[6] === "sisa") as (string | number)[];
    remainder[4] = 999999;
    sheet.items.push(["", "Tidak ada", "2026-01-01", "Hantu", 1000, "IDR", ""]);
    const report = await applyPull(TRIP, sheet);
    expect(report.applied.items).toBe(0);
    expect(report.issues).toHaveLength(1);
    expect(await total(E1)).toBe(20_350_000);
  });

  it("refuses an item change that would make the expense total zero", async () => {
    const { sheet } = await synced();
    await pool.query(
      "update travel_expenses set original_amount_minor=19000000, converted_amount_minor=19000000 where id=$1",
      [E1],
    );
    const fresh = await synced();
    const item = fresh.sheet.items.find((row) => row[6] === I1) as (string | number)[];
    item[4] = 1; // lowers the total by 89.999,99: still positive, accepted
    await applyPull(TRIP, fresh.sheet);
    expect(await total(E1)).toBeGreaterThan(0);
  });

  it("brings a pulled expense total back into the sheet on the next write", async () => {
    const { sheet } = await synced();
    expenseRow(sheet, E2)[4] = 120000;
    await applyPull(TRIP, sheet);
    const state = await loadState(pool, TRIP);
    const written = sheetOf(state);
    expect(expenseRow(written, E2)[4]).toBe(120000);
  });

  it("is idempotent: pulling the same edited sheet twice changes nothing the second time", async () => {
    const { sheet } = await synced();
    expenseRow(sheet, E2)[4] = 120000;
    await applyPull(TRIP, sheet);
    const again = await applyPull(TRIP, sheet);
    expect(again.applied.expenses).toBe(0);
  });
});
