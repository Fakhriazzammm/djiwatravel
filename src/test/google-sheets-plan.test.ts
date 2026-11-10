import { describe, expect, it } from "vitest";
import {
  PLAN_HEADER,
  PLAN_TAB,
  PREP_HEADER,
  PREP_TAB,
  SUMMARY_TAB,
  TICKET_TAB,
  buildPlanFormat,
  buildPlanWrite,
  parsePlanItems,
  parsePrep,
  planItemHash,
  type PlanSheetState,
} from "@/lib/google-sheets-plan";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";

const state: PlanSheetState = {
  tripName: "=cmd()",
  destination: "Jepang",
  dates: "10-12 Des 2026",
  travelers: 2,
  currency: "IDR",
  departure: "2026-12-10",
  totalMinor: 1_500_000_000,
  categories: [{ name: "Akomodasi" }, { name: "Makan & minum" }],
  items: [
    {
      id: ID1,
      date: "2026-12-10",
      start: "09:30",
      end: "11:00",
      title: "Senso-ji",
      location: "Asakusa",
      notes: "+pagi",
      costMinor: 5_000_000,
      currency: "IDR",
      category: "sightseeing",
      lat: 35.71,
      lng: 139.79,
    },
    {
      id: ID2,
      date: "2026-12-11",
      start: "",
      end: "",
      title: "Bebas",
      location: "",
      notes: "",
      costMinor: 0,
      currency: "IDR",
      category: "",
      lat: null,
      lng: null,
    },
  ],
  prep: [{ id: ID1, title: "Cek visa", due: "2026-11-20", done: false }],
  plan: {
    city: "Tokyo",
    tier: "nyaman",
    budget: [{ name: "Akomodasi", amountIdr: 4_400_000, basis: "perkiraan" }],
    research: {
      outbound: { priceIdr: 3_000_000, date: "2026-12-10" },
      originCode: "CGK",
      destinationCode: "TYO",
      esim: { name: "Jepang 5GB", days: 7, priceIdr: 120_000 },
      guides: [{ title: "Tax Refund", slug: "tax-refund-jepang-2026" }],
    },
    costs: { foodMid: 300_000 },
    updatedAt: "2026-11-10",
  },
  fxFromIdr: 1,
};

describe("plan tabs: what is written", () => {
  const write = buildPlanWrite(state);
  const at = (range: string) => write.raw.find((r) => r.range === range);
  it("writes the itinerary with IDs, guarded text, cost and map links", () => {
    const rows = at(`${PLAN_TAB}!A1`)!.values;
    expect(rows[0]).toEqual([...PLAN_HEADER]);
    expect(rows[1]).toEqual([
      ID1,
      "2026-12-10",
      "09:30",
      "11:00",
      "Senso-ji",
      "Asakusa",
      "'+pagi",
      50_000,
      "sightseeing",
      1,
      "Ya",
    ]);
    expect(rows[2]![10]).toBe("Belum");
    const links = write.formulas.find((f) => f.range === `${PLAN_TAB}!L1`)!.values;
    expect(links[1]![0]).toContain("maps/search/?api=1&query=35.71,139.79");
    expect(links[2]![0]).toContain("query=Bebas");
  });
  it("guards a title that would be read as a formula", () => {
    expect(at(`${SUMMARY_TAB}!A1`)!.values[0]![0]).toBe("'=cmd()");
  });
  it("ties the summary to the Anggaran tab with formulas, and shows Travo's estimate beside them", () => {
    const f = write.formulas.find((x) => x.range === `${SUMMARY_TAB}!C9`)!.values;
    expect(f[0]).toEqual(["=Anggaran!B9", "=Anggaran!C9", "=Anggaran!D9", "=Anggaran!E9"]);
    expect(write.formulas.find((x) => x.range === `${SUMMARY_TAB}!A5`)!.values[0]).toContain(
      "=Anggaran!B2",
    );
    expect(at(`${SUMMARY_TAB}!B9`)!.values).toEqual([[4_400_000], [""]]);
  });
  it("lists preparation with a real checkbox value and the ticket facts with their date", () => {
    expect(at(`${PREP_TAB}!A1`)!.values[1]).toEqual([
      ID1,
      "Cek visa",
      "2026-11-20",
      false,
      "Belum",
    ]);
    const tickets = at(`${TICKET_TAB}!A1`)!.values.map((r) => r.join(" | "));
    expect(
      tickets.some(
        (r) => r.includes("CGK → TYO") && r.includes("Rp 3.000.000") && r.includes("2026-12-10"),
      ),
    ).toBe(true);
    expect(tickets.some((r) => r.startsWith("eSIM: Jepang 5GB"))).toBe(true);
    expect(tickets.some((r) => r.includes("/panduan/tax-refund-jepang-2026"))).toBe(true);
  });
  it("says so when there is no plan yet", () => {
    const empty = buildPlanWrite({ ...state, plan: null });
    expect(empty.raw.find((r) => r.range === `${TICKET_TAB}!A1`)!.values[1]![0]).toBe(
      "Belum ada rencana",
    );
  });
});

const rows = (...items: (string | number | boolean | null)[][]) => [[...PLAN_HEADER], ...items];
const trip = { from: "2026-12-10", to: "2026-12-12" };

