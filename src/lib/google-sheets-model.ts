import { createHash } from "node:crypto";

/**
 * Two-way model of the budget spreadsheet. Pure (no I/O): the sheet layout, how a sheet's cells are
 * read back into records, how records are fingerprinted, and how a change on either side is told
 * apart from a change on the other (or on both). The server orchestrates the I/O around it.
 *
 * Sheet layout (tabs and managed columns; everything to the right, from column J, is the traveler's):
 *   Pengeluaran A:I  ID | Tanggal | Deskripsi | Kategori | Jumlah | Mata uang | Kurs | Jumlah (<mata uang trip>) | Struk
 *   Rincian     A:G  ID Pengeluaran | Pengeluaran | Tanggal | Item | Harga | Mata uang | ID Item
 *   Anggaran    A:F  summary rows 1-7, header row 8, one category per row from row 9: Kategori | Anggaran | Terpakai | Sisa | % | ID
 */

export const EXPENSE_TAB = "Pengeluaran";
export const ITEMS_TAB = "Rincian";
export const BUDGET_TAB = "Anggaran";
/** Name of the tab that held category totals before the budget tab existed. */
export const LEGACY_SUMMARY_TAB = "Ringkasan";
export const LAYOUT_VERSION = 2;
export const NO_CATEGORY = "Tanpa kategori";
export const REMAINDER_LABEL = "Pajak, layanan & lainnya";
export const REMAINDER_KEY = "sisa";

export const EXPENSE_HEADER = [
  "ID",
  "Tanggal",
  "Deskripsi",
  "Kategori",
  "Jumlah",
  "Mata uang",
  "Kurs",
] as const;
export const ITEM_HEADER = [
  "ID Pengeluaran",
  "Pengeluaran",
  "Tanggal",
  "Item",
  "Harga",
  "Mata uang",
  "ID Item",
] as const;
export const CATEGORY_HEADER = [
  "Kategori",
  "Anggaran",
  "Terpakai",
  "Sisa",
  "% Terpakai",
  "ID",
] as const;
/** First category row of the Anggaran tab (1-based): rows above are the summary and the header. */
export const CATEGORY_FIRST_ROW = 9;
export const CATEGORY_HEADER_ROW = 8;

export function managedRanges() {
  return [`${EXPENSE_TAB}!A:I`, `${ITEMS_TAB}!A:G`, `${BUDGET_TAB}!A:F`];
}

/* ------------------------------------------------------------------------------ records */

export type TripRec = { totalMinor: number };
export type CategoryRec = { id: string; name: string; allocMinor: number };
export type ExpenseRec = {
  id: string;
  description: string;
  date: string;
  /** Category name, "" for none. */
  category: string;
  amountMinor: number;
  currency: string;
  /** Normalised rate ("" when the expense is in the trip currency). */
  rate: string;
  convertedMinor: number;
  hasReceipt: boolean;
};
export type ItemRec = { id: string; expenseId: string; name: string; amountMinor: number };

export type BudgetState = {
  tripCurrency: string;
  total: TripRec;
  categories: CategoryRec[];
  expenses: ExpenseRec[];
  items: ItemRec[];
};

export const normRate = (value: number | string | null | undefined) =>
  value === null || value === undefined || value === "" || Number(value) <= 0
    ? ""
    : Number(value).toFixed(8);

const stable = (value: unknown) => JSON.stringify(value);
export const hashOf = (value: unknown) => createHash("sha1").update(stable(value)).digest("hex");

/** Fingerprint of the fields a traveler can edit, so unchanged rows never look edited. */
export const expenseHash = (e: ExpenseRec, tripCurrency: string) =>
  hashOf([
    e.description.trim(),
    e.date,
    e.category.trim(),
    e.amountMinor,
    e.currency,
    e.currency === tripCurrency ? "" : e.rate,
  ]);
/** The same fingerprint computed from what the sheet says, so a row can be compared with the app's. */
export const sheetExpenseHash = (s: SheetExpense, tripCurrency: string) =>
  hashOf([
    s.description.trim(),
    s.date,
    s.category.trim(),
    s.amountMinor,
    s.currency,
    s.currency === tripCurrency ? "" : normRate(s.rate),
  ]);
export const sheetItemHash = (s: SheetItem) => hashOf([s.name.trim(), s.amountMinor]);
export const sheetCategoryHash = (s: SheetCategory) => hashOf([s.name.trim(), s.allocMinor]);

/**
 * Amounts of an expense edited in the sheet: in the trip currency it converts 1:1, otherwise it needs
 * a rate (the one typed, or the one already stored when the currency did not change).
 */
