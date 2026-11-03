import { formatTripMoney } from "@/lib/trip-money";
import { MoneyInput } from "@/components/money-input";
import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BedDouble,
  CalendarDays,
  ChevronRight,
  Maximize2,
  Minimize2,
  Route as RouteIcon,
  ClipboardCheck,
  Coffee,
  Hotel,
  MapPin,
  Plane,
  Plus,
  Ticket,
  Utensils,
  WalletCards,
} from "lucide-react";
import ItineraryMap from "@/components/itinerary-map";
import { PlaceSearchField, type PickedPlace } from "@/components/place-search-field";
import { getItineraryMapConfig } from "@/lib/itinerary-map.fn";
import {
  buildMapModel,
  formatKm,
  googleMapsDayRouteUrl,
  googleMapsDirectionsUrl,
  itemPoint,
  routeLengthKm,
  type ItineraryMapConfig,
} from "@/lib/itinerary-map";
import { Page, btnRed, btnSoft, group } from "@/components/shell";
import { TripNavBar, TripTabBar, type TripTabId } from "@/components/trip-ios";
import { BudgetEditor, ExpenseEditor } from "@/components/trip-budget-ios";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { displayBudgetCategory, displayChecklistTitle } from "@/lib/my-trips-home";
import { isTripAuthenticationError, runTripMutation } from "@/lib/trip-actions";
import {
  deleteBookingRecord,
  deleteChecklist,
  deleteExpense,
  deleteItinerary,
  getTripSection,
  patchBudget,
  patchChecklist,
  postBooking,
  postChecklist,
  postExpense,
  postItinerary,
} from "@/lib/my-trips.fn";