describe("plan tabs: reading the traveler's edits", () => {
  it("reads edits, new rows, and times typed as Sheets time values", () => {
    const parsed = parsePlanItems(
      rows(
        [ID1, "2026-12-10", 0.4375, "11:30", "Senso-ji pagi", "Asakusa", "catatan", "75.000"],
        ["", 46_366, "13:00", "14:00", "Makan siang", "Ueno", "", ""],
      ),
      trip,
    );
    expect(parsed.headerIntact).toBe(true);
    expect(parsed.keyed.get(ID1)).toMatchObject({
      date: "2026-12-10",
      start: "10:30",
      end: "11:30",
      title: "Senso-ji pagi",
      costMinor: 7_500_000,
    });
    expect(parsed.fresh).toHaveLength(1);
    expect(parsed.fresh[0]!.title).toBe("Makan siang");
    expect(parsed.issues).toEqual([]);
  });
  it("skips and reports invalid rows instead of guessing", () => {
    const parsed = parsePlanItems(
      rows(
        [ID1, "2026-12-30", "09:00", "10:00", "Di luar tanggal", "", "", ""],
        [ID2, "bukan tanggal", "09:00", "10:00", "Tanggal rusak", "", "", ""],
        ["abc", "2026-12-11", "09:00", "10:00", "ID rusak", "", "", ""],
        ["", "2026-12-11", "25:00", "", "Jam rusak", "", "", ""],
        ["", "2026-12-11", "10:00", "09:00", "Terbalik", "", "", ""],
        ["", "2026-12-11", "", "", "", "", "", ""],
        ["", "2026-12-11", "", "", "Biaya rusak", "", "", "-5"],
      ),
      trip,
    );
    expect(parsed.keyed.size + parsed.fresh.length).toBe(0);
    expect(parsed.issues.map((i) => i.reason)).toEqual([
      "Tanggal di luar tanggal perjalanan.",
      "Tanggal tidak terbaca. Pakai format 2026-12-10.",
      "ID tidak valid. Kosongkan untuk menambah aktivitas baru.",
      "Jam tidak terbaca. Pakai format 09:30.",
      "Jam selesai harus setelah jam mulai.",
      "Aktivitas wajib diisi (maks. 160 karakter).",
      "Perkiraan biaya harus angka 0 atau lebih.",
    ]);
    // A row with an ID that was invalid is still "present", so the app's version is kept, not deleted.
    expect([...parsed.presentKeys].sort()).toEqual([ID1, ID2].sort());
  });
  it("detects a damaged header so a missing row never means 'deleted'", () => {
    expect(parsePlanItems([["x", "y"]], trip).headerIntact).toBe(false);
  });
  it("fingerprints only the editable fields", () => {
    const base = {
      date: "2026-12-10",
      start: "09:00",
      end: "10:00",
      title: "A",
      location: "B",
      notes: "C",
      costMinor: 100,
    };
    expect(planItemHash(base)).toBe(planItemHash({ ...base, title: " A " }));
    expect(planItemHash(base)).not.toBe(planItemHash({ ...base, costMinor: 200 }));
  });
  it("reads the checkbox column only", () => {
    const parsed = parsePrep([
      [...PREP_HEADER],
      [ID1, "Cek visa", "2026-11-20", true, "Selesai"],
      [ID2, "Beli eSIM", "", "TRUE", ""],
      ["", "tanpa id", "", true, ""],
    ]);
    expect(parsed.headerIntact).toBe(true);
    expect(parsed.keyed.get(ID1)!.done).toBe(true);
    expect(parsed.keyed.get(ID2)!.done).toBe(true);
    expect(parsed.keyed.size).toBe(2);
  });
});

describe("plan tabs: the design", () => {
  const ids = new Map([
    [SUMMARY_TAB, 1],
    [PLAN_TAB, 2],
    [PREP_TAB, 3],
    [TICKET_TAB, 4],
  ]);
  it("dresses every tab in one batch (header colour, frozen rows, widths, chart, checkboxes)", () => {
    const requests = buildPlanFormat({
      ids,
      currency: "IDR",
      categoryCount: 4,
      itemCount: 8,
      prepCount: 5,
    });
    const kinds = requests.map((r) => Object.keys(r)[0]);
    for (const kind of [
      "updateSheetProperties",
      "mergeCells",
      "repeatCell",
      "addChart",
      "setDataValidation",
      "addConditionalFormatRule",
      "addProtectedRange",
      "updateDimensionProperties",
    ])
      expect(kinds).toContain(kind);
    const json = JSON.stringify(requests);
    expect(json).toContain('"pattern":"\\"Rp\\" #,##0"');
    expect(json).toContain("frozenRowCount");
    expect(
      JSON.stringify(
        buildPlanFormat({ ids, currency: "JPY", categoryCount: 1, itemCount: 0, prepCount: 0 }),
      ),
    ).toContain('"pattern":"#,##0"');
  });
  it("does nothing while a tab is missing", () => {
    expect(
      buildPlanFormat({
        ids: new Map([[SUMMARY_TAB, 1]]),
        currency: "IDR",
        categoryCount: 1,
        itemCount: 0,
        prepCount: 0,
      }),
    ).toEqual([]);
  });
});
