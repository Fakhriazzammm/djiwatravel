import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Compass,
  MapPin,
  Plus,
  WalletCards,
} from "lucide-react";
import { BackBar, Page } from "@/components/shell";
import { displayChecklistTitle } from "@/lib/my-trips-home";
import { getTrip, patchChecklist } from "@/lib/my-trips.server";
import { isTripAuthenticationError, runTripMutation } from "@/lib/trip-actions";

export const Route = createFileRoute("/my-trips/$tripId/travel")({
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
  head: () => ({
    meta: [{ title: "Mode Perjalanan — Djiwa Travel" }, { name: "robots", content: "noindex" }],
  }),
  component: TravelMode,
});

type TripData = Awaited<ReturnType<typeof getTrip>>;
type Trip = TripData["trip"] & {
  id: string;
  name: string;
  destination_name: string;
  departure_date: string | null;
  return_date: string | null;
  primary_currency: string;
  total_budget_minor: number;
  travelers_count: number;
};
type ItineraryItem = {
  id: string;
  activity_date?: string | Date | null;
  start_time?: string | null;
  end_time?: string | null;
  title?: string | null;
  location?: string | null;
  activity_category?: string | null;
};
type ChecklistItem = {
  id: string;
  title: string;
  is_completed: boolean;
};

const dateKey = (value?: string | Date | null) => {
  if (!value) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
};

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
};

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

