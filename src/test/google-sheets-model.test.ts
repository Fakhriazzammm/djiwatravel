import { describe, expect, it } from "vitest";
import {
  BUDGET_TAB,
  CATEGORY_FIRST_ROW,
  NO_CATEGORY,
  REMAINDER_KEY,
  buildSheetWrite,
  deletionsAllowed,
  expenseHash,
  managedRanges,
  parseBudget,
  parseExpenses,
  parseItems,
  planRows,
  readDate,
  readNumber,
  resolveExpenseMoney,
  sheetExpenseHash,
  snapshotOf,
  unplainCell,
  type BudgetState,
  type ExpenseRec,
} from "@/lib/google-sheets-model";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const CAT = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";

describe("Reading numbers and dates from cells", () => {
  it("reads real numbers and the usual typed formats", () => {
    expect(readNumber(25000)).toBe(25000);
    expect(readNumber("25.000")).toBe(25000);
    expect(readNumber("1.250.000")).toBe(1250000);
    expect(readNumber("1.234,56")).toBe(1234.56);
    expect(readNumber("1,234.56")).toBe(1234.56);
    expect(readNumber("12,5")).toBe(12.5);
    expect(readNumber("12.5")).toBe(12.5);
    expect(readNumber("Rp 25.000")).toBe(25000);
    expect(readNumber("25,000")).toBe(25000);
  });

  it("rejects text that is not a number", () => {
    expect(readNumber("")).toBeNull();
    expect(readNumber("abc")).toBeNull();
    expect(readNumber(undefined)).toBeNull();
  });

  it("reads real dates (serial numbers), ISO and day-first dates", () => {
    expect(readDate(46000)).toBe("2025-12-09");
    expect(readDate("2026-12-14")).toBe("2026-12-14");
    expect(readDate("14/12/2026")).toBe("2026-12-14");
    expect(readDate("1/2/2026")).toBe("2026-02-01");
    expect(readDate("2026-02-30")).toBeNull();
    expect(readDate("kemarin")).toBeNull();
  });

  it("drops the formula guard when the sheet hands text back", () => {
    expect(unplainCell("'=HYPERLINK()")).toBe("=HYPERLINK()");
    expect(unplainCell("Makan")).toBe("Makan");
  });
});

const header = ["ID", "Tanggal", "Deskripsi", "Kategori", "Jumlah", "Mata uang", "Kurs"];

describe("Reading the Pengeluaran tab", () => {
  it("reads known rows, new rows and skips blank ones", () => {
    const parsed = parseExpenses(
      [
        header,
        [ID1, "2026-12-14", "Warung", "Makan", 185000, "IDR", ""],
        ["", "2026-12-15", "Grab", "Transport", 94000],
        [],
        ["", "", "", "", "", "", ""],
      ],
      "IDR",
    );
    expect(parsed.headerIntact).toBe(true);
    expect(parsed.keyed.get(ID1)).toMatchObject({
      description: "Warung",
      amountMinor: 18_500_000,
      row: 2,
    });
    expect(parsed.fresh).toHaveLength(1);
    expect(parsed.fresh[0]).toMatchObject({
      description: "Grab",
      currency: "IDR",
      category: "Transport",
    });
    expect(parsed.issues).toEqual([]);
  });

  it("reports unreadable rows with their row number and still counts a known ID as present", () => {
    const parsed = parseExpenses(
      [
        header,
        [ID1, "2026-12-14", "Warung", "Makan", "banyak", "IDR", ""],
        ["", "bukan tanggal", "X", "", 1000],
        ["abc", "2026-12-14", "Y", "", 1000],
      ],
      "IDR",
    );
    expect(parsed.keyed.size).toBe(0);
    expect(parsed.presentKeys.has(ID1)).toBe(true);
    expect(parsed.issues.map((issue) => issue.row)).toEqual([2, 3, 4]);
  });

  it("reads 'Tanpa kategori' as no category and defaults the currency to the trip's", () => {
    const parsed = parseExpenses([header, [ID1, "2026-12-14", "Warung", NO_CATEGORY, 1000]], "IDR");
    expect(parsed.keyed.get(ID1)).toMatchObject({ category: "", currency: "IDR" });
  });

  it("flags a damaged header so rows missing from the sheet are never treated as deleted", () => {
    expect(parseExpenses([["x"], [ID1, "2026-12-14", "A", "", 1]], "IDR").headerIntact).toBe(false);
    expect(parseExpenses([], "IDR").headerIntact).toBe(false);
  });
});

