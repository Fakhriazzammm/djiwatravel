import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, ChevronRight, MapPin } from "lucide-react";
import { BackBar, Page, btnRed, btnSoft } from "@/components/shell";
import { deleteTripRecord, getTrip, patchTrip } from "@/lib/my-trips.server";
import { isTripAuthenticationError } from "@/lib/trip-actions";
import { TripWorkspace } from "./my-trips.$tripId.$section";

export const Route = createFileRoute("/my-trips/$tripId")({
  loader: async ({ params, location }) => {
    try {
      return await getTrip({ data: { tripId: params.tripId } });
    } catch (error) {
      if (isTripAuthenticationError(error)) {
        throw redirect({ to: "/profile", search: { returnTo: location.href } });
      }
      throw error;
    }
  },
  component: TripDetail,
});

const dateLabel = (value?: string | null) => {
  if (!value) return "Belum diatur";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "Belum diatur"
    : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(date);
};

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);

type Trip = {
  id: string;
  name: string;
  destination_name: string;
  destination_code: string;
  departure_date?: string | null;
  return_date?: string | null;
  travelers_count: number;
  primary_currency: string;
  total_budget_minor: number;
  timezone?: string;
  status: string;
};

function TripDetail() {
  const data = Route.useLoaderData();
  const showingSection = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId === "/my-trips/$tripId/$section"),
  });
  if (showingSection) return <Outlet />;

  const trip = data.trip as unknown as Trip;
  const currency = String(trip.primary_currency).trim();
  const remaining = Number(data.totals.remainingMinor ?? 0);
  const budget = Number(trip.total_budget_minor ?? 0);
  const spent = Number(data.totals.spentMinor ?? 0);
  const budgetPercent = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  return (
    <Page>
      <TripHeaderEditor trip={trip} onSaved={() => window.location.reload()} />

      <Link
        to="/my-trips/$tripId/$section"
        params={{ tripId: trip.id, section: "budget" }}
        className="tap mt-5 block rounded-2xl bg-surface p-4 transition-colors active:bg-secondary/60"
        aria-label="Buka detail anggaran"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-muted-foreground">Sisa anggaran</p>
            <p className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.035em]">
              {money(remaining, currency)}
            </p>
          </div>
          <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground/60" />
        </div>
        {budget > 0 ? (
          <>
            <div
              className="mt-5 h-1.5 overflow-hidden rounded-full bg-secondary"
              role="progressbar"
              aria-label="Anggaran digunakan"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={budgetPercent}
            >
              <div
                className="h-full rounded-full bg-brand-red transition-[width] duration-500"
                style={{ width: `${budgetPercent}%` }}
              />
            </div>
            <div className="mt-2.5 flex justify-between gap-3 text-[13px] text-muted-foreground">
              <span>{money(spent, currency)} terpakai</span>
              <span className="shrink-0">{budgetPercent}% digunakan</span>
            </div>
          </>
        ) : (
          <p className="mt-3 text-[14px] text-muted-foreground">
            Atur alokasi dan pantau dana perjalananmu.
          </p>
        )}
      </Link>

      <TripWorkspace
        tripId={trip.id}
        expenses={data.expenses}
        itinerary={data.itinerary}
        checklist={data.checklist}
        bookings={data.bookings}
      />
    </Page>
  );
}

function TripHeaderEditor({ trip, onSaved }: { trip: Trip; onSaved: () => void }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: trip.name,
    destinationName: trip.destination_name,
    departureDate: trip.departure_date ?? "",
    returnDate: trip.return_date ?? "",
    travelersCount: trip.travelers_count,
    totalBudgetMinor: trip.total_budget_minor,
    timezone: trip.timezone ?? "",
    destinationCode: trip.destination_code,
    primaryCurrency: trip.primary_currency.trim() as "IDR" | "JPY" | "USD" | "SGD" | "KRW",
  });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await patchTrip({ data: { tripId: trip.id, ...form } });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function removeTrip() {
    if (
      !window.confirm(
        `Hapus perjalanan “${trip.name}”? Semua agenda, budget, checklist, dan data terkait akan dihapus.`,
      )
    )
      return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteTripRecord({ data: { id: trip.id } });
      await navigate({ to: "/my-trips" });
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Perjalanan belum dapat dihapus.");
    } finally {
      setDeleting(false);
    }
  }

  const field = (
    key: "name" | "destinationName" | "departureDate" | "returnDate",
    placeholder: string,
    type = "text",
  ) => (
    <input
      required
      type={type}
      value={form[key]}
      onChange={(event) => setForm({ ...form, [key]: event.target.value })}
      placeholder={placeholder}
      aria-label={placeholder}
      className="min-h-11 min-w-0 flex-1 rounded-xl bg-secondary px-3 text-[15px] outline-none focus:ring-2 focus:ring-brand-red/25"
    />
  );

  return (
    <>
      <BackBar
        title={editing ? "Edit Perjalanan" : "Perjalanan"}
        action={
          editing ? undefined : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="tap flex min-h-11 items-center justify-end px-1 text-[16px] font-medium text-brand-red"
            >
              Edit
            </button>
          )
        }
      />

      {editing ? (
        <form onSubmit={save} className="mt-2 rounded-2xl bg-surface p-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {field("name", "Nama perjalanan")}
            {field("destinationName", "Destinasi")}
            {field("departureDate", "Tanggal berangkat", "date")}
            {field("returnDate", "Tanggal pulang", "date")}
            <input
              type="number"
              min="1"
              max="50"
              value={form.travelersCount}
              onChange={(event) => setForm({ ...form, travelersCount: Number(event.target.value) })}
              placeholder="Jumlah traveler"
              aria-label="Jumlah traveler"
              className="min-h-11 rounded-xl bg-secondary px-3 text-[15px] outline-none focus:ring-2 focus:ring-brand-red/25"
            />
            <input
              type="number"
              min="0"
              value={form.totalBudgetMinor / 100}
              onChange={(event) =>
                setForm({
                  ...form,
                  totalBudgetMinor: Math.round(Number(event.target.value || 0) * 100),
                })
              }
              placeholder="Total anggaran"
              aria-label="Total anggaran"
              className="min-h-11 rounded-xl bg-secondary px-3 text-[15px] outline-none focus:ring-2 focus:ring-brand-red/25"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className={btnSoft}>
              Batal
            </button>
            <button disabled={saving} className={btnRed}>
              {saving ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      ) : (
        <header className="px-1 pt-2">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-[32px] font-bold leading-[1.12] tracking-[-0.04em]">{trip.name}</h1>
            <button
              type="button"
              onClick={() => void removeTrip()}
              disabled={deleting}
              className="tap shrink-0 rounded-xl px-2 py-2 text-sm font-semibold text-destructive disabled:opacity-50"
            >
              {deleting ? "Menghapus…" : "Hapus"}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-muted-foreground">
            <span className="flex min-h-8 items-center gap-1.5">
              <MapPin className="size-4" strokeWidth={1.9} />
              {trip.destination_name}
            </span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={`tap -my-1 flex min-h-11 items-center gap-1.5 text-left ${
                trip.departure_date ? "" : "font-medium text-brand-red"
              }`}
            >
              <CalendarDays className="size-4" strokeWidth={1.9} />
              {trip.departure_date
                ? `${dateLabel(trip.departure_date)} — ${
                    trip.return_date ? dateLabel(trip.return_date) : "Atur tanggal pulang"
                  }`
                : "Atur tanggal perjalanan"}
            </button>
          </div>
          {deleteError && <p className="mt-3 text-sm text-destructive">{deleteError}</p>}
        </header>
      )}
    </>
  );
}
