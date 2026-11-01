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
};

export type MyTripsHomeAgendaItem = {
  id?: string;
  trip_id: string;
  activity_date: string;
  start_time?: string | null;
  end_time?: string | null;
  title: string;
  location?: string | null;
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
  const nextAgenda = home.agenda.find((item) => item.activity_date.slice(0, 10) >= todayKey);

  const nextStep =
    trip.status === "ongoing" && nextAgenda
      ? {
          label: nextAgenda.title,
          hint: nextAgenda.start_time ? `Pukul ${nextAgenda.start_time.slice(0, 5)}` : "Hari ini",
        }
      : pending
        ? { label: displayChecklistTitle(pending.title), hint: "Selanjutnya di checklist" }
        : { label: "Semua persiapan siap", hint: "Cek itinerary perjalananmu" };

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
  };
}
