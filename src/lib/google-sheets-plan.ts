/**
 * The plan tabs of a trip's Google spreadsheet (Ringkasan, Itinerary, Persiapan, Tiket & Transport):
 * what is written, how the traveler's edits are read back, and how the sheet looks. Pure; the Google
 * calls live in google-sheets-plan.server.ts. They sit beside the existing Anggaran / Pengeluaran /
 * Rincian tabs of the same file, so budget, estimate and real spending are one set of numbers.
 */
import {
  BUDGET_TAB,
  CATEGORY_FIRST_ROW,
  EXPENSE_TAB,
  blank,
  hashOf,
  idCell,
  plainCell,
  readDate,
  readNumber,
  text,
  unplainCell,
  type Cell,
  type ParsedSheet,
  type Rows,
  type SheetIssue,
} from "./google-sheets-model";

export const SUMMARY_TAB = "Ringkasan";
export const PLAN_TAB = "Itinerary";
export const PREP_TAB = "Persiapan";
export const TICKET_TAB = "Tiket & Transport";
export const PLAN_TABS = [SUMMARY_TAB, PLAN_TAB, PREP_TAB, TICKET_TAB] as const;
/** Bump when the look or layout of the plan tabs changes: sheets of an older version are redone. */
export const PLAN_LAYOUT_VERSION = 1;

export const PLAN_HEADER = [
  "ID",
  "Tanggal",
  "Mulai",
  "Selesai",
  "Aktivitas",
  "Lokasi",
  "Catatan",
  "Perkiraan biaya",
  "Kategori",
  "Hari ke",
  "Pin",
  "Peta",
] as const;
export const PREP_HEADER = ["ID", "Persiapan", "Tenggat", "Selesai", "Status"] as const;

/** Brand palette for the sheet (0-1 RGB as the Sheets API wants it). */
const RED = { red: 0.82, green: 0.18, blue: 0.2 };
const GREY = { red: 0.95, green: 0.95, blue: 0.96 };
const BAND = { red: 0.985, green: 0.985, blue: 0.99 };
const WHITE = { red: 1, green: 1, blue: 1 };
const INK = { red: 0.1, green: 0.1, blue: 0.12 };
const MUTED = { red: 0.42, green: 0.44, blue: 0.48 };

/* ---------------------------------------------------------------------------- records */

export type PlanItemRec = {
  id: string;
  date: string;
  start: string;
  end: string;
  title: string;
  location: string;
  notes: string;
  costMinor: number;
  currency: string;
  category: string;
  lat: number | null;
  lng: number | null;
};
export type PrepRec = { id: string; title: string; due: string; done: boolean };

export type PlanBudgetLine = { name: string; amountIdr: number; basis: "tercatat" | "perkiraan" };
export type PlanFacts = {
  city: string;
  tier: string;
  budget: PlanBudgetLine[];
  research: {
    outbound?: { priceIdr: number; date: string } | null;
    returnLeg?: { priceIdr: number; date: string } | null;
    cheapestOutbound?: { priceIdr: number; date: string } | null;
    esim?: { name: string; days: number; priceIdr: number } | null;
    originCode?: string | null;
    destinationCode?: string | null;
    departureDate?: string | null;
    returnDate?: string | null;
    guides?: { title: string; slug: string }[];
  };
  costs: Record<string, number>;
  updatedAt: string;
};

export type PlanSheetState = {
  tripName: string;
  destination: string;
  dates: string;
  travelers: number;
  currency: string;
  departure: string | null;
  totalMinor: number;
  categories: { name: string }[];
  items: PlanItemRec[];
  prep: PrepRec[];
  plan: PlanFacts | null;
  /** Real budget lines (allocated and spent, minor units) and bookings, for the PDF / Drive document. */
  budgetRows?: { name: string; allocatedMinor: number; spentMinor: number }[];
  spentMinor?: number;
  bookings?: { title: string; category: string; status: string; reference: string }[];
  /** IDR → trip currency multiplier, to show the plan's estimates in the trip's currency. */
  fxFromIdr: number;
};

