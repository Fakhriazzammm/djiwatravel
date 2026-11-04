import { describe, expect, it } from "vitest";
import {
  batchTotalMinor,
  convertedMinor,
  editToRead,
  editedValidation,
  itemsNote,
  makeEdit,
  matchLine,
  parseAmount,
  saveBlocker,
  type ScanItem,
} from "@/lib/receipt-scan-client";
import type { ReceiptRead } from "@/lib/receipt-scan";

const read: ReceiptRead = {
  isReceipt: true,
  readable: true,
  merchant: "Fuglen Tokyo",
  date: "2026-11-04",
  currency: "JPY",
  total: 1480,
  items: [
    { name: "Cold brew", amount: 680 },
    { name: "Cheesecake", amount: 800 },
  ],
  categoryGuess: null,
  uncertain: [],
  region: null,
  reason: null,
};
const today = "2026-11-04";

describe("scan edit model", () => {
  it("starts from the AI read and falls back to today and the trip currency", () => {
    expect(makeEdit(read, "cat-1", "IDR", today)).toMatchObject({
      merchant: "Fuglen Tokyo",
      currency: "JPY",
      total: "1480",
      categoryId: "cat-1",
      edited: false,
    });
    expect(makeEdit(null, null, "IDR", today)).toMatchObject({
      merchant: "",
      date: today,
      currency: "IDR",
      total: "",
    });
  });

  it("re-validates while the traveler edits, so a missed item shows up and goes away", () => {
    const edit = makeEdit(read, null, "IDR", today);
    expect(editedValidation(edit, today).matches).toBe(true);
    const gap = { ...edit, total: "1600" };
    expect(editedValidation(gap, today)).toMatchObject({ matches: false, difference: 120 });
    const fixed = { ...gap, items: [...gap.items, { name: "Nori", amount: "120" }] };
    expect(editedValidation(fixed, today).matches).toBe(true);
  });

  it("describes the match the way the prototype does", () => {
    const edit = makeEdit(read, null, "IDR", today);
    expect(matchLine(edit, editedValidation(edit, today))).toEqual({
      ok: true,
      text: "¥680 + ¥800 = ¥1.480, cocok dengan total",
    });
    const gap = { ...edit, total: "1600" };
    const line = matchLine(gap, editedValidation(gap, today));
    expect(line?.ok).toBe(false);
    expect(line?.text).toContain("Selisih ¥120");
  });

  it("converts to the trip currency and waits for a rate when currencies differ", () => {
    const edit = makeEdit(read, null, "IDR", today);
    expect(convertedMinor(edit, "IDR")).toBeNull();
    expect(convertedMinor({ ...edit, rate: 101 }, "IDR")).toBe(14_948_000);
    expect(convertedMinor({ ...edit, currency: "IDR", total: "25000" }, "IDR")).toBe(2_500_000);
    expect(convertedMinor({ ...edit, total: "" }, "IDR")).toBeNull();
  });

  it("names what blocks saving", () => {
    const edit = { ...makeEdit(read, null, "IDR", today), rate: 101 };
    expect(saveBlocker(edit, "IDR", today)).toBeNull();
    expect(saveBlocker({ ...edit, merchant: " " }, "IDR", today)).toBe("Isi nama toko");
    expect(saveBlocker({ ...edit, total: "0" }, "IDR", today)).toBe("Isi total");
    expect(saveBlocker({ ...edit, rate: null }, "IDR", today)).toBe("Isi kurs");
    expect(saveBlocker({ ...edit, date: "2026-12-30" }, "IDR", today)).toBe(
      "Tanggal di masa depan",
    );
  });

  it("totals only the included receipts and writes the item note", () => {
    const a = { ...makeEdit(read, null, "IDR", today), rate: 101 };
    const item = (id: string, over: Partial<ScanItem>): ScanItem => ({
      id,
      url: "",
      status: "ready",
      skipped: false,
      edit: a,
      ...over,
    });
    expect(
      batchTotalMinor(
        [item("1", {}), item("2", { skipped: true }), item("3", { status: "unreadable" })],
        "IDR",
      ),
    ).toBe(14_948_000);
    expect(itemsNote(a)).toBe("Dari scan struk: Cold brew ¥680, Cheesecake ¥800");
    expect(editToRead(a).items).toHaveLength(2);
    expect(parseAmount("12,5")).toBe(12.5);
    expect(parseAmount("abc")).toBeNull();
  });
});