describe("Reading the Rincian tab", () => {
  const itemHeader = [
    "ID Pengeluaran",
    "Pengeluaran",
    "Tanggal",
    "Item",
    "Harga",
    "Mata uang",
    "ID Item",
  ];

  it("reads items, finds new ones and ignores the tax/service row", () => {
    const parsed = parseItems([
      itemHeader,
      [ID1, "Warung", "2026-12-14", "Croissant", 90000, "IDR", ITEM],
      [ID1, "Warung", "2026-12-14", "Pajak, layanan & lainnya", 18500, "IDR", REMAINDER_KEY],
      ["", "Warung", "2026-12-14", "Air", 10000, "IDR", ""],
    ]);
    expect(parsed.headerIntact).toBe(true);
    expect(parsed.keyed.size).toBe(1);
    expect(parsed.keyed.get(ITEM)).toMatchObject({ name: "Croissant", amountMinor: 9_000_000 });
    expect(parsed.fresh).toHaveLength(1);
    expect(parsed.fresh[0]).toMatchObject({ expenseKey: null, expenseName: "Warung", name: "Air" });
    expect(parsed.issues).toEqual([]);
  });
});

describe("Reading the Anggaran tab", () => {
  const top = [
    ["Total anggaran", 10000000],
    ["Terpakai", 100],
    ["Sisa"],
    ["% terpakai"],
    ["Dialokasikan ke kategori"],
    ["Belum dialokasikan"],
    ["Tanpa kategori (terpakai)"],
    ["Kategori", "Anggaran", "Terpakai", "Sisa", "% Terpakai", "ID"],
  ];

  it("reads the total, categories and new category rows", () => {
    const parsed = parseBudget([...top, ["Makan", 2000000, 5, 5, "", CAT], ["Oleh-oleh", 500000]]);
    expect(parsed.headerIntact).toBe(true);
    expect(parsed.total).toBe(1_000_000_000);
    expect(parsed.keyed.get(CAT)).toMatchObject({ name: "Makan", allocMinor: 200_000_000 });
    expect(parsed.fresh[0]).toMatchObject({
      name: "Oleh-oleh",
      allocMinor: 50_000_000,
      row: CATEGORY_FIRST_ROW + 1,
    });
  });

  it("refuses a category called 'Tanpa kategori' and a negative allocation", () => {
    const parsed = parseBudget([...top, ["Tanpa kategori", 1000], ["Visa", -5]]);
    expect(parsed.fresh).toHaveLength(0);
    expect(parsed.issues).toHaveLength(2);
  });

  it("reports a total that is not a number", () => {
    const parsed = parseBudget([["Total anggaran", "banyak"], ...top.slice(1)]);
    expect(parsed.total).toBeNull();
    expect(parsed.issues[0]?.row).toBe(1);
  });
});

