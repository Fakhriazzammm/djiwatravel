import { itemPoint } from "./itinerary-map";
import { pickNowNext } from "./trip-overview";

export type MyTripsHomeStatus = "upcoming" | "ongoing" | "past";

export type MyTripsHomeTrip = {
  id: string;
  name: string;
  destination_code?: string;
  destination_name: string;
  status: MyTripsHomeStatus;
  departure_date: string | null;
  return_date: string | null;
  travelers_count: number;
  primary_currency: string;
  total_budget_minor: number;
  spent_minor: number;
  checklist_total: number;
  checklist_done: number;
  booking_count?: number;
};

/** `YYYY-MM-DD` from a date column that can arrive as a string or, from a raw pg row, a Date. */
function agendaDayKey(value: unknown) {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

export type MyTripsHomeAgendaItem = {
  id?: string;
  trip_id: string;
  activity_date: string;
  start_time?: string | null;
  end_time?: string | null;
  title: string;
  location?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  activity_category?: string | null;
};

export type MyTripsHomeChecklistItem = {
  id: string;
  trip_id: string;
  title: string;
  due_date?: string | null;
  is_completed: boolean;
};

export type MyTripsAction = {
  id: "new-trip" | "itinerary" | "budget" | "checklist" | "bookings" | "share";
  label: string;
};

const checklistLabels: Record<string, string> = {
  Passport: "Paspor",
  "Flight tickets": "Tiket penerbangan",
  "Hotel booking": "Pemesanan penginapan",
  "Travel insurance": "Asuransi perjalanan",
  "eSIM installation": "Aktifkan eSIM",
  "Currency exchange": "Tukar mata uang",
  Packing: "Siapkan barang bawaan",
  "Airport preparation": "Persiapan bandara",
};

export function displayChecklistTitle(title: string) {
  return checklistLabels[title] ?? title;
}

const budgetLabels: Record<string, string> = {
  Flights: "Penerbangan",
  Accommodation: "Akomodasi",
  Transportation: "Transportasi",
  "Food & Drinks": "Makan & minum",
  Attractions: "Aktivitas",
  Shopping: "Belanja",
  "eSIM & Internet": "eSIM & internet",
  Insurance: "Asuransi",
  Emergency: "Darurat",
  Other: "Lainnya",
};

export function displayBudgetCategory(name: string) {
  return budgetLabels[name] ?? name;
}

export function getMyTripsActions(hasFocusTrip: boolean): MyTripsAction[] {
  const actions: MyTripsAction[] = [{ id: "new-trip", label: "Buat perjalanan" }];
  if (!hasFocusTrip) return actions;
  return [
    ...actions,
    { id: "itinerary", label: "Itinerary" },
    { id: "checklist", label: "Checklist" },
    { id: "budget", label: "Budget" },
    { id: "bookings", label: "Bookings" },
    { id: "share", label: "Bagikan perjalanan" },
  ];
}

export function buildMyTripsHome(
  trips: MyTripsHomeTrip[],
  agenda: MyTripsHomeAgendaItem[],
  checklist: MyTripsHomeChecklistItem[],
) {
  const focusTrip =
    trips.find((trip) => trip.status === "ongoing") ??
    [...trips]
      .filter((trip) => trip.status === "upcoming")
      .sort((a, b) => String(a.departure_date).localeCompare(String(b.departure_date)))[0] ??
    null;
  const focusId = focusTrip?.id;

  return {
    trips,
    focusTrip,
    agenda: focusId ? agenda.filter((item) => item.trip_id === focusId) : [],
    checklist: focusId ? checklist.filter((item) => item.trip_id === focusId) : [],
  };
}

export type HomeTripWidget =
  | { kind: "empty" }
  | {
      kind: "trip";
      tripId: string;
      title: string;
      destination: string;
      status: MyTripsHomeStatus;
      /** "H-12", "Hari ini", "Sedang berlangsung" */
      countdown: string;
      dateRange: string;
      travelers: number;
      checklistDone: number;
      checklistTotal: number;
      nextStep: { label: string; hint: string };
      /** "Hari ke-2" while the trip runs, else null. */
      dayLabel: string | null;
      /** What is on now or comes next, for the card's agenda row. */
      agenda: HomeAgendaNow | null;
      todayAgendaCount: number;
      agendaCount: number;
      bookingCount: number;
      budget: { set: boolean; remainingMinor: number; currency: string };
      /** Pins of the agenda day shown on the mini route (numbered per day). */
      route: { date: string; pins: { id: string; n: number; lat: number; lng: number }[] } | null;
    };

export type HomeAgendaNow = {
  id: string;
  title: string;
  /** "10:00" or null when the activity has no time. */
  time: string | null;
  location: string | null;
  /** "sedang berlangsung", "25 mnt lagi", "2 jam lagi", "Besok", "5 Nov". */
  when: string;
  isNow: boolean;
};

const MS_DAY = 86_400_000;
const parseDay = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

function formatRange(start: string | null, end: string | null) {
  const a = parseDay(start);
  if (!a) return "Tanggal belum diatur";
  const fmt = (d: Date, withYear: boolean) =>
    new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
    }).format(d);
  const b = parseDay(end);
  return b ? `${fmt(a, false)} – ${fmt(b, true)}` : fmt(a, true);
}

