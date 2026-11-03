import { glassIconButtonClass } from "@/components/shell";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  FolderPlus,
  ListChecks,
  MapPin,
  Plus,
  WalletCards,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";
import { CustomerAuth } from "@/components/customer-auth";
import { FixedLayer } from "@/components/motion-primitives";
import { Page } from "@/components/shell";
import { TripTicket } from "@/components/trip-ticket";
import { getMyTripsActions } from "@/lib/my-trips-home";
import { getMyTripsHome } from "@/lib/my-trips.fn";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";
import { pressable, springSheet } from "@/lib/motion";

export const Route = createFileRoute("/my-trips/")({
  loader: () => getMyTripsHome(),
  head: () => ({
    meta: [
      { title: "My Trips — Djiwa Travel" },
      { name: "description", content: "Rencanakan perjalananmu dengan tenang." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  pendingComponent: () => (
    <Page>
      <div className="space-y-4 pt-3">
        <div className="h-7 w-32 animate-pulse rounded-full bg-secondary" />
        <div className="h-[76px] animate-pulse rounded-[14px] bg-secondary" />
        <div className="h-[76px] animate-pulse rounded-[14px] bg-secondary" />
      </div>
    </Page>
  ),
  component: MyTrips,
});

type HomeData = Awaited<ReturnType<typeof getMyTripsHome>>;
type Trip = HomeData["trips"][number];
type AgendaItem = HomeData["agenda"][number];

const formatDate = (value: string | null | undefined, options?: Intl.DateTimeFormatOptions) => {
  if (!value) return "Tanggal belum diatur";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Tanggal belum diatur";
  return new Intl.DateTimeFormat("id-ID", options ?? { day: "numeric", month: "short" }).format(
    date,
  );
};

const formatTime = (value: string | null | undefined) => (value ? value.slice(0, 5) : "Fleksibel");
const tripTitle = (trip: Trip) =>
  (trip.name?.trim().length ?? 0) > 2 ? trip.name.trim() : `${trip.destination_name} Trip`;

function MyTrips() {
  const data = Route.useLoaderData();
  const { user, loading: authLoading } = useBetterAuthUser();
  const [view, setView] = useState<"today" | "logbook">("today");
  const [sheet, setSheet] = useState<"menu" | "actions" | null>(null);

  if (!user && !authLoading) return <Unauthenticated />;

  return (
    <Page>
      <TopBar onMenu={() => setSheet("menu")} onAdd={() => setSheet("actions")} />
      <h1 className="px-1 pb-2 pt-1 text-[30px] font-bold leading-[1.1] tracking-[-0.03em]">
        Perjalanan
      </h1>

      <nav
        className="flex rounded-[10px] bg-secondary p-0.5"
        role="tablist"
        aria-label="Tampilan perjalanan"
      >
        {(["today", "logbook"] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={view === item}
            onClick={() => setView(item)}
            className={`min-h-9 flex-1 rounded-lg px-4 text-[13px] font-medium transition-colors ${
              view === item ? "bg-surface font-semibold shadow-sm" : "text-muted-foreground"
            }`}
          >
            {item === "today" ? "Mendatang" : "Riwayat"}
          </button>
        ))}
      </nav>

      {view === "today" ? (
        <TodayView data={data} user={user} authLoading={authLoading} />
      ) : (
        <LogbookView trips={data.trips} />
      )}

      <ActionSheet
        open={sheet !== null}
        kind={sheet ?? "actions"}
        focusTrip={data.focusTrip}
        onClose={() => setSheet(null)}
      />
    </Page>
  );
}

function TopBar({ onMenu, onAdd }: { onMenu: () => void; onAdd: () => void }) {
  return (
    <div className="flex h-11 items-center justify-between">
      <Link
        to="/"
        aria-label="Kembali ke beranda"
        className="tap -ml-2 flex min-h-11 items-center gap-0.5 rounded-xl pl-1 pr-3 text-[17px] text-brand-red"
      >
        <ChevronLeft className="size-6" strokeWidth={2.4} aria-hidden="true" />
        Beranda
      </Link>
      <div className="flex items-center">
        <button
          type="button"
          aria-label="Menu perjalanan"
          onClick={onMenu}
          className="tap grid size-11 place-items-center rounded-full text-brand-red"
        >
          <Ellipsis className="size-6" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Buat perjalanan baru"
          onClick={onAdd}
          className="tap grid size-11 place-items-center"
        >
          <span className="grid size-7 place-items-center rounded-full bg-brand-red text-white">
            <Plus className="size-[18px]" strokeWidth={2.4} aria-hidden="true" />
          </span>
        </button>
      </div>
    </div>
  );
}

function ActionSheet({
  open,
  kind,
  focusTrip,
  onClose,
}: {
  open: boolean;
  kind: "menu" | "actions";
  focusTrip: Trip | null;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const actions = getMyTripsActions(Boolean(focusTrip));
  const visibleActions = actions;

  async function shareTrip() {
    const shareData = {
      title: focusTrip?.name ?? "Perjalanan saya",
      text: focusTrip
        ? `${focusTrip.name} ke ${focusTrip.destination_name}`
        : "Rencanakan perjalanan bersama Djiwa Travel",
      url: window.location.href,
    };
    if (navigator.share) await navigator.share(shareData);
    else await navigator.clipboard?.writeText(window.location.href);
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <FixedLayer>
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 sm:items-center"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) onClose();
            }}
          >
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 20 }}
              transition={reduce ? { duration: 0.12 } : springSheet}
              role="dialog"
              aria-modal="true"
              aria-labelledby="my-trips-sheet-title"
              className="w-full max-w-md overflow-hidden rounded-[28px] bg-surface p-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-border/60"
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/25" />
              <div className="px-3 pb-2">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Djiwa Travel
                </p>
                <h2 id="my-trips-sheet-title" className="mt-1 text-xl font-bold">
                  {kind === "menu" ? "Menu perjalanan" : "Tambah ke perjalanan"}
                </h2>
              </div>
              <div className="space-y-1">
                {visibleActions.map((action) => {
                  const Icon =
                    action.id === "new-trip"
                      ? Plus
                      : action.id === "itinerary"
                        ? CalendarDays
                        : action.id === "checklist"
                          ? ListChecks
                          : action.id === "budget"
                            ? WalletCards
                            : action.id === "bookings"
                              ? FolderPlus
                              : MapPin;
                  if (action.id === "share") {
                    return (
                      <motion.button
                        key={action.id}
                        type="button"
                        onClick={() => void shareTrip()}
                        className="tap flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left font-semibold hover:bg-secondary"
                        {...pressable}
                      >
                        <Icon className="size-5 text-brand-red" />
                        {action.label}
                      </motion.button>
                    );
                  }
                  const isNew = action.id === "new-trip";
                  const section =
                    action.id === "itinerary" ||
                    action.id === "budget" ||
                    action.id === "checklist" ||
                    action.id === "bookings"
                      ? action.id
                      : null;
                  return isNew || !section || !focusTrip ? (
                    <Link
                      key={action.id}
                      to="/my-trips/new"
                      onClick={onClose}
                      className="tap flex min-h-12 items-center gap-3 rounded-2xl px-3 font-semibold hover:bg-secondary"
                    >
                      <Icon className="size-5 text-brand-red" />
                      {action.label}
                    </Link>
                  ) : (
                    <Link
                      key={action.id}
                      to="/my-trips/$tripId/$section"
                      params={{ tripId: focusTrip.id, section }}
                      onClick={onClose}
                      className="tap flex min-h-12 items-center gap-3 rounded-2xl px-3 font-semibold hover:bg-secondary"
                    >
                      <Icon className="size-5 text-brand-red" />
                      {action.label}
                    </Link>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="tap mt-2 min-h-12 w-full rounded-2xl bg-secondary font-semibold text-muted-foreground"
              >
                Batal
              </button>
            </motion.div>
          </motion.div>
        </FixedLayer>
      )}
    </AnimatePresence>
  );
}

function TodayView({
  data,
  user,
  authLoading,
}: {
  data: HomeData;
  user: { id: string; email: string } | null;
  authLoading: boolean;
}) {
  const focusTrip = data.focusTrip;
  const upcoming = data.trips.filter((trip) => trip.status !== "past");

  return (
    <div className="mt-3 space-y-4 pb-4">
      {upcoming.length ? (
        <section aria-labelledby="all-trips-heading" className="space-y-2">
          <SectionHeading id="all-trips-heading" title="Perjalanan" count={upcoming.length} />
          {upcoming.map((trip) => (
            <TripTicket key={trip.id} trip={trip} title={tripTitle(trip)} />
          ))}
        </section>
      ) : (
        <EmptyTrips trips={data.trips} user={user} loading={authLoading} />
      )}

      {focusTrip && (
        <section aria-labelledby="today-agenda-heading">
          <SectionHeading
            id="today-agenda-heading"
            title="Agenda mendatang"
            action={
              <Link
                to="/my-trips/$tripId/$section"
                params={{ tripId: focusTrip.id, section: "itinerary" }}
                className="tap text-[12px] font-medium text-brand-red"
              >
                Lihat semua
              </Link>
            }
          />
          {data.agenda.length ? (
            <div className="overflow-hidden rounded-[14px] bg-surface ring-1 ring-border/50">
              {data.agenda.slice(0, 5).map((item) => (
                <AgendaRow
                  key={item.id ?? `${item.trip_id}-${item.title}`}
                  item={item}
                  tripId={focusTrip.id}
                />
              ))}
            </div>
          ) : (
            <Link
              to="/my-trips/$tripId/$section"
              params={{ tripId: focusTrip.id, section: "itinerary" }}
              className="tap flex min-h-12 items-center gap-3 rounded-[14px] bg-surface px-3 text-[13px] text-muted-foreground ring-1 ring-border/50"
            >
              <CalendarDays className="size-[18px] text-brand-red" aria-hidden="true" />
              <span className="flex-1">Belum ada agenda. Susun hari perjalananmu.</span>
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          )}
        </section>
      )}
    </div>
  );
}

function SectionHeading({
  id,
  title,
  count,
  action,
}: {
  id: string;
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="mb-1.5 flex items-end justify-between gap-3 px-1">
      <h2 id={id} className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
        {count !== undefined && <span className="ml-1.5 normal-case">{count}</span>}
      </h2>
      {action}
    </div>
  );
}

function AgendaRow({ item, tripId }: { item: AgendaItem; tripId: string }) {
  return (
    <Link
      to="/my-trips/$tripId/$section"
      params={{ tripId, section: "itinerary" }}
      className="tap flex min-h-[48px] items-center gap-3 border-b border-border/60 px-3 last:border-b-0"
    >
      <span className="w-11 shrink-0 text-[11.5px] font-medium tabular-nums text-muted-foreground">
        {formatTime(item.start_time)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">{item.title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {item.location || item.activity_category || formatDate(item.activity_date)}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
    </Link>
  );
}

function LogbookView({ trips }: { trips: Trip[] }) {
  const pastTrips = trips.filter((trip) => trip.status === "past");
  return (
    <div className="mt-3 space-y-2 pb-4">
      {pastTrips.length ? (
        <>
          <SectionHeading id="past-trips-heading" title="Selesai" count={pastTrips.length} />
          {pastTrips.map((trip) => (
            <TripTicket key={trip.id} trip={trip} title={tripTitle(trip)} />
          ))}
        </>
      ) : (
        <section className="rounded-[14px] bg-surface px-4 py-6 text-center ring-1 ring-border/50">
          <p className="text-[15px] font-semibold">Belum ada perjalanan selesai</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Perjalanan yang sudah lewat akan tersimpan di sini.
          </p>
        </section>
      )}
    </div>
  );
}

function EmptyTrips({
  trips,
  user,
  loading,
}: {
  trips: Trip[];
  user: { id: string; email: string } | null | undefined;
  loading: boolean;
}) {
  return (
    <section className="rounded-[14px] bg-surface px-4 py-5 text-center ring-1 ring-border/50">
      <h2 className="text-[16px] font-semibold">
        {loading
          ? "Memuat perjalanan…"
          : trips.length
            ? "Belum ada perjalanan mendatang"
            : "Mulai perjalananmu"}
      </h2>
      <p className="mx-auto mt-1 max-w-xs text-[12.5px] leading-5 text-muted-foreground">
        {loading
          ? "Sebentar, kami menyiapkan ruang perjalananmu."
          : "Simpan agenda, checklist, budget, dan booking di satu tempat."}
      </p>
      {!loading &&
        (user ? (
          <Link
            to="/my-trips/new"
            className="tap mx-auto mt-3 flex h-11 max-w-xs items-center justify-center gap-2 rounded-xl bg-brand-red text-[14px] font-semibold text-white"
          >
            <Plus className="size-4" aria-hidden="true" />
            Buat perjalanan
          </Link>
        ) : (
          <div className="mx-auto mt-4 max-w-xs">
            <CustomerAuth />
          </div>
        ))}
    </section>
  );
}

function Unauthenticated() {
  return (
    <Page>
      <div className="flex min-h-[70vh] items-center">
        <section className="w-full rounded-[28px] bg-surface px-5 py-10 text-center ring-1 ring-border/60">
          <CheckCircle2 className="mx-auto size-12 text-brand-red" strokeWidth={1.5} />
          <h1 className="mt-4 text-[22px] font-bold">Masuk ke perjalananmu</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
            Login untuk menyimpan itinerary, checklist, budget, dan booking.
          </p>
          <div className="mx-auto mt-6 max-w-xs">
            <CustomerAuth />
          </div>
        </section>
      </div>
    </Page>
  );
}
