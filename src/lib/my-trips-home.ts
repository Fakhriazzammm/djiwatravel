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