/* ----------------------------------------------------------------------------- hashes */

export const planItemHash = (i: {
  date: string;
  start: string;
  end: string;
  title: string;
  location: string;
  notes: string;
  costMinor: number;
}) =>
  hashOf([i.date, i.start, i.end, i.title.trim(), i.location.trim(), i.notes.trim(), i.costMinor]);
export const prepHash = (p: { done: boolean }) => hashOf([p.done]);

/* ------------------------------------------------------------------------------ write */

const mapsLink = (i: PlanItemRec) =>
  i.lat !== null && i.lng !== null
    ? `https://www.google.com/maps/search/?api=1&query=${i.lat},${i.lng}`
    : i.title
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${i.title} ${i.location}`.trim())}`
      : "";

const dayNumber = (date: string, departure: string | null) => {
  if (!departure) return "";
  const diff = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${departure}T00:00:00Z`)) / 86_400_000,
  );
  return diff >= 0 ? diff + 1 : "";
};

const moneyOf = (minor: number) => minor / 100;
const planMoney = (idr: number, fx: number) => Math.round(idr * fx);

export type PlanWrite = {
  raw: Array<{ range: string; values: Array<Array<string | number | boolean>> }>;
  /** Cells Sheets evaluates (USER_ENTERED): formulas and hyperlinks. */
  formulas: Array<{ range: string; values: string[][] }>;
  /** Row counts the format step needs. */
  rows: { categories: number; items: number; prep: number };
  /** Rows of the plan estimate table in Ringkasan (first row 1-based, count). */
  estimate: { first: number; count: number };
};

export function buildPlanWrite(state: PlanSheetState): PlanWrite {
  const cats = state.categories;
  const estimates = new Map(
    (state.plan?.budget ?? []).map((l) => [
      l.name.toLowerCase(),
      planMoney(l.amountIdr, state.fxFromIdr),
    ]),
  );
  // Summary -------------------------------------------------------------------------------
  const tableHeader = 8;
  const tableFirst = tableHeader + 1;
  const catCount = Math.max(cats.length, 1);
  const summaryRaw: PlanWrite["raw"] = [
    {
      range: `${SUMMARY_TAB}!A1`,
      values: [
        [plainCell(state.tripName)],
        [plainCell(`${state.destination} · ${state.dates} · ${state.travelers} traveler`)],
        [],
        ["Total anggaran", "", "Terpakai", "", "Sisa", "", "Terpakai (%)", ""],
      ],
    },
    {
      range: `${SUMMARY_TAB}!A7`,
      values: [["Anggaran per kategori"]],
    },
    {
      range: `${SUMMARY_TAB}!A${tableHeader}`,
      values: [
        [
          "Kategori",
          `Perkiraan Travo (${state.currency})`,
          `Anggaran (${state.currency})`,
          `Terpakai (${state.currency})`,
          `Sisa (${state.currency})`,
          "% terpakai",
        ],
      ],
    },
  ];
  const summaryFormulas: PlanWrite["formulas"] = [
    {
      range: `${SUMMARY_TAB}!A5`,
      values: [
        [
          `=${BUDGET_TAB}!B1`,
          "",
          `=${BUDGET_TAB}!B2`,
          "",
          `=${BUDGET_TAB}!B3`,
          "",
          `=${BUDGET_TAB}!B4`,
          "",
        ],
      ],
    },
  ];
  if (cats.length) {
    summaryFormulas.push(
      {
        range: `${SUMMARY_TAB}!A${tableFirst}`,
        values: cats.map((_, i) => [`=${BUDGET_TAB}!A${CATEGORY_FIRST_ROW + i}`]),
      },
      {
        range: `${SUMMARY_TAB}!C${tableFirst}`,
        values: cats.map((_, i) => {
          const r = CATEGORY_FIRST_ROW + i;
          return [
            `=${BUDGET_TAB}!B${r}`,
            `=${BUDGET_TAB}!C${r}`,
            `=${BUDGET_TAB}!D${r}`,
            `=${BUDGET_TAB}!E${r}`,
          ];
        }),
      },
    );
    // The estimate column is a plain number per category (blank when Travo made none for it).
    summaryRaw.push({
      range: `${SUMMARY_TAB}!B${tableFirst}`,
      values: cats.map((c) => [estimates.get(c.name.toLowerCase()) ?? ""]),
    });
  } else {
    summaryRaw.push({
      range: `${SUMMARY_TAB}!A${tableFirst}`,
      values: [["Belum ada kategori anggaran"]],
    });
  }
  const afterTable = tableFirst + catCount + 1;
  summaryRaw.push({ range: `${SUMMARY_TAB}!A${afterTable}`, values: [["Agenda dan persiapan"]] });
  summaryFormulas.push({
    range: `${SUMMARY_TAB}!A${afterTable + 1}`,
    values: [
      ["Aktivitas terjadwal", `=COUNTA(${PLAN_TAB}!A2:A)`],
      ["Persiapan selesai", `=COUNTIF(${PREP_TAB}!D2:D,TRUE)&" dari "&COUNTA(${PREP_TAB}!A2:A)`],
      ["Pengeluaran tercatat", `=COUNTA(${EXPENSE_TAB}!A2:A)`],
    ],
  });
  const plan = state.plan;
  if (plan) {
    const out = plan.research.outbound;
    const lines: Array<Array<string | number>> = [
      ["Kota rencana", plainCell(plan.city)],
      ["Gaya anggaran Travo", plan.tier === "hemat" ? "Hemat (perkiraan)" : "Nyaman (perkiraan)"],
    ];
    if (out)
      lines.push([
        "Tiket pergi per orang (tercatat)",
        `Rp ${Math.round(out.priceIdr).toLocaleString("id-ID")} · ${out.date}`,
      ]);
    summaryRaw.push({ range: `${SUMMARY_TAB}!A${afterTable + 5}`, values: lines });
  }

  // Itinerary -----------------------------------------------------------------------------
  const itemRaw: Array<Array<string | number>> = [[...PLAN_HEADER]];
  const itemFormulas: string[][] = [[PLAN_HEADER[11]]];
  for (const i of state.items) {
    itemRaw.push([
      i.id,
      i.date,
      i.start,
      i.end,
      plainCell(i.title),
      plainCell(i.location),
      plainCell(i.notes),
      i.costMinor ? moneyOf(i.costMinor) : "",
      i.category,
      dayNumber(i.date, state.departure),
      i.lat !== null && i.lng !== null ? "Ya" : "Belum",
    ]);
    const link = mapsLink(i);
    itemFormulas.push([link ? `=HYPERLINK("${link}","Buka")` : ""]);
  }
  // Preparation ---------------------------------------------------------------------------
  const prepRaw: Array<Array<string | number | boolean>> = [[...PREP_HEADER]];
  for (const p of state.prep)
    prepRaw.push([p.id, plainCell(p.title), p.due, p.done, p.done ? "Selesai" : "Belum"]);
  // Tickets & transport -------------------------------------------------------------------
  const ticketRows: Array<Array<string | number>> = [["Tiket dan transport", "Nilai", "Catatan"]];
  const ticketFormulas: Array<{ range: string; values: string[][] }> = [];
  if (plan) {
    const r = plan.research;
    const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
    const route = r.originCode && r.destinationCode ? `${r.originCode} → ${r.destinationCode}` : "";
    if (r.outbound)
      ticketRows.push([
        `Tiket pergi ${route}`.trim(),
        rp(r.outbound.priceIdr),
        `Harga terendah tercatat ${r.outbound.date}, per orang. Cek lagi saat membeli.`,
      ]);
    if (r.returnLeg)
      ticketRows.push([
        `Tiket pulang ${route.split(" → ").reverse().join(" → ")}`.trim(),
        rp(r.returnLeg.priceIdr),
        `Harga terendah tercatat ${r.returnLeg.date}, per orang.`,
      ]);
    if (r.cheapestOutbound && r.outbound && r.cheapestOutbound.priceIdr < r.outbound.priceIdr)
      ticketRows.push([
        "Saran tanggal hemat",
        rp(r.cheapestOutbound.priceIdr),
        `Berangkat ${r.cheapestOutbound.date} lebih murah ${rp(r.outbound.priceIdr - r.cheapestOutbound.priceIdr)} per orang.`,
      ]);
    if (!r.outbound && !r.returnLeg)
      ticketRows.push([
        "Tiket pesawat",
        "Belum tercatat",
        "Isi kota asal di Edit perjalanan lalu minta Travo membuat ulang rencana.",
      ]);
    if (r.esim)
      ticketRows.push([
        `eSIM: ${plainCell(r.esim.name)}`,
        rp(r.esim.priceIdr),
        `${r.esim.days} hari, per orang.`,
      ]);
    ticketRows.push(["", "", ""]);
    ticketRows.push([
      "Biaya harian kota (perkiraan)",
      "Rupiah",
      `Kota ${plan.city}. Dibuat Travo dan bisa diubah tim Djiwa.`,
    ]);
    const labels: Array<[string, string]> = [
      ["foodBudget", "Makan hemat, per orang per hari"],
      ["foodMid", "Makan nyaman, per orang per hari"],
      ["transportDay", "Transport lokal, per orang per hari"],
      ["attractionsDay", "Tiket wisata, per orang per hari"],
      ["hotelBudget", "Hotel hemat, per kamar per malam"],
      ["hotelMid", "Hotel nyaman, per kamar per malam"],
    ];
    for (const [key, label] of labels)
      if (typeof plan.costs[key] === "number")
        ticketRows.push([label, rp(plan.costs[key]!), "Perkiraan"]);
    if (r.guides?.length) {
      ticketRows.push(["", "", ""]);
      ticketRows.push(["Panduan terkait", "", ""]);
      r.guides.forEach((g) =>
        ticketRows.push([plainCell(g.title), "", `https://djiwatravel.com/panduan/${g.slug}`]),
      );
    }
  } else {
    ticketRows.push([
      "Belum ada rencana",
      "",
      "Minta Travo “Rencana lengkap” di Ringkas untuk mengisi tab ini.",
    ]);
  }

  return {
    raw: [
      ...summaryRaw,
      { range: `${PLAN_TAB}!A1`, values: itemRaw },
      { range: `${PREP_TAB}!A1`, values: prepRaw },
      { range: `${TICKET_TAB}!A1`, values: ticketRows },
    ],
    formulas: [
      ...summaryFormulas,
      { range: `${PLAN_TAB}!L1`, values: itemFormulas },
      ...ticketFormulas,
    ],
    rows: { categories: catCount, items: state.items.length, prep: state.prep.length },
    estimate: { first: tableFirst, count: catCount },
  };
}