describe("Telling apart who changed a row", () => {
  type S = { v: string };
  const run = (opts: {
    sheet?: [string, string][];
    present?: string[];
    db: [string, string][];
    snap: [string, string][];
  }) =>
    planRows<S, string>({
      sheet: new Map((opts.sheet ?? []).map(([k, v]) => [k, { v }])),
      present: new Set(opts.present ?? (opts.sheet ?? []).map(([k]) => k)),
      db: new Map(opts.db),
      snapshot: new Map(opts.snap),
      sheetHash: (s) => s.v,
      dbHash: (d) => d,
    });

  it("applies a sheet edit when the app has not changed the row since the last sync", () => {
    expect(run({ sheet: [["a", "NEW"]], db: [["a", "OLD"]], snap: [["a", "OLD"]] }).update).toEqual(
      [{ key: "a", value: { v: "NEW" } }],
    );
  });

  it("leaves an app edit for the rewrite to push", () => {
    const plan = run({ sheet: [["a", "OLD"]], db: [["a", "NEW"]], snap: [["a", "OLD"]] });
    expect(plan.update).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });

  it("keeps the app's version and reports a conflict when both changed", () => {
    const plan = run({ sheet: [["a", "S"]], db: [["a", "D"]], snap: [["a", "OLD"]] });
    expect(plan.update).toEqual([]);
    expect(plan.conflicts).toEqual(["a"]);
  });

  it("treats differing rows with no history as a conflict, never as an edit", () => {
    expect(run({ sheet: [["a", "S"]], db: [["a", "D"]], snap: [] }).conflicts).toEqual(["a"]);
  });

  it("notices a row removed from the sheet only when the app has not changed it", () => {
    expect(run({ sheet: [], db: [["a", "OLD"]], snap: [["a", "OLD"]] }).remove).toEqual(["a"]);
    const changed = run({ sheet: [], db: [["a", "NEW"]], snap: [["a", "OLD"]] });
    expect(changed.remove).toEqual([]);
    expect(changed.conflicts).toEqual(["a"]);
  });

  it("does not treat a brand-new app row, or an unreadable sheet row, as deleted", () => {
    expect(run({ sheet: [], db: [["a", "X"]], snap: [] }).remove).toEqual([]);
    expect(
      run({ sheet: [], present: ["a"], db: [["a", "OLD"]], snap: [["a", "OLD"]] }).remove,
    ).toEqual([]);
  });

  it("ignores a sheet row whose ID the app no longer has", () => {
    const plan = run({ sheet: [["gone", "S"]], db: [], snap: [["gone", "OLD"]] });
    expect(plan).toEqual({ update: [], remove: [], conflicts: [] });
  });
});

describe("Holding back mass deletions", () => {
  it("allows a few removals and holds a large share or a damaged header", () => {
    expect(deletionsAllowed(2, 10, true)).toBe(true);
    expect(deletionsAllowed(5, 6, true)).toBe(true);
    expect(deletionsAllowed(8, 10, true)).toBe(false);
    expect(deletionsAllowed(6, 40, true)).toBe(true);
    expect(deletionsAllowed(1, 10, false)).toBe(false);
  });
});

describe("Money of an expense edited in the sheet", () => {
  it("converts 1:1 in the trip currency", () => {
    expect(
      resolveExpenseMoney({ tripCurrency: "IDR", amountMinor: 500, currency: "IDR", rate: null }),
    ).toEqual({
      originalMinor: 500,
      convertedMinor: 500,
      rate: null,
    });
  });

  it("uses the typed rate, else the stored one for the same currency, else refuses", () => {
    expect(
      resolveExpenseMoney({ tripCurrency: "IDR", amountMinor: 1000, currency: "JPY", rate: 110 }),
    ).toMatchObject({ convertedMinor: 110000 });
    expect(
      resolveExpenseMoney({
        tripCurrency: "IDR",
        amountMinor: 1000,
        currency: "JPY",
        rate: null,
        existing: { currency: "JPY", rate: 100 },
      }),
    ).toMatchObject({ convertedMinor: 100000 });
    expect(
      resolveExpenseMoney({
        tripCurrency: "IDR",
        amountMinor: 1000,
        currency: "USD",
        rate: null,
        existing: { currency: "JPY", rate: 100 },
      }),
    ).toHaveProperty("error");
  });
});

const expense = (over: Partial<ExpenseRec> = {}): ExpenseRec => ({
  id: ID1,
  description: "Warung",
  date: "2026-12-14",
  category: "Makan",
  amountMinor: 18_500_000,
  currency: "IDR",
  rate: "",
  convertedMinor: 18_500_000,
  hasReceipt: true,
  ...over,
});

describe("Fingerprints match across the app and the sheet", () => {
  it("is the same for an unchanged row and ignores the rate in the trip currency", () => {
    const e = expense();
    const parsed = parseExpenses(
      [header, [ID1, "2026-12-14", "Warung", "Makan", 185000, "IDR", 1]],
      "IDR",
    );
    expect(sheetExpenseHash(parsed.keyed.get(ID1)!, "IDR")).toBe(expenseHash(e, "IDR"));
  });

  it("changes when an editable field changes", () => {
    const parsed = parseExpenses(
      [header, [ID1, "2026-12-14", "Warung", "Makan", 190000, "IDR", ""]],
      "IDR",
    );
    expect(sheetExpenseHash(parsed.keyed.get(ID1)!, "IDR")).not.toBe(expenseHash(expense(), "IDR"));
  });

  it("does not flip on floating point noise in a foreign-currency rate", () => {
    const e = expense({ currency: "JPY", rate: "0.01123457" });
    const parsed = parseExpenses(
      [header, [ID1, "2026-12-14", "Warung", "Makan", 185000, "JPY", 0.011234567891]],
      "IDR",
    );
    expect(sheetExpenseHash(parsed.keyed.get(ID1)!, "IDR")).toBe(expenseHash(e, "IDR"));
  });
});

