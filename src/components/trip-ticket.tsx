import { Link } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import texture from "@/assets/ticket-texture.jpg";
import { springSheet } from "@/lib/motion";
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

const barcode = (color: string) =>
  `repeating-linear-gradient(90deg, ${color} 0 1px, transparent 1px 3px, ${color} 3px 5px, transparent 5px 6px, ${color} 6px 7px, transparent 7px 10px)`;

/**
 * Compact boarding-pass style card: soft map texture and a red edge on the left, a countdown
 * stub (perforation, notches, barcode) on the right. Enters with a stagger and, for active
 * trips, a slow light sweep; both are skipped when the user prefers reduced motion.
 */
export function TripTicket({
  trip,
  title,
  index = 0,
  onShare,
}: {
  trip: TicketData;
  title: string;
  index?: number;
  /** Shows a share button on the ticket; the card itself still opens the trip. */
  onShare?: (trip: TicketData) => void;
}) {
  const reduce = useReducedMotion();
  const stub = ticketStub(trip, localDayKey());
  const past = trip.status === "past";
  const muted = past || !trip.departure_date;
  const from = shortDate(trip.departure_date);
  const to = shortDate(trip.return_date);
  const progress =
    trip.checklist_total > 0
      ? Math.round((trip.checklist_done / trip.checklist_total) * 100)
      : trip.total_budget_minor > 0
        ? Math.min(100, Math.round((trip.spent_minor / trip.total_budget_minor) * 100))
        : 0;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduce ? { duration: 0 } : { ...springSheet, delay: Math.min(index, 6) * 0.06 }}
      {...(reduce ? {} : { whileTap: { scale: 0.98 } })}
      className="relative"
    >
      <Link
        to="/my-trips/$tripId"
        params={{ tripId: trip.id }}
        draggable={false}
        className="relative flex min-h-[84px] overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgba(20,24,40,0.06)] ring-1 ring-border/50"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.17] mix-blend-multiply"
          style={{
            backgroundImage: `url(${texture})`,
            backgroundSize: "cover",
            backgroundPosition: "left center",
          }}
        />
        <span
          aria-hidden="true"
          className={`absolute inset-x-0 top-0 h-[3px] ${muted ? "bg-border" : "bg-gradient-to-r from-[#ff8a8e] to-brand-red"}`}
        />
        {!muted && !reduce && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/70 to-transparent"
            initial={{ x: "-130%" }}
            animate={{ x: "420%" }}
            transition={{
              duration: 1.6,
              ease: "easeInOut",
              delay: 0.8 + index * 0.35,
              repeat: Infinity,
              repeatDelay: 6,
            }}
          />
        )}

        <div className="relative min-w-0 flex-1 px-3.5 pb-2.5 pt-3">
          <p className="flex items-center gap-1.5 truncate text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <span aria-hidden="true" className="text-brand-red">
              ✈
            </span>
            {trip.destination_name}
          </p>
          <h2 className="truncate text-[16px] font-semibold leading-snug tracking-tight">
            {title}
          </h2>
          <p className="truncate text-[11.5px] text-muted-foreground">
            {from && to ? `${from} – ${to}` : "Tanggal belum diatur"}
            {trip.travelers_count ? ` · ${trip.travelers_count} traveler` : ""}
          </p>
          {progress > 0 && !past && (
            <div
              className="mt-2 h-[3px] w-[70%] overflow-hidden rounded-full bg-secondary"
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
          className={`relative flex w-[78px] shrink-0 flex-col items-center justify-center gap-1 border-l-[1.5px] border-dashed border-border ${
            muted ? "bg-secondary/60 text-muted-foreground" : "bg-brand-red-soft/70 text-brand-red"
          }`}
        >
          <span
            aria-hidden="true"
            className="absolute -left-[7px] -top-[7px] size-[13px] rounded-full bg-background ring-1 ring-inset ring-border/60"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-[7px] -left-[7px] size-[13px] rounded-full bg-background ring-1 ring-inset ring-border/60"
          />
          <span
            className={`font-extrabold leading-none tracking-tight ${stub.value.length > 3 ? "text-[15px]" : "text-[22px]"}`}
          >
            {stub.value}
          </span>
          <span className="-mt-0.5 max-w-full break-words px-1 text-center text-[8.5px] font-bold leading-tight tracking-[0.06em]">
            {stub.unit}
          </span>
          <span
            aria-hidden="true"
            className="mt-0.5 h-3 w-9 opacity-55"
            style={{ backgroundImage: barcode(muted ? "#8e8e93" : "#c92f3a") }}
          />
        </div>
      </Link>
      {onShare && (
        <button
          type="button"
          aria-label={`Bagikan ${title}`}
          onClick={() => onShare(trip)}
          className="tap absolute right-[78px] top-0.5 z-10 grid size-11 place-items-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Share2 className="size-4" aria-hidden="true" />
        </button>
      )}
    </motion.div>
  );
}
