import { Link } from "@tanstack/react-router";
import { ticketStub, localDayKey } from "@/lib/trip-ticket";

export type TicketData = {
  id: string;
  name: string;
  destination_name: string;
  departure_date: string | null;
  return_date: string | null;
  travelers_count?: number | null;
  status: string;
  total_budget_minor: number;
  spent_minor: number;
  checklist_total: number;
  checklist_done: number;
};

const shortDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(date);
};

/** Compact boarding-pass style card: trip info on the left, countdown stub on the right. */
export function TripTicket({ trip, title }: { trip: TicketData; title: string }) {
  const stub = ticketStub(trip, localDayKey());
  const past = trip.status === "past";
  const undated = !trip.departure_date;
  const from = shortDate(trip.departure_date);
  const to = shortDate(trip.return_date);
  const progress =
    trip.checklist_total > 0
      ? Math.round((trip.checklist_done / trip.checklist_total) * 100)
      : trip.total_budget_minor > 0
        ? Math.min(100, Math.round((trip.spent_minor / trip.total_budget_minor) * 100))
        : 0;
  const stubTone = past
    ? "bg-secondary text-muted-foreground"
    : undated
      ? "bg-secondary text-muted-foreground"
      : "bg-brand-red-soft text-brand-red";

  return (
    <Link
      to="/my-trips/$tripId"
      params={{ tripId: trip.id }}
      className="tap relative flex min-h-[76px] overflow-hidden rounded-[14px] bg-surface ring-1 ring-border/50"
    >
      <div className="min-w-0 flex-1 px-3 py-2.5">
        <p className="truncate text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
          {trip.destination_name}
        </p>
        <h2 className="truncate text-[15px] font-semibold leading-tight">{title}</h2>
        <p className="truncate text-[11.5px] text-muted-foreground">
          {from && to ? `${from} – ${to}` : "Tanggal belum diatur"}
          {trip.travelers_count ? ` · ${trip.travelers_count} traveler` : ""}
        </p>
        {progress > 0 && !past && (
          <div
            className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-label="Progres persiapan"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="h-full rounded-full bg-brand-red" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <div
        className={`relative flex w-[68px] shrink-0 flex-col items-center justify-center border-l-[1.5px] border-dashed border-border px-1 text-center ${stubTone}`}
      >
        <span
          aria-hidden="true"
          className="absolute -top-1.5 -left-[7px] size-3 rounded-full bg-background"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-1.5 -left-[7px] size-3 rounded-full bg-background"
        />
        <span
          className={`font-extrabold leading-none ${stub.value.length > 3 ? "text-[12px]" : "text-[20px]"}`}
        >
          {stub.value}
        </span>
        <span className="mt-0.5 text-[8.5px] font-semibold leading-tight tracking-wide">
          {stub.unit}
        </span>
      </div>
    </Link>
  );
}