const dateLabel = (value?: string | Date | null) => {
  const key = dateKey(value);
  if (!key) return "Tanggal belum diatur";
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${key}T12:00:00`));
};

const shortDate = (value?: string | Date | null) => {
  const key = dateKey(value);
  if (!key) return "Tanggal belum diatur";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(
    new Date(`${key}T12:00:00`),
  );
};

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: currency.trim(),
    maximumFractionDigits: 0,
  }).format(minor / 100);

const minutes = (value?: string | null) => {
  const match = String(value ?? "").match(/^(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

function TravelMode() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [busyChecklist, setBusyChecklist] = useState<string | null>(null);
  const trip = data.trip as unknown as Trip;
  const currency = String(trip.primary_currency ?? "IDR").trim();
  const today = todayKey();
  const departure = dateKey(trip.departure_date);
  const returnDate = dateKey(trip.return_date);
  const totalDays =
    departure && returnDate && returnDate >= departure ? daysBetween(departure, returnDate) + 1 : 0;
  const dayNumber =
    departure && today >= departure
      ? Math.min(totalDays || 1, Math.max(1, daysBetween(departure, today) + 1))
      : null;
  const daysUntil = departure ? daysBetween(today, departure) : null;
  const itinerary = (data.itinerary as ItineraryItem[]).filter((item) =>
    dateKey(item.activity_date),
  );
  const sorted = [...itinerary].sort((a, b) =>
    `${dateKey(a.activity_date)}T${String(a.start_time ?? "99:99")}`.localeCompare(
      `${dateKey(b.activity_date)}T${String(b.start_time ?? "99:99")}`,
    ),
  );
  const todayItems = sorted.filter((item) => dateKey(item.activity_date) === today);
  const upcoming = sorted.filter((item) => dateKey(item.activity_date) >= today);
  const next = upcoming[0] ?? null;
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const current = todayItems.find((item) => {
    const start = minutes(item.start_time);
    const end = minutes(item.end_time);
    return start !== null && start <= nowMinutes && (end === null || end >= nowMinutes);
  });
  const checklist = data.checklist as ChecklistItem[];
  const pendingChecklist = checklist.filter((item) => !item.is_completed);
  const remaining = Number(data.totals.remainingMinor ?? 0);
  const ended = Boolean(returnDate && today > returnDate);
  const phase = ended
    ? "Perjalanan selesai"
    : daysUntil === null
      ? "Tanggal belum diatur"
      : daysUntil > 0
        ? `Mulai dalam ${daysUntil} hari`
        : dayNumber
          ? `Hari ke-${dayNumber} dari ${totalDays}`
          : "Perjalanan selesai";

  async function toggle(id: string, completed: boolean) {
    setBusyChecklist(id);
    try {
      await runTripMutation({
        action: () => patchChecklist({ data: { id, completed } }),
        refresh: () => router.invalidate(),
        successMessage: completed ? "Checklist ditandai selesai" : "Checklist dibuka kembali",
        failureMessage: "Checklist belum diperbarui. Coba lagi.",
      });
    } finally {
      setBusyChecklist(null);
    }
  }

  return (
    <Page>
      <BackBar title="Mode Perjalanan" />

      <section className="rounded-[28px] bg-foreground p-5 text-background">
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-full bg-background/15 px-3 py-1 text-[11px] font-semibold">
            {phase}
          </span>
          <Compass className="size-5 text-background/75" />
        </div>
        <h1 className="mt-4 text-[28px] font-bold leading-tight tracking-[-0.04em]">{trip.name}</h1>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-background/75">
          <MapPin className="size-4" />
          {trip.destination_name}
        </p>
        <p className="mt-1 text-xs text-background/60">
          {shortDate(trip.departure_date)} — {shortDate(trip.return_date)}
          {totalDays ? ` · ${totalDays} hari` : ""} · {trip.travelers_count} traveler
        </p>
      </section>

      {current ? (
        <section className="mt-4 rounded-[22px] bg-brand-red p-4 text-white">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/75">
            Sedang berlangsung
          </p>
          <h2 className="mt-1 text-xl font-bold">{current.title || "Aktivitas"}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/80">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-3.5" />
              {String(current.start_time ?? "").slice(0, 5) || "Fleksibel"}
              {current.end_time ? `–${String(current.end_time).slice(0, 5)}` : ""}
            </span>
            {current.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {current.location}
              </span>
            )}
          </p>
        </section>
      ) : next ? (
        <section className="mt-4 rounded-[22px] bg-surface p-4 ring-1 ring-border/60">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-red">
            Berikutnya
          </p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">{next.title || "Aktivitas"}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {dateLabel(next.activity_date)}
                {next.start_time ? ` · ${String(next.start_time).slice(0, 5)}` : ""}
                {next.location ? ` · ${next.location}` : ""}
              </p>
            </div>
            <Link
              to="/my-trips/$tripId/$section"
              params={{ tripId: trip.id, section: "itinerary" }}
              className="tap shrink-0 rounded-full bg-secondary px-3 py-2 text-xs font-semibold"
            >
              Lihat
            </Link>
          </div>
        </section>
      ) : (
        <section className="mt-4 rounded-[22px] bg-surface p-4 text-sm text-muted-foreground ring-1 ring-border/60">
          Belum ada agenda. Tambahkan aktivitas agar mode perjalanan terisi.
        </section>
      )}

      <section className="mt-5" aria-labelledby="travel-today-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="travel-today-heading" className="text-[20px] font-bold tracking-[-0.03em]">
              Hari ini
            </h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{dateLabel(today)}</p>
          </div>
          <Link
            to="/my-trips/$tripId/$section"
            params={{ tripId: trip.id, section: "itinerary" }}
            className="tap text-[12px] font-semibold text-brand-red"
          >
            Semua agenda
          </Link>
        </div>
        {todayItems.length ? (
          <div className="mt-3 divide-y divide-border/60 rounded-[20px] bg-surface px-4">
            {todayItems.map((item) => (
              <div key={item.id} className="flex items-start gap-3 py-3">
                <div className="w-11 shrink-0 pt-0.5 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                  {String(item.start_time ?? "").slice(0, 5) || "—"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{item.title || "Aktivitas"}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {item.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" />
                        {item.location}
                      </span>
                    ) : (
                      <span>Lokasi belum diatur</span>
                    )}
                    {item.end_time && <span>s.d. {String(item.end_time).slice(0, 5)}</span>}
                  </p>
                </div>
                {current?.id === item.id && (
                  <span className="shrink-0 rounded-full bg-brand-red-soft px-2 py-1 text-[10px] font-bold text-brand-red">
                    Sekarang
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-[20px] bg-surface px-4 py-6 text-center ring-1 ring-border/60">
            <CalendarDays className="mx-auto size-8 text-muted-foreground" strokeWidth={1.5} />
            <p className="mt-2 text-sm font-semibold">Belum ada agenda hari ini</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Nikmati waktu luang atau tambahkan rencana baru.
            </p>
            <Link
              to="/my-trips/$tripId/$section"
              params={{ tripId: trip.id, section: "itinerary" }}
              className="tap mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-secondary px-4 text-xs font-semibold"
            >
              <Plus className="size-3.5" /> Tambah aktivitas
            </Link>
          </div>
        )}
      </section>

      <section className="mt-5" aria-labelledby="travel-checklist-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="travel-checklist-heading" className="text-[20px] font-bold tracking-[-0.03em]">
              Persiapan
            </h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {checklist.length - pendingChecklist.length}/{checklist.length} selesai
            </p>
          </div>
          <Link
            to="/my-trips/$tripId/$section"
            params={{ tripId: trip.id, section: "checklist" }}
            className="tap text-[12px] font-semibold text-brand-red"
          >
            Kelola
          </Link>
        </div>
        {pendingChecklist.length ? (
          <div className="mt-3 divide-y divide-border/60 rounded-[20px] bg-surface px-4">
            {pendingChecklist.slice(0, 6).map((item) => (
              <label key={item.id} className="flex min-h-12 items-center gap-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={false}
                  disabled={busyChecklist === item.id}
                  onChange={() => void toggle(item.id, true)}
                  className="size-5 accent-brand-red"
                />
                <span className="min-w-0 flex-1">{displayChecklistTitle(item.title)}</span>
              </label>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-[20px] bg-surface px-4 py-5 text-center text-sm text-muted-foreground ring-1 ring-border/60">
            Semua persiapan selesai. Selamat menikmati perjalanan.
          </div>
        )}
      </section>

      <section className="mt-5 rounded-[20px] bg-surface p-4 ring-1 ring-border/60">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Sisa anggaran</p>
            <p className="mt-1 text-xl font-bold">{money(remaining, currency)}</p>
          </div>
          <WalletCards className="size-5 text-brand-red" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            to="/my-trips/$tripId/$section"
            params={{ tripId: trip.id, section: "expenses" }}
            className="tap flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-secondary text-xs font-semibold"
          >
            <Plus className="size-3.5" /> Catat pengeluaran
          </Link>
          <Link
            to="/my-trips/$tripId"
            params={{ tripId: trip.id }}
            className="tap flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-secondary text-xs font-semibold"
          >
            Ringkasan <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </section>
    </Page>
  );
}
