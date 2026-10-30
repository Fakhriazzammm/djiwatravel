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
  ClipboardCheck,
  Compass,
  Copy,
  Link2,
  MapPin,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { BackBar, Page, btnRed, btnSoft } from "@/components/shell";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  deleteTripRecord,
  deleteTripShare,
  duplicateTrip,
  getTrip,
  patchTrip,
  postTripShare,
} from "@/lib/my-trips.fn";
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

function TripDetail() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const showingChild = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId.startsWith("/my-trips/$tripId/")),
  });
  if (showingChild) return <Outlet />;

  const trip = data.trip as unknown as Trip;
  const currency = String(trip.primary_currency).trim();
  const remaining = Number(data.totals.remainingMinor ?? 0);
  const budget = Number(trip.total_budget_minor ?? 0);
  const spent = Number(data.totals.spentMinor ?? 0);
  const budgetPercent = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const checklistItems = data.checklist as Array<{ is_completed?: boolean }>;
  const completedChecklist = checklistItems.filter((item) => item.is_completed).length;
  const share = data.share as ShareLink;

  async function duplicate() {
    if (
      !window.confirm(
        `Duplikasi “${trip.name}”? Agenda, checklist, kategori anggaran, dan pemesanan akan disalin ke perjalanan baru tanpa pengeluaran lama.`,
      )
    )
      return;
    setDuplicating(true);
    try {
      const copy = await duplicateTrip({ data: { tripId: trip.id } });
      toast.success("Perjalanan diduplikasi");
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
      setDuplicating(false);
    }
  }

  return (
    <Page>
      <TripHeaderEditor trip={trip} onSaved={() => window.location.reload()} />

      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-0.5">
        <Link
          to="/my-trips/$tripId/travel"
          params={{ tripId: trip.id }}
          className="tap flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[12px] font-semibold text-background"
        >
          <Compass className="size-3.5" /> Mode perjalanan
        </Link>
        <button
          type="button"
          onClick={() => void duplicate()}
          disabled={duplicating}
          className="tap flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3.5 text-[12px] font-semibold text-foreground disabled:opacity-50"
        >
          <Copy className="size-3.5" /> {duplicating ? "Menduplikasi…" : "Duplikasi"}
        </button>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="tap flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3.5 text-[12px] font-semibold text-foreground"
        >
          <Share2 className="size-3.5" /> Bagikan
        </button>
      </div>

      <TimelineSummary
        trip={trip}
        itinerary={data.itinerary as ItineraryRow[]}
        checklist={checklistItems}
      />

      <section
        className="mt-4 rounded-[24px] bg-foreground p-5 text-background"
        aria-label="Ringkasan perjalanan"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-background/65">Persiapan perjalanan</p>
            <p className="mt-1 text-2xl font-bold tracking-tight">
              {checklistItems.length
                ? `${completedChecklist} dari ${checklistItems.length} selesai`
                : "Mulai persiapanmu"}
            </p>
          </div>
          <ClipboardCheck className="size-5 shrink-0 text-background/75" />
        </div>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-background/20"
          role="progressbar"
          aria-label="Checklist persiapan"
          aria-valuemin={0}
          aria-valuemax={checklistItems.length || 1}
          aria-valuenow={completedChecklist}
        >
          <div
            className="h-full rounded-full bg-background transition-[width]"
            style={{
              width: `${checklistItems.length ? Math.round((completedChecklist / checklistItems.length) * 100) : 0}%`,
            }}
          />
        </div>
        <p className="mt-3 text-xs text-background/70">
          {trip.destination_name} · {trip.travelers_count} traveler
          {trip.travelers_count === 1 ? "" : "s"}
        </p>
      </section>

      <Link
        to="/my-trips/$tripId/$section"
        params={{ tripId: trip.id, section: "budget" }}
        className="tap mt-4 block rounded-2xl bg-surface p-4 transition-colors active:bg-secondary/60"
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

function TimelineSummary({
  trip,
  itinerary,
  checklist,
}: {
  trip: Trip;
  itinerary: ItineraryRow[];
  checklist: Array<{ is_completed?: boolean }>;
}) {
  const today = localTodayKey();
  const departure = dateKey(trip.departure_date);
  const returnDate = dateKey(trip.return_date);
  const totalDays =
    departure && returnDate && returnDate >= departure ? daysBetween(departure, returnDate) + 1 : 0;
  const daysUntil = departure ? daysBetween(today, departure) : null;
  const dayNumber =
    departure && today >= departure
      ? Math.min(totalDays || 1, Math.max(1, daysBetween(departure, today) + 1))
      : null;
  const completed = checklist.filter((item) => item.is_completed).length;
  const sorted = [...itinerary]
    .filter((item) => dateKey(item.activity_date))
    .sort((a, b) =>
      `${dateKey(a.activity_date)}T${String(a.start_time ?? "99:99")}`.localeCompare(
        `${dateKey(b.activity_date)}T${String(b.start_time ?? "99:99")}`,
      ),
    );
  const ended = Boolean(returnDate && today > returnDate);
  const nextActivity = ended
    ? (sorted[sorted.length - 1] ?? null)
    : (sorted.find((item) => dateKey(item.activity_date) >= today) ?? sorted[0] ?? null);
  const agendaDays = new Set(sorted.map((item) => dateKey(item.activity_date))).size;
  const phase = ended
    ? "Selesai"
    : daysUntil === null
      ? "Tanggal belum diatur"
      : daysUntil > 0
        ? `H-${daysUntil}`
        : daysUntil === 0
          ? "Hari ini"
          : dayNumber && totalDays
            ? `Hari ke-${dayNumber}`
            : "Selesai";
  const progress = ended
    ? 100
    : daysUntil !== null && daysUntil <= 0 && totalDays > 0
      ? Math.min(100, Math.round(((dayNumber ?? totalDays) / totalDays) * 100))
      : checklist.length
        ? Math.round((completed / checklist.length) * 100)
        : 0;

  return (
    <section
      className="mt-4 rounded-[24px] bg-surface p-5 ring-1 ring-border/50"
      aria-label="Ringkasan timeline"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Ringkasan timeline</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {trip.departure_date && trip.return_date
              ? `${dateLabel(trip.departure_date)} — ${dateLabel(trip.return_date)}${
                  totalDays ? ` · ${totalDays} hari` : ""
                }`
              : "Atur tanggal perjalanan untuk melihat hitung mundur."}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-foreground px-2.5 py-1 text-[11px] font-bold text-background">
          {phase}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-secondary/70 px-2 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Agenda
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums">{itinerary.length}</p>
        </div>
        <div className="rounded-xl bg-secondary/70 px-2 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Hari terisi
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums">{agendaDays}</p>
        </div>
        <div className="rounded-xl bg-secondary/70 px-2 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Persiapan
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums">
            {completed}/{checklist.length}
          </p>
        </div>
      </div>

      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-label={
          daysUntil !== null && daysUntil <= 0 ? "Progres hari perjalanan" : "Progres persiapan"
        }
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div className="h-full rounded-full bg-brand-red" style={{ width: `${progress}%` }} />
      </div>

      {nextActivity ? (
        <Link
          to="/my-trips/$tripId/$section"
          params={{ tripId: trip.id, section: "itinerary" }}
          className="tap mt-3 flex items-center gap-3 rounded-xl bg-secondary/60 px-3 py-2.5"
        >
          <CalendarDays className="size-4 shrink-0 text-brand-red" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">
              {nextActivity.title || "Aktivitas"}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {dateLabel(dateKey(nextActivity.activity_date))}
              {nextActivity.start_time ? ` · ${String(nextActivity.start_time).slice(0, 5)}` : ""}
              {nextActivity.location ? ` · ${String(nextActivity.location)}` : ""}
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      ) : (
        <Link
          to="/my-trips/$tripId/$section"
          params={{ tripId: trip.id, section: "itinerary" }}
          className="tap mt-3 flex items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2.5 text-[13px] text-muted-foreground"
        >
          <CalendarDays className="size-4 text-brand-red" />
          Belum ada agenda. Susun rencana perjalananmu.
        </Link>
      )}
    </section>
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
    if (!window.confirm("Cabut tautan ini? Orang lain tidak bisa lagi membuka itinerary.")) return;
    setBusy(true);
    try {
      await deleteTripShare({ data: { tripId: trip.id } });
      toast.success("Tautan dibagikan dicabut");
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
                className={`${btnSoft} min-h-12 rounded-2xl`}
              >
                <Copy className="size-4" /> Salin
              </button>
              <button
                type="button"
                onClick={() => void shareNative()}
                className={`${btnRed} min-h-12 rounded-2xl`}
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
              onClick={() => void revoke()}
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
              className={`${btnRed} min-h-12 rounded-2xl`}
            >
              {busy ? "Membuat tautan…" : "Buat tautan bagikan"}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
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
