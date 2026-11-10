import type { PoolClient } from "pg";
import { pool } from "@/db/client.server";
import { totalsAfterDelta } from "./expense-items";
import {
  BUDGET_TAB,
  EXPENSE_TAB,
  ITEMS_TAB,
  NO_CATEGORY,
  categoryHash,
  deletionsAllowed,
  expenseHash,
  itemHash,
  normRate,
  parseBudget,
  parseExpenses,
  parseItems,
  planRows,
  resolveExpenseMoney,
  sheetCategoryHash,
  sheetExpenseHash,
  sheetItemHash,
  snapshotOf,
  tripHash,
  type BudgetState,
  type SheetIssue,
} from "./google-sheets-model";

type Db = Pick<PoolClient, "query">;

/** What one sync cycle did with the traveler's edits in the sheet. */
export type PullReport = {
  applied: {
    trip: number;
    categories: number;
    expenses: number;
    items: number;
  };
  created: number;
  deleted: number;
  /** Rows changed on both sides since the last sync: the app version was kept. */
  conflicts: number;
  /** Removals held back because too many rows vanished at once or the header was damaged. */
  heldDeletions: number;
  issues: SheetIssue[];
};

export const emptyReport = (): PullReport => ({
  applied: { trip: 0, categories: 0, expenses: 0, items: 0 },
  created: 0,
  deleted: 0,
  conflicts: 0,
  heldDeletions: 0,
  issues: [],
});

export const pulledAnything = (report: PullReport) =>
  report.applied.trip +
    report.applied.categories +
    report.applied.expenses +
    report.applied.items +
    report.created +
    report.deleted >
  0;

const dateText = (value: unknown) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

/** The trip's budget, expenses and items exactly as the app holds them. */
export async function loadState(db: Db, tripId: string): Promise<BudgetState> {
  const [trip, categories, expenses, items] = await Promise.all([
    db.query("select primary_currency, total_budget_minor from travel_trips where id=$1", [tripId]),
    db.query(
      "select id, name, allocated_minor from travel_budget_categories where trip_id=$1 order by sort_order, created_at",
      [tripId],
    ),
    db.query(
      `select e.id, e.description, e.transaction_date::text as transaction_date, c.name as category_name, e.original_amount_minor,
              e.original_currency, e.exchange_rate, e.converted_amount_minor,
              exists (select 1 from public.travel_receipt_photos p where p.expense_id=e.id) as has_receipt
         from travel_expenses e left join travel_budget_categories c on c.id=e.category_id
        where e.trip_id=$1 order by e.transaction_date, e.created_at, e.id`,
      [tripId],
    ),
    db.query(
      `select i.id, i.expense_id, i.name, i.amount_minor
         from travel_expense_items i join travel_expenses e on e.id=i.expense_id
        where e.trip_id=$1 order by i.position, i.created_at, i.id`,
      [tripId],
    ),
  ]);
  const t = trip.rows[0];
  return {
    tripCurrency: String(t?.primary_currency ?? "IDR").trim(),
    total: { totalMinor: Number(t?.total_budget_minor ?? 0) },
    categories: categories.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      allocMinor: Number(row.allocated_minor),
    })),
    expenses: expenses.rows.map((row) => ({
      id: String(row.id),
      description: String(row.description),
      date: dateText(row.transaction_date),
      category: row.category_name ? String(row.category_name) : "",
      amountMinor: Number(row.original_amount_minor),
      currency: String(row.original_currency).trim(),
      rate: normRate(row.exchange_rate),
      convertedMinor: Number(row.converted_amount_minor),
      hasReceipt: Boolean(row.has_receipt),
    })),
    items: items.rows.map((row) => ({
      id: String(row.id),
      expenseId: String(row.expense_id),
      name: String(row.name),
      amountMinor: Number(row.amount_minor),
    })),
  };
}

export async function loadSnapshot(tripId: string) {
  const result = await pool.query(
    "select tab, row_key, hash from travel_google_sheet_rows where trip_id=$1",
    [tripId],
  );
  const byTab = new Map<string, Map<string, string>>();
  for (const row of result.rows) {
    const tab = String(row.tab);
    const map = byTab.get(tab) ?? new Map<string, string>();
    map.set(String(row.row_key), String(row.hash));
    byTab.set(tab, map);
  }
  return (tab: string) => byTab.get(tab) ?? new Map<string, string>();
}

