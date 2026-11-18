/**
 * Shared date-range model for every Admin analytics surface (Analitik, Dashboard, Pelanggan).
 * Pure and timezone-fixed to WIB (UTC+7, no DST), so every rule is unit-tested. A range resolves
 * to a half-open window [from, to) plus the comparison window right before it.
 */

export const RANGE_KEYS = [
  "24j",
  "hari-ini",
  "kemarin",
  "7h",
  "30h",
  "90h",
  "minggu-ini",
  "minggu-lalu",
  "bulan-ini",
  "bulan-lalu",
  "tahun-ini",
  "365h",
  "semua",
  "kustom",
] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABEL: Record<RangeKey, string> = {
  "24j": "24 jam",
  "hari-ini": "Hari ini",
  kemarin: "Kemarin",
  "7h": "7 hari",
  "30h": "30 hari",
  "90h": "90 hari",
  "minggu-ini": "Minggu ini",
  "minggu-lalu": "Minggu lalu",
  "bulan-ini": "Bulan ini",
  "bulan-lalu": "Bulan lalu",
  "tahun-ini": "Tahun ini",
  "365h": "1 tahun",
  semua: "Semua",
  kustom: "Rentang tanggal",
};

/** Presets shown in the picker, grouped the way people think about them. */
export const RANGE_GROUPS: { title: string; keys: RangeKey[] }[] = [
  { title: "Harian", keys: ["hari-ini", "kemarin", "24j"] },
  { title: "Mingguan", keys: ["7h", "minggu-ini", "minggu-lalu"] },
  { title: "Bulanan", keys: ["30h", "bulan-ini", "bulan-lalu", "90h"] },
  { title: "Tahunan", keys: ["tahun-ini", "365h", "semua"] },
];

export type Granularity = "hour" | "day";

export type ResolvedRange = {
  key: RangeKey;
  label: string;
  from: Date;
  /** Exclusive end. */
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  granularity: Granularity;
  /** Calendar days covered (at least 1). */
  days: number;
  /** First and last day shown, YYYY-MM-DD in WIB (last is inclusive). */
  fromDay: string;
  toDay: string;
  custom: boolean;
};

export type RangeInput = {
  range?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WIB = 7 * HOUR;
const MAX_CUSTOM_DAYS = 366;
const ALL_SINCE = Date.UTC(2020, 0, 1) - WIB;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const dayStartMs = (y: number, m: number, d: number) => Date.UTC(y, m, d) - WIB;

/** Calendar parts of an instant in WIB. */
function parts(ms: number) {
  const d = new Date(ms + WIB);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay() };
}

export const toDayString = (ms: number) => {
  const p = parts(ms);
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
};

