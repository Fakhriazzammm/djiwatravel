export type TicketTrip = {
  departure_date?: string | null;
  return_date?: string | null;
  status?: string | null;
};

const dayNumber = (key: string) => Math.round(Date.parse(`${key}T00:00:00Z`) / 86400000);

/** Stub on the right side of a trip ticket: a big value over a small unit. */
export function ticketStub(trip: TicketTrip, today: string): { value: string; unit: string } {
  const departure = trip.departure_date?.slice(0, 10) ?? "";
  const returnDate = trip.return_date?.slice(0, 10) ?? "";
  if (!departure) return { value: "Atur", unit: "TANGGAL" };
  if (returnDate && today > returnDate) return { value: "✓", unit: "SELESAI" };
  const until = dayNumber(departure) - dayNumber(today);
  if (until > 0) return { value: String(until), unit: "HARI" };
  if (until === 0) return { value: "Hari ini", unit: "BERANGKAT" };
  return { value: String(Math.abs(until) + 1), unit: "HARI KE-" };
}

export function localDayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}
