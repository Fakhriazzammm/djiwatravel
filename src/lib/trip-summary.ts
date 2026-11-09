/**
 * "Ringkas semua": one summary of everything on a trip, built from the rows the trip pages already
 * load (Agenda, Biaya, Checklist, Booking). Pure and deterministic: no AI call, so it is instant,
 * free, and always agrees with the pages.
 */
import { conflictingIds, dateKey, itemPoint } from "./itinerary-map";

type Row = Record<string, unknown>;

export type SummaryInput = {
  today: string;
  name: string;
  destination: string;
  departureDate: string | null;
  returnDate: string | null;
  travelers: number;
  currency: string;
  cities: string[];
  totalBudgetMinor: number;
  itinerary: Row[];
  budget: Row[];
  expenses: Row[];
  checklist: Row[];
  bookings: Row[];
};

export type SummaryAction = "plan" | "tidy" | "budget" | "checklist" | "pin";

export type TripSummary = {
  name: string;
  destination: string;
  cities: string[];
  travelers: number;
  currency: string;
  datesLabel: string;
  countdown: string;
  agenda: {
    total: number;
    daysTotal: number;
    daysFilled: number;
    pinned: number;
    days: {
      date: string;
      label: string;
      empty: boolean;
      items: {
        id: string;
        time: string;
        title: string;
        place: string;
        pinned: boolean;
        clash: boolean;
      }[];
    }[];
  };
  budget: {
    set: boolean;
    totalMinor: number;
    spentMinor: number;
    remainingMinor: number;
    percent: number;
    categories: { name: string; allocatedMinor: number; spentMinor: number }[];
    expenseCount: number;
    recent: { description: string; amountMinor: number; date: string }[];
  };
  checklist: { done: number; total: number; open: { id: string; title: string }[] };
  bookings: { id: string; title: string; category: string; status: string; pending: boolean }[];
  attention: { id: string; text: string; action: SummaryAction | null }[];
};

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

