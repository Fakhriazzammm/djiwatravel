/**
 * Small, honest reader for OpenStreetMap `opening_hours` values (the tag Nominatim returns).
 * It understands the common shapes: `24/7`, day ranges and lists, one or more time ranges, `off`,
 * rules that override earlier ones, and times that run past midnight. Anything else (public
 * holidays, months, weeks, sunrise, "+" ranges, comments) makes the answer `null` = unknown, so the
 * assistant says "cek jam buka" instead of guessing.
 */

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
type Interval = [number, number];

const toMinutes = (hh: string, mm: string) => Number(hh) * 60 + Number(mm);

function parseDays(spec: string): number[] | null {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const m = part.trim().match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
    if (!m) return null;
    const a = DAYS.indexOf(m[1] as (typeof DAYS)[number]);
    const b = m[2] ? DAYS.indexOf(m[2] as (typeof DAYS)[number]) : a;
    for (let i = a; ; i = (i + 1) % 7) {
      out.add(i);
      if (i === b) break;
    }
  }
  return [...out];
}

function parseTimes(spec: string): Interval[] | null {
  const out: Interval[] = [];
  for (const part of spec.split(",")) {
    const m = part.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const start = toMinutes(m[1]!, m[2]!);
    const end = toMinutes(m[3]!, m[4]!);
    if (start > 1440 || end > 1800 || start === end) return null;
    out.push([start, end]);
  }
  return out.length ? out : null;
}

/** Day index (Mo = 0) of a `YYYY-MM-DD` date. */
export function weekdayIndex(date: string): number | null {
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : (d.getUTCDay() + 6) % 7;
}

/** Opening intervals per weekday, or null when the value is outside what this reader trusts. */
export function parseOpeningHours(raw: string): Interval[][] | null {
  const text = raw.trim();
  if (!text || text.length > 200) return null;
  if (/^24\s*\/\s*7$/.test(text)) return Array.from({ length: 7 }, () => [[0, 1440]] as Interval[]);
  const week: Interval[][] = Array.from({ length: 7 }, () => []);
  for (const ruleRaw of text.split(";")) {
    const rule = ruleRaw.trim();
    if (!rule) continue;
    if (
      /(PH|SH|week|sunrise|sunset|dawn|dusk|"|\+|\bopen\b|\bunknown\b|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(
        rule,
      )
    )
      return null;
    const m = rule.match(
      /^((?:Mo|Tu|We|Th|Fr|Sa|Su)[A-Za-z,\-\s]*?)?\s*(off|closed|\d{1,2}:\d{2}.*)$/,
    );
    if (!m) return null;
    const days = m[1] ? parseDays(m[1].replace(/\s+/g, "")) : [0, 1, 2, 3, 4, 5, 6];
    if (!days) return null;
    const times = /^(off|closed)$/i.test(m[2]!) ? [] : parseTimes(m[2]!);
    if (times === null) return null;
    for (const d of days) week[d] = times; // a later rule replaces the earlier one for that day
  }
  return week;
}

/**
 * Is the place open at that weekday and minute of day? `true`/`false`, or `null` when unknown.
 * Hours that run past midnight also count on the next morning.
 */
export function isOpenAt(raw: string, weekday: number, minute: number): boolean | null {
  const week = parseOpeningHours(raw);
  if (!week || weekday < 0 || weekday > 6) return null;
  const today = week[weekday]!;
  for (const [start, end] of today) {
    if (end > start ? minute >= start && minute < end : minute >= start) return true;
  }
  const yesterday = week[(weekday + 6) % 7]!;
  for (const [start, end] of yesterday) {
    if (end <= start || end > 1440) {
      const spill = end > 1440 ? end - 1440 : end;
      if (minute < spill) return true;
    }
  }
  return false;
}

/** "10:00-20:00" style summary for the day, used in the card. */
export function hoursForDay(raw: string, weekday: number): string | null {
  const week = parseOpeningHours(raw);
  if (!week) return null;
  const today = week[weekday] ?? [];
  if (!today.length) return "tutup";
  const f = (m: number) =>
    `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return today.map(([a, b]) => `${f(a)}-${b === 1440 ? "24:00" : f(b)}`).join(", ");
}
