/**
 * Read model for the trip's Ringkas (overview) page: day grouping for the map and agenda list,
 * the day shown first, and the "Perlu perhatian" items. Pure helpers, shared by the page and tests.
 */
import { dateKey } from "./itinerary-map";

type DatedItem = { id: string; activity_date?: unknown };

/** Items arrive sorted by date and time from the server; keep that order inside each day. */
export function groupOverviewDays<T extends DatedItem>(items: T[]) {
  const days = new Map<string, T[]>();
  for (const item of items) {
    const date = dateKey(item.activity_date);
    if (!date) continue;
    days.set(date, [...(days.get(date) ?? []), item]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayItems]) => ({ date, items: dayItems }));
}

/** Today when the trip has activities today, else the next day with activities, else the last. */
export function pickOverviewDay(dates: string[], today: string) {
  if (!dates.length) return "";
  if (dates.includes(today)) return today;
  return dates.find((date) => date > today) ?? dates[dates.length - 1]!;
}

export type AttentionItem =
  | { kind: "checklist"; id: string; title: string }
  | { kind: "booking"; id: string; title: string; status: string };

type ChecklistRow = { id?: unknown; title?: unknown; is_completed?: unknown };
type BookingRow = { id?: unknown; title?: unknown; status?: unknown };

const PENDING_BOOKING = /^(pending|menunggu|waiting)$/i;

/** Open checklist items and bookings that still wait for confirmation, most useful first. */
export function buildAttention(
  checklist: ChecklistRow[],
  bookings: BookingRow[],
  limit = 3,
): AttentionItem[] {
  const open: AttentionItem[] = checklist
    .filter((row) => row.id && !row.is_completed)
    .map((row) => ({
      kind: "checklist" as const,
      id: String(row.id),
      title: String(row.title ?? "Checklist"),
    }));
  const waiting: AttentionItem[] = bookings
    .filter((row) => row.id && PENDING_BOOKING.test(String(row.status ?? "")))
    .map((row) => ({
      kind: "booking" as const,
      id: String(row.id),
      title: String(row.title ?? "Pemesanan"),
      status: String(row.status),
    }));
  return [...waiting, ...open].slice(0, limit);
}

/** Compact rupiah for the stat tiles: 7,5 jt, 450 rb. Falls back to the full amount. */
export function compactMoney(minor: number, formatted: string) {
  const major = Math.abs(minor) / 100;
  if (formatted.startsWith("Rp") || /^-?Rp/.test(formatted)) {
    const sign = minor < 0 ? "-" : "";
    if (major >= 1_000_000)
      return `${sign}${(major / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
    if (major >= 1_000)
      return `${sign}${(major / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
  }
  return formatted;
}

type TimedRow = {
  id: string;
  activity_date?: unknown;
  start_time?: unknown;
  end_time?: unknown;
};

const toMinutes = (value: unknown) => {
  const match = String(value ?? "").match(/^(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/** An activity without an end time is treated as lasting an hour. */
const DEFAULT_DURATION_MINUTES = 60;

/**
 * What is happening now (today, start <= now < end) and what comes next (the first activity that
 * has not started yet, today or later). Rows must already be sorted by date and time.
 */
export function pickNowNext<T extends TimedRow>(rows: T[], today: string, nowMinutes: number) {
  let current: T | null = null;
  let next: T | null = null;
  for (const row of rows) {
    const date = dateKey(row.activity_date);
    if (!date || date < today) continue;
    const start = toMinutes(row.start_time);
    if (date === today && start !== null) {
      const end = toMinutes(row.end_time) ?? start + DEFAULT_DURATION_MINUTES;
      if (start <= nowMinutes && nowMinutes < end) {
        current ??= row;
        continue;
      }
      if (end <= nowMinutes) continue;
    }
    next ??= row;
  }
  return { current, next };
}

/** Warm one-liner for the map header on Ringkas, from the countdown value and the destination. */
export function friendlyTripLine(dayLabel: string, destination: string) {
  const place = destination.trim() || "tujuanmu";
  const day = /^Hari ke-(\d+)$/.exec(dayLabel);
  if (day) return `Hari ke-${day[1]} serunya di ${place}`;
  const until = /^(\d+) hari$/.exec(dayLabel);
  if (until) return `${until[1]} hari lagi menuju ${place}`;
  if (dayLabel === "Berangkat!") return `Hari ini berangkat ke ${place}!`;
  if (dayLabel === "Selesai") return `Kenangan serumu di ${place}`;
  return `Rencanakan serumu di ${place}`;
}
