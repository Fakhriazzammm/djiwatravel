import { formatTripMoney } from "@/lib/trip-money";
import { MoneyInput } from "@/components/money-input";
import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, Pencil, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { btnRed, btnSoft } from "@/components/shell";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConfirmDialog, TripActionSheet, TripTabBar } from "@/components/trip-ios";
import { ShareTripSheet } from "@/components/trip-share-sheet";
import { TripOverview } from "@/components/trip-overview";
import { TripCountryPicker } from "@/components/trip-country-picker";
import { getItineraryMapConfig } from "@/lib/itinerary-map.fn";
import { DEFAULT_ITINERARY_MAP_CONFIG, type ItineraryMapConfig } from "@/lib/itinerary-map";
import { deleteTripRecord, duplicateTrip, getTrip, patchTrip } from "@/lib/my-trips.fn";
import { getFlightsStatus } from "@/lib/flights.fn";
import { flightsPathFor, showFlightsTile } from "@/lib/flights";
import { isTripAuthenticationError } from "@/lib/trip-actions";

export const Route = createFileRoute("/my-trips/$tripId")({
  loader: async ({ params, location }) => {
    try {
      const [trip, mapConfig, flights] = await Promise.all([
        getTrip({ data: { tripId: params.tripId } }),
        // The map is an enhancement: if its setting cannot be read the overview still loads.
        getItineraryMapConfig().catch(() => DEFAULT_ITINERARY_MAP_CONFIG),
        // Flight tickets are an extra: if the status cannot be read the card is simply hidden.
        getFlightsStatus().catch(() => null),
      ]);
      return { ...trip, mapConfig, flights };
    } catch (error) {
      if (isTripAuthenticationError(error)) {
        throw redirect({
          to: "/profile",
          search: {
            returnTo: location.href,
            admin: undefined,
            calendar: undefined,
            calendarSync: undefined,
          },
        });
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

const money = (minor: unknown, currency: unknown) => formatTripMoney(minor, currency);

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

type ShareLink = { token: string; createdAt: string } | null;
const dateKey = (value?: string | Date | null) => {
  if (!value) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
};

const localTodayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
};

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/** Countdown copy for the hero card, derived from the trip dates (device-local "today"). */
function tripCountdown(trip: Trip) {
  const today = localTodayKey();
  const departure = dateKey(trip.departure_date);
  const returnDate = dateKey(trip.return_date);
  const totalDays =
    departure && returnDate && returnDate >= departure ? daysBetween(departure, returnDate) + 1 : 0;
  if (!departure) return { label: "Tanggal belum diatur", value: "Atur tanggal", totalDays };
  if (returnDate && today > returnDate) return { label: "Perjalanan", value: "Selesai", totalDays };
  const until = daysBetween(today, departure);
  if (until > 0) return { label: "Berangkat dalam", value: `${until} hari`, totalDays };
  if (until === 0) return { label: "Hari ini", value: "Berangkat!", totalDays };
  const day = Math.min(totalDays || 1, Math.max(1, daysBetween(departure, today) + 1));
  return { label: "Sedang berlangsung", value: `Hari ke-${day}`, totalDays };
}

function TripDetail() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<"duplicate" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const showingChild = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId.startsWith("/my-trips/$tripId/")),
  });
  if (showingChild) return <Outlet />;

  const trip = data.trip as unknown as Trip;
  const currency = String(trip.primary_currency).trim();
  const budget = Number(trip.total_budget_minor ?? 0);
  const remaining = Number(data.totals.remainingMinor ?? 0);
  const share = data.share as ShareLink;
  const countdown = tripCountdown(trip);
  const dates =
    trip.departure_date && trip.return_date
      ? `${dateLabel(trip.departure_date)} – ${dateLabel(trip.return_date)}${
          countdown.totalDays ? ` · ${countdown.totalDays} hari` : ""
        }`
      : "Tanggal belum diatur";

  async function duplicate() {
    setBusy(true);
    try {
      const copy = await duplicateTrip({ data: { tripId: trip.id } });
      toast.success("Perjalanan diduplikasi");
      setConfirm(null);
      await navigate({ to: "/my-trips/$tripId", params: { tripId: copy.id } });
    } catch (cause) {
      toast.error(
        isTripAuthenticationError(cause)
          ? "Sesi berakhir. Masuk kembali untuk menduplikasi perjalanan."
          : cause instanceof Error
            ? cause.message
            : "Perjalanan belum dapat diduplikasi.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteTripRecord({ data: { id: trip.id } });
      toast.success("Perjalanan dihapus");
      setConfirm(null);
      await navigate({ to: "/my-trips" });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Perjalanan belum dapat dihapus.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TripOverview
        tripId={trip.id}
        name={trip.name}
        destination={trip.destination_name}
        destinationCode={trip.destination_code}
        dayLabel={countdown.value}
        datesLabel={`${trip.destination_name} · ${dates}`}
        itinerary={data.itinerary as never}
        checklist={data.checklist as never}
        bookings={data.bookings as never}
        budgetSet={budget > 0}
        remainingLabel={money(remaining, currency)}
        remainingMinor={remaining}
        mapConfig={(data.mapConfig as ItineraryMapConfig | null) ?? null}
        flightsSearch={
          data.flights?.available && showFlightsTile(data.flights.config)
            ? flightsPathFor({
                destination: trip.destination_name,
                departureDate: trip.departure_date,
                returnDate: trip.return_date,
              })
            : null
        }
        onMenu={() => setMenuOpen(true)}
        onChanged={() => router.invalidate()}
      />

      <TripTabBar tripId={trip.id} active="summary" />

      <TripActionSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title={trip.name}
        actions={[
          { label: "Bagikan perjalanan", icon: Share2, onSelect: () => setShareOpen(true) },
          { label: "Edit nama & tanggal", icon: Pencil, onSelect: () => setEditOpen(true) },
          { label: "Duplikasi", icon: Copy, onSelect: () => setConfirm("duplicate") },
          {
            label: "Hapus perjalanan",
            icon: Trash2,
            destructive: true,
            onSelect: () => setConfirm("delete"),
          },
        ]}
      />

      <ConfirmDialog
        open={confirm === "duplicate"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Duplikasi perjalanan?"
        description="Agenda, checklist, kategori anggaran, dan pemesanan disalin tanpa pengeluaran lama."
        confirmLabel="Duplikasi"
        busy={busy}
        onConfirm={duplicate}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Hapus perjalanan?"
        description={`“${trip.name}” beserta agenda, anggaran, checklist, dan data terkait akan dihapus permanen.`}
        confirmLabel="Hapus"
        destructive
        busy={busy}
        onConfirm={remove}
      />

      <EditTripSheet
        key={`${trip.id}-${editOpen}`}
        open={editOpen}
        onOpenChange={setEditOpen}
        trip={trip}
        onSaved={() => router.invalidate()}
      />
      <ShareTripSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        trip={trip}
        share={share}
        onChanged={() => router.invalidate()}
      />
    </>
  );
}

function EditTripSheet({
  open,
  onOpenChange,
  trip,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: Trip;
  onSaved: () => Promise<unknown> | void;
}) {
  const [saving, setSaving] = useState(false);
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
      toast.success("Perjalanan diperbarui");
      onOpenChange(false);
      await onSaved();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Perubahan belum tersimpan.");
    } finally {
      setSaving(false);
    }
  }

  const input =
    "min-h-11 w-full min-w-0 rounded-xl bg-secondary px-3 text-[16px] outline-none focus:ring-2 focus:ring-brand-red/25";
  const text = (key: "name" | "departureDate" | "returnDate", label: string, type = "text") => (
    <label className="block">
      <span className="mb-1 block px-1 text-[12px] font-medium text-muted-foreground">{label}</span>
      <input
        required
        type={type}
        value={form[key]}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
        className={input}
      />
    </label>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[24px] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4"
      >
        <SheetHeader className="mb-4 text-left">
          <SheetTitle>Edit perjalanan</SheetTitle>
          <SheetDescription className="sr-only">Ubah nama, tanggal, dan anggaran</SheetDescription>
        </SheetHeader>
        <form onSubmit={save} className="space-y-3">
          {text("name", "Nama perjalanan")}
          {/* The country is the map's source, so it is picked from the list, not typed. */}
          <div className="block">
            <span className="mb-1 block px-1 text-[12px] font-medium text-muted-foreground">
              Negara
            </span>
            <div className={`${input} flex items-center`}>
              <TripCountryPicker
                value={form.destinationCode}
                onChange={(country) =>
                  setForm({
                    ...form,
                    destinationCode: country.code,
                    destinationName: country.name,
                  })
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {text("departureDate", "Berangkat", "date")}
            {text("returnDate", "Pulang", "date")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block px-1 text-[12px] font-medium text-muted-foreground">
                Traveler
              </span>
              <input
                type="number"
                min="1"
                max="50"
                value={form.travelersCount}
                onChange={(event) =>
                  setForm({ ...form, travelersCount: Number(event.target.value) })
                }
                className={input}
              />
            </label>
            <label className="block">
              <span className="mb-1 block px-1 text-[12px] font-medium text-muted-foreground">
                Total anggaran
              </span>
              <MoneyInput
                value={form.totalBudgetMinor ? String(Math.round(form.totalBudgetMinor / 100)) : ""}
                onValueChange={(digits) =>
                  setForm({ ...form, totalBudgetMinor: Number(digits || 0) * 100 })
                }
                placeholder="Rp 1.000.000"
                aria-label="Total anggaran"
                className={input}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className={btnSoft}>
              Batal
            </button>
            <button disabled={saving} className={btnRed}>
              {saving ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
