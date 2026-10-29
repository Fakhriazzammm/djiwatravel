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
  itinerary_count: number;
  booking_count: number;
  expense_count?: number;
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

export type TripProgressInput = Partial<
  Pick<
    MyTripsHomeTrip,
    | "name"
    | "destination_name"
    | "departure_date"
    | "return_date"
    | "total_budget_minor"
    | "itinerary_count"
    | "checklist_total"
    | "checklist_done"
    | "booking_count"
    | "expense_count"
    | "status"
  >
>;

export function getTripProgress(trip: TripProgressInput) {
  const checklistTotal = Math.max(0, Number(trip.checklist_total ?? 0));
  const checklistDone = Math.min(checklistTotal, Math.max(0, Number(trip.checklist_done ?? 0)));
  const checklistRatio = checklistTotal ? checklistDone / checklistTotal : 0;
  const stages = [
    {
      weight: 20,
      done: Boolean(
        (trip.name?.trim().length ?? 0) > 2 &&
        trip.destination_name?.trim() &&
        trip.departure_date &&
        trip.return_date,
      ),
      label: "Lengkapi detail perjalanan",
      section: null,
    },
    {
      weight: 20,
      done: Number(trip.itinerary_count ?? 0) > 0,
      label: "Susun agenda pertama",
      section: "itinerary",
    },
    {
      weight: 20,
      done: checklistTotal === 0 || checklistRatio === 1,
      label: "Selesaikan persiapan",
      section: "checklist",
    },
    {
      weight: 15,
      done: Number(trip.total_budget_minor ?? 0) > 0,
      label: "Atur anggaran perjalanan",
      section: "budget",
    },
    {
      weight: 15,
      done: Number(trip.booking_count ?? 0) > 0,
      label: "Simpan pemesanan",
      section: "bookings",
    },
    {
      weight: 10,
      done: Number(trip.expense_count ?? 0) > 0,
      label: "Catat pengeluaran pertama",
      section: "expenses",
    },
  ] as const;
  const percent = Math.min(
    100,
    stages.reduce((sum, stage) => sum + (stage.done ? stage.weight : 0), 0) +
      (checklistTotal && checklistRatio < 1 ? Math.round(20 * checklistRatio) : 0),
  );
  const next = stages.find((stage) => !stage.done);
  return {
    percent,
    completed: stages.filter((stage) => stage.done).length,
    total: stages.length,
    nextLabel: next?.label ?? (trip.status === "past" ? "Perjalanan selesai" : "Perjalanan siap"),
    nextSection: next?.section ?? null,
  };
}

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
