import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "@/db/client.server";
import { totalsAfterDelta, type ExpenseDetail, type ExpenseItem } from "./expense-items";

/**
 * Per-item detail of an expense: read it, edit or delete one item, change the expense's name, date
 * and category. Every query joins the trip owner, so a traveler only reaches their own expenses.
 */

type Queryable = Pick<PoolClient, "query">;

const uuid = z.string().uuid();
const itemName = z.string().trim().min(1).max(160);
const amountMinor = z.number().int().positive().max(100_000_000_000_00);

export const lineItemsSchema = z
  .array(z.object({ name: itemName, amountMinor }))
  .max(100)
  .default([]);

/** Stores the line items of a new expense (inside the caller's transaction when given a client). */
export async function insertLineItems(
  db: Queryable,
  expenseId: string,
  items: ReadonlyArray<{ name: string; amountMinor: number }>,
) {
  for (const [position, item] of items.entries()) {
    await db.query(
      "insert into travel_expense_items (expense_id, name, amount_minor, position) values ($1,$2,$3,$4)",
      [expenseId, item.name, item.amountMinor, position],
    );
  }
}

const dateText = (value: unknown) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

export async function readExpenseDetail(
  userId: string,
  expenseId: string,
): Promise<ExpenseDetail | null> {
  if (!uuid.safeParse(expenseId).success) return null;
  const result = await pool.query(
    `select e.*, c.name as category_name
       from travel_expenses e
       join travel_trips t on t.id = e.trip_id
       left join travel_budget_categories c on c.id = e.category_id
      where e.id=$1 and t.customer_auth_subject=$2`,
    [expenseId, userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const [items, photo] = await Promise.all([
    pool.query(
      "select id, name, amount_minor, position from travel_expense_items where expense_id=$1 order by position, created_at",
      [expenseId],
    ),
    pool
      .query("select scan_id from public.travel_receipt_photos where expense_id=$1 limit 1", [
        expenseId,
      ])
      .catch(() => ({ rows: [] as Array<{ scan_id: string }> })),
  ]);
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    description: String(row.description),
    transactionDate: dateText(row.transaction_date),
    categoryId: row.category_id ? String(row.category_id) : null,
    categoryName: row.category_name ? String(row.category_name) : null,
    originalCurrency: String(row.original_currency).trim(),
    originalAmountMinor: Number(row.original_amount_minor),
    convertedCurrency: String(row.converted_currency).trim(),
    convertedAmountMinor: Number(row.converted_amount_minor),
    exchangeRate: row.exchange_rate === null ? null : Number(row.exchange_rate),
    notes: row.notes ? String(row.notes) : null,
    receiptScanId: photo.rows[0] ? String(photo.rows[0].scan_id) : null,
    items: items.rows.map((item): ExpenseItem => ({
      id: String(item.id),
      name: String(item.name),
      amountMinor: Number(item.amount_minor),
      position: Number(item.position),
    })),
  };
}

export class ExpenseItemError extends Error {}

/** Locks the expense row for the owner and returns its money columns. */
async function lockExpense(client: Queryable, userId: string, expenseId: string) {
  const result = await client.query(
    `select e.id, e.trip_id, e.original_amount_minor, e.converted_amount_minor, e.exchange_rate,
            e.original_currency, e.converted_currency
       from travel_expenses e join travel_trips t on t.id = e.trip_id
      where e.id=$1 and t.customer_auth_subject=$2 for update of e`,
    [expenseId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new ExpenseItemError("Pengeluaran tidak ditemukan");
  return {
    tripId: String(row.trip_id),
    totals: {
      originalMinor: Number(row.original_amount_minor),
      convertedMinor: Number(row.converted_amount_minor),
      rate: row.exchange_rate === null ? null : Number(row.exchange_rate),
      sameCurrency: String(row.original_currency).trim() === String(row.converted_currency).trim(),
    },
  };
}

async function applyDelta(
  client: Queryable,
  expenseId: string,
  totals: ReturnType<typeof totalsAfterDelta>,
) {
  if (!totals)
    throw new ExpenseItemError("Total pengeluaran tidak boleh nol. Hapus pengeluarannya saja.");
  await client.query(
    "update travel_expenses set original_amount_minor=$1, converted_amount_minor=$2, updated_at=now() where id=$3",
    [totals.originalMinor, totals.convertedMinor, expenseId],
  );
}

async function transaction<T>(work: (client: Queryable) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Keeps the traveler's Google Sheet in step after the total changed. Never blocks or fails the edit. */
async function refreshSheet(userId: string, tripId: string) {
  try {
    const { queueSheetSync } = await import("./google-sheets.server");
    await queueSheetSync(userId, tripId);
  } catch (error) {
    console.error(
      "[expense-items] sheet sync queue failed",
      error instanceof Error ? error.message : error,
    );
  }
}

const saveItemSchema = z.object({
  expenseId: uuid,
  itemId: uuid.optional(),
  name: itemName,
  amountMinor,
});
export const saveExpenseItemInput = (data: unknown) => saveItemSchema.parse(data);

/** Adds an item, or changes one. The expense total moves by the difference. */
export async function saveExpenseItem(
  userId: string,
  data: ReturnType<typeof saveExpenseItemInput>,
) {
  const tripId = await transaction(async (client) => {
    const { tripId, totals } = await lockExpense(client, userId, data.expenseId);
    if (data.itemId) {
      const before = await client.query(
        "select amount_minor from travel_expense_items where id=$1 and expense_id=$2 for update",
        [data.itemId, data.expenseId],
      );
      if (!before.rows[0]) throw new ExpenseItemError("Item tidak ditemukan");
      const delta = data.amountMinor - Number(before.rows[0].amount_minor);
      await applyDelta(client, data.expenseId, totalsAfterDelta(totals, delta));
      await client.query(
        "update travel_expense_items set name=$1, amount_minor=$2, updated_at=now() where id=$3",
        [data.name, data.amountMinor, data.itemId],
      );
    } else {
      const count = await client.query(
        "select count(*)::int as n from travel_expense_items where expense_id=$1",
        [data.expenseId],
      );
      if (Number(count.rows[0]?.n) >= 100)
        throw new ExpenseItemError("Maksimal 100 item per pengeluaran");
      await applyDelta(client, data.expenseId, totalsAfterDelta(totals, data.amountMinor));
      await client.query(
        `insert into travel_expense_items (expense_id, name, amount_minor, position)
         values ($1,$2,$3,(select coalesce(max(position)+1,0) from travel_expense_items where expense_id=$1))`,
        [data.expenseId, data.name, data.amountMinor],
      );
    }
    return tripId;
  });
  await refreshSheet(userId, tripId);
  return readExpenseDetail(userId, data.expenseId);
}

const removeItemSchema = z.object({ expenseId: uuid, itemId: uuid });
export const removeExpenseItemInput = (data: unknown) => removeItemSchema.parse(data);

/** Deletes one item; the expense total drops by that item's amount. */
export async function removeExpenseItem(
  userId: string,
  data: ReturnType<typeof removeExpenseItemInput>,
) {
  const tripId = await transaction(async (client) => {
    const { tripId, totals } = await lockExpense(client, userId, data.expenseId);
    const before = await client.query(
      "select amount_minor from travel_expense_items where id=$1 and expense_id=$2 for update",
      [data.itemId, data.expenseId],
    );
    if (!before.rows[0]) throw new ExpenseItemError("Item tidak ditemukan");
    await applyDelta(
      client,
      data.expenseId,
      totalsAfterDelta(totals, -Number(before.rows[0].amount_minor)),
    );
    await client.query("delete from travel_expense_items where id=$1", [data.itemId]);
    return tripId;
  });
  await refreshSheet(userId, tripId);
  return readExpenseDetail(userId, data.expenseId);
}

const infoSchema = z.object({
  expenseId: uuid,
  description: itemName,
  transactionDate: z.string().date(),
  categoryId: uuid.nullable(),
});
export const updateExpenseInfoInput = (data: unknown) => infoSchema.parse(data);

/** Changes the expense's name, date and category (not its amount). */
export async function updateExpenseInfo(
  userId: string,
  data: ReturnType<typeof updateExpenseInfoInput>,
) {
  const tripId = await transaction(async (client) => {
    const { tripId } = await lockExpense(client, userId, data.expenseId);
    if (data.categoryId) {
      const category = await client.query(
        "select id from travel_budget_categories where id=$1 and trip_id=$2",
        [data.categoryId, tripId],
      );
      if (!category.rows[0]) throw new ExpenseItemError("Kategori anggaran tidak ditemukan");
    }
    await client.query(
      "update travel_expenses set description=$1, transaction_date=$2, category_id=$3, updated_at=now() where id=$4",
      [data.description, data.transactionDate, data.categoryId, data.expenseId],
    );
    return tripId;
  });
  await refreshSheet(userId, tripId);
  return readExpenseDetail(userId, data.expenseId);
}

/** Admin: how many expenses carry line items. Best effort; 0 before migration 043. */
export async function expenseItemStats() {
  try {
    const result = await pool.query(
      "select count(distinct expense_id)::int as expenses, count(*)::int as items from travel_expense_items",
    );
    return {
      expensesWithItems: Number(result.rows[0]?.expenses ?? 0),
      itemsStored: Number(result.rows[0]?.items ?? 0),
    };
  } catch {
    return { expensesWithItems: 0, itemsStored: 0 };
  }
}
