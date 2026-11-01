import { Link } from "@tanstack/react-router";
import {
  BriefcaseBusiness,
  CalendarRange,
  Check,
  ChevronRight,
  Landmark,
  Ticket,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildHomeTripWidget, buildMyTripsHome } from "@/lib/my-trips-home";
import { getMyTripsHome } from "@/lib/my-trips.fn";

type Section = "itinerary" | "budget" | "checklist" | "bookings";

const SECTIONS: { id: Section; label: string; icon: typeof Check; tone: string }[] = [
  { id: "itinerary", label: "Itinerary", icon: CalendarRange, tone: "bg-[#E8F1FF] text-[#0a84ff]" },
  { id: "budget", label: "Budget", icon: Landmark, tone: "bg-[#E8F8EE] text-[#28b84f]" },
  { id: "checklist", label: "Checklist", icon: Check, tone: "bg-[#FFF2DD] text-[#ff8a00]" },
  { id: "bookings", label: "Booking", icon: Ticket, tone: "bg-[#F1E8FF] text-[#8e44ff]" },
];

type State = { status: "loading" } | { status: "ready"; home: ReturnType<typeof buildMyTripsHome> };

const CARD = "ios-card mt-3 p-4";

/**
 * Home entry point for /my-trips. Signed-out users, users without a trip and load failures all
 * land on the same "start planning" call to action; an unavailable trip list never blocks Home.
 */
export function HomeMyTripsWidget({ signedIn }: { signedIn: boolean }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!signedIn) {
      setState({ status: "ready", home: buildMyTripsHome([], [], []) });
      return;
    }
    let cancelled = false;
    void getMyTripsHome()
      .then((home) => !cancelled && setState({ status: "ready", home }))
      .catch(() => !cancelled && setState({ status: "ready", home: buildMyTripsHome([], [], []) }));
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const view = useMemo(
    () => (state.status === "ready" ? buildHomeTripWidget(state.home, new Date()) : null),
    [state],
  );

  if (!view) {
    return (
      <div
        role="status"
        aria-label="Memuat perjalanan"
        className={`${CARD} h-56 animate-pulse motion-reduce:animate-none`}
      />
    );
  }

  if (view.kind === "empty") {
    return (
      <div className={CARD} data-testid="home-trips-widget" data-state="empty">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-gradient-to-b from-[#ff7a7a] to-brand-red text-white">
            <BriefcaseBusiness className="size-5" aria-hidden="true" />
          </span>
          <span className="text-[12px] font-semibold text-muted-foreground">My Trips</span>
        </div>
        <h3 className="mt-2 text-[20px] font-bold tracking-[-0.025em]">Rencanakan perjalananmu</h3>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Itinerary, budget, checklist, dan booking dalam satu tempat.
        </p>
        <SectionShortcuts />
        <Link
          to={signedIn ? "/my-trips/new" : "/my-trips"}
          className="tap mt-4 flex h-12 items-center justify-center rounded-full bg-brand-red text-[15px] font-bold text-white shadow-[0_8px_16px_-8px_oklch(0.6_0.21_25/0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {signedIn ? "Buat perjalanan" : "Masuk & mulai merencanakan"}
        </Link>
      </div>
    );
  }

  const pct = view.checklistTotal
    ? Math.round((view.checklistDone / view.checklistTotal) * 100)
    : 0;
  return (
    <div className={CARD} data-testid="home-trips-widget" data-state="trip">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-[10px] bg-gradient-to-b from-[#ff7a7a] to-brand-red text-white">
          <BriefcaseBusiness className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-muted-foreground">
            {view.status === "ongoing" ? "Perjalanan sekarang" : "Perjalanan berikutnya"}
          </p>
          <h3 className="truncate text-[18px] font-bold tracking-[-0.02em]">{view.title}</h3>
        </div>
        <span className="shrink-0 rounded-full bg-brand-red-soft px-3 py-1 text-[13px] font-bold text-brand-red">
          {view.countdown}
        </span>
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground">
        {view.dateRange} · {view.travelers} traveler
      </p>
      {view.checklistTotal > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 flex justify-between text-[13px] text-muted-foreground">
            <span>Persiapan</span>
            <b className="text-foreground">
              {view.checklistDone} dari {view.checklistTotal} siap
            </b>
          </div>
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progres persiapan"
            className="h-2 overflow-hidden rounded-full bg-black/[0.08]"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#ff7a7a] to-brand-red transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
      <Link
        to="/my-trips/$tripId/$section"
        params={{
          tripId: view.tripId,
          section: view.checklistTotal > view.checklistDone ? "checklist" : "itinerary",
        }}
        className="tap mt-3 flex min-h-12 items-center gap-2.5 rounded-2xl bg-secondary px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{view.nextStep.label}</span>
          <span className="block text-[12px] text-muted-foreground">{view.nextStep.hint}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
      </Link>
      <SectionShortcuts tripId={view.tripId} />
      <Link
        to="/my-trips/$tripId"
        params={{ tripId: view.tripId }}
        className="tap mt-4 flex h-11 items-center justify-center rounded-full bg-brand-red-soft text-[15px] font-bold text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Lanjutkan persiapan
      </Link>
    </div>
  );
}

function SectionShortcuts({ tripId }: { tripId?: string }) {
  return (
    <div className="mt-4 grid grid-cols-4 gap-1.5">
      {SECTIONS.map(({ id, label, icon: Icon, tone }) => {
        const inner = (
          <>
            <span className={`flex size-11 items-center justify-center rounded-[14px] ${tone}`}>
              <Icon className="size-[22px]" strokeWidth={1.9} aria-hidden="true" />
            </span>
            <span className="text-[11px] font-semibold">{label}</span>
          </>
        );
        const cls =
          "tap flex flex-col items-center gap-1.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
        return tripId ? (
          <Link
            key={id}
            to="/my-trips/$tripId/$section"
            params={{ tripId, section: id }}
            className={cls}
          >
            {inner}
          </Link>
        ) : (
          <span key={id} className={cls}>
            {inner}
          </span>
        );
      })}
    </div>
  );
}
