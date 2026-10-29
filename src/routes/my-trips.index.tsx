import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Ellipsis,
  ListChecks,
  MapPin,
  Plane,
  Plus,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";
import { CustomerAuth } from "@/components/customer-auth";
import { FixedLayer } from "@/components/motion-primitives";
import { Page } from "@/components/shell";
import { destinationPhoto } from "@/lib/destination-artwork";
import { getMyTripsActions } from "@/lib/my-trips-home";
import { getMyTripsHome, patchChecklist } from "@/lib/my-trips.server";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";
import { pressable, springSheet } from "@/lib/motion";

export const Route = createFileRoute("/my-trips/")({
  loader: () => getMyTripsHome(),
  head: () => ({
    meta: [
      { title: "My Trips — Djiwa Travel" },
      { name: "description", content: "Rencanakan perjalananmu dengan tenang." },
    ],
  }),
  pendingComponent: () => (
    <Page>
      <div className="space-y-4 pt-3">
        <div className="h-7 w-32 animate-pulse rounded-full bg-secondary" />
        <div className="h-52 animate-pulse rounded-[28px] bg-secondary" />
        <div className="h-40 animate-pulse rounded-[28px] bg-secondary" />
      </div>
    </Page>
  ),
  component: MyTrips,
});

type HomeData = Awaited<ReturnType<typeof getMyTripsHome>>;
type Trip = HomeData["trips"][number];
type AgendaItem = HomeData["agenda"][number];
type ChecklistItem = HomeData["checklist"][number];

const formatDate = (value: string | null | undefined, options?: Intl.DateTimeFormatOptions) => {
  if (!value) return "Tanggal belum diatur";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Tanggal belum diatur";
  return new Intl.DateTimeFormat("id-ID", options ?? { day: "numeric", month: "short" }).format(
    date,
  );
};

const formatTime = (value: string | null | undefined) => (value ? value.slice(0, 5) : "Fleksibel");
const tripTitle = (trip: Trip) => {
  const name = trip.name?.trim();
  return name && name.length > 2 ? name : `${trip.destination_name || "Perjalanan"} Trip`;
};