describe("Building what is written to the sheet", () => {
  const state: BudgetState = {
    tripCurrency: "IDR",
    total: { totalMinor: 1_000_000_000 },
    categories: [{ id: CAT, name: "Makan", allocMinor: 200_000_000 }],
    expenses: [expense(), expense({ id: ID2, description: "=EVIL()", category: "" })],
    items: [{ id: ITEM, expenseId: ID1, name: "Croissant", amountMinor: 9_000_000 }],
  };
  const write = buildSheetWrite(state);
  const raw = (range: string) => write.raw.find((block) => block.range === range)!.values;
  const formulas = (range: string) => write.formulas.find((block) => block.range === range)!.values;

  it("writes expenses with the ID first and guards formula-looking text", () => {
    const rows = raw("Pengeluaran!A1");
    expect(rows[0]).toEqual([
      "ID",
      "Tanggal",
      "Deskripsi",
      "Kategori",
      "Jumlah",
      "Mata uang",
      "Kurs",
    ]);
    expect(rows[1]).toEqual([ID1, "2026-12-14", "Warung", "Makan", 185000, "IDR", ""]);
    expect(rows[2]?.[2]).toBe("'=EVIL()");
    expect(rows[2]?.[3]).toBe(NO_CATEGORY);
  });

  it("converts each expense with a live formula over its own amount and rate", () => {
    const rows = formulas("Pengeluaran!H1");
    expect(rows[0]).toEqual(["Jumlah (IDR)"]);
    expect(rows[1]).toEqual(['=IF(G2="",E2,E2*G2)']);
    expect(rows[2]).toEqual(['=IF(G3="",E3,E3*G3)']);
  });

  it("lists items with their ID and a row for the tax/service remainder", () => {
    const rows = raw("Rincian!A1");
    expect(rows[1]).toEqual([ID1, "Warung", "2026-12-14", "Croissant", 90000, "IDR", ITEM]);
    expect(rows[2]?.[6]).toBe(REMAINDER_KEY);
    expect(rows[2]?.[4]).toBe(95000);
  });

  it("puts the budget on its own tab and ties it to the expenses with formulas", () => {
    const rows = raw(`${BUDGET_TAB}!A1`);
    expect(rows[0]).toEqual(["Total anggaran", 10000000]);
    expect(rows[7]).toEqual(["Kategori", "Anggaran", "Terpakai", "Sisa", "% Terpakai", "ID"]);
    expect(rows[8]).toEqual(["Makan", 2000000, "", "", "", CAT]);
    const summary = formulas(`${BUDGET_TAB}!B2:B7`).map((row) => row[0]);
    expect(summary[0]).toBe("=SUM(Pengeluaran!$H$2:$H)");
    expect(summary[1]).toBe("=B1-B2");
    expect(summary[3]).toBe("=SUM(B9:B)");
    expect(summary[4]).toBe("=B1-B5");
    const perCategory = formulas(`${BUDGET_TAB}!C9:E9`)[0]!;
    expect(perCategory[0]).toBe("=SUMIF(Pengeluaran!$D:$D,A9,Pengeluaran!$H:$H)");
    expect(perCategory[1]).toBe("=B9-C9");
  });

  it("clears exactly the columns it writes", () => {
    expect(managedRanges()).toEqual(["Pengeluaran!A:I", "Rincian!A:G", "Anggaran!A:F"]);
  });

  it("records a fingerprint for every row it wrote", () => {
    const snapshot = snapshotOf(state);
    expect(snapshot.map((row) => `${row.tab}:${row.key}`)).toEqual([
      "Anggaran:trip",
      `Anggaran:${CAT}`,
      `Pengeluaran:${ID1}`,
      `Pengeluaran:${ID2}`,
      `Rincian:${ITEM}`,
    ]);
  });
});