export const Route = createFileRoute("/my-trips/$tripId/$section")({
  loader: async ({ params, location }) => {
    try {
      const [section, mapConfig] = await Promise.all([
        getTripSection({
          data: { tripId: params.tripId, section: params.section as FeatureId },
        }),
        // The map is an enhancement: if its setting cannot be read the Agenda still loads.
        params.section === "itinerary"
          ? getItineraryMapConfig().catch(() => null)
          : Promise.resolve(null),
      ]);
      return { ...section, mapConfig };
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
  component: TripSection,
});
const labels: Record<string, string> = {
  budget: "Anggaran",
  expenses: "Pengeluaran",
  itinerary: "Agenda",
  checklist: "Checklist",
  bookings: "Pemesanan",
  places: "Saved Places",
  documents: "Documents",
  group: "Travel Group",
  "split-bill": "Split Bill",
  currency: "Currency",
  "ai-planner": "AI Planner",
};
type FeatureId = "budget" | "expenses" | "itinerary" | "checklist" | "bookings";
type Item = {
  id: string;
  name?: unknown;
  allocated_minor?: unknown;
  spent_minor?: unknown;
  expense_count?: unknown;
  description?: unknown;
  original_currency?: unknown;
  original_amount_minor?: unknown;
  converted_currency?: unknown;
  converted_amount_minor?: unknown;
  category_id?: unknown;
  category_name?: unknown;
  activity_date?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  title?: unknown;
  location?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  notes?: unknown;
  activity_category?: unknown;
  booking_reference?: unknown;
  is_completed?: unknown;
  status?: unknown;
};
type BudgetSummary = {
  allocatedMinor: number;
  spentMinor: number;
  uncategorizedSpentMinor: number;
  uncategorizedCount: number;
  budgetMinor: number;
};
type CategoryOption = {
  id: string;
  name: string;
  allocated_minor: number;
  currency: string;
};
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const money = (minor: unknown, currency: unknown) => formatTripMoney(minor, currency);

function TripSection() {
  const { section, tripId } = Route.useParams();
  const data = Route.useLoaderData();
  const router = useRouter();
  const items = data.items as Item[];
  const trip = data.trip as unknown as {
    id: string;
    name: string;
    destination_name: string;
    departure_date: string | null;
    return_date: string | null;
    primary_currency: string;
    total_budget_minor: number;
  };
  const refresh = () => router.invalidate();
  const summary = data.summary as BudgetSummary | null;
  const categories = data.categories as CategoryOption[];
  return (
    <Page tabs={false}>
      <TripNavBar backLabel={trip.name} backTo="trip" backTripId={tripId} />
      <h1 className="px-1 pb-2 pt-1 text-[22px] font-bold leading-tight tracking-tight">
        {labels[section] ?? "Perjalanan"}
      </h1>
      {(section === "budget" || section === "expenses") && (
        <div
          role="tablist"
          aria-label="Biaya"
          className="mb-3 grid grid-cols-2 rounded-[10px] bg-secondary p-0.5 text-[13px] font-medium"
        >
          {(["budget", "expenses"] as const).map((id) => (
            <Link
              key={id}
              role="tab"
              aria-selected={section === id}
              to="/my-trips/$tripId/$section"
              params={{ tripId, section: id }}
              replace
              className={`tap flex min-h-9 items-center justify-center rounded-lg ${
                section === id ? "bg-surface font-semibold shadow-sm" : "text-muted-foreground"
              }`}
            >
              {id === "budget" ? "Anggaran" : "Pengeluaran"}
            </Link>
          ))}
        </div>
      )}
      <div className="space-y-3">
        {section === "budget" && (
          <BudgetEditor
            tripId={tripId}
            items={items}
            currency={trip.primary_currency}
            summary={summary}
            onSaved={refresh}
          />
        )}
        {section === "expenses" && (
          <ExpenseEditor
            tripId={tripId}
            currency={trip.primary_currency}
            items={items}
            categories={categories}
            onSaved={refresh}
          />
        )}
        {section === "itinerary" && (
          <ItineraryEditor
            tripId={tripId}
            items={items}
            onSaved={refresh}
            mapConfig={(data.mapConfig as ItineraryMapConfig | null) ?? null}
          />
        )}
        {section === "checklist" && (
          <ChecklistEditor tripId={tripId} items={items} onSaved={refresh} />
        )}
        {section === "bookings" && (
          <BookingEditor tripId={tripId} items={items} categories={categories} onSaved={refresh} />
        )}
        {["places", "documents", "group", "split-bill", "currency", "ai-planner"].includes(
          section,
        ) && (
          <div className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">
            Fitur ini belum memiliki editor khusus.
          </div>
        )}
      </div>
      <TripTabBar
        tripId={tripId}
        active={section === "expenses" ? "budget" : (section as TripTabId)}
      />
    </Page>
  );
}

export function ItineraryEditor({
  tripId,
  items,
  onSaved,
  mapConfig = null,
}: {
  tripId: string;
  items: Item[];
  onSaved: () => Promise<void>;
  mapConfig?: ItineraryMapConfig | null;
}) {
  const [form, setForm] = useState({
    title: "",
    date: today(),
    startTime: "",
    endTime: "",
    location: "",
    category: "",
  });
  const [point, setPoint] = useState<PickedPlace>(null);
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [mapBroken, setMapBroken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await runTripMutation({
        action: () =>
          postItinerary({
            data: {
              tripId,
              title: form.title,
              activityDate: form.date,
              startTime: form.startTime || undefined,
              endTime: form.endTime || undefined,
              location: form.location || undefined,
              latitude: point?.lat,
              longitude: point?.lng,
              activityCategory: form.category || undefined,
            },
          }),
        refresh: onSaved,
        successMessage: "Aktivitas disimpan",
        failureMessage: "Aktivitas belum tersimpan. Periksa tanggal dan waktu lalu coba lagi.",
      });
      if (saved) {
        setForm({
          title: "",
          date: form.date,
          startTime: "",
          endTime: "",
          location: "",
          category: "",
        });
        setPoint(null);
        setShowForm(false);
      }
    } finally {
      setSaving(false);
    }
  }

  const days = useMemo(() => groupItineraryByDay(items), [items]);
  const mapOn = Boolean(mapConfig?.enabled) && !mapBroken;
  const defaultDay = days.find((day) => day.date === today())?.date ?? days[0]?.date ?? "";
  const scope =
    selectedDay === "all" || days.some((day) => day.date === selectedDay)
      ? selectedDay
      : defaultDay;
  const model = useMemo(() => buildMapModel(days, scope || "all"), [days, scope]);
  const pinNumbers = useMemo(() => new Map(model.pins.map((pin) => [pin.id, pin.n])), [model]);
  const pinnedTotal = items.filter((item) => itemPoint(item)).length;
  const dayRouteUrl =
    scope && scope !== "all"
      ? googleMapsDayRouteUrl(model.pins.map((pin) => ({ lat: pin.lat, lng: pin.lng })))
      : null;
  const searchEnabled = Boolean(mapConfig?.enabled && mapConfig.placeSearch);
  return (
    <section className="space-y-3" aria-label="Agenda perjalanan">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="tap flex min-h-10 items-center gap-2 rounded-full bg-brand-red px-4 text-sm font-semibold text-white"
          aria-expanded={showForm}
        >
          <Plus className="size-4" /> Tambah aktivitas
        </button>
      </div>
      <Sheet open={showForm} onOpenChange={setShowForm}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border-border/70 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-7 sm:rounded-t-[28px]"
        >
          <div
            className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/25"
            aria-hidden="true"
          />
          <SheetHeader className="mb-4 pr-8 text-left">
            <SheetTitle className="text-[22px] tracking-tight">Tambah aktivitas</SheetTitle>
            <SheetDescription>
              Susun rencana perjalananmu. Semua waktu mengikuti zona lokal.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="agenda-title" className="text-[13px] font-semibold">
                Nama aktivitas
              </label>
              <input
                id="agenda-title"
                required
                autoFocus
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Contoh: Makan malam"
                className="min-h-10 w-full rounded-xl border border-border/70 bg-secondary/70 px-3.5 text-[14px] outline-none transition focus:border-brand-red focus:ring-2 focus:ring-brand-red/15"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="agenda-date" className="text-[13px] font-semibold">
                Tanggal
              </label>
              <input
                id="agenda-date"
                required
                type="date"
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
                className="min-h-10 w-full min-w-0 rounded-xl border border-border/70 bg-secondary/70 px-3 text-sm outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/15"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="agenda-location" className="text-[13px] font-semibold">
                Lokasi <span className="font-normal text-muted-foreground">(opsional)</span>
              </label>
              <PlaceSearchField
                id="agenda-location"
                value={form.location}
                picked={point}
                searchEnabled={searchEnabled}
                onChange={(location, picked) => {
                  setForm((current) => ({ ...current, location }));
                  setPoint(picked);
                }}
              />
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-semibold">
                Waktu <span className="font-normal text-muted-foreground">(opsional)</span>
              </p>
              <p className="mb-2 text-xs text-muted-foreground">
                Jika selesai lebih awal dari mulai, aktivitas dianggap berlanjut sampai hari
                berikutnya.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5 text-xs text-muted-foreground">
                  Mulai
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                    className="min-h-10 w-full rounded-xl border border-border/70 bg-secondary/70 px-3 text-sm text-foreground outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/15"
                  />
                </label>
                <label className="space-y-1.5 text-xs text-muted-foreground">
                  Selesai
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(event) => setForm({ ...form, endTime: event.target.value })}
                    className="min-h-10 w-full rounded-xl border border-border/70 bg-secondary/70 px-3 text-sm text-foreground outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/15"
                  />
                </label>
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="agenda-category" className="text-[13px] font-semibold">
                Kategori <span className="font-normal text-muted-foreground">(opsional)</span>
              </label>
              <select
                id="agenda-category"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                className="min-h-10 w-full rounded-xl border border-border/70 bg-secondary/70 px-3 text-sm outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/15"
              >
                <option value="">Pilih kategori</option>
                <option value="flight">Penerbangan</option>
                <option value="hotel">Hotel</option>
                <option value="food">Makan</option>
                <option value="attraction">Atraksi</option>
                <option value="transport">Transportasi</option>
                <option value="other">Lainnya</option>
              </select>
            </div>
            <div className="sticky bottom-0 -mx-5 flex gap-3 border-t border-border/60 bg-background/95 px-4 pb-1 pt-4 backdrop-blur">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className={`${btnSoft} min-h-10 flex-1 rounded-full`}
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className={`${btnRed} min-h-10 flex-[1.4] rounded-full disabled:opacity-60`}
              >
                {saving ? "Menyimpan…" : "Simpan aktivitas"}
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      {mapOn && model.pinnedCount > 0 ? (
        <div
          className={
            expanded
              ? "fixed inset-0 z-50 bg-background"
              : "relative h-[230px] overflow-hidden rounded-2xl bg-secondary"
          }
        >
          <ItineraryMap
            pins={model.pins}
            routes={model.routes}
            activeId={activeId}
            onSelect={setActiveId}
            styleUrl={mapConfig!.styleUrl}
            onUnavailable={() => setMapBroken(true)}
          />
          <div
            className={`absolute left-2 flex max-w-[calc(100%-3.5rem)] gap-1.5 overflow-x-auto ${expanded ? "top-[calc(env(safe-area-inset-top)+0.5rem)]" : "top-2"}`}
          >
            {days.length > 1 ? (
              <>
                {days.map((day) => {
                  const label = formatItineraryDate(day.date);
                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => setSelectedDay(day.date)}
                      aria-pressed={scope === day.date}
                      className={`tap min-h-8 shrink-0 rounded-full px-2.5 text-xs font-semibold shadow ${scope === day.date ? "bg-brand-red text-white" : "bg-surface/95 text-foreground"}`}
                    >
                      {label.full}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setSelectedDay("all")}
                  aria-pressed={scope === "all"}
                  className={`tap min-h-8 shrink-0 rounded-full px-2.5 text-xs font-semibold shadow ${scope === "all" ? "bg-brand-red text-white" : "bg-surface/95 text-foreground"}`}
                >
                  Semua hari
                </button>
              </>
            ) : (
              <span className="inline-flex min-h-8 items-center rounded-full bg-brand-red px-2.5 text-xs font-semibold text-white shadow">
                {formatItineraryDate(days[0]?.date ?? "").full}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? "Tutup peta layar penuh" : "Buka peta layar penuh"}
            className={`tap absolute right-2 flex size-9 items-center justify-center rounded-full bg-surface/95 shadow ${expanded ? "top-[calc(env(safe-area-inset-top)+0.5rem)]" : "top-2"}`}
          >
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          {dayRouteUrl && (
            <a
              href={dayRouteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`tap absolute left-2 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-surface/95 px-2.5 text-xs font-semibold shadow ${expanded ? "bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]" : "bottom-6"}`}
            >
              <RouteIcon className="size-3.5 text-brand-red" />
              Rute hari ini · {model.pinnedCount} titik
            </a>
          )}
        </div>
      ) : mapOn && days.length > 0 && pinnedTotal === 0 ? (
        <p className="flex items-center gap-2 rounded-2xl bg-secondary px-3 py-2.5 text-xs text-muted-foreground">
          <MapPin className="size-4 shrink-0 text-brand-red" />
          Cari tempat saat menambah aktivitas agar muncul di peta.
        </p>
      ) : null}
      {days.length ? (
        days.map((day) => (
          <ItineraryDay
            key={day.date}
            date={day.date}
            items={day.items}
            pinNumbers={pinNumbers}
            activeId={activeId}
            onSelect={(id) => {
              setActiveId(id);
              const found = days.find((d) => d.items.some((i) => i.id === id));
              if (found && scope !== "all" && scope !== found.date) setSelectedDay(found.date);
            }}
            onDelete={async (id) => {
              await runTripMutation({
                action: () => deleteItinerary({ data: { id } }),
                refresh: onSaved,
                successMessage: "Aktivitas dihapus",
                failureMessage: "Aktivitas belum terhapus. Coba lagi.",
              });
            }}
          />
        ))
      ) : (
        <div className="rounded-2xl bg-secondary p-4 text-center">
          <CalendarDays className="mx-auto size-9 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-semibold">Belum ada aktivitas</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Rencana perjalananmu akan tersusun di sini.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="tap mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-background px-4 text-sm font-semibold text-brand-red"
          >
            <Plus className="size-4" /> Tambah aktivitas
          </button>
        </div>
      )}
    </section>
  );
}

function groupItineraryByDay(items: Item[]) {
  const groups = new Map<string, Item[]>();
  [...items]
    .sort((a, b) =>
      `${itineraryDateKey(a.activity_date)}T${String(a.start_time ?? "99:99")}`.localeCompare(
        `${itineraryDateKey(b.activity_date)}T${String(b.start_time ?? "99:99")}`,
      ),
    )
    .forEach((item) => {
      const date = itineraryDateKey(item.activity_date) ?? "";
      groups.set(date, [...(groups.get(date) ?? []), item]);
    });
  return [...groups.entries()].map(([date, groupedItems]) => ({ date, items: groupedItems }));
}

function itineraryDateKey(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  const raw = String(value ?? "").trim();
  const dateOnly = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnly) return dateOnly[1];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

function formatItineraryDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { weekday: "", full: "Tanggal belum diatur" };
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return {
    weekday: new Intl.DateTimeFormat("id-ID", { weekday: "short" }).format(date),
    full: new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(date),
  };
}

function ItineraryDay({
  date,
  items,
  pinNumbers,
  activeId,
  onSelect,
  onDelete,
}: {
  date: string;
  items: Item[];
  pinNumbers: Map<string, number>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const dateLabel = formatItineraryDate(date);
  const points = items.map((item) => itemPoint(item));
  const dayPoints = points.filter((point): point is NonNullable<typeof point> => Boolean(point));
  const lengthKm = dayPoints.length > 1 ? routeLengthKm(dayPoints) : 0;
  let previous: (typeof dayPoints)[number] | null = null;
  const hops = points.map((point) => {
    if (!point) return null;
    const hop = previous ? routeLengthKm([previous, point]) : null;
    previous = point;
    return hop;
  });
  return (
    <section className="rounded-[20px] bg-surface px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold capitalize tracking-tight">
          {dateLabel.weekday ? `${dateLabel.weekday}, ` : ""}
          {dateLabel.full}
        </h3>
        <span className="shrink-0 text-xs text-muted-foreground">
          {items.length} aktivitas{lengthKm > 0 ? ` · ±${formatKm(lengthKm)}` : ""}
        </span>
      </div>
      <div className="mt-2 divide-y divide-border/60">
        {items.map((item, index) => (
          <ItineraryItem
            key={item.id}
            item={item}
            pin={pinNumbers.get(item.id)}
            active={activeId === item.id}
            hopKm={hops[index] ?? null}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}

function ItineraryItem({
  item,
  pin,
  active,
  hopKm,
  onSelect,
  onDelete,
}: {
  item: Item;
  pin?: number | undefined;
  active: boolean;
  hopKm: number | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const point = itemPoint(item);
  const [deleting, setDeleting] = useState(false);
  const time = String(item.start_time ?? "").slice(0, 5);
  const endTime = String(item.end_time ?? "").slice(0, 5);
  const Icon = itineraryIcon(item.activity_category, item.title);
  async function remove() {
    setDeleting(true);
    try {
      await onDelete(item.id);
    } finally {
      setDeleting(false);
    }
  }
  return (
    <article
      className={`flex items-start gap-3 py-3 first:pt-1 last:pb-1 ${point ? "cursor-pointer" : ""} ${active ? "rounded-xl bg-brand-red-soft/60" : ""}`}
      aria-current={active ? "true" : undefined}
      onClick={() => point && onSelect(item.id)}
    >
      <div className="w-11 shrink-0 pt-0.5 text-right text-xs font-medium tabular-nums text-muted-foreground">
        {time || "—"}
      </div>
      {pin ? (
        <div
          className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${active ? "bg-brand-red text-white" : "bg-brand-red-soft text-brand-red"}`}
          aria-label={`Titik ${pin} di peta`}
        >
          {pin}
        </div>
      ) : (
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Icon className="size-3.5" strokeWidth={1.8} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold leading-snug">
              {String(item.title ?? "Aktivitas")}
            </h4>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {item.location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" />
                  {String(item.location)}
                </span>
              ) : (
                <span>Lokasi belum diatur</span>
              )}
              {endTime && time && (
                <span>
                  {time}–{endTime}
                </span>
              )}
              {hopKm !== null && <span>±{formatKm(hopKm)} dari titik sebelumnya</span>}
            </div>
          </div>
          {point && (
            <a
              href={googleMapsDirectionsUrl(point)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="tap inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-semibold text-brand-red"
              aria-label={`Rute ke ${String(item.title ?? "aktivitas")} di Google Maps`}
            >
              <RouteIcon className="size-3.5" /> Rute
            </a>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void remove();
            }}
            disabled={deleting}
            className="tap shrink-0 rounded-lg px-1.5 py-1 text-xs font-semibold text-muted-foreground hover:text-brand-red"
            aria-label={`Hapus ${String(item.title ?? "aktivitas")}`}
          >
            {deleting ? "…" : "Hapus"}
          </button>
        </div>
        {item.booking_reference ? (
          <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
            Booking tersimpan
          </span>
        ) : (
          <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
            Perlu booking
          </span>
        )}
      </div>
    </article>
  );
}

function itineraryIcon(category: unknown, title: unknown) {
  const value = `${String(category ?? "")} ${String(title ?? "")}`.toLowerCase();
  if (
    value.includes("flight") ||
    value.includes("airport") ||
    value.includes("bandara") ||
    value.includes("penerbangan")
  )
    return Plane;
  if (
    value.includes("hotel") ||
    value.includes("check-in") ||
    value.includes("check in") ||
    value.includes("accommodation")
  )
    return BedDouble;
  if (
    value.includes("food") ||
    value.includes("dinner") ||
    value.includes("makan") ||
    value.includes("lunch")
  )
    return Utensils;
  if (value.includes("ticket") || value.includes("attraction") || value.includes("atraksi"))
    return Ticket;
  if (value.includes("coffee") || value.includes("cafe")) return Coffee;
  return MapPin;
}

function ChecklistEditor({
  tripId,
  items,
  onSaved,
}: {
  tripId: string;
  items: Item[];
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const done = items.filter((item) => Boolean(item.is_completed)).length;
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await runTripMutation({
        action: () => postChecklist({ data: { tripId, title } }),
        refresh: onSaved,
        successMessage: "Checklist ditambahkan",
        failureMessage: "Checklist belum tersimpan. Coba lagi.",
      });
      if (saved) {
        setTitle("");
        setShowAdd(false);
      }
    } finally {
      setSaving(false);
    }
  }
  async function updateItem(id: string, action: () => Promise<unknown>, message: string) {
    setBusyItemId(id);
    try {
      await runTripMutation({
        action,
        refresh: onSaved,
        successMessage: message,
        failureMessage: "Checklist belum diperbarui. Coba lagi.",
      });
    } finally {
      setBusyItemId(null);
    }
  }
  return (
    <section>
      <div className="mb-4 rounded-[22px] bg-surface p-4 ring-1 ring-border/50">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Persiapan</span>
          <span className="text-muted-foreground">
            {done}/{items.length}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-brand-red transition-[width]"
            style={{ width: `${items.length ? Math.round((done / items.length) * 100) : 0}%` }}
          />
        </div>
      </div>
      <div className={`${group} divide-y divide-border/60`}>
        {items.length ? (
          items.map((x) => (
            <div key={x.id} className="flex min-h-[60px] items-center gap-3 px-4 py-2">
              <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(x.is_completed)}
                  disabled={busyItemId === x.id}
                  onChange={(e) =>
                    void updateItem(
                      x.id,
                      () => patchChecklist({ data: { id: x.id, completed: e.target.checked } }),
                      e.target.checked ? "Checklist ditandai selesai" : "Checklist diperbarui",
                    )
                  }
                  className="size-5 accent-brand-red"
                />
                <span className={x.is_completed ? "line-through text-muted-foreground" : ""}>
                  {displayChecklistTitle(String(x.title ?? ""))}
                </span>
              </label>
              <button
                type="button"
                disabled={busyItemId === x.id}
                onClick={() =>
                  void updateItem(
                    x.id,
                    () => deleteChecklist({ data: { id: x.id } }),
                    "Checklist dihapus",
                  )
                }
                className="min-h-11 rounded-full px-3 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-brand-red disabled:opacity-50"
              >
                {busyItemId === x.id ? "…" : "Hapus"}
              </button>
            </div>
          ))
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Belum ada checklist.</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setShowAdd(true)}
        className={`${btnRed} mt-3 min-h-10 w-full rounded-xl`}
      >
        Tambah checklist
      </button>
      <Sheet open={showAdd} onOpenChange={setShowAdd}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[88dvh] w-full max-w-lg rounded-t-[28px] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-7"
        >
          <div
            className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/25"
            aria-hidden="true"
          />
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>Tambah checklist</SheetTitle>
            <SheetDescription>
              Tambahkan hal yang perlu disiapkan untuk perjalanan.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={add} className="flex gap-2">
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tambah checklist"
              className="min-h-10 min-w-0 flex-1 rounded-xl bg-secondary px-3 text-sm"
            />
            <button disabled={saving} className={btnSoft}>
              {saving ? "Menyimpan…" : "Tambah"}
            </button>
          </form>
        </SheetContent>
      </Sheet>
    </section>
  );
}

const OTHER_BOOKING_CATEGORY = "Lainnya";

export function BookingEditor({
  tripId,
  items,
  categories,
  onSaved,
}: {
  tripId: string;
  items: Item[];
  categories: CategoryOption[];
  onSaved: () => Promise<void>;
}) {
  // Options are the traveler's own budget categories; "Lainnya" stays available as a fallback.
  const categoryOptions = [
    ...new Set([
      ...categories.map((category) => displayBudgetCategory(category.name)),
      OTHER_BOOKING_CATEGORY,
    ]),
  ];
  const [form, setForm] = useState({
    category: categoryOptions[0] ?? OTHER_BOOKING_CATEGORY,
    title: "",
    date: "",
    provider: "",
  });
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await runTripMutation({
        action: () =>
          postBooking({
            data: {
              tripId,
              category: form.category,
              title: form.title,
              bookingDate: form.date || undefined,
              provider: form.provider || undefined,
            },
          }),
        refresh: onSaved,
        successMessage: "Pemesanan disimpan",
        failureMessage: "Pemesanan belum tersimpan. Periksa data lalu coba lagi.",
      });
      if (saved) {
        setForm({
          category: categoryOptions[0] ?? OTHER_BOOKING_CATEGORY,
          title: "",
          date: "",
          provider: "",
        });
        setShowForm(false);
      }
    } finally {
      setSaving(false);
    }
  }
  return (
    <section>
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className={`${btnRed} mb-4 min-h-10 w-full rounded-xl`}
      >
        Tambah pemesanan
      </button>
      <Sheet open={showForm} onOpenChange={setShowForm}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-7"
        >
          <div
            className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/25"
            aria-hidden="true"
          />
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>Tambah pemesanan</SheetTitle>
            <SheetDescription>
              Simpan detail tiket, hotel, transportasi, atau aktivitas.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="flex gap-2">
              <select
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                aria-label="Kategori"
                className="min-h-10 w-2/5 min-w-0 rounded-xl bg-secondary px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25"
              >
                {categoryOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Nama booking"
                className="min-h-10 min-w-0 flex-1 rounded-xl bg-secondary px-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand-red/25"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="min-h-10 min-w-0 flex-1 rounded-xl bg-secondary px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25"
              />
              <input
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                placeholder="Provider"
                className="min-h-10 min-w-0 flex-1 rounded-xl bg-secondary px-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand-red/25"
              />
            </div>
            <button disabled={saving} className={`${btnRed} min-h-10 rounded-xl`}>
              {saving ? "Menyimpan…" : "Tambah booking"}
            </button>
          </form>
        </SheetContent>
      </Sheet>
      <EditableList
        items={items}
        empty="Belum ada booking."
        render={(x) => `${String(x.title ?? "")} · ${String(x.status ?? "manual")}`}
        onDelete={async (id) => {
          await runTripMutation({
            action: () => deleteBookingRecord({ data: { id } }),
            refresh: onSaved,
            successMessage: "Pemesanan dihapus",
            failureMessage: "Pemesanan belum terhapus. Coba lagi.",
          });
        }}
      />
    </section>
  );
}

function EditableList({
  items,
  empty,
  render,
  onDelete,
}: {
  items: Item[];
  empty: string;
  render: (x: Item) => string;
  onDelete: (id: string) => Promise<void>;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  async function remove(id: string) {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  }
  return (
    <div className="mt-4 space-y-2">
      {items.length ? (
        items.map((x) => (
          <div
            key={x.id}
            className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-sm"
          >
            <span className="min-w-0 flex-1">{render(x)}</span>
            <button
              type="button"
              disabled={deletingId === x.id}
              onClick={() => void remove(x.id)}
              className="text-xs font-semibold text-brand-red disabled:opacity-50"
            >
              {deletingId === x.id ? "…" : "Hapus"}
            </button>
          </div>
        ))
      ) : (
        <div className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">{empty}</div>
      )}
    </div>
  );
}