/** Replaces the stored fingerprints with those of the state just written to the sheet. */
export async function saveSnapshot(tripId: string, state: BudgetState) {
  const rows = snapshotOf(state);
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Only the budget tabs: the plan tabs keep their own fingerprints (google-sheets-plan.server.ts).
    await client.query(
      "delete from travel_google_sheet_rows where trip_id=$1 and tab = any($2::text[])",
      [tripId, [BUDGET_TAB, EXPENSE_TAB, ITEMS_TAB]],
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

export type SheetData = {
  expenses: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>;
  items: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>;
  budget: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>;
};

/** Runs one change on its own savepoint, so a rejected row never blocks the rest of the cycle. */
async function attempt(
  db: Db,
  issues: SheetIssue[],
  tab: string,
  row: number,
  work: () => Promise<boolean>,
) {
  await db.query("savepoint pull_row");
  try {
    const done = await work();
    await db.query("release savepoint pull_row");
    return done;
  } catch (error) {
    await db.query("rollback to savepoint pull_row");
    await db.query("release savepoint pull_row");
    const text = error instanceof Error ? error.message : "gagal";
    issues.push({
      tab,
      row,
      reason: /unique|duplicate/i.test(text)
        ? "Nama sudah dipakai."
        : "Perubahan ditolak oleh aplikasi.",
    });
    return false;
  }
}

/**
 * Applies what the traveler changed in the sheet to the database, in one transaction. Rows are
 * matched by their ID. Anything invalid is skipped and reported; a row changed on both sides keeps
 * the app's version. Returns what was done; the caller then rewrites the sheet from the database.
 */
export async function applyPull(tripId: string, data: SheetData): Promise<PullReport> {
  const report = emptyReport();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select id from travel_trips where id=$1 for update", [tripId]);
    const state = await loadState(client, tripId);
    const snapshot = await loadSnapshot(tripId);
    const cur = state.tripCurrency;

    const exp = parseExpenses(data.expenses, cur);
    const itm = parseItems(data.items);
    const bud = parseBudget(data.budget);
    report.issues.push(...exp.issues, ...itm.issues, ...bud.issues);

    /* ----------------------------------------------------------- trip total + categories */
    if (bud.total !== null) {
      const base = snapshot(BUDGET_TAB).get("trip");
      const here = tripHash(state.total);
      const there = tripHash({ totalMinor: bud.total });
      if (there !== here) {
        if (base === here) {
          await client.query(
            "update travel_trips set total_budget_minor=$1, updated_at=now() where id=$2",
            [bud.total, tripId],
          );
          report.applied.trip += 1;
        } else if (base !== there) report.conflicts += 1;
      }
    }

    const catPlan = planRows({
      sheet: bud.keyed,
      present: bud.presentKeys,
      db: new Map(state.categories.map((c) => [c.id, c])),
      snapshot: snapshot(BUDGET_TAB),
      sheetHash: sheetCategoryHash,
      dbHash: categoryHash,
    });
    report.conflicts += catPlan.conflicts.length;
    for (const { key, value } of catPlan.update)
      if (
        await attempt(client, report.issues, BUDGET_TAB, value.row, async () => {
          await client.query(
            "update travel_budget_categories set name=$1, category_key=$2, allocated_minor=$3, updated_at=now() where id=$4 and trip_id=$5",
            [
              value.name,
              value.name.toLowerCase().replaceAll(/\s+/g, "-"),
              value.allocMinor,
              key,
              tripId,
            ],
          );
          return true;
        })
      )
        report.applied.categories += 1;
    const catTracked = snapshot(BUDGET_TAB).size - 1;
    if (deletionsAllowed(catPlan.remove.length, Math.max(catTracked, 0), bud.headerIntact)) {
      for (const key of catPlan.remove) {
        // Expenses keep their row: the foreign key sets their category to none.
        await client.query("delete from travel_budget_categories where id=$1 and trip_id=$2", [
          key,
          tripId,
        ]);
        report.deleted += 1;
      }
    } else report.heldDeletions += catPlan.remove.length;
    for (const value of bud.fresh)
      if (
        await attempt(client, report.issues, BUDGET_TAB, value.row, async () => {
          const result = await client.query(
            `insert into travel_budget_categories (trip_id,name,category_key,allocated_minor,currency,sort_order)
             values ($1,$2,$3,$4,$5,coalesce((select max(sort_order)+1 from travel_budget_categories where trip_id=$1),0))
             on conflict (trip_id, name) do nothing returning id`,
            [
              tripId,
              value.name,
              value.name.toLowerCase().replaceAll(/\s+/g, "-"),
              value.allocMinor,
              cur,
            ],
          );
          if (!result.rows[0]) throw new Error("duplicate");
          return true;
        })
      )
        report.created += 1;

    const categoryIds = new Map<string, string>();
    for (const row of (
      await client.query("select id, name from travel_budget_categories where trip_id=$1", [tripId])
    ).rows)
      categoryIds.set(String(row.name).trim().toLowerCase(), String(row.id));
    const categoryFor = (name: string) =>
      name === "" ? null : (categoryIds.get(name.toLowerCase()) ?? undefined);

    /* ---------------------------------------------------------------------- expenses */
    const changedExpenses = new Set<string>();
    const expPlan = planRows({
      sheet: exp.keyed,
      present: exp.presentKeys,
      db: new Map(state.expenses.map((e) => [e.id, e])),
      snapshot: snapshot(EXPENSE_TAB),
      sheetHash: (s) => sheetExpenseHash(s, cur),
      dbHash: (e) => expenseHash(e, cur),
    });
    report.conflicts += expPlan.conflicts.length;
    const dbExpense = new Map(state.expenses.map((e) => [e.id, e]));
    for (const { key, value } of expPlan.update) {
      const categoryId = categoryFor(value.category);
      if (categoryId === undefined) {
        report.issues.push({
          tab: EXPENSE_TAB,
          row: value.row,
          reason: `Kategori "${value.category}" tidak ada di tab Anggaran.`,
        });
        continue;
      }
      const before = dbExpense.get(key)!;
      const money = resolveExpenseMoney({
        tripCurrency: cur,
        amountMinor: value.amountMinor,
        currency: value.currency,
        rate: value.rate,
        existing: {
          currency: before.currency,
          rate: before.rate === "" ? null : Number(before.rate),
        },
      });
      if ("error" in money) {
        report.issues.push({
          tab: EXPENSE_TAB,
          row: value.row,
          reason: money.error ?? "Kurs tidak valid.",
        });
        continue;
      }
      if (
        await attempt(client, report.issues, EXPENSE_TAB, value.row, async () => {
          await client.query(
            `update travel_expenses set description=$1, transaction_date=$2, category_id=$3,
                    original_amount_minor=$4, original_currency=$5, exchange_rate=$6,
                    exchange_rate_status=case when $6::numeric is null then exchange_rate_status else 'manual' end,
                    converted_amount_minor=$7, converted_currency=$8, updated_at=now()
              where id=$9 and trip_id=$10`,
            [
              value.description,
              value.date,
              categoryId,
              money.originalMinor,
              value.currency,
              money.rate,
              money.convertedMinor,
              cur,
              key,
              tripId,
            ],
          );
          return true;
        })
      ) {
        report.applied.expenses += 1;
        changedExpenses.add(key);
      }
    }
    const expTracked = snapshot(EXPENSE_TAB).size;
    if (deletionsAllowed(expPlan.remove.length, expTracked, exp.headerIntact)) {
      for (const key of expPlan.remove) {
        await client.query("delete from travel_expenses where id=$1 and trip_id=$2", [key, tripId]);
        report.deleted += 1;
      }
    } else report.heldDeletions += expPlan.remove.length;
    for (const value of exp.fresh) {
      const categoryId = categoryFor(value.category);
      if (categoryId === undefined) {
        report.issues.push({
          tab: EXPENSE_TAB,
          row: value.row,
          reason: `Kategori "${value.category}" tidak ada di tab Anggaran.`,
        });
        continue;
      }
      const money = resolveExpenseMoney({
        tripCurrency: cur,
        amountMinor: value.amountMinor,
        currency: value.currency,
        rate: value.rate,
      });
      if ("error" in money) {
        report.issues.push({
          tab: EXPENSE_TAB,
          row: value.row,
          reason: money.error ?? "Kurs tidak valid.",
        });
        continue;
      }
      let createdId: string | null = null;
      if (
        await attempt(client, report.issues, EXPENSE_TAB, value.row, async () => {
          const result = await client.query(
            `insert into travel_expenses
               (trip_id,category_id,description,transaction_date,original_amount_minor,original_currency,exchange_rate,
                exchange_rate_status,exchange_rate_as_of,converted_amount_minor,converted_currency)
             values ($1,$2,$3,$4,$5,$6,$7,'manual',now(),$8,$9) returning id`,
            [
              tripId,
              categoryId,
              value.description,
              value.date,
              money.originalMinor,
              value.currency,
              money.rate,
              money.convertedMinor,
              cur,
            ],
          );
          createdId = String(result.rows[0].id);
          return true;
        })
      ) {
        report.created += 1;
        if (createdId) changedExpenses.add(createdId);
      }
    }

    /* ------------------------------------------------------------------------- items */
    const itemPlan = planRows({
      sheet: itm.keyed,
      present: itm.presentKeys,
      db: new Map(state.items.map((i) => [i.id, i])),
      snapshot: snapshot(ITEMS_TAB),
      sheetHash: sheetItemHash,
      dbHash: itemHash,
    });
    report.conflicts += itemPlan.conflicts.length;
    const dbItem = new Map(state.items.map((i) => [i.id, i]));

    /** Moves the expense total by `delta` unless the sheet already changed that expense's own amount. */
    const moveTotal = async (expenseId: string, delta: number) => {
      if (changedExpenses.has(expenseId) || delta === 0) return true;
      const result = await client.query(
        "select original_amount_minor, converted_amount_minor, exchange_rate, original_currency, converted_currency from travel_expenses where id=$1 for update",
        [expenseId],
      );
      const row = result.rows[0];
      if (!row) return false;
      const totals = totalsAfterDelta(
        {
          originalMinor: Number(row.original_amount_minor),
          convertedMinor: Number(row.converted_amount_minor),
          rate: row.exchange_rate === null ? null : Number(row.exchange_rate),
          sameCurrency:
            String(row.original_currency).trim() === String(row.converted_currency).trim(),
        },
        delta,
      );
      if (!totals) throw new Error("total nol");
      await client.query(
        "update travel_expenses set original_amount_minor=$1, converted_amount_minor=$2, updated_at=now() where id=$3",
        [totals.originalMinor, totals.convertedMinor, expenseId],
      );
      return true;
    };

    for (const { key, value } of itemPlan.update) {
      const before = dbItem.get(key)!;
      if (
        await attempt(client, report.issues, ITEMS_TAB, value.row, async () => {
          await moveTotal(before.expenseId, value.amountMinor - before.amountMinor);
          await client.query(
            "update travel_expense_items set name=$1, amount_minor=$2, updated_at=now() where id=$3",
            [value.name, value.amountMinor, key],
          );
          return true;
        })
      )
        report.applied.items += 1;
    }
    const itemTracked = snapshot(ITEMS_TAB).size;
    if (deletionsAllowed(itemPlan.remove.length, itemTracked, itm.headerIntact)) {
      for (const key of itemPlan.remove) {
        const before = dbItem.get(key)!;
        if (
          await attempt(client, report.issues, ITEMS_TAB, 0, async () => {
            await moveTotal(before.expenseId, -before.amountMinor);
            await client.query("delete from travel_expense_items where id=$1", [key]);
            return true;
          })
        )
          report.deleted += 1;
      }
    } else report.heldDeletions += itemPlan.remove.length;

    // New item rows attach to an expense by its ID, or by name and date when exactly one matches.
    const current = await loadState(client, tripId);
    const expenseIds = new Set(current.expenses.map((e) => e.id));
    for (const value of itm.fresh) {
      let parent = value.expenseKey && expenseIds.has(value.expenseKey) ? value.expenseKey : null;
      if (!parent && value.expenseName) {
        const matches = current.expenses.filter(
          (e) =>
            e.description.trim().toLowerCase() === value.expenseName.toLowerCase() &&
            (!value.expenseDate || e.date === value.expenseDate),
        );
        if (matches.length === 1) parent = matches[0]!.id;
      }
      if (!parent) {
        report.issues.push({
          tab: ITEMS_TAB,
          row: value.row,
          reason: "Pengeluaran induk tidak ditemukan. Isi ID Pengeluaran.",
        });
        continue;
      }
      const parentId = parent;
      if (
        await attempt(client, report.issues, ITEMS_TAB, value.row, async () => {
          await moveTotal(parentId, value.amountMinor);
          await client.query(
            `insert into travel_expense_items (expense_id, name, amount_minor, position)
             values ($1,$2,$3,(select coalesce(max(position)+1,0) from travel_expense_items where expense_id=$1))`,
            [parentId, value.name, value.amountMinor],
          );
          return true;
        })
      )
        report.created += 1;
    }

    await client.query("commit");
    return report;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export { NO_CATEGORY };
