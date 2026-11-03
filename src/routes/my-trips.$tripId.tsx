import { formatTripMoney } from "@/lib/trip-money";
import { MoneyInput } from "@/components/money-input";
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  Compass,
  Copy,
  Link2,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plane,
  Share2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Page, btnRed, btnSoft } from "@/components/shell";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ConfirmDialog,
  ProgressRing,
  TripActionSheet,
  TripNavBar,
  TripTabBar,
  iosGroup,
  iosHeading,
} from "@/components/trip-ios";
import {
  deleteTripRecord,
  deleteTripShare,
  duplicateTrip,
  getTrip,
  patchTrip,
  postTripShare,
} from "@/lib/my-trips.fn";
import { isTripAuthenticationError } from "@/lib/trip-actions";

export const Route = createFileRoute("/my-trips/$tripId")({
  loader: async ({ params, location }) => {
    try {
      return await getTrip({ data: { tripId: params.tripId } });
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
type ItineraryRow = {
  id?: string;
  activity_date?: string | Date | null;
  start_time?: string | null;
  end_time?: string | null;
  title?: string | null;
  location?: string | null;
  activity_category?: string | null;
};
type BookingRow = { id?: string; title?: unknown; status?: unknown; provider?: unknown };

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

function nextAgenda(itinerary: ItineraryRow[], trip: Trip) {
  const today = localTodayKey();
  const sorted = [...itinerary]
    .filter((item) => dateKey(item.activity_date))
    .sort((a, b) =>
      `${dateKey(a.activity_date)}T${String(a.start_time ?? "99:99")}`.localeCompare(
        `${dateKey(b.activity_date)}T${String(b.start_time ?? "99:99")}`,
      ),
    );
  const returnDate = dateKey(trip.return_date);
  if (returnDate && today > returnDate) return sorted[sorted.length - 1] ?? null;
  return sorted.find((item) => dateKey(item.activity_date) >= today) ?? sorted[0] ?? null;
}

const bookingStatus = (value: unknown) => {
  const key = String(value ?? "").toLowerCase();
  if (["confirmed", "terkonfirmasi", "booked", "paid"].includes(key))
    return { label: "Terkonfirmasi", tone: "bg-success/15 text-success" };
  if (["cancelled", "canceled", "dibatalkan"].includes(key))
    return { label: "Dibatalkan", tone: "bg-destructive/10 text-destructive" };
  return { label: key ? "Menunggu" : "Tersimpan", tone: "bg-warning/15 text-warning-foreground" };
};

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
  const spent = Number(data.totals.spentMinor ?? 0);
  const remaining = Number(data.totals.remainingMinor ?? 0);
  const budgetPercent = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const checklistItems = data.checklist as Array<{ is_completed?: boolean }>;
  const completed = checklistItems.filter((item) => item.is_completed).length;
  const checklistPercent = checklistItems.length ? (completed / checklistItems.length) * 100 : 0;
  const share = data.share as ShareLink;
  const bookings = data.bookings as BookingRow[];
  const countdown = tripCountdown(trip);
  const next = nextAgenda(data.itinerary as ItineraryRow[], trip);
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
    <Page tabs={false}>
      <TripNavBar
        backLabel="Perjalanan"
        backTo="list"
        action={
          <button
            type="button"
            aria-label="Menu perjalanan"
            onClick={() => setMenuOpen(true)}
            className="tap grid size-11 place-items-center rounded-full text-brand-red"
          >
            <MoreHorizontal className="size-6" aria-hidden="true" />
          </button>
        }
      />

      <header className="px-1 pb-3 pt-1">
        <h1 className="text-[22px] font-bold leading-tight tracking-tight">{trip.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[14px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden="true" />
            {trip.destination_name}
          </span>
          <span aria-hidden="true">·</span>
          <span>{dates}</span>
        </p>
      </header>

      <div className="space-y-4">
        <section
          aria-label="Hitung mundur"
          className="relative overflow-hidden rounded-[18px] bg-gradient-to-br from-[#ff7a7e] via-brand-red to-[#c92f3a] p-4 text-white"
        >
          <Plane className="absolute right-4 top-4 size-8 opacity-90" aria-hidden="true" />
          <p className="text-[12px] font-medium text-white/85">{countdown.label}</p>
          <p className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
            {countdown.value}
          </p>
          <p className="text-[12px] text-white/85">
            {trip.travelers_count} traveler{trip.travelers_count === 1 ? "" : "s"}
          </p>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/my-trips/$tripId/$section"
            params={{ tripId: trip.id, section: "checklist" }}
            className={`tap flex items-center gap-3 p-3 ${iosGroup}`}
          >
            <ProgressRing
              percent={checklistPercent}
              label="Checklist selesai"
              color="var(--brand-red)"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">Checklist</span>
              <span className="block truncate text-[12px] text-muted-foreground">
                {checklistItems.length
                  ? `${completed}/${checklistItems.length} selesai`
                  : "Belum ada"}
              </span>
            </span>
          </Link>
          <Link
            to="/my-trips/$tripId/$section"
            params={{ tripId: trip.id, section: "budget" }}
            className={`tap flex items-center gap-3 p-3 ${iosGroup}`}
          >
            <ProgressRing
              percent={budgetPercent}
              label="Anggaran terpakai"
              color="var(--success)"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">Anggaran</span>
              <span className="block truncate text-[12px] text-muted-foreground">
                {budget > 0 ? `Sisa ${money(remaining, currency)}` : "Belum diatur"}
              </span>
            </span>
          </Link>
        </div>

        <section>
          <h2 className={iosHeading}>Berikutnya</h2>
          <div className={iosGroup}>
            <Link
              to="/my-trips/$tripId/$section"
              params={{ tripId: trip.id, section: "itinerary" }}
              className="tap flex min-h-[56px] items-center gap-3 px-3"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-red text-white">
                <CalendarDays className="size-[18px]" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">
                  {next?.title || "Belum ada agenda"}
                </span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {next
                    ? `${dateLabel(dateKey(next.activity_date))}${
                        next.start_time ? ` · ${String(next.start_time).slice(0, 5)}` : ""
                      }${next.location ? ` · ${String(next.location)}` : ""}`
                    : "Susun rencana perjalananmu"}
                </span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground/60"
                aria-hidden="true"
              />
            </Link>
            <Link
              to="/my-trips/$tripId/travel"
              params={{ tripId: trip.id }}
              className="tap flex min-h-[48px] items-center gap-3 border-t border-border/60 px-3"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-background">
                <Compass className="size-[18px]" aria-hidden="true" />
              </span>
              <span className="flex-1 text-[15px] font-medium">Mode perjalanan</span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground/60"
                aria-hidden="true"
              />
            </Link>
          </div>
        </section>

        <section>
          <h2 className={iosHeading}>Pemesanan</h2>
          <div className={iosGroup}>
            {bookings.slice(0, 3).map((booking, index) => {
              const status = bookingStatus(booking.status);
              return (
                <Link
                  key={String(booking.id ?? index)}
                  to="/my-trips/$tripId/$section"
                  params={{ tripId: trip.id, section: "bookings" }}
                  className="tap flex min-h-[48px] items-center gap-3 border-b border-border/60 px-3 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[15px]">
                    {String(booking.title ?? "Pemesanan")}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.tone}`}
                  >
                    {status.label}
                  </span>
                </Link>
              );
            })}
            <Link
              to="/my-trips/$tripId/$section"
              params={{ tripId: trip.id, section: "bookings" }}
              className="tap flex min-h-[48px] items-center justify-between px-3 text-[15px] text-brand-red"
            >
              {bookings.length ? `Lihat semua (${bookings.length})` : "Tambah pemesanan"}
              <ChevronRight className="size-4 text-muted-foreground/60" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>

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
    </Page>
  );
}

function ShareTripSheet({
  open,
  onOpenChange,
  trip,
  share,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: Trip;
  share: ShareLink;
  onChanged: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl(share ? `${window.location.origin}/share/${share.token}` : "");
  }, [share]);

  async function create() {
    setBusy(true);
    try {
      await postTripShare({ data: { tripId: trip.id } });
      toast.success("Tautan itinerary dibuat");
      await onChanged();
    } catch (cause) {
      toast.error(
        isTripAuthenticationError(cause)
          ? "Sesi berakhir. Masuk kembali untuk membagikan itinerary."
          : "Tautan belum dapat dibuat. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Tautan disalin");
    } catch {
      toast.error("Tautan belum dapat disalin.");
    }
  }

  async function shareNative() {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${trip.name} — itinerary`,
          text: `Itinerary ${trip.name} ke ${trip.destination_name}`,
          url,
        });
        return;
      } catch {
        // The user may dismiss the native sheet; fall back to copying.
      }
    }
    await copy();
  }

  async function revoke() {
    setBusy(true);
    try {
      await deleteTripShare({ data: { tripId: trip.id } });
      toast.success("Tautan dibagikan dicabut");
      setConfirmRevoke(false);
      await onChanged();
    } catch (cause) {
      toast.error(
        isTripAuthenticationError(cause)
          ? "Sesi berakhir. Masuk kembali untuk mencabut tautan."
          : "Tautan belum dapat dicabut. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-7"
      >
        <div
          className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/25"
          aria-hidden="true"
        />
        <SheetHeader className="mb-5 text-left">
          <SheetTitle>Bagikan itinerary</SheetTitle>
          <SheetDescription>
            Tautan baca-saja berisi nama perjalanan, tanggal, dan agenda. Pengeluaran, checklist,
            dan data pribadi tidak ikut dibagikan.
          </SheetDescription>
        </SheetHeader>

        {share ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-secondary/70 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tautan aktif
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Link2 className="size-4 shrink-0 text-brand-red" />
                <input
                  readOnly
                  value={url}
                  aria-label="Tautan itinerary"
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-h-10 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void copy()}
                className={`${btnSoft} min-h-10 rounded-xl`}
              >
                <Copy className="size-4" /> Salin
              </button>
              <button
                type="button"
                onClick={() => void shareNative()}
                className={`${btnRed} min-h-10 rounded-xl`}
              >
                <Share2 className="size-4" /> Bagikan
              </button>
            </div>
            <p className="px-1 text-[11px] leading-5 text-muted-foreground">
              Siapa pun yang memiliki tautan dapat membuka itinerary ini. Cabut tautan jika sudah
              tidak ingin dibagikan.
            </p>
            <button
              type="button"
              onClick={() => setConfirmRevoke(true)}
              disabled={busy}
              className="tap min-h-11 w-full rounded-xl text-sm font-semibold text-brand-red disabled:opacity-50"
            >
              {busy ? "Memproses…" : "Cabut tautan"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl bg-secondary/70 p-4 text-sm text-muted-foreground">
              Buat tautan baca-saja yang bisa dibuka tanpa login. Isinya hanya itinerary perjalanan.
            </div>
            <button
              type="button"
              onClick={() => void create()}
              disabled={busy}
              className={`${btnRed} min-h-10 rounded-xl`}
            >
              {busy ? "Membuat tautan…" : "Buat tautan bagikan"}
            </button>
          </div>
        )}
      </SheetContent>
      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Cabut tautan?"
        description="Orang lain tidak bisa lagi membuka itinerary ini."
        confirmLabel="Cabut"
        destructive
        busy={busy}
        onConfirm={revoke}
      />
    </Sheet>
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
  const text = (
    key: "name" | "destinationName" | "departureDate" | "returnDate",
    label: string,
    type = "text",
  ) => (
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
        className="mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[24px] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-6"
      >
        <SheetHeader className="mb-4 text-left">
          <SheetTitle>Edit perjalanan</SheetTitle>
          <SheetDescription className="sr-only">Ubah nama, tanggal, dan anggaran</SheetDescription>
        </SheetHeader>
        <form onSubmit={save} className="space-y-3">
          {text("name", "Nama perjalanan")}
          {text("destinationName", "Destinasi")}
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
