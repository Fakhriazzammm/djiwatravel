import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client.server", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));

import { multipartBody } from "@/lib/google-drive.server";
import {
  EXPENSE_HEADER,
  expenseValues,
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
    expect(managedRanges()).toEqual(["Pengeluaran!A:I", "Ringkasan!A:B"]);
    expect(managedRanges().join()).not.toMatch(/:Z|:J/);
  });

  it("covers every column the export writes", () => {
    expect(EXPENSE_HEADER.length).toBe(9); // A..I
  });
});