export function resolveExpenseMoney(input: {
  tripCurrency: string;
  amountMinor: number;
  currency: string;
  rate: number | null;
  existing?: { currency: string; rate: number | null } | undefined;
}) {
  if (input.currency === input.tripCurrency)
    return { originalMinor: input.amountMinor, convertedMinor: input.amountMinor, rate: null };
  const rate =
    input.rate ??
    (input.existing && input.existing.currency === input.currency ? input.existing.rate : null);
  if (!rate || rate <= 0)
    return { error: "Kurs wajib diisi untuk mata uang selain mata uang trip." };
  return {
    originalMinor: input.amountMinor,
    convertedMinor: Math.max(1, Math.round(input.amountMinor * rate)),
    rate,
  };
}

export const itemHash = (i: ItemRec) => hashOf([i.name.trim(), i.amountMinor]);
export const categoryHash = (c: CategoryRec) => hashOf([c.name.trim(), c.allocMinor]);
export const tripHash = (t: TripRec) => hashOf([t.totalMinor]);

/* ------------------------------------------------------------------------------- cells */

export type Cell = string | number | boolean | null | undefined;

/** A cell that would otherwise be read as a formula gets a visible guard. */
export const plainCell = (value: string) => (/^[=+\-@]/.test(value) ? `'${value}` : value);
/** The reverse of plainCell: drops the guard when the sheet hands the text back. */
export const unplainCell = (value: string) => (/^'[=+\-@]/.test(value) ? value.slice(1) : value);

const text = (cell: Cell) => (cell === null || cell === undefined ? "" : String(cell).trim());

/** A number typed or pasted into a cell: real numbers, "25.000", "1.234,56", "1,234.56", "Rp 25.000". */
export function readNumber(cell: Cell): number | null {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  const raw = text(cell).replace(/[^\d.,-]/g, "");
  if (!/\d/.test(raw)) return null;
  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");
  let normalised = raw;
  if (lastDot >= 0 && lastComma >= 0) {
    // The separator that comes last is the decimal one.
    normalised =
      lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalised =
      /,\d{3}$/.test(raw) && raw.split(",").length > 1
        ? raw.replace(/,/g, "")
        : raw.replace(",", ".");
  } else if (lastDot >= 0) {
    const groups = raw.split(".");
    // "25.000" or "1.250.000" are thousands; "12.5" is a decimal.
    normalised = groups.length > 2 || /\.\d{3}$/.test(raw) ? raw.replace(/\./g, "") : raw;
  }
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

export const toMinorUnits = (major: number) => Math.round(major * 100);

/** ISO date from a sheet cell: a real date (serial number), "2026-12-14" or "14/12/2026". */
export function readDate(cell: Cell): string | null {
  if (typeof cell === "number" && Number.isFinite(cell) && cell > 0) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(cell) * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  const value = text(cell);
  let y: string | undefined;
  let m: string | undefined;
  let d: string | undefined;
  let match = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) [, y, m, d] = match;
  else if ((match = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [, d, m, y] = match;
  if (!y || !m || !d) return null;
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idCell = (cell: Cell) => {
  const value = text(cell).toLowerCase();
  return value && UUID.test(value) ? value : null;
};

export type SheetIssue = { tab: string; row: number; reason: string };
export type Rows = ReadonlyArray<ReadonlyArray<Cell>>;

export type ParsedSheet<T extends { row: number }> = {
  /** Header cells are where Djiwa left them, so a missing row really means "deleted". */
  headerIntact: boolean;
  /** Rows with an ID of a known record, valid or not: they are present in the sheet. */
  presentKeys: Set<string>;
  /** Valid rows that already have an ID. */
  keyed: Map<string, T>;
  /** Valid rows without an ID: the traveler added them in the sheet. */
  fresh: T[];
  issues: SheetIssue[];
};

const blank = (row: ReadonlyArray<Cell> | undefined, from: number, to: number) =>
  !row || row.slice(from, to).every((cell) => text(cell) === "");

export type SheetExpense = {
  row: number;
  description: string;
  date: string;
  category: string;
  amountMinor: number;
  currency: string;
  rate: number | null;
};

export function parseExpenses(rows: Rows, tripCurrency: string): ParsedSheet<SheetExpense> {
  const header = rows[0] ?? [];
  const parsed: ParsedSheet<SheetExpense> = {
    headerIntact:
      text(header[0]) === "ID" && text(header[1]) === "Tanggal" && text(header[2]) === "Deskripsi",
    presentKeys: new Set(),
    keyed: new Map(),
    fresh: [],
    issues: [],
  };
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (blank(row, 0, 7) || !row) continue;
    const rowNumber = i + 1;
    const fail = (reason: string) =>
      parsed.issues.push({ tab: EXPENSE_TAB, row: rowNumber, reason });
    const key = idCell(row[0]);
    if (text(row[0]) && !key) {
      fail("ID tidak valid. Kosongkan ID untuk menambah pengeluaran baru.");
      continue;
    }
    if (key) parsed.presentKeys.add(key);
    const description = unplainCell(text(row[2])).replace(/\s+/g, " ");
    const date = readDate(row[1]);
    const amount = readNumber(row[4]);
    const currency = (text(row[5]) || tripCurrency).toUpperCase();
    const rate = text(row[6]) === "" ? null : readNumber(row[6]);
    if (!description || description.length > 160) {
      fail("Deskripsi wajib diisi (maks. 160 karakter).");
      continue;
    }
    if (!date) {
      fail("Tanggal tidak dikenali. Pakai format 2026-12-14 atau 14/12/2026.");
      continue;
    }
    if (amount === null || amount <= 0 || toMinorUnits(amount) <= 0) {
      fail("Jumlah harus angka lebih dari 0.");
      continue;
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      fail("Mata uang harus 3 huruf, mis. IDR.");
      continue;
    }
    if (rate !== null && rate <= 0) {
      fail("Kurs harus angka lebih dari 0.");
      continue;
    }
    const category = text(row[3]) === NO_CATEGORY ? "" : unplainCell(text(row[3]));
    const value: SheetExpense = {
      row: rowNumber,
      description,
      date,
      category,
      amountMinor: toMinorUnits(amount),
      currency,
      rate,
    };
    if (key) parsed.keyed.set(key, value);
    else parsed.fresh.push(value);
  }
  return parsed;
}

export type SheetItem = {
  row: number;
  expenseKey: string | null;
  expenseName: string;
  expenseDate: string | null;
  name: string;
  amountMinor: number;
};

export function parseItems(rows: Rows): ParsedSheet<SheetItem> {
  const header = rows[0] ?? [];
  const parsed: ParsedSheet<SheetItem> = {
    headerIntact:
      text(header[0]) === "ID Pengeluaran" &&
      text(header[3]) === "Item" &&
      text(header[6]) === "ID Item",
    presentKeys: new Set(),
    keyed: new Map(),
    fresh: [],
    issues: [],
  };
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (blank(row, 0, 6) || !row) continue;
    const rowNumber = i + 1;
    const fail = (reason: string) => parsed.issues.push({ tab: ITEMS_TAB, row: rowNumber, reason });
    const keyText = text(row[6]);
    // The tax/service row is derived from the expense total, not an item of its own.
    if (keyText === REMAINDER_KEY) continue;
    const key = idCell(row[6]);
    if (keyText && !key) {
      fail("ID Item tidak valid. Kosongkan untuk menambah item baru.");
      continue;
    }
    if (key) parsed.presentKeys.add(key);
    const name = unplainCell(text(row[3])).replace(/\s+/g, " ");
    const amount = readNumber(row[4]);
    if (!name || name.length > 160) {
      fail("Nama item wajib diisi (maks. 160 karakter).");
      continue;
    }
    if (amount === null || amount <= 0 || toMinorUnits(amount) <= 0) {
      fail("Harga harus angka lebih dari 0.");
      continue;
    }
    const value: SheetItem = {
      row: rowNumber,
      expenseKey: idCell(row[0]),
      expenseName: unplainCell(text(row[1])),
      expenseDate: readDate(row[2]),
      name,
      amountMinor: toMinorUnits(amount),
    };
    if (key) parsed.keyed.set(key, value);
    else parsed.fresh.push(value);
  }
  return parsed;
}

export type SheetCategory = { row: number; name: string; allocMinor: number };
export type ParsedBudget = ParsedSheet<SheetCategory> & { total: number | null };

export function parseBudget(rows: Rows): ParsedBudget {
  const header = rows[CATEGORY_HEADER_ROW - 1] ?? [];
  const parsed: ParsedBudget = {
    headerIntact:
      text(rows[0]?.[0]) === "Total anggaran" &&
      text(header[0]) === "Kategori" &&
      text(header[5]) === "ID",
    presentKeys: new Set(),
    keyed: new Map(),
    fresh: [],
    issues: [],
    total: null,
  };
  const totalCell = rows[0]?.[1];
  if (text(totalCell) !== "") {
    const total = readNumber(totalCell);
    if (total === null || total < 0)
      parsed.issues.push({
        tab: BUDGET_TAB,
        row: 1,
        reason: "Total anggaran harus angka 0 atau lebih.",
      });
    else parsed.total = toMinorUnits(total);
  }
  for (let i = CATEGORY_FIRST_ROW - 1; i < rows.length; i += 1) {
    const row = rows[i];
    if ((blank(row, 0, 2) && text(row?.[5]) === "") || !row) continue;
    const rowNumber = i + 1;
    const fail = (reason: string) =>
      parsed.issues.push({ tab: BUDGET_TAB, row: rowNumber, reason });
    const key = idCell(row[5]);
    if (text(row[5]) && !key) {
      fail("ID tidak valid. Kosongkan ID untuk menambah kategori baru.");
      continue;
    }
    if (key) parsed.presentKeys.add(key);
    const name = unplainCell(text(row[0])).replace(/\s+/g, " ");
    if (!name || name.length > 80) {
      fail("Nama kategori wajib diisi (maks. 80 karakter).");
      continue;
    }
    if (name.toLowerCase() === NO_CATEGORY.toLowerCase()) {
      fail(`"${NO_CATEGORY}" dipakai untuk pengeluaran tanpa kategori. Pilih nama lain.`);
      continue;
    }
    const alloc = text(row[1]) === "" ? 0 : readNumber(row[1]);
    if (alloc === null || alloc < 0) {
      fail("Anggaran kategori harus angka 0 atau lebih.");
      continue;
    }
    const value: SheetCategory = { row: rowNumber, name, allocMinor: toMinorUnits(alloc) };
    if (key) parsed.keyed.set(key, value);
    else parsed.fresh.push(value);
  }
  return parsed;
}

/* ---------------------------------------------------------------------------- planning */

export type RowPlan<T> = {
  /** Sheet holds a newer version of a row the app has not changed since the last sync. */
  update: Array<{ key: string; value: T }>;
  /** Rows the traveler removed from the sheet (the app has not changed them since). */
  remove: string[];
  /** Changed on both sides since the last sync: the app version is kept. */
  conflicts: string[];
};

/**
 * Tells the three cases apart per row, using the fingerprint of what was last written to the sheet:
 * only the sheet changed (apply it), only the app changed (the rewrite pushes it), or both (the app wins).
 */
export function planRows<T, D>(input: {
  sheet: ReadonlyMap<string, T>;
  present: ReadonlySet<string>;
  db: ReadonlyMap<string, D>;
  snapshot: ReadonlyMap<string, string>;
  sheetHash: (value: T) => string;
  dbHash: (value: D) => string;
}): RowPlan<T> {
  const plan: RowPlan<T> = { update: [], remove: [], conflicts: [] };
  for (const [key, db] of input.db) {
    const base = input.snapshot.get(key);
    const dbFingerprint = input.dbHash(db);
    const sheet = input.sheet.get(key);
    if (sheet === undefined) {
      if (input.present.has(key)) continue; // present but invalid: keep the app's version
      if (base === undefined) continue; // new in the app: the rewrite pushes it
      if (base === dbFingerprint) plan.remove.push(key);
      else plan.conflicts.push(key); // changed in the app while removed from the sheet
      continue;
    }
    const sheetFingerprint = input.sheetHash(sheet);
    if (sheetFingerprint === dbFingerprint) continue;
    if (base === dbFingerprint) plan.update.push({ key, value: sheet });
    else if (base === sheetFingerprint)
      continue; // only the app changed
    else plan.conflicts.push(key);
  }
  return plan;
}

/** A mass removal is held back: a cleared sheet or a slip of the mouse must not wipe a trip. */
export function deletionsAllowed(removing: number, tracked: number, headerIntact: boolean) {
  if (!headerIntact) return false;
  if (removing <= 5) return true;
  return removing <= tracked / 2;
}

/* ----------------------------------------------------------------------------- writing */

export type SheetWrite = {
  /** Written as plain values (never parsed as formulas). */
  raw: Array<{ range: string; values: Array<Array<string | number>> }>;
  /** Written with formulas evaluated by Sheets. */
  formulas: Array<{ range: string; values: string[][] }>;
};

export function buildSheetWrite(state: BudgetState): SheetWrite {
  const cur = state.tripCurrency;
  const expenses = state.expenses;
  const header = [...EXPENSE_HEADER] as string[];
  const expenseRaw = [
    header,
    ...expenses.map((e) => [
      e.id,
      e.date,
      plainCell(e.description),
      plainCell(e.category || NO_CATEGORY),
      e.amountMinor / 100,
      e.currency,
      e.currency === cur || e.rate === "" ? "" : Number(e.rate),
    ]),
  ];
  const expenseFormulas = [
    [`Jumlah (${cur})`],
    ...expenses.map((_, i) => [`=IF(G${i + 2}="",E${i + 2},E${i + 2}*G${i + 2})`]),
  ];
  const receipts = [["Struk"], ...expenses.map((e) => [e.hasReceipt ? "Ada" : ""])];

  const byExpense = new Map<string, ItemRec[]>();
  for (const item of state.items) {
    const list = byExpense.get(item.expenseId) ?? [];
    list.push(item);
    byExpense.set(item.expenseId, list);
  }
  const itemRows: Array<Array<string | number>> = [[...ITEM_HEADER]];
  for (const expense of expenses) {
    const lines = byExpense.get(expense.id);
    if (!lines?.length) continue;
    const head = [expense.id, plainCell(expense.description), expense.date];
    for (const line of lines)
      itemRows.push([
        ...head,
        plainCell(line.name),
        line.amountMinor / 100,
        expense.currency,
        line.id,
      ]);
    const remainder = expense.amountMinor - lines.reduce((sum, line) => sum + line.amountMinor, 0);
    if (remainder !== 0)
      itemRows.push([...head, REMAINDER_LABEL, remainder / 100, expense.currency, REMAINDER_KEY]);
  }

  const first = CATEGORY_FIRST_ROW;
  const last = first + Math.max(state.categories.length, 1) - 1;
  const budgetRaw: Array<{ range: string; values: Array<Array<string | number>> }> = [
    {
      range: `${BUDGET_TAB}!A1`,
      values: [
        ["Total anggaran", state.total.totalMinor / 100],
        ["Terpakai"],
        ["Sisa"],
        ["% terpakai"],
        ["Dialokasikan ke kategori"],
        ["Belum dialokasikan"],
        [`Tanpa kategori (terpakai)`],
        [...CATEGORY_HEADER],
        ...state.categories.map((c) => [plainCell(c.name), c.allocMinor / 100, "", "", "", c.id]),
      ],
    },
  ];
  const sumRange = `${EXPENSE_TAB}!$H:$H`;
  const nameRange = `${EXPENSE_TAB}!$D:$D`;
  const budgetFormulas: Array<{ range: string; values: string[][] }> = [
    {
      range: `${BUDGET_TAB}!B2:B7`,
      values: [
        [`=SUM(${EXPENSE_TAB}!$H$2:$H)`],
        ["=B1-B2"],
        ["=IF(B1=0,0,B2/B1)"],
        [`=SUM(B${first}:B)`],
        ["=B1-B5"],
        [`=SUMIF(${nameRange},"${NO_CATEGORY}",${sumRange})`],
      ],
    },
  ];
  if (state.categories.length)
    budgetFormulas.push({
      range: `${BUDGET_TAB}!C${first}:E${last}`,
      values: state.categories.map((_, i) => {
        const r = first + i;
        return [
          `=SUMIF(${nameRange},A${r},${sumRange})`,
          `=B${r}-C${r}`,
          `=IF(B${r}=0,"",C${r}/B${r})`,
        ];
      }),
    });

  return {
    raw: [
      { range: `${EXPENSE_TAB}!A1`, values: expenseRaw },
      { range: `${EXPENSE_TAB}!I1`, values: receipts },
      { range: `${ITEMS_TAB}!A1`, values: itemRows },
      ...budgetRaw,
    ],
    formulas: [{ range: `${EXPENSE_TAB}!H1`, values: expenseFormulas }, ...budgetFormulas],
  };
}

/** What the snapshot stores after a sync: the fingerprint of every row as it was written. */
export function snapshotOf(state: BudgetState) {
  const rows: Array<{ tab: string; key: string; hash: string }> = [
    { tab: BUDGET_TAB, key: "trip", hash: tripHash(state.total) },
  ];
  for (const c of state.categories)
    rows.push({ tab: BUDGET_TAB, key: c.id, hash: categoryHash(c) });
  for (const e of state.expenses)
    rows.push({ tab: EXPENSE_TAB, key: e.id, hash: expenseHash(e, state.tripCurrency) });
  for (const i of state.items) rows.push({ tab: ITEMS_TAB, key: i.id, hash: itemHash(i) });
  return rows;
}
