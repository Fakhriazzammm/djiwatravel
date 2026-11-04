import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client.server", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));

import { multipartBody } from "@/lib/google-drive.server";
import {
  EXPENSE_HEADER,
  expenseValues,
  ITEM_HEADER,
  itemValues,
  managedRanges,
  plainCell,
  summaryValues,
} from "@/lib/google-sheets.server";

describe("Drive multipart upload body", () => {
  it("wraps metadata and the exact image bytes between boundaries", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x10]);
    const { boundary, body } = multipartBody(
      { name: "a.jpg", parents: ["f1"] },
      "image/jpeg",
      bytes,
    );
    const text = body.toString("latin1");
    expect(text.startsWith(`--${boundary}\r\n`)).toBe(true);
    expect(text.endsWith(`\r\n--${boundary}--`)).toBe(true);
    expect(text).toContain('"parents":["f1"]');
    expect(text).toContain("Content-Type: image/jpeg");
    const start = body.indexOf(Buffer.from("image/jpeg\r\n\r\n")) + "image/jpeg\r\n\r\n".length;
    expect([...body.subarray(start, start + bytes.length)]).toEqual([...bytes]);
  });
});

describe("Sheets export values", () => {
  const row = {
    id: "e1",
    transaction_date: new Date("2026-12-14T00:00:00.000Z"),
    description: '=HYPERLINK("http://evil")',
    category_name: null,
    original_amount_minor: "1850000",
    original_currency: "IDR",
    exchange_rate: null,
    converted_amount_minor: 1850000,
    has_receipt: true,
  };

  it("keeps the fixed header and converts minor units", () => {
    const values = expenseValues([row]);
    expect(values[0]).toEqual([...EXPENSE_HEADER]);
    expect(values[1]?.[1]).toBe("2026-12-14");
    expect(values[1]?.[4]).toBe(18500);
    expect(values[1]?.[7]).toBe(18500);
    expect(values[1]?.[3]).toBe("Tanpa kategori");
    expect(values[1]?.[8]).toBe("Ada");
  });

  it("defuses text that could be read as a formula", () => {
    expect(expenseValues([row])[1]?.[2]).toBe('\'=HYPERLINK("http://evil")');
    expect(plainCell("+62 812")).toBe("'+62 812");
    expect(plainCell("Makan siang")).toBe("Makan siang");
  });

  it("lists categories under the summary header", () => {
    expect(summaryValues(["Makan", "=bad"])).toEqual([
      ["Kategori", "Total (IDR)"],
      ["Makan"],
      ["'=bad"],
    ]);
  });
});

describe("Cells Djiwa rewrites", () => {
  it("clears only the managed columns so the traveler's own columns survive", () => {
    expect(managedRanges()).toEqual(["Pengeluaran!A:I", "Rincian!A:F", "Ringkasan!A:B"]);
    expect(managedRanges().join()).not.toMatch(/:Z|:J/);
  });

  it("covers every column the export writes", () => {
    expect(EXPENSE_HEADER.length).toBe(9); // A..I
  });
});

describe("Rincian tab", () => {
  const expense = (id: string, total: number, extra = {}) => ({
    id,
    transaction_date: "2026-11-04",
    description: "Notre Socielle",
    category_name: "Makan",
    original_amount_minor: total,
    original_currency: "IDR",
    exchange_rate: null,
    converted_amount_minor: total,
    has_receipt: true,
    ...extra,
  });

  it("lists every item under its expense, in the original currency", () => {
    const rows = itemValues(
      [expense("e1", 20_350_000)],
      [
        { expense_id: "e1", name: "Croissant", amount_minor: 9_000_000 },
        { expense_id: "e1", name: "Latte", amount_minor: 10_000_000 },
      ],
    );
    expect(rows[0]).toEqual([...ITEM_HEADER]);
    expect(rows[1]).toEqual(["e1", "Notre Socielle", "2026-11-04", "Croissant", 90_000, "IDR"]);
    expect(rows[2]?.[3]).toBe("Latte");
  });

  it("adds a row for tax and service so the rows sum to the expense total", () => {
    const rows = itemValues(
      [expense("e1", 20_350_000)],
      [
        { expense_id: "e1", name: "Croissant", amount_minor: 9_000_000 },
        { expense_id: "e1", name: "Latte", amount_minor: 10_000_000 },
      ],
    );
    const last = rows.at(-1)!;
    expect(last[3]).toBe("Pajak, layanan & lainnya");
    const sum = rows.slice(1).reduce((total, row) => total + Number(row[4]), 0);
    expect(sum).toBe(203_500);
  });

  it("adds no remainder row when the items match, and skips expenses without items", () => {
    const rows = itemValues(
      [expense("e1", 19_000_000), expense("e2", 5_000_000)],
      [
        { expense_id: "e1", name: "A", amount_minor: 9_000_000 },
        { expense_id: "e1", name: "B", amount_minor: 10_000_000 },
      ],
    );
    expect(rows).toHaveLength(3);
    expect(rows.some((row) => row[0] === "e2")).toBe(false);
  });

  it("defuses item names that look like formulas", () => {
    const rows = itemValues(
      [expense("e1", 1_000)],
      [{ expense_id: "e1", name: "=SUM(A1)", amount_minor: 1_000 }],
    );
    expect(rows[1]?.[3]).toBe("'=SUM(A1)");
  });

  it("shows an empty tab with only the header when no expense has items", () => {
    expect(itemValues([expense("e1", 1_000)], [])).toEqual([[...ITEM_HEADER]]);
  });
});