const shortDay = (key: string) => {
  const d = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? key
    : new Intl.DateTimeFormat("id-ID", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(d);
};

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

function rangeOfDays(from: string, to: string, cap = 31) {
  const out: string[] = [];
  for (let i = 0; i <= daysBetween(from, to) && out.length < cap; i += 1)
    out.push(new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

export function buildTripSummary(input: SummaryInput): TripSummary {
  const { today, departureDate: dep, returnDate: ret } = input;

  // ---- agenda
  const byDate = new Map<string, Row[]>();
  for (const item of input.itinerary) {
    const d = dateKey(item["activity_date"]);
    if (d) byDate.set(d, [...(byDate.get(d) ?? []), item]);
  }
  const tripDays = dep && ret && ret >= dep ? rangeOfDays(dep, ret) : [];
  const dates = [...new Set([...tripDays, ...byDate.keys()])].sort();
  const clashes = conflictingIds(
    input.itinerary.map((i) => ({
      id: str(i["id"]),
      date: dateKey(i["activity_date"]),
      start: str(i["start_time"]).slice(0, 5) || null,
      end: str(i["end_time"]).slice(0, 5) || null,
    })),
  );
  const days = dates.map((date) => {
    const rows = (byDate.get(date) ?? [])
      .slice()
      .sort((a, b) => str(a["start_time"]).localeCompare(str(b["start_time"])));
    return {
      date,
      label: shortDay(date),
      empty: rows.length === 0,
      items: rows.map((r) => ({
        id: str(r["id"]),
        time: str(r["start_time"]).slice(0, 5),
        title: str(r["title"]) || "Aktivitas",
        place: str(r["location"]),
        pinned: itemPoint(r as never) !== null,
        clash: clashes.has(str(r["id"])),
      })),
    };
  });
  const pinned = input.itinerary.filter((i) => itemPoint(i as never) !== null).length;

  // ---- budget
  const spentBy = new Map<string, number>();
  let spent = 0;
  for (const e of input.expenses) {
    const amount = num(e["converted_amount_minor"]);
    spent += amount;
    const cat = str(e["category_id"]);
    if (cat) spentBy.set(cat, (spentBy.get(cat) ?? 0) + amount);
  }
  const categories = input.budget
    .map((b) => ({
      name: str(b["name"]),
      allocatedMinor: num(b["allocated_minor"]),
      spentMinor: spentBy.get(str(b["id"])) ?? 0,
    }))
    .filter((c) => c.allocatedMinor > 0 || c.spentMinor > 0)
    .sort((a, b) => b.allocatedMinor + b.spentMinor - (a.allocatedMinor + a.spentMinor));
  const total = input.totalBudgetMinor;
  const recent = input.expenses
    .slice()
    .sort((a, b) => str(b["transaction_date"]).localeCompare(str(a["transaction_date"])))
    .slice(0, 3)
    .map((e) => ({
      description: str(e["description"]) || "Pengeluaran",
      amountMinor: num(e["converted_amount_minor"]),
      date: dateKey(e["transaction_date"]),
    }));

  // ---- checklist + bookings
  const open = input.checklist.filter((c) => !c["is_completed"]);
  const bookings = input.bookings
    .filter((b) => !/^(cancelled|canceled|dibatalkan)$/i.test(str(b["status"])))
    .map((b) => ({
      id: str(b["id"]),
      title: str(b["title"]) || "Pemesanan",
      category: str(b["category"]),
      status: str(b["status"]),
      pending: /pending|menunggu|waiting/i.test(str(b["status"])),
    }));

  // ---- countdown
  let countdown = "Tanggal belum diatur";
  if (dep && ret) {
    const until = daysBetween(today, dep);
    if (today > ret) countdown = "Perjalanan selesai";
    else if (until > 0) countdown = `${until} hari lagi`;
    else if (until === 0) countdown = "Berangkat hari ini";
    else
      countdown = `Hari ke-${Math.min(daysBetween(dep, ret) + 1, daysBetween(dep, today) + 1)} dari ${daysBetween(dep, ret) + 1}`;
  }
  const datesLabel = dep && ret ? `${shortDay(dep)} – ${shortDay(ret)}` : "Tanggal belum diatur";

  // ---- what needs attention (most useful first)
  const attention: TripSummary["attention"] = [];
  const emptyAhead = days.filter((d) => d.empty && d.date >= today && tripDays.includes(d.date));
  const unpinned = input.itinerary.length - pinned;
  if (!total) attention.push({ id: "budget", text: "Anggaran belum diatur", action: "budget" });
  else if (!categories.some((c) => c.allocatedMinor > 0))
    attention.push({ id: "split", text: "Anggaran belum dibagi per kategori", action: "budget" });
  if (total && spent > total)
    attention.push({ id: "over", text: "Pengeluaran melebihi anggaran", action: "budget" });
  if (emptyAhead.length)
    attention.push({
      id: "empty",
      text: `${emptyAhead.length} hari belum punya agenda`,
      action: "plan",
    });
  if (clashes.size)
    attention.push({
      id: "clash",
      text: `${clashes.size} aktivitas jamnya bentrok`,
      action: "tidy",
    });
  if (unpinned > 0)
    attention.push({
      id: "pin",
      text: `${unpinned} aktivitas belum punya titik di peta`,
      action: "pin",
    });
  if (open.length && dep && daysBetween(today, dep) <= 14 && today <= (ret ?? "9999"))
    attention.push({
      id: "check",
      text: `${open.length} persiapan belum selesai`,
      action: "checklist",
    });
  const pending = bookings.filter((b) => b.pending).length;
  if (pending)
    attention.push({
      id: "pending",
      text: `${pending} pemesanan menunggu konfirmasi`,
      action: null,
    });

  return {
    name: input.name,
    destination: input.destination,
    cities: input.cities,
    travelers: input.travelers,
    currency: input.currency,
    datesLabel,
    countdown,
    agenda: {
      total: input.itinerary.length,
      daysTotal: dates.length,
      daysFilled: days.filter((d) => !d.empty).length,
      pinned,
      days,
    },
    budget: {
      set: total > 0,
      totalMinor: total,
      spentMinor: spent,
      remainingMinor: total - spent,
      percent: total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0,
      categories: categories.slice(0, 5),
      expenseCount: input.expenses.length,
      recent,
    },
    checklist: {
      done: input.checklist.length - open.length,
      total: input.checklist.length,
      open: open.slice(0, 5).map((c) => ({ id: str(c["id"]), title: str(c["title"]) })),
    },
    bookings,
    attention,
  };
}