/** Summarises the focus trip for the Home widget; pure so the server clock/locale stay testable. */
export function buildHomeTripWidget(
  home: ReturnType<typeof buildMyTripsHome>,
  now: Date,
): HomeTripWidget {
  const trip = home.focusTrip;
  if (!trip) return { kind: "empty" };

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const departure = parseDay(trip.departure_date);
  const daysLeft = departure ? Math.round((departure.getTime() - today.getTime()) / MS_DAY) : null;
  const countdown =
    trip.status === "ongoing"
      ? "Sedang berlangsung"
      : daysLeft === null
        ? "Segera"
        : daysLeft <= 0
          ? "Hari ini"
          : `H-${daysLeft}`;

  const pending = home.checklist.find((item) => !item.is_completed);
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;
  const nextAgenda = home.agenda.find((item) => agendaDayKey(item.activity_date) >= todayKey);

  const nextStep =
    trip.status === "ongoing" && nextAgenda
      ? {
          label: nextAgenda.title,
          hint: nextAgenda.start_time ? `Pukul ${nextAgenda.start_time.slice(0, 5)}` : "Hari ini",
        }
      : pending
        ? { label: displayChecklistTitle(pending.title), hint: "Selanjutnya di checklist" }
        : { label: "Semua persiapan siap", hint: "Cek itinerary perjalananmu" };

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const dayAgenda = [...home.agenda].map((item) => ({
    ...item,
    activity_date: agendaDayKey(item.activity_date),
  }));
  const { current, next } = pickNowNext(
    dayAgenda.map((item, index) => ({ ...item, id: item.id ?? `a${index}` })),
    todayKey,
    nowMinutes,
  );
  const focus = current ?? next;
  const agenda: HomeAgendaNow | null = focus
    ? {
        id: focus.id,
        title: focus.title,
        time: focus.start_time ? String(focus.start_time).slice(0, 5) : null,
        location: focus.location ? String(focus.location) : null,
        ...agendaWhen(focus, current !== null, todayKey, today, nowMinutes),
      }
    : null;
  const routeDate = focus ? agendaDayKey(focus.activity_date) : "";
  const routePins = routeDate
    ? dayAgenda
        .filter((item) => item.activity_date === routeDate)
        .flatMap((item, index) => {
          const point = itemPoint({
            id: item.id ?? `a${index}`,
            latitude: item.latitude,
            longitude: item.longitude,
          });
          return point ? [{ id: item.id ?? `a${index}`, lat: point.lat, lng: point.lng }] : [];
        })
        .map((pin, index) => ({ ...pin, n: index + 1 }))
    : [];
  const totalDays = (() => {
    const a = parseDay(trip.departure_date);
    const b = parseDay(trip.return_date);
    return a && b ? Math.round((b.getTime() - a.getTime()) / MS_DAY) + 1 : 0;
  })();
  const dayLabel =
    trip.status === "ongoing" && departure
      ? `Hari ke-${Math.min(totalDays || 1, Math.max(1, Math.round((today.getTime() - departure.getTime()) / MS_DAY) + 1))}`
      : null;

  const name = trip.name?.trim() ?? "";
  return {
    kind: "trip",
    tripId: trip.id,
    title: name.length > 2 ? name : `${trip.destination_name} Trip`,
    destination: trip.destination_name,
    status: trip.status,
    countdown,
    dateRange: formatRange(trip.departure_date, trip.return_date),
    travelers: trip.travelers_count,
    checklistDone: trip.checklist_done,
    checklistTotal: trip.checklist_total,
    nextStep,
    dayLabel,
    agenda,
    todayAgendaCount: dayAgenda.filter((item) => item.activity_date === todayKey).length,
    agendaCount: dayAgenda.length,
    bookingCount: trip.booking_count ?? 0,
    budget: {
      set: trip.total_budget_minor > 0,
      remainingMinor: trip.total_budget_minor - trip.spent_minor,
      currency: trip.primary_currency,
    },
    route: routePins.length ? { date: routeDate, pins: routePins } : null,
  };
}

const startMinutes = (value: unknown) => {
  const match = String(value ?? "").match(/^(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/** Short Indonesian phrase for when an activity happens relative to now. */
function agendaWhen(
  item: { activity_date: string; start_time?: string | null },
  isNow: boolean,
  todayKey: string,
  today: Date,
  nowMinutes: number,
): { when: string; isNow: boolean } {
  if (isNow) return { when: "sedang berlangsung", isNow: true };
  const date = parseDay(item.activity_date);
  const dayDiff = date ? Math.round((date.getTime() - today.getTime()) / MS_DAY) : null;
  if (item.activity_date === todayKey) {
    const start = startMinutes(item.start_time);
    if (start === null) return { when: "hari ini", isNow: false };
    const left = Math.max(0, start - nowMinutes);
    return {
      when: left < 60 ? `${left} mnt lagi` : `${Math.round(left / 60)} jam lagi`,
      isNow: false,
    };
  }
  if (dayDiff === 1) return { when: "besok", isNow: false };
  return {
    when: date
      ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(date)
      : "segera",
    isNow: false,
  };
}