function MyTrips() {
  const data = Route.useLoaderData();
  const { user, setUser, loading: authLoading } = useBetterAuthUser();
  const [view, setView] = useState<"today" | "logbook">("today");
  const [sheet, setSheet] = useState<"menu" | "actions" | null>(null);

  if (!user && !authLoading) return <Unauthenticated onAuthenticated={setUser} />;

  return (
    <Page>
      <div className="relative pt-1">
        <TopBar onMenu={() => setSheet("menu")} />
        <h1 className="mt-5 text-[34px] font-bold leading-none tracking-[-0.045em]">Perjalanan</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {view === "today" ? "Satu langkah kecil untuk perjalananmu." : "Semua perjalananmu."}
        </p>
      </div>

      <nav
        className="no-scrollbar mt-5 flex gap-1 overflow-x-auto rounded-2xl bg-secondary/80 p-1"
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
            className={`min-h-10 flex-1 rounded-xl px-4 text-[13px] font-semibold transition-colors ${
              view === item ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {item === "today" ? "Hari ini" : "Riwayat"}
          </button>
        ))}
      </nav>

      {view === "today" ? (
        <TodayView data={data} user={user} authLoading={authLoading} onAuthenticated={setUser} />
      ) : (
        <LogbookView trips={data.trips} />
      )}

      <motion.button
        type="button"
        aria-label="Buat perjalanan baru"
        onClick={() => setSheet("actions")}
        className="tap fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-5 z-30 flex size-14 items-center justify-center rounded-full bg-brand-red text-white shadow-[0_8px_24px_rgba(220,38,38,0.25)] ring-4 ring-background"
        {...pressable}
      >
        <Plus className="size-7" strokeWidth={2.1} />
      </motion.button>
      <ActionSheet
        open={sheet !== null}
        kind={sheet ?? "actions"}
        focusTrip={data.focusTrip}
        onClose={() => setSheet(null)}
      />
    </Page>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <Link
        to="/"
        aria-label="Kembali ke beranda"
        className="tap flex size-10 items-center justify-center rounded-full bg-surface shadow-[0_1px_5px_rgba(15,23,42,0.08)] ring-1 ring-border/70"
      >
        <ArrowLeft className="size-5" strokeWidth={2.3} />
      </Link>
      <button
        type="button"
        aria-label="Menu perjalanan"
        onClick={onMenu}
        className="tap flex size-10 items-center justify-center rounded-full bg-surface text-foreground shadow-[0_1px_5px_rgba(15,23,42,0.08)] ring-1 ring-border/70"
      >
        <Ellipsis className="size-5" strokeWidth={2.4} />
      </button>
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.12 : 0.2 }}
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
  onAuthenticated,
}: {
  data: HomeData;
  user: { id: string; email: string } | null;
  authLoading: boolean;
  onAuthenticated: (user: { id: string; email: string }) => void;
}) {
  const focusTrip = data.focusTrip;
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleChecklist(item: ChecklistItem) {
    setBusyId(item.id);
    try {
      await patchChecklist({ data: { id: item.id, completed: !item.is_completed } });
      await router.invalidate();
    } finally {
      setBusyId(null);
    }
  }

  if (!focusTrip) {
    return (
      <EmptyTrips
        trips={data.trips}
        user={user}
        loading={authLoading}
        onAuthenticated={onAuthenticated}
      />
    );
  }

  const openItems = data.checklist.filter((item) => !item.is_completed);
  const checklistItems = openItems.slice(0, 3);

  return (
    <div className="mt-5 space-y-6 pb-5">
      <FocusTripCard trip={focusTrip} />

      <section aria-labelledby="today-agenda-heading">
        <SectionHeading
          id="today-agenda-heading"
          title="Agenda terdekat"
          subtitle="Untuk 14 hari ke depan"
          action={
            <Link
              to="/my-trips/$tripId/$section"
              params={{ tripId: focusTrip.id, section: "itinerary" }}
              className="tap text-[12px] font-semibold text-brand-red"
            >
              Lihat semua
            </Link>
          }
        />
        {data.agenda.length ? (
          <div className="mt-3 space-y-1">
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
            className="tap mt-3 flex items-center gap-3 rounded-2xl bg-surface px-4 py-4 text-sm text-muted-foreground ring-1 ring-border/60"
          >
            <CalendarDays className="size-5 text-brand-red" />
            <span className="flex-1">Belum ada agenda. Susun hari perjalananmu.</span>
            <ChevronRight className="size-4" />
          </Link>
        )}
      </section>

      <section aria-labelledby="today-checklist-heading">
        <SectionHeading
          id="today-checklist-heading"
          title="Checklist"
          subtitle={`${openItems.length} hal belum selesai`}
          action={
            <Link
              to="/my-trips/$tripId/$section"
              params={{ tripId: focusTrip.id, section: "checklist" }}
              className="tap text-[12px] font-semibold text-brand-red"
            >
              Lihat semua
            </Link>
          }
        />
        <div className="mt-3 divide-y divide-border/60 overflow-hidden rounded-2xl bg-surface ring-1 ring-border/60">
          {checklistItems.length ? (
            checklistItems.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onToggle={() => void toggleChecklist(item)}
                tripId={focusTrip.id}
              />
            ))
          ) : (
            <Link
              to="/my-trips/$tripId/$section"
              params={{ tripId: focusTrip.id, section: "checklist" }}
              className="tap flex items-center gap-3 px-4 py-4 text-sm text-muted-foreground"
            >
              <ListChecks className="size-5 text-brand-red" /> Belum ada checklist untuk perjalanan
              ini.
            </Link>
          )}
        </div>
        {openItems.length > checklistItems.length && (
          <Link
            to="/my-trips/$tripId/$section"
            params={{ tripId: focusTrip.id, section: "checklist" }}
            className="mt-2 block px-1 text-[13px] font-semibold text-brand-red"
          >
            Lihat semua checklist
          </Link>
        )}
      </section>
    </div>
  );
}

function FocusTripCard({ trip }: { trip: Trip }) {
  const photo = destinationPhoto(String(trip.destination_code ?? ""));
  const pct =
    trip.total_budget_minor > 0
      ? Math.min(100, Math.round((trip.spent_minor / trip.total_budget_minor) * 100))
      : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSheet}
    >
      <Link
        to="/my-trips/$tripId"
        params={{ tripId: trip.id }}
        className="tap relative block min-h-56 overflow-hidden rounded-[28px] bg-[#123b68] shadow-[0_12px_32px_rgba(15,43,74,0.16)]"
      >
        {photo && (
          <img src={photo} alt="" className="absolute inset-0 size-full object-cover opacity-80" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#061d36] via-[#123b68]/45 to-transparent" />
        <div className="relative flex min-h-56 flex-col justify-between p-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <span className="rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold backdrop-blur-md">
              {trip.status === "ongoing" ? "Sedang berlangsung" : "Berikutnya"}
            </span>
            <Plane className="size-5" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-white/75">
              {trip.departure_date && trip.return_date
                ? `${formatDate(trip.departure_date)} — ${formatDate(trip.return_date)}`
                : "Atur tanggal perjalanan"}
            </p>
            <h2 className="mt-1 line-clamp-2 break-words text-[25px] font-bold tracking-[-0.03em]">
              {tripTitle(trip)}
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-[14px] text-white/80">
              <MapPin className="size-3.5" />
              <span className="capitalize">{trip.destination_name}</span>
            </p>
            {trip.total_budget_minor > 0 && (
              <div className="mt-4 flex items-center gap-2 text-[11px] text-white/75">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
                  <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
                </div>
                <span>{pct}% anggaran terpakai</span>
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function SectionHeading({
  id,
  title,
  subtitle,
  action,
}: {
  id: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 id={id} className="text-[20px] font-bold tracking-[-0.03em]">
          {title}
        </h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function AgendaRow({ item, tripId }: { item: AgendaItem; tripId: string }) {
  return (
    <Link
      to="/my-trips/$tripId/$section"
      params={{ tripId, section: "itinerary" }}
      className="tap flex items-center gap-3 rounded-2xl px-2 py-3"
    >
      <div className="flex w-14 shrink-0 flex-col items-center text-[11px] font-semibold text-muted-foreground">
        <Clock3 className="mb-1 size-4 text-brand-red" />
        {formatTime(item.start_time)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{item.title}</p>
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
          {item.location || item.activity_category || formatDate(item.activity_date)}
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function ChecklistRow({
  item,
  busy,
  onToggle,
  tripId,
}: {
  item: ChecklistItem;
  busy: boolean;
  onToggle: () => void;
  tripId: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button
        type="button"
        aria-label={
          item.is_completed ? `Tandai ${item.title} belum selesai` : `Tandai ${item.title} selesai`
        }
        onClick={onToggle}
        disabled={busy}
        className={`tap flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${item.is_completed ? "border-brand-red bg-brand-red text-white" : "border-[#c7c7cc] text-transparent"}`}
      >
        {item.is_completed && <Check className="size-4" strokeWidth={3} />}
      </button>
      <Link
        to="/my-trips/$tripId/$section"
        params={{ tripId, section: "checklist" }}
        className={`min-w-0 flex-1 truncate text-[15px] ${item.is_completed ? "text-muted-foreground line-through" : "font-medium"}`}
      >
        {item.title}
      </Link>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
    </div>
  );
}

function LogbookView({ trips }: { trips: Trip[] }) {
  return (
    <div className="mt-5 space-y-4 pb-5">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold text-muted-foreground">
          {new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date())}
        </p>
        <span className="text-[13px] text-muted-foreground">{trips.length} perjalanan</span>
      </div>
      {trips.length ? (
        trips.map((trip) => <LogbookCard key={trip.id} trip={trip} />)
      ) : (
        <EmptyTrips trips={trips} />
      )}
    </div>
  );
}

function LogbookCard({ trip }: { trip: Trip }) {
  const photo = destinationPhoto(String(trip.destination_code ?? ""));
  const pct =
    trip.total_budget_minor > 0
      ? Math.min(100, Math.round((trip.spent_minor / trip.total_budget_minor) * 100))
      : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSheet}
    >
      <Link
        to="/my-trips/$tripId"
        params={{ tripId: trip.id }}
        className="tap block overflow-hidden rounded-[26px] bg-surface shadow-[0_4px_18px_rgba(15,23,42,0.05)] ring-1 ring-border/60"
      >
        <div className="relative h-36 overflow-hidden bg-gradient-to-br from-brand-red-soft via-secondary to-background">
          {photo ? (
            <img src={photo} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Plane className="size-10 text-brand-red/50" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
          <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold">
            {trip.status === "past"
              ? "Selesai"
              : trip.status === "ongoing"
                ? "Berjalan"
                : "Akan datang"}
          </span>
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-[19px] font-bold tracking-[-0.025em]">
                {tripTitle(trip)}
              </h2>
              <p className="mt-1 flex items-center gap-1 text-[13px] text-muted-foreground">
                <MapPin className="size-3.5" />
                {trip.destination_name}
              </p>
            </div>
            <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" />
          </div>
          <div className="mt-4 flex items-center justify-between text-[12px] text-muted-foreground">
            <span>
              {formatDate(trip.departure_date, { day: "numeric", month: "short", year: "numeric" })}
            </span>
            <span>
              {trip.checklist_done}/{trip.checklist_total} checklist
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-brand-red" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function EmptyTrips({
  trips,
  user,
  loading,
  onAuthenticated,
}: {
  trips: Trip[];
  user: { id: string; email: string } | null | undefined;
  loading: boolean;
  onAuthenticated: (user: { id: string; email: string }) => void;
}) {
  return (
    <section className="mt-7 rounded-[28px] bg-surface px-5 py-10 text-center ring-1 ring-border/60">
      <CheckCircle2 className="mx-auto size-12 text-brand-red" strokeWidth={1.5} />
      <h2 className="mt-4 text-[20px] font-bold">
        {loading
          ? "Memuat perjalanan…"
          : trips.length
            ? "Belum ada perjalanan aktif"
            : "Mulai perjalananmu"}
      </h2>
      <p className="mx-auto mt-2 max-w-xs text-[14px] leading-6 text-muted-foreground">
        {loading
          ? "Sebentar, kami menyiapkan ruang perjalananmu."
          : "Simpan agenda, checklist, budget, dan booking dalam satu ruang yang tenang."}
      </p>
      {!loading &&
        (user ? (
          <Link
            to="/my-trips/new"
            className="tap mx-auto mt-6 flex h-11 max-w-xs items-center justify-center gap-2 rounded-xl bg-brand-red text-sm font-semibold text-white"
          >
            <Plus className="size-4" />
            Buat perjalanan
          </Link>
        ) : (
          <div className="mx-auto mt-6 max-w-xs">
            <CustomerAuth onAuthenticated={onAuthenticated} />
          </div>
        ))}
    </section>
  );
}

function Unauthenticated({
  onAuthenticated,
}: {
  onAuthenticated: (user: { id: string; email: string }) => void;
}) {
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
            <CustomerAuth onAuthenticated={onAuthenticated} />
          </div>
        </section>
      </div>
    </Page>
  );
}