/* ------------------------------------------------------------------------------- read */

const timeCell = (cell: Cell): string | null => {
  if (cell === null || cell === undefined || text(cell) === "") return "";
  if (typeof cell === "number" && cell >= 0 && cell < 1) {
    const minutes = Math.round(cell * 24 * 60);
    return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  const m = text(cell).match(/^(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59
    ? `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
    : null;
};

export type SheetPlanItem = {
  row: number;
  date: string;
  start: string;
  end: string;
  title: string;
  location: string;
  notes: string;
  costMinor: number;
};

/**
 * Reads the Itinerary tab: ID, date, times, title, location, notes and cost are the traveler's to
 * edit; day, pin, category and map link are ours. A row without an ID is a new activity.
 */
export function parsePlanItems(
  rows: Rows,
  trip: { from: string | null; to: string | null },
): ParsedSheet<SheetPlanItem> {
  const header = rows[0] ?? [];
  const parsed: ParsedSheet<SheetPlanItem> = {
    headerIntact:
      text(header[0]) === PLAN_HEADER[0] &&
      text(header[1]) === PLAN_HEADER[1] &&
      text(header[4]) === PLAN_HEADER[4],
    presentKeys: new Set(),
    keyed: new Map(),
    fresh: [],
    issues: [],
  };
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (blank(row, 0, 8) || !row) continue;
    const rowNumber = i + 1;
    const fail = (reason: string) =>
      parsed.issues.push({ tab: PLAN_TAB, row: rowNumber, reason } satisfies SheetIssue);
    const keyText = text(row[0]);
    const key = idCell(row[0]);
    if (keyText && !key) {
      fail("ID tidak valid. Kosongkan untuk menambah aktivitas baru.");
      continue;
    }
    if (key) parsed.presentKeys.add(key);
    const title = unplainCell(text(row[4])).replace(/\s+/g, " ");
    if (!title || title.length > 160) {
      fail("Aktivitas wajib diisi (maks. 160 karakter).");
      continue;
    }
    const date = readDate(row[1]);
    if (!date) {
      fail("Tanggal tidak terbaca. Pakai format 2026-12-10.");
      continue;
    }
    if ((trip.from && date < trip.from) || (trip.to && date > trip.to)) {
      fail("Tanggal di luar tanggal perjalanan.");
      continue;
    }
    const start = timeCell(row[2]);
    const end = timeCell(row[3]);
    if (start === null || end === null) {
      fail("Jam tidak terbaca. Pakai format 09:30.");
      continue;
    }
    if (start && end && end <= start) {
      fail("Jam selesai harus setelah jam mulai.");
      continue;
    }
    const cost = text(row[7]) === "" ? 0 : readNumber(row[7]);
    if (cost === null || cost < 0) {
      fail("Perkiraan biaya harus angka 0 atau lebih.");
      continue;
    }
    const value: SheetPlanItem = {
      row: rowNumber,
      date,
      start,
      end,
      title,
      location: unplainCell(text(row[5])).slice(0, 200),
      notes: unplainCell(text(row[6])).slice(0, 2000),
      costMinor: Math.round(cost * 100),
    };
    if (key) parsed.keyed.set(key, value);
    else parsed.fresh.push(value);
  }
  return parsed;
}

export type SheetPrep = { row: number; done: boolean };

/** Reads the Persiapan tab: only the "Selesai" checkbox is the traveler's to change. */
export function parsePrep(rows: Rows): ParsedSheet<SheetPrep> {
  const header = rows[0] ?? [];
  const parsed: ParsedSheet<SheetPrep> = {
    headerIntact: text(header[0]) === PREP_HEADER[0] && text(header[3]) === PREP_HEADER[3],
    presentKeys: new Set(),
    keyed: new Map(),
    fresh: [],
    issues: [],
  };
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const key = idCell(row[0]);
    if (!key) continue;
    parsed.presentKeys.add(key);
    const cell = row[3];
    const done =
      cell === true || (typeof cell === "string" && /^(true|ya|selesai|x|✓)$/i.test(cell.trim()));
    parsed.keyed.set(key, { row: i + 1, done });
  }
  return parsed;
}

/* ----------------------------------------------------------------------------- format */

type Ids = Map<string, number>;
const grid = (sheetId: number, r0: number, r1: number, c0: number, c1: number) => ({
  sheetId,
  startRowIndex: r0,
  endRowIndex: r1,
  startColumnIndex: c0,
  endColumnIndex: c1,
});
const fill = (range: object, color: object, extra: Record<string, unknown> = {}, fields = "") => ({
  repeatCell: {
    range,
    cell: { userEnteredFormat: { backgroundColor: color, ...extra } },
    fields: `userEnteredFormat(backgroundColor${fields})`,
  },
});
const widths = (sheetId: number, sizes: number[]) =>
  sizes.map((pixelSize, index) => ({
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
      properties: { pixelSize },
      fields: "pixelSize",
    },
  }));
const header = (sheetId: number, cols: number) =>
  fill(
    grid(sheetId, 0, 1, 0, cols),
    RED,
    {
      textFormat: { bold: true, foregroundColor: WHITE, fontSize: 10 },
      verticalAlignment: "MIDDLE",
      horizontalAlignment: "LEFT",
    },
    ",textFormat,verticalAlignment,horizontalAlignment",
  );
const band = (sheetId: number, r0: number, r1: number, c1: number) => ({
  addConditionalFormatRule: {
    index: 0,
    rule: {
      ranges: [grid(sheetId, r0, r1, 0, c1)],
      booleanRule: {
        condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: "=ISEVEN(ROW())" }] },
        format: { backgroundColor: BAND },
      },
    },
  },
});

export type PlanFormatInput = {
  ids: Ids;
  currency: string;
  categoryCount: number;
  itemCount: number;
  prepCount: number;
};

/**
 * One batchUpdate that dresses the plan tabs: brand header, frozen rows, widths, number formats,
 * banding, a progress bar on "% terpakai", a budget chart, checkboxes, tab colours, and soft
 * protection on what Djiwa fills. Safe to repeat.
 */
export function buildPlanFormat(input: PlanFormatInput): Array<Record<string, unknown>> {
  const { ids } = input;
  const sum = ids.get(SUMMARY_TAB);
  const plan = ids.get(PLAN_TAB);
  const prep = ids.get(PREP_TAB);
  const ticket = ids.get(TICKET_TAB);
  if (sum === undefined || plan === undefined || prep === undefined || ticket === undefined)
    return [];
  const money = input.currency === "IDR" ? '"Rp" #,##0' : "#,##0";
  const tableHeaderRow = 7; // zero-based index of row 8
  const first = tableHeaderRow + 1;
  const last = first + Math.max(input.categoryCount, 1);
  const requests: Array<Record<string, unknown>> = [
    // Tab colours and frozen rows
    ...[
      [sum, RED],
      [plan, { red: 0.2, green: 0.5, blue: 0.9 }],
      [prep, { red: 0.2, green: 0.65, blue: 0.4 }],
      [ticket, { red: 0.95, green: 0.6, blue: 0.1 }],
    ].map(([id, color]) => ({
      updateSheetProperties: {
        properties: { sheetId: id, tabColorStyle: { rgbColor: color } },
        fields: "tabColorStyle",
      },
    })),
    ...[plan, prep, ticket].map((id) => ({
      updateSheetProperties: {
        properties: { sheetId: id, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    })),
    {
      updateSheetProperties: {
        properties: { sheetId: sum, gridProperties: { hideGridlines: true } },
        fields: "gridProperties.hideGridlines",
      },
    },
    // ---- Ringkasan
    ...widths(sum, [210, 150, 150, 150, 150, 110, 150, 40]),
    { mergeCells: { range: grid(sum, 0, 1, 0, 8), mergeType: "MERGE_ALL" } },
    { mergeCells: { range: grid(sum, 1, 2, 0, 8), mergeType: "MERGE_ALL" } },
    fill(
      grid(sum, 0, 1, 0, 8),
      RED,
      {
        textFormat: { bold: true, fontSize: 18, foregroundColor: WHITE },
        verticalAlignment: "MIDDLE",
      },
      ",textFormat,verticalAlignment",
    ),
    fill(
      grid(sum, 1, 2, 0, 8),
      RED,
      {
        textFormat: { fontSize: 10, foregroundColor: { red: 1, green: 0.88, blue: 0.88 } },
        verticalAlignment: "MIDDLE",
      },
      ",textFormat,verticalAlignment",
    ),
    {
      updateDimensionProperties: {
        range: { sheetId: sum, dimension: "ROWS", startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 46 },
        fields: "pixelSize",
      },
    },
    ...[0, 2, 4, 6].flatMap((c) => [
      { mergeCells: { range: grid(sum, 3, 4, c, c + 2), mergeType: "MERGE_ALL" } },
      { mergeCells: { range: grid(sum, 4, 5, c, c + 2), mergeType: "MERGE_ALL" } },
      fill(
        grid(sum, 3, 4, c, c + 2),
        GREY,
        {
          textFormat: { fontSize: 9, bold: true, foregroundColor: MUTED },
          horizontalAlignment: "CENTER",
        },
        ",textFormat,horizontalAlignment",
      ),
      fill(
        grid(sum, 4, 5, c, c + 2),
        GREY,
        {
          textFormat: { fontSize: 16, bold: true, foregroundColor: INK },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
          numberFormat:
            c === 6 ? { type: "PERCENT", pattern: "0%" } : { type: "NUMBER", pattern: money },
        },
        ",textFormat,horizontalAlignment,verticalAlignment,numberFormat",
      ),
    ]),
    {
      updateDimensionProperties: {
        range: { sheetId: sum, dimension: "ROWS", startIndex: 4, endIndex: 5 },
        properties: { pixelSize: 42 },
        fields: "pixelSize",
      },
    },
    ...[6, last + 1].map((row) => ({
      repeatCell: {
        range: grid(sum, row, row + 1, 0, 8),
        cell: {
          userEnteredFormat: { textFormat: { bold: true, fontSize: 12, foregroundColor: RED } },
        },
        fields: "userEnteredFormat.textFormat",
      },
    })),
    header(sum, 6),
    {
      repeatCell: {
        range: grid(sum, first, last, 1, 5),
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "NUMBER", pattern: money },
            horizontalAlignment: "RIGHT",
          },
        },
        fields: "userEnteredFormat(numberFormat,horizontalAlignment)",
      },
    },
    {
      repeatCell: {
        range: grid(sum, first, last, 5, 6),
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "PERCENT", pattern: "0%" },
            horizontalAlignment: "RIGHT",
          },
        },
        fields: "userEnteredFormat(numberFormat,horizontalAlignment)",
      },
    },
    band(sum, first, last, 6),
    // % terpakai: green below 80%, amber to 100%, red over
    ...[
      { type: "NUMBER_LESS", value: "0.8", color: { red: 0.8, green: 0.94, blue: 0.82 } },
      {
        type: "NUMBER_BETWEEN",
        value: "0.8",
        value2: "1",
        color: { red: 1, green: 0.93, blue: 0.7 },
      },
      { type: "NUMBER_GREATER", value: "1", color: { red: 0.98, green: 0.78, blue: 0.78 } },
    ].map((rule, index) => ({
      addConditionalFormatRule: {
        index,
        rule: {
          ranges: [grid(sum, first, last, 5, 6), grid(sum, 4, 5, 6, 8)],
          booleanRule: {
            condition: {
              type: rule.type,
              values: [
                { userEnteredValue: rule.value },
                ...(rule.value2 ? [{ userEnteredValue: rule.value2 }] : []),
              ],
            },
            format: { backgroundColor: rule.color },
          },
        },
      },
    })),
    // Budget chart beside the table
    {
      addChart: {
        chart: {
          spec: {
            title: "Anggaran dan terpakai per kategori",
            basicChart: {
              chartType: "COLUMN",
              legendPosition: "BOTTOM_LEGEND",
              axis: [{ position: "BOTTOM_AXIS" }, { position: "LEFT_AXIS" }],
              domains: [
                { domain: { sourceRange: { sources: [grid(sum, tableHeaderRow, last, 0, 1)] } } },
              ],
              series: [2, 3].map((col, i) => ({
                series: {
                  sourceRange: { sources: [grid(sum, tableHeaderRow, last, col, col + 1)] },
                },
                targetAxis: "LEFT_AXIS",
                color: i === 0 ? { red: 0.75, green: 0.78, blue: 0.84 } : RED,
              })),
              headerCount: 1,
            },
          },
          position: {
            overlayPosition: {
              anchorCell: {
                sheetId: sum,
                rowIndex: first + Math.max(input.categoryCount, 1) + 7,
                columnIndex: 0,
              },
              widthPixels: 760,
              heightPixels: 300,
            },
          },
        },
      },
    },
    // ---- Itinerary
    ...widths(plan, [10, 95, 62, 62, 240, 180, 260, 130, 100, 70, 62, 70]),
    header(plan, 12),
    {
      repeatCell: {
        range: grid(plan, 1, 2000, 1, 12),
        cell: { userEnteredFormat: { verticalAlignment: "MIDDLE" } },
        fields: "userEnteredFormat.verticalAlignment",
      },
    },
    {
      repeatCell: {
        range: grid(plan, 1, 2000, 7, 8),
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "NUMBER", pattern: money },
            horizontalAlignment: "RIGHT",
          },
        },
        fields: "userEnteredFormat(numberFormat,horizontalAlignment)",
      },
    },
    {
      repeatCell: {
        range: grid(plan, 1, 2000, 9, 11),
        cell: {
          userEnteredFormat: {
            horizontalAlignment: "CENTER",
            textFormat: { foregroundColor: MUTED },
          },
        },
        fields: "userEnteredFormat(horizontalAlignment,textFormat)",
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId: plan, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
        properties: { hiddenByUser: true },
        fields: "hiddenByUser",
      },
    },
    band(plan, 1, 2000, 12),
    {
      addConditionalFormatRule: {
        index: 0,
        rule: {
          ranges: [grid(plan, 1, 2000, 10, 11)],
          booleanRule: {
            condition: { type: "TEXT_EQ", values: [{ userEnteredValue: "Belum" }] },
            format: { backgroundColor: { red: 1, green: 0.93, blue: 0.7 } },
          },
        },
      },
    },
    {
      addProtectedRange: {
        protectedRange: {
          range: grid(plan, 0, 2000, 8, 12),
          description: "Diisi otomatis oleh Djiwa Travel",
          warningOnly: true,
        },
      },
    },
    {
      addProtectedRange: {
        protectedRange: {
          range: grid(plan, 0, 2000, 0, 1),
          description: "ID dikelola Djiwa Travel",
          warningOnly: true,
        },
      },
    },
    // ---- Persiapan
    ...widths(prep, [10, 380, 110, 80, 90]),
    header(prep, 5),
    {
      setDataValidation: {
        range: grid(prep, 1, 500, 3, 4),
        rule: { condition: { type: "BOOLEAN" }, strict: true, showCustomUi: true },
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId: prep, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
        properties: { hiddenByUser: true },
        fields: "hiddenByUser",
      },
    },
    band(prep, 1, 500, 5),
    {
      addConditionalFormatRule: {
        index: 0,
        rule: {
          ranges: [grid(prep, 1, 500, 0, 5)],
          booleanRule: {
            condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: "=$D2=TRUE" }] },
            format: { textFormat: { strikethrough: true, foregroundColor: MUTED } },
          },
        },
      },
    },
    {
      addProtectedRange: {
        protectedRange: {
          range: grid(prep, 0, 500, 4, 5),
          description: "Diisi otomatis oleh Djiwa Travel",
          warningOnly: true,
        },
      },
    },
    // ---- Tiket & Transport
    ...widths(ticket, [300, 160, 520]),
    header(ticket, 3),
    band(ticket, 1, 200, 3),
  ];
  // Section rows in the ticket tab keep the soft red heading look.
  requests.push(
    fill(
      grid(ticket, 0, 1, 0, 3),
      RED,
      { textFormat: { bold: true, foregroundColor: WHITE } },
      ",textFormat",
    ),
  );
  return requests;
}
