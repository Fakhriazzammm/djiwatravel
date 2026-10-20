import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarDays,
  CheckSquare2,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Plus,
  Smartphone,
  WalletCards,
} from "lucide-react";
import { useState } from "react";
import { BackBar, Page, btnSoft, group, row } from "@/components/shell";
import { getTrip, postChecklist, patchChecklist } from "@/lib/my-trips.server";

export const Route = createFileRoute("/my-trips/$tripId")({
  loader: ({ params }) => getTrip({ data: { tripId: params.tripId } }),
  component: TripDetail,
});
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(
    new Date(`${value}T00:00:00`),
  );
const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    minor / 100,
  );
function TripDetail() {
  const data = Route.useLoaderData();
  const { trip: rawTrip, totals } = data;
  const trip = rawTrip as unknown as {
    id: string;
    name: string;
    destination_name: string;
    departure_date: string;
    return_date: string;
    primary_currency: string;
    status: string;
  };
  const [checklist, setChecklist] = useState(data.checklist);
  const [newTask, setNewTask] = useState("");
  const [error, setError] = useState<string | null>(null);
  const completed = checklist.filter((item) => item.is_completed).length;
  const progress = checklist.length ? Math.round((completed / checklist.length) * 100) : 0;
  async function toggle(id: string, value: boolean) {
    try {
      const updated = await patchChecklist({ data: { id, completed: value } });
      setChecklist((items) => items.map((item) => (item.id === id ? updated : item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checklist belum dapat diperbarui.");
    }
  }
  async function addTask(event: React.FormEvent) {
    event.preventDefault();
    if (!newTask.trim()) return;
    try {
      const item = await postChecklist({ data: { tripId: trip.id, title: newTask.trim() } });
      setChecklist((items) => [...items, item]);
      setNewTask("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checklist belum dapat ditambahkan.");
    }
  }
  return (
    <Page>
      <BackBar title="Detail Perjalanan" />
      <header className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border/50">
        <div className="flex items-start gap-3">
          <span className="flex size-12 items-center justify-center rounded-xl bg-brand-red-soft text-2xl">
            🌏
          </span>
          <div>
            <h1 className="text-xl font-bold">{trip.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {trip.destination_name} · {trip.status}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {dateLabel(String(trip.departure_date))} — {dateLabel(String(trip.return_date))}
            </p>
          </div>
        </div>
      </header>
      <section className="mt-5 grid grid-cols-2 gap-3">
        <Metric
          icon={<WalletCards />}
          label="Terpakai"
          value={money(totals.spentMinor, String(trip.primary_currency).trim())}
        />
        <Metric
          icon={<CircleDollarSign />}
          label="Sisa budget"
          value={money(totals.remainingMinor, String(trip.primary_currency).trim())}
        />
      </section>
      <section className="mt-6">
        <h2 className="mb-3 px-1 text-sm font-semibold text-muted-foreground">
          Rencana perjalanan
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Action section="budget" tripId={trip.id} icon={<WalletCards />} label="Budget" />
          <Action
            section="expenses"
            tripId={trip.id}
            icon={<CircleDollarSign />}
            label="Expenses"
          />
          <Action section="itinerary" tripId={trip.id} icon={<CalendarDays />} label="Itinerary" />
          <Action section="checklist" tripId={trip.id} icon={<CheckSquare2 />} label="Checklist" />
          <Action to="/my-esim" icon={<Smartphone />} label="My eSIM" />
          <Action section="bookings" tripId={trip.id} icon={<FileText />} label="Bookings" />
        </div>
      </section>
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Checklist · {progress}%</h2>
          <span className="text-xs text-muted-foreground">
            {completed}/{checklist.length}
          </span>
        </div>
        <div className={group}>
          {checklist.slice(0, 6).map((item) => (
            <label key={item.id} className={`${row} cursor-pointer`}>
              <span className="flex min-w-0 items-center gap-3">
                <input
                  type="checkbox"
                  checked={item.is_completed}
                  onChange={(e) => void toggle(item.id, e.target.checked)}
                  className="size-4 accent-brand-red"
                />
                <span
                  className={`truncate text-sm ${item.is_completed ? "text-muted-foreground line-through" : "font-medium"}`}
                >
                  {item.title}
                </span>
              </span>
            </label>
          ))}
          <form onSubmit={addTask} className={row}>
            <Plus className="size-4 text-muted-foreground" />
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="Tambah checklist"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </form>
        </div>
      </section>
      {error && (
        <p
          className="mt-4 rounded-xl bg-brand-red-soft px-3 py-2 text-sm text-brand-red"
          role="alert"
        >
          {error}
        </p>
      )}
      <section className="mt-6">
        <h2 className="mb-3 px-1 text-sm font-semibold text-muted-foreground">Agenda berikutnya</h2>
        {data.itinerary[0] ? (
          <div className="rounded-2xl bg-surface p-4">
            <p className="text-xs text-muted-foreground">
              {dateLabel(String(data.itinerary[0].activity_date))}
            </p>
            <p className="mt-1 font-semibold">{data.itinerary[0].title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.itinerary[0].location || "Lokasi belum ditentukan"}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">
            Belum ada agenda. Tambahkan dari Itinerary.
          </div>
        )}
      </section>
    </Page>
  );
}
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3 ring-1 ring-border/50">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 truncate text-sm font-bold">{value}</p>
    </div>
  );
}
function Action({
  to,
  section,
  tripId,
  icon,
  label,
}: {
  to?: string;
  section?: string;
  tripId?: string;
  icon: React.ReactNode;
  label: string;
}) {
  if (to) {
    return (
      <Link to={to} className={`${btnSoft} h-16 justify-start px-4`}>
        <span className="text-brand-red">{icon}</span>
        <span className="flex-1 text-left">{label}</span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
    );
  }
  return (
    <Link
      to="/my-trips/$tripId/$section"
      params={{ tripId: tripId!, section: section! }}
      className={`${btnSoft} h-16 justify-start px-4`}
    >
      <span className="text-brand-red">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </Link>
  );
}