export function parseDay(value: string | undefined | null): number | null {
  if (!value || !DAY_RE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const ms = dayStartMs(y, m - 1, d);
  return toDayString(ms) === value ? ms : null;
}

export function isRangeKey(value: unknown): value is RangeKey {
  return typeof value === "string" && (RANGE_KEYS as readonly string[]).includes(value);
}

/** Old links used `all`; keep them working. */
export function normalizeRangeKey(value: unknown, fallback: RangeKey): RangeKey {
  if (value === "all") return "semua";
  return isRangeKey(value) ? value : fallback;
}

export function resolveRange(
  input: RangeInput = {},
  fallback: RangeKey = "30h",
  now: Date = new Date(),
): ResolvedRange {
  const nowMs = now.getTime();
  const t = parts(nowMs);
  const today = dayStartMs(t.y, t.m, t.d);
  const tomorrow = today + DAY;
  let key = normalizeRangeKey(input.range, fallback);
  let from = today;
  let to = tomorrow;
  let prevFrom = 0;
  let prevTo = 0;
  let granularity: Granularity = "day";

  const fromCustom = parseDay(input.from);
  const toCustom = parseDay(input.to);
  if (key === "kustom") {
    if (fromCustom === null || toCustom === null) key = fallback === "kustom" ? "30h" : fallback;
  }

  const rolling = (days: number) => {
    from = today - (days - 1) * DAY;
    to = tomorrow;
    prevFrom = from - days * DAY;
    prevTo = from;
  };

  switch (key) {
    case "24j":
      from = nowMs - 24 * HOUR;
      to = nowMs;
      prevFrom = from - 24 * HOUR;
      prevTo = from;
      granularity = "hour";
      break;
    case "hari-ini":
      from = today;
      to = tomorrow;
      prevFrom = today - DAY;
      prevTo = today - DAY + (nowMs - today);
      granularity = "hour";
      break;
    case "kemarin":
      from = today - DAY;
      to = today;
      prevFrom = from - DAY;
      prevTo = from;
      granularity = "hour";
      break;
    case "7h":
      rolling(7);
      break;
    case "30h":
      rolling(30);
      break;
    case "90h":
      rolling(90);
      break;
    case "365h":
      rolling(365);
      break;
    case "minggu-ini": {
      const sinceMonday = (t.dow + 6) % 7;
      from = today - sinceMonday * DAY;
      to = tomorrow;
      prevFrom = from - 7 * DAY;
      prevTo = Math.min(prevFrom + (to - from), from);
      break;
    }
    case "minggu-lalu": {
      const sinceMonday = (t.dow + 6) % 7;
      to = today - sinceMonday * DAY;
      from = to - 7 * DAY;
      prevFrom = from - 7 * DAY;
      prevTo = from;
      break;
    }
    case "bulan-ini": {
      from = dayStartMs(t.y, t.m, 1);
      to = tomorrow;
      prevFrom = dayStartMs(t.y, t.m - 1, 1);
      prevTo = Math.min(prevFrom + (to - from), from);
      break;
    }
    case "bulan-lalu": {
      from = dayStartMs(t.y, t.m - 1, 1);
      to = dayStartMs(t.y, t.m, 1);
      prevFrom = dayStartMs(t.y, t.m - 2, 1);
      prevTo = from;
      break;
    }
    case "tahun-ini": {
      from = dayStartMs(t.y, 0, 1);
      to = tomorrow;
      prevFrom = dayStartMs(t.y - 1, 0, 1);
      prevTo = Math.min(prevFrom + (to - from), from);
      break;
    }
    case "semua":
      from = ALL_SINCE;
      to = tomorrow;
      prevFrom = from - (to - from);
      prevTo = from;
      break;
    case "kustom": {
      let a = fromCustom as number;
      let b = toCustom as number;
      if (a > b) [a, b] = [b, a];
      if ((b - a) / DAY + 1 > MAX_CUSTOM_DAYS) a = b - (MAX_CUSTOM_DAYS - 1) * DAY;
      from = a;
      to = b + DAY;
      prevFrom = from - (to - from);
      prevTo = from;
      granularity = to - from <= DAY ? "hour" : "day";
      break;
    }
  }

  const days = Math.max(1, Math.round((to - from) / DAY));
  return {
    key,
    label: RANGE_LABEL[key],
    from: new Date(from),
    to: new Date(to),
    prevFrom: new Date(prevFrom),
    prevTo: new Date(prevTo),
    granularity,
    days,
    fromDay: toDayString(from),
    toDay: toDayString(Math.max(from, to - 1)),
    custom: key === "kustom",
  };
}

const DAY_FMT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});
const DAY_FMT_Y = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

/** "1 Nov – 19 Nov 2026" style caption for a resolved range. */
export function describeRange(range: ResolvedRange): string {
  const a = new Date(range.from);
  const b = new Date(Math.max(range.from.getTime(), range.to.getTime() - 1));
  if (range.key === "24j") return "24 jam terakhir";
  if (range.fromDay === range.toDay) return DAY_FMT_Y.format(a);
  return `${DAY_FMT.format(a)} – ${DAY_FMT_Y.format(b)}`;
}

/** Search params for links: keeps `from`/`to` only for a custom range. */
export function rangeSearch(range: RangeKey, from?: string, to?: string) {
  return range === "kustom" && from && to
    ? { range, from, to }
    : { range, from: undefined, to: undefined };
}

/** SQL timestamp literal from a validated Date (ISO output, no user text). */
export const sqlTs = (value: Date) => `timestamptz '${value.toISOString()}'`;

/** Percent change against the comparison window, null when there is no base. */
export function changePct(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
