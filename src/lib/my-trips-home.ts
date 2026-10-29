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

export type TripProgressInput = {
  name?: string | null;
  destination_name?: string | null;
  departure_date?: string | null;
  return_date?: string | null;
  total_budget_minor?: number | null;
  itinerary_count?: number | null;
  checklist_total?: number | null;
  checklist_done?: number | null;
  booking_count?: number | null;
  expense_count?: number | null;
  status?: MyTripsHomeStatus;
};

export function getTripProgress(trip: TripProgressInput) {
  const detailsReady = Boolean(
    trip.name?.trim() && trip.destination_name?.trim() && trip.departure_date && trip.return_date,
  );
  const checklistTotal = Math.max(0, Number(trip.checklist_total ?? 0));
  const checklistDone = Math.min(checklistTotal, Math.max(0, Number(trip.checklist_done ?? 0)));
  const checklistProgress = checklistTotal ? checklistDone / checklistTotal : 0;
  const stages = [
    { id: "details", weight: 20, done: detailsReady, label: "Lengkapi detail perjalanan", section: null },
    { id: "itinerary", weight: 20, done: Number(trip.itinerary_count ?? 0) > 0, label: "Susun agenda pertama", section: "itinerary" },
    { id: "checklist", weight: 20, done: checklistTotal > 0 && checklistProgress >= 1, label: "Selesaikan persiapan", section: "checklist" },
    { id: "budget", weight: 15, done: Number(trip.total_budget_minor ?? 0) > 0, label: "Atur anggaran perjalanan", section: "budget" },
    { id: "booking", weight: 15, done: Number(trip.booking_count ?? 0) > 0, label: "Simpan pemesanan", section: "bookings" },
    { id: "expenses", weight: 10, done: Number(trip.expense_count ?? 0) > 0, label: "Catat pengeluaran pertama", section: "expenses" },
  ] as const;
  const score = stages.reduce((sum, stage) => sum + (stage.done ? stage.weight : 0), 0) +
    (checklistTotal && checklistProgress < 1 ? Math.round(20 * checklistProgress) : 0);
  const next = stages.find((stage) => !stage.done) ?? null;
  return {
    percent: Math.min(100, score),
    nextLabel: next?.label ?? (trip.status === "past" ? "Perjalanan selesai" : "Perjalanan siap"),
    nextSection: next?.section ?? null,
    completed: stages.filter((stage) => stage.done).length,
    total: stages.length,
  };
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
