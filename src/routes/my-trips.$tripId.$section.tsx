import { formatTripMoney } from "@/lib/trip-money";
import { MoneyInput } from "@/components/money-input";
import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { springIos, springSnappy } from "@/lib/motion";
import { toast } from "sonner";
import { getPlaceImage, resolveItemImage, reversePlace } from "@/lib/itinerary-map.fn";
import { isAllowedImageUrl } from "@/lib/place-image";
import {
  BedDouble,
  CalendarDays,
  ChevronRight,
  Expand,
  Focus,
  Footprints,
  LocateFixed,
  Pencil,
  Navigation,
  Route as RouteIcon,
  Shrink,
  TriangleAlert,
  X,
  TrainFront,
  Trash2,
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
import { AgendaMascotBubble } from "@/components/agenda-mascot-bubble";
import { CalendarConnectBanner } from "@/components/calendar-connect-banner";
import ItineraryMap, { type PickedPoi } from "@/components/itinerary-map";
import { PlaceSearchField, type PickedPlace } from "@/components/place-search-field";
import { getItineraryMapConfig } from "@/lib/itinerary-map.fn";
import { getReceiptScanStatus } from "@/lib/receipt-scan.fn";
import { getPlaceIdeasStatus, pinItemOnMap } from "@/lib/place-ideas.fn";
import { UNAVAILABLE_PLACE_IDEAS, type PlaceIdeasStatus } from "@/lib/place-ideas";
import { PlaceIdeasFeature, type IdeaDay } from "@/components/place-ideas";
import { UNAVAILABLE_RECEIPT_SCAN } from "@/lib/receipt-scan";
import {
  DEFAULT_ITINERARY_MAP_CONFIG,
  POI_CATEGORIES,
  buildMapModel,
  distanceKm,
  type MapPin as AgendaPin,
  conflictingIds,
  findConflicts,
  itinerarySortKey,
  poiCategory,
  type PoiCategoryId,
  estimateLeg,
  formatKm,
  formatMinutes,
  googleMapsDayRouteUrl,
  googleMapsDirectionsUrl,
  itemPoint,
  routeLengthKm,
  type ItineraryMapConfig,
} from "@/lib/itinerary-map";
import { Page, btnRed, btnSoft, group } from "@/components/shell";
import { TripTabBar, type TripTabId } from "@/components/trip-ios";
import { BudgetEditor, ExpenseEditor } from "@/components/trip-budget-ios";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { displayBudgetCategory, displayChecklistTitle } from "@/lib/my-trips-home";
import { countryBoundsFor } from "@/lib/trip-country-bounds";
import { guessActivityCategory, titleForPlace, type TripCity } from "@/lib/trip-cities";
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
  patchItinerary,
  postItinerary,
} from "@/lib/my-trips.fn";

export const Route = createFileRoute("/my-trips/$tripId/$section")({
  loader: async ({ params, location }) => {
    try {
      const [section, mapConfig, receiptScan, placeIdeas] = await Promise.all([
        getTripSection({
          data: { tripId: params.tripId, section: params.section as FeatureId },
        }),
        // The map is an enhancement: if its setting cannot be read the Agenda still loads.
        params.section === "itinerary"
          ? getItineraryMapConfig().catch(() => DEFAULT_ITINERARY_MAP_CONFIG)
          : Promise.resolve(null),
        // Scan struk is an extra: if its status cannot be read the Biaya page still loads.
        params.section === "expenses" || params.section === "budget"
          ? getReceiptScanStatus().catch(() => UNAVAILABLE_RECEIPT_SCAN)
          : Promise.resolve(UNAVAILABLE_RECEIPT_SCAN),
        // Ide tempat is an extra too: without its status the Agenda simply hides the feature.
        params.section === "itinerary"
          ? getPlaceIdeasStatus().catch(() => UNAVAILABLE_PLACE_IDEAS)
          : Promise.resolve(UNAVAILABLE_PLACE_IDEAS),
      ]);
      return { ...section, mapConfig, receiptScan, placeIdeas };
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
  // `add` and `edit` come from the Ringkas page: they open the matching form on arrival.
  validateSearch: (search: Record<string, unknown>): { add?: boolean; edit?: string } => ({
    ...(search["add"] === true || search["add"] === "true" ? { add: true } : {}),
    ...(typeof search["edit"] === "string" && search["edit"] ? { edit: search["edit"] } : {}),
  }),
  component: TripSection,
});
const labels: Record<string, string> = {
  budget: "Biaya",
  expenses: "Biaya",
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
  place_image_url?: unknown;
  place_image_checked_at?: unknown;
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
  const { add, edit } = Route.useSearch();
  const data = Route.useLoaderData();
  const router = useRouter();
  const items = data.items as Item[];
  const trip = data.trip as unknown as {
    id: string;
    name: string;
    destination_name: string;
    destination_code: string;
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
      {section !== "itinerary" && (
        <h1 className="px-1 pb-2 pt-1 text-[22px] font-bold leading-tight tracking-tight">
          {labels[section] ?? "Perjalanan"}
        </h1>
      )}
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
            receiptScan={data.receiptScan}
          />
        )}
        {section === "expenses" && (
          <ExpenseEditor
            tripId={tripId}
            currency={trip.primary_currency}
            items={items}
            categories={categories}
            onSaved={refresh}
            receiptScan={data.receiptScan}
            budgetMinor={Number(trip.total_budget_minor ?? 0)}
            initialCreating={Boolean(add)}
          />
        )}
        {section === "itinerary" && (
          <ItineraryEditor
            tripId={tripId}
            trip={trip}
            items={items}
            onSaved={refresh}
            mapConfig={(data.mapConfig as ItineraryMapConfig | null) ?? null}
            placeIdeas={data.placeIdeas}
            initialAdd={Boolean(add)}
            initialEditId={edit ?? null}
          />
        )}
        {section === "checklist" && (
          <ChecklistEditor
            tripId={tripId}
            items={items}
            onSaved={refresh}
            initialAdd={Boolean(add)}
          />
        )}
        {section === "bookings" && (
          <BookingEditor
            tripId={tripId}
            items={items}
            categories={categories}
            onSaved={refresh}
            initialAdd={Boolean(add)}
          />
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
  trip,
  items,
  onSaved,
  mapConfig = null,
  placeIdeas = UNAVAILABLE_PLACE_IDEAS,
  initialAdd = false,
  initialEditId = null,
}: {
  tripId: string;
  /** Shown under the title so it is clear which trip this agenda belongs to. */
  trip?: {
    name: string;
    destination_name: string;
    /** ISO country code; frames the map before any activity has a point. */
    destination_code?: string | null;
    /** Cities chosen for the trip; they scope place search in the form. */
    cities?: TripCity[];
    departure_date: string | null;
    return_date: string | null;
  };
  items: Item[];
  onSaved: () => Promise<void>;
  mapConfig?: ItineraryMapConfig | null;
  /** AI place ideas (carousel + "Ke mana lagi ya?" sheet); hidden unless available. */
  placeIdeas?: PlaceIdeasStatus;
  /** Open the "add activity" form on arrival (from the Ringkas "+" sheet). */
  initialAdd?: boolean;
  /** Open this activity for editing on arrival (from the Ringkas row menu). */
  initialEditId?: string | null;
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
  // Set once the traveler types a name; a picked place then stops overwriting it.
  const titleTouched = useRef(false);
  const tripCities = trip?.cities ?? [];
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [mapBroken, setMapBroken] = useState(false);
  const [poiOn, setPoiOn] = useState<PoiCategoryId[]>(() =>
    POI_CATEGORIES.filter((category) => category.defaultOn).map((category) => category.id),
  );
  const [poi, setPoi] = useState<PickedPoi | null>(null);
  const [conflicts, setConflicts] = useState<TimedItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [focus, setFocus] = useState(false);
  const [tilt, setTilt] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [zoomTick, setZoomTick] = useState(0);
  const [poiImage, setPoiImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  // The inline form opens inside its day; bring it into view.
  useEffect(() => {
    if (showForm) formRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [showForm, editingId]);

  // A new time or date makes an earlier overlap warning stale.
  useEffect(() => setConflicts([]), [form.date, form.startTime, form.endTime]);

  async function submit(event?: React.FormEvent, force = false) {
    event?.preventDefault();
    if (!force && form.startTime) {
      const hits = findConflicts(
        {
          date: form.date,
          start: form.startTime,
          end: form.endTime || null,
          ...(editingId ? { id: editingId } : {}),
        },
        items.map(toTimedItem),
      );
      if (hits.length) {
        setConflicts(hits);
        return;
      }
    }
    setSaving(true);
    try {
      const saved = await runTripMutation({
        action: () => {
          const fields = {
            title: form.title,
            activityDate: form.date,
            startTime: form.startTime || undefined,
            endTime: form.endTime || undefined,
            location: form.location || undefined,
            latitude: point?.lat,
            longitude: point?.lng,
            activityCategory: form.category || undefined,
          };
          return editingId
            ? patchItinerary({ data: { id: editingId, ...fields } })
            : postItinerary({ data: { tripId, ...fields } });
        },
        refresh: onSaved,
        successMessage: editingId ? "Perubahan disimpan" : "Aktivitas disimpan",
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
        setEditingId(null);
        setShowForm(false);
      }
    } finally {
      setSaving(false);
    }
  }

  function openNew(date?: string) {
    titleTouched.current = false;
    setExtrasOpen(false);
    setEditingId(null);
    setConflicts([]);
    setForm((current) => ({
      title: "",
      date: date ?? (scope && scope !== "all" ? scope : current.date),
      startTime: "",
      endTime: "",
      location: "",
      category: "",
    }));
    setPoint(null);
    setShowForm(true);
  }

  function openEdit(item: Item) {
    const p = itemPoint(item);
    titleTouched.current = true;
    setEditingId(item.id);
    setConflicts([]);
    setForm({
      title: String(item.title ?? ""),
      date: itineraryDateKey(item.activity_date) ?? today(),
      startTime: hhmm(item.start_time) ?? "",
      endTime: hhmm(item.end_time) ?? "",
      location: String(item.location ?? ""),
      category: String(item.activity_category ?? ""),
    });
    setPoint(p);
    setShowForm(true);
  }

  function exploreCategory(category: PoiCategoryId) {
    setFocus(false);
    setPoiOn((current) => (current.includes(category) ? current : [...current, category]));
    setZoomTick((tick) => tick + 1);
  }

  function selectActivity(id: string) {
    setActiveId(id);
    const found = days.find((d) => d.items.some((i) => i.id === id));
    if (found && scope !== "all" && scope !== found.date) setSelectedDay(found.date);
  }

  // Arriving from Ringkas with ?add or ?edit opens the form once.
  useEffect(() => {
    const target = initialEditId ? items.find((item) => item.id === initialEditId) : null;
    if (target) openEdit(target);
    else if (initialAdd) openNew();
    // Only on arrival; later list refreshes must not reopen the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFormOpenChange(open: boolean) {
    setShowForm(open);
    if (!open) {
      setEditingId(null);
      setConflicts([]);
    }
  }

  function locateMe() {
    if (!navigator.geolocation) {
      toast.error("Perangkat ini tidak mendukung GPS.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setPoi(null);
        setMe({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        setLocating(false);
        toast.error(
          error.code === error.PERMISSION_DENIED
            ? "Izin lokasi ditolak. Aktifkan lokasi untuk Djiwa Travel di pengaturan browser."
            : "Lokasi belum bisa ditemukan. Coba lagi di tempat terbuka.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }

  async function addHere() {
    if (!me) return;
    let label = "Lokasi saya";
    try {
      const found = await reversePlace({ data: { lat: me.lat, lng: me.lng } });
      if (found.place?.label) label = found.place.label;
    } catch {
      // The name is a convenience; the point itself is what matters.
    }
    openNew();
    setForm((current) => ({ ...current, location: label, title: current.title || "" }));
    setPoint({ lat: me.lat, lng: me.lng });
  }

  // A tapped place gets its photo when one exists.
  useEffect(() => {
    setPoiImage(null);
    if (!poi || !mapConfig?.placeImages) return;
    let cancelled = false;
    getPlaceImage({ data: { lat: poi.lat, lng: poi.lng, label: poi.label } })
      .then((result) => {
        if (!cancelled && result.image?.url && isAllowedImageUrl(result.image.url)) {
          setPoiImage(result.image.url);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [poi, mapConfig?.placeImages]);

  // Activities with a point but no photo lookup yet: ask the server once, then refresh the list.
  const imageTried = useRef(new Set<string>());
  useEffect(() => {
    if (!mapConfig?.enabled || !mapConfig.placeImages) return;
    const pending = items.filter(
      (item) => itemPoint(item) && !item.place_image_checked_at && !imageTried.current.has(item.id),
    );
    if (!pending.length) return;
    let cancelled = false;
    void (async () => {
      let changed = false;
      for (const item of pending.slice(0, 8)) {
        imageTried.current.add(item.id);
        try {
          const result = await resolveItemImage({ data: { itemId: item.id } });
          if (result.checked) changed = true;
        } catch {
          // Photos are optional.
        }
        if (cancelled) return;
      }
      if (changed && !cancelled) await onSaved();
    })();
    return () => {
      cancelled = true;
    };
  }, [items, mapConfig?.enabled, mapConfig?.placeImages, onSaved]);

  const days = useMemo(() => groupItineraryByDay(items), [items]);
  const overlapIds = useMemo(() => conflictingIds(items.map(toTimedItem)), [items]);
  const mapOn = Boolean(mapConfig?.enabled);
  // Before any activity has a point, the map still opens on the trip's destination country.
  const countryBounds = countryBoundsFor(trip?.destination_code);
  const defaultDay = days.find((day) => day.date === today())?.date ?? days[0]?.date ?? "";
  const scope =
    selectedDay === "all" || days.some((day) => day.date === selectedDay)
      ? selectedDay
      : defaultDay;
  const ideaDays = useMemo<IdeaDay[]>(() => {
    const byDate = new Map<string, Item[]>(days.map((day) => [day.date, day.items]));
    const from = trip?.departure_date?.slice(0, 10);
    const to = trip?.return_date?.slice(0, 10);
    if (from && to && from <= to) {
      const cursor = new Date(`${from}T00:00:00Z`);
      for (let n = 0; n < 31 && cursor.toISOString().slice(0, 10) <= to; n += 1) {
        const key = cursor.toISOString().slice(0, 10);
        if (!byDate.has(key)) byDate.set(key, []);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayItems]) => {
        const label = formatItineraryDate(date);
        return {
          date,
          label: label.weekday ? `${label.weekday}, ${label.full}` : label.full,
          items: dayItems.map((item) => ({
            start: hhmm(item.start_time),
            end: hhmm(item.end_time),
            lat:
              item.latitude === null || item.latitude === undefined ? null : Number(item.latitude),
            lng:
              item.longitude === null || item.longitude === undefined
                ? null
                : Number(item.longitude),
          })),
        };
      });
  }, [days, trip?.departure_date, trip?.return_date]);
  const agendaDays = useMemo(
    () =>
      ideaDays.map((day) => ({
        date: day.date,
        items: days.find((d) => d.date === day.date)?.items ?? [],
      })),
    [ideaDays, days],
  );
  const formHasDay = agendaDays.some((day) => day.date === form.date);
  const ideasDate = scope && scope !== "all" ? scope : defaultDay || ideaDays[0]?.date || today();
  const model = useMemo(() => buildMapModel(days, scope || "all"), [days, scope]);
  const pinInfo = useMemo(() => new Map(model.pins.map((pin) => [pin.id, pin])), [model]);
  const nearestKm = useMemo(() => {
    if (!me) return null;
    const candidates = model.pins.filter((pin) => !pin.muted);
    if (!candidates.length) return null;
    return Math.min(...candidates.map((pin) => distanceKm(me, pin)));
  }, [me, model]);
  const pinnedTotal = items.filter((item) => itemPoint(item)).length;
  const dayRouteUrl =
    scope && scope !== "all"
      ? googleMapsDayRouteUrl(model.pins.map((pin) => ({ lat: pin.lat, lng: pin.lng })))
      : null;
  const searchEnabled = Boolean(mapConfig?.enabled && mapConfig.placeSearch);
  const showExtras =
    extrasOpen || Boolean(form.startTime || form.endTime || form.category) || conflicts.length > 0;
  const formNode = showForm ? (
    <motion.div
      ref={formRef}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springIos}
      className="mt-1.5 scroll-mt-4"
    >
      <form
        aria-label={editingId ? "Ubah aktivitas" : "Tambah aktivitas"}
        onSubmit={(event) => void submit(event)}
        className="space-y-2.5 rounded-2xl border border-brand-red/60 bg-surface p-3 shadow-sm"
      >
        <div className="space-y-1.5">
          <label htmlFor="agenda-location" className="text-[13px] font-semibold">
            Cari tempat <span className="font-normal text-muted-foreground">(opsional)</span>
          </label>
          <PlaceSearchField
            id="agenda-location"
            value={form.location}
            picked={point}
            searchEnabled={searchEnabled}
            cities={tripCities}
            autoFocus={!editingId}
            onChange={(location, picked) => {
              setForm((current) => ({ ...current, location }));
              setPoint(picked);
            }}
            onPick={(place) => {
              const category = guessActivityCategory(place.subtitle);
              setForm((current) => ({
                ...current,
                title: titleTouched.current
                  ? current.title
                  : titleForPlace(place.label, category || current.category),
                category: current.category || category,
              }));
            }}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="agenda-title" className="text-[13px] font-semibold">
            Nama aktivitas
          </label>
          <input
            id="agenda-title"
            required
            value={form.title}
            onChange={(event) => {
              titleTouched.current = true;
              setForm({ ...form, title: event.target.value });
            }}
            placeholder="Contoh: Makan malam"
            className="min-h-10 w-full rounded-xl border border-border/70 bg-secondary/70 px-3.5 text-[14px] outline-none transition focus:border-brand-red focus:ring-2 focus:ring-brand-red/15"
          />
        </div>
        {(editingId || !formHasDay) && (
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
        )}
        {showExtras ? (
          <div className="space-y-2.5">
            <div>
              <p className="mb-1.5 text-[13px] font-semibold">
                Waktu <span className="font-normal text-muted-foreground">(opsional)</span>
              </p>
              <p className="mb-2 text-xs text-muted-foreground">
                Jam selesai lebih kecil dari jam mulai berarti berakhir keesokan harinya (misal
                22.00 sampai 01.00).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5 text-xs text-muted-foreground">
                  Mulai
                  <input
                    id="agenda-start"
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
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setExtrasOpen(true)}
            className="tap flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-[12px] font-semibold text-brand-red"
          >
            <Plus className="size-3.5" /> Atur waktu &amp; kategori
          </button>
        )}
        <AnimatePresence initial={false}>
          {conflicts.length > 0 && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={springIos}
              className="overflow-hidden"
            >
              <div className="rounded-xl bg-amber-50 p-3 text-[12px] text-amber-900">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <TriangleAlert className="size-4" /> Jadwal bertabrakan
                </p>
                <p className="mt-1">Waktu ini beririsan dengan aktivitas lain:</p>
                <ul className="mt-1 space-y-0.5">
                  {conflicts.map((conflict) => (
                    <li key={conflict.id} className="tabular-nums">
                      • {String(conflict.title)} · {conflict.start}
                      {conflict.end ? `–${conflict.end}` : ""}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-amber-800/80">
                  Tanpa jam selesai, aktivitas dihitung 30 menit.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConflicts([]);
                      document.getElementById("agenda-start")?.focus();
                    }}
                    className="tap min-h-9 flex-1 rounded-lg bg-surface text-[12px] font-semibold"
                  >
                    Ubah waktu
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void submit(undefined, true)}
                    className="tap min-h-9 flex-1 rounded-lg bg-amber-600 text-[12px] font-semibold text-white disabled:opacity-60"
                  >
                    Tetap simpan
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleFormOpenChange(false)}
            className={`${btnSoft} min-h-10 flex-1 rounded-xl`}
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={saving}
            className={`${btnRed} min-h-10 flex-[1.6] rounded-xl disabled:opacity-60`}
          >
            {saving ? "Menyimpan…" : editingId ? "Simpan perubahan" : "Simpan"}
          </button>
        </div>
      </form>
    </motion.div>
  ) : null;
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id="agenda">
        <section className="space-y-3 pb-28" aria-label="Agenda perjalanan">
          <div className="relative flex items-center justify-between px-1 pt-1">
            <div className="min-w-0">
              <h1 className="truncate text-[22px] font-bold leading-tight tracking-tight">
                {trip?.destination_name
                  ? `Mau ke mana saja di ${trip.destination_name}?`
                  : "Mau ke mana saja?"}
              </h1>
              {trip && (
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                  {tripSubtitle(trip, items.length)}
                </p>
              )}
            </div>
          </div>
          <CalendarConnectBanner />
          {mapOn && (model.pinnedCount > 0 || countryBounds !== null) ? (
            <motion.div
              initial={{ y: 10, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              transition={springIos}
              className={
                expanded
                  ? "fixed inset-0 z-50 flex flex-col gap-2 bg-background px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-[calc(env(safe-area-inset-top)+0.5rem)]"
                  : "space-y-2 pt-6"
              }
            >
              <div
                className={`flex gap-1.5 overflow-x-auto overscroll-x-contain px-0.5 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${expanded ? "" : "pr-24"}`}
              >
                {days.length > 1 ? (
                  <>
                    {days.map((day) => (
                      <DayChip
                        key={day.date}
                        selected={scope === day.date}
                        onClick={() => setSelectedDay(day.date)}
                      >
                        {formatItineraryDate(day.date).weekday
                          ? `${formatItineraryDate(day.date).weekday}, `
                          : ""}
                        {formatItineraryDate(day.date).full}
                      </DayChip>
                    ))}
                    <DayChip selected={scope === "all"} onClick={() => setSelectedDay("all")}>
                      Semua hari
                    </DayChip>
                  </>
                ) : (
                  <span className="inline-flex min-h-8 items-center rounded-full bg-brand-red px-3 text-[11px] font-semibold text-white shadow">
                    {formatItineraryDate(days[0]?.date ?? "").full}
                  </span>
                )}
              </div>
              <div className={expanded ? "relative min-h-0 flex-1" : "relative"}>
                {!expanded && (
                  <div className="pointer-events-none absolute bottom-[calc(100%-10px)] right-3 z-0 flex flex-col items-end">
                    <AgendaMascotBubble
                      hasItems={items.length > 0}
                      canExploreMap={Boolean(mapConfig?.poiHelper)}
                      onAdd={openNew}
                      onExplore={exploreCategory}
                      onIdeas={placeIdeas.available ? () => setIdeasOpen(true) : undefined}
                    />
                    <AgendaMascot size={92} />
                  </div>
                )}
                <div
                  className={
                    expanded
                      ? "relative z-10 h-full min-h-0 overflow-hidden rounded-2xl bg-secondary"
                      : "relative z-10 h-[230px] overflow-hidden rounded-[18px] bg-secondary"
                  }
                >
                  {mapBroken && (
                    <p className="absolute inset-x-3 top-1/2 z-10 -translate-y-1/2 rounded-xl bg-surface/95 px-3 py-2 text-center text-xs text-muted-foreground shadow">
                      Peta belum bisa dimuat. Daftar agenda tetap bisa dipakai; pakai tombol Rute
                      untuk membuka Google Maps.
                    </p>
                  )}
                  <ItineraryMap
                    pins={model.pins}
                    routes={model.routes}
                    focus={focus}
                    userPoint={me}
                    zoomTick={zoomTick}
                    activeId={activeId}
                    onSelect={selectActivity}
                    styleUrl={mapConfig!.styleUrl}
                    poiCategories={mapConfig?.poiHelper ? poiOn : []}
                    onPoiSelect={(picked) => {
                      setMe(null);
                      setPoi(picked);
                    }}
                    focusBounds={countryBounds}
                    tilt={tilt}
                    onUnavailable={() => setMapBroken(true)}
                  />
                  <AnimatePresence>
                    {me && (
                      <motion.div
                        key="me"
                        initial={{ y: 16, opacity: 0, scale: 0.96 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 12, opacity: 0 }}
                        transition={springIos}
                        className={`absolute inset-x-2 z-10 flex items-center gap-2.5 rounded-2xl bg-surface p-2.5 shadow-lg ${"bottom-2"}`}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                          <LocateFixed className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold">
                            Lokasi kamu
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            ±{Math.max(1, Math.round(me.accuracy))} m
                            {nearestKm !== null
                              ? ` · ${formatKm(nearestKm)} dari titik agenda terdekat`
                              : ""}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => void addHere()}
                          className="tap min-h-8 rounded-lg bg-brand-red px-3 text-[12px] font-semibold text-white"
                        >
                          Tambah di sini
                        </button>
                        <button
                          type="button"
                          onClick={() => setMe(null)}
                          aria-label="Tutup"
                          className="tap flex size-8 items-center justify-center rounded-lg text-muted-foreground"
                        >
                          <X className="size-4" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <AnimatePresence>
                    {poi && (
                      <motion.div
                        key={`${poi.lat}-${poi.lng}`}
                        initial={{ y: 16, opacity: 0, scale: 0.96 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 12, opacity: 0 }}
                        transition={springIos}
                        className={`absolute inset-x-2 z-10 flex items-center gap-2.5 rounded-2xl bg-surface p-2.5 shadow-lg ${"bottom-2"}`}
                      >
                        {poiImage && (
                          <img
                            src={poiImage}
                            alt=""
                            loading="lazy"
                            className="size-10 shrink-0 rounded-lg object-cover"
                          />
                        )}
                        <span
                          className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-white ${poiImage ? "hidden" : ""}`}
                          style={{ backgroundColor: poiCategory(poi.category)?.color }}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="size-4"
                            fill="none"
                            stroke="#fff"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                            dangerouslySetInnerHTML={{
                              __html: poiCategory(poi.category)?.icon ?? "",
                            }}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold">
                            {poi.label}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {poiCategory(poi.category)?.label}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setForm((current) => ({
                              ...current,
                              title: current.title || poi.label,
                              location: poi.label,
                              date: scope && scope !== "all" ? scope : current.date,
                              category: current.category || POI_FORM_CATEGORY[poi.category],
                            }));
                            setPoint({ lat: poi.lat, lng: poi.lng });
                            setPoi(null);
                            setShowForm(true);
                          }}
                          className="tap min-h-8 rounded-lg bg-brand-red px-3 text-[12px] font-semibold text-white"
                        >
                          Tambah
                        </button>
                        <button
                          type="button"
                          onClick={() => setPoi(null)}
                          aria-label="Tutup"
                          className="tap flex size-8 items-center justify-center rounded-lg text-muted-foreground"
                        >
                          <X className="size-4" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className={`absolute right-2 flex flex-col gap-2 ${"top-12"}`}>
                    <motion.button
                      type="button"
                      onClick={() => setFocus((value) => !value)}
                      aria-pressed={focus}
                      aria-label={focus ? "Matikan mode fokus" : "Mode fokus: hanya titik agenda"}
                      whileTap={{ scale: 0.9 }}
                      transition={springSnappy}
                      className={`tap flex size-9 items-center justify-center rounded-full shadow ${focus ? "bg-brand-red text-white" : "bg-surface/95"}`}
                    >
                      <Focus className="size-4" />
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={() => setTilt((value) => !value)}
                      aria-pressed={tilt}
                      aria-label={tilt ? "Kembali ke peta 2D" : "Tampilan 3D"}
                      whileTap={{ scale: 0.9 }}
                      transition={springSnappy}
                      className={`tap flex size-9 items-center justify-center rounded-full text-[11px] font-bold shadow ${tilt ? "bg-brand-red text-white" : "bg-surface/95"}`}
                    >
                      3D
                    </motion.button>
                    {mapConfig?.locateMe && (
                      <motion.button
                        type="button"
                        onClick={locateMe}
                        disabled={locating}
                        aria-label="Lokasi saya"
                        whileTap={{ scale: 0.9 }}
                        animate={locating ? { rotate: 360 } : { rotate: 0 }}
                        transition={
                          locating
                            ? { repeat: Infinity, duration: 1.2, ease: "linear" }
                            : springSnappy
                        }
                        className={`tap flex size-9 items-center justify-center rounded-full shadow ${me ? "bg-blue-600 text-white" : "bg-surface/95"}`}
                      >
                        <LocateFixed className="size-4" />
                      </motion.button>
                    )}
                  </div>
                  <motion.button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    whileTap={{ scale: 0.9, rotate: 8 }}
                    transition={springSnappy}
                    aria-label={expanded ? "Tutup peta layar penuh" : "Buka peta layar penuh"}
                    className={`tap absolute right-2 flex size-9 items-center justify-center rounded-full bg-surface/95 shadow ${"top-2"}`}
                  >
                    {expanded ? <Shrink className="size-4" /> : <Expand className="size-4" />}
                  </motion.button>
                </div>
              </div>
              {(dayRouteUrl || (mapConfig?.poiHelper && !focus)) && (
                <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain px-0.5 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {dayRouteUrl && (
                    <motion.a
                      href={dayRouteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      initial={{ y: 12, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ ...springIos, delay: 0.25 }}
                      whileTap={{ scale: 0.96 }}
                      className="tap inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full bg-surface px-2.5 text-[11px] font-semibold shadow-sm"
                    >
                      <RouteIcon className="size-3.5 text-brand-red" />
                      Rute hari ini · {model.pinnedCount} titik
                    </motion.a>
                  )}
                  {mapConfig?.poiHelper && !focus && (
                    <div className="contents" role="group" aria-label="Tampilkan di peta">
                      {POI_CATEGORIES.map((category, index) => {
                        const on = poiOn.includes(category.id);
                        return (
                          <motion.button
                            key={category.id}
                            type="button"
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ ...springIos, delay: 0.1 + index * 0.04 }}
                            whileTap={{ scale: 0.92 }}
                            onClick={() =>
                              setPoiOn((current) =>
                                on
                                  ? current.filter((id) => id !== category.id)
                                  : [...current, category.id],
                              )
                            }
                            aria-pressed={on}
                            {...(on
                              ? { style: { backgroundColor: category.color, color: "#fff" } }
                              : {})}
                            className="tap inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full bg-surface px-2.5 text-[11px] font-semibold shadow-sm"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="size-3.5"
                              fill="none"
                              stroke={on ? "#fff" : category.color}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                              dangerouslySetInnerHTML={{ __html: category.icon }}
                            />
                            {category.label}
                          </motion.button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ) : null}
          {mapOn && days.length > 0 && pinnedTotal === 0 && (
            <p className="flex items-center gap-2 rounded-2xl bg-secondary px-3 py-2.5 text-xs text-muted-foreground">
              <MapPin className="size-4 shrink-0 text-brand-red" />
              Cari tempat saat menambah aktivitas agar muncul di peta.
            </p>
          )}
          <PlaceIdeasFeature
            tripId={tripId}
            destination={trip?.destination_name ?? "tujuanmu"}
            status={placeIdeas}
            days={ideaDays}
            defaultDate={ideasDate}
            open={ideasOpen}
            onOpenChange={setIdeasOpen}
            onAdded={onSaved}
          />
          {showForm && !formHasDay && formNode}
          {agendaDays.map((day) => (
            <ItineraryDay
              key={day.date}
              date={day.date}
              items={day.items}
              pinInfo={pinInfo}
              overlapIds={overlapIds}
              activeId={activeId}
              onSelect={selectActivity}
              onEdit={openEdit}
              onAdd={() => openNew(day.date)}
              form={showForm && form.date === day.date ? formNode : null}
              onPin={async (id) => {
                const result = await pinItemOnMap({ data: { itemId: id } });
                if (result.found) await onSaved();
                return result.found;
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
          ))}
          {agendaDays.length === 0 && !showForm && (
            <div className="rounded-2xl bg-secondary p-4 text-center">
              <CalendarDays className="mx-auto size-9 text-muted-foreground" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-semibold">Belum ada aktivitas</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Rencana perjalananmu akan tersusun di sini.
              </p>
              <button
                type="button"
                onClick={() => openNew()}
                className="tap mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-background px-4 text-sm font-semibold text-brand-red"
              >
                <Plus className="size-4" /> Tambah aktivitas
              </button>
            </div>
          )}
        </section>
      </LayoutGroup>
    </MotionConfig>
  );
}

type TimedItem = {
  id: string;
  title: unknown;
  date: string;
  start: string | null;
  end: string | null;
};

const hhmm = (value: unknown) => {
  const text = String(value ?? "");
  return /^\d{2}:\d{2}/.test(text) ? text.slice(0, 5) : null;
};

function toTimedItem(item: Item): TimedItem {
  return {
    id: item.id,
    title: item.title,
    date: itineraryDateKey(item.activity_date) ?? "",
    start: hhmm(item.start_time),
    end: hhmm(item.end_time),
  };
}

const POI_FORM_CATEGORY: Record<PoiCategoryId, string> = {
  station: "transport",
  airport: "flight",
  food: "food",
  attraction: "attraction",
  hotel: "hotel",
  shop: "other",
};

/** The scheduling mascot (a plush plane with a calendar and pencil), floating gently. */
function AgendaMascot({ size }: { size: number }) {
  return (
    <motion.img
      src="/assets/agenda/mascot-agenda-v4.png"
      alt=""
      width={size}
      height={Math.round(size * (272 / 360))}
      loading="lazy"
      animate={{ y: [0, -3, 0] }}
      transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut" }}
      className="mx-auto select-none"
      draggable={false}
    />
  );
}

function tripSubtitle(
  trip: {
    name: string;
    destination_name: string;
    departure_date: string | null;
    return_date: string | null;
  },
  count = 0,
) {
  const fmt = (value: string | null, withYear: boolean) => {
    const m = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
    }).format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  };
  const a = String(trip.departure_date ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  const b = String(trip.return_date ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  let range: string | null;
  if (a && b && a[1] === b[1] && a[2] === b[2]) {
    // Same month: "3–9 Nov 2026" is shorter and reads better on a phone.
    range = `${Number(a[3])}–${fmt(trip.return_date, true)}`;
  } else {
    const from = fmt(trip.departure_date, false);
    const to = fmt(trip.return_date, true);
    range = from && to ? `${from} – ${to}` : (to ?? from);
  }
  return [trip.name, range, count > 0 ? `${count} agenda` : null].filter(Boolean).join(" · ");
}

function groupItineraryByDay(items: Item[]) {
  const groups = new Map<string, Item[]>();
  [...items]
    .sort(
      (a, b) =>
        itinerarySortKey(a).localeCompare(itinerarySortKey(b)) ||
        String(a.title ?? "").localeCompare(String(b.title ?? "")),
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

function DayChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      whileTap={{ scale: 0.94 }}
      transition={springSnappy}
      className={`tap relative min-h-8 shrink-0 rounded-full px-3 text-[11px] font-semibold shadow ${selected ? "text-white" : "bg-surface/95 text-foreground"}`}
    >
      {selected && (
        <motion.span
          layoutId="agenda-day-pill"
          transition={springSnappy}
          className="absolute inset-0 rounded-full bg-brand-red"
        />
      )}
      <span className="relative">{children}</span>
    </motion.button>
  );
}

function TravelHop({ km }: { km: number }) {
  const leg = estimateLeg(km);
  const Icon = leg.mode === "walk" ? Footprints : TrainFront;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.15 }}
      className="ml-6 flex items-center gap-2 py-1 text-[11px] tabular-nums text-muted-foreground"
      data-testid="travel-hop"
    >
      <motion.i
        aria-hidden="true"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={springIos}
        style={{
          originY: 0,
          backgroundImage:
            "repeating-linear-gradient(to bottom, var(--color-border) 0 3px, transparent 3px 6px)",
        }}
        className="block h-4 w-0.5"
      />
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ ...springSnappy, delay: 0.2 }}
        className="flex"
      >
        <Icon className="size-3.5" strokeWidth={1.8} />
      </motion.span>
      <span>
        {leg.mode === "walk" ? "Jalan kaki" : "Kereta"} · ≈{formatMinutes(leg.minutes)} ·{" "}
        {formatKm(leg.km)}
      </span>
    </motion.div>
  );
}

function ItineraryDay({
  date,
  items,
  pinInfo,
  overlapIds,
  activeId,
  onSelect,
  onEdit,
  onAdd,
  form,
  onDelete,
  onPin,
}: {
  date: string;
  items: Item[];
  pinInfo: Map<string, AgendaPin>;
  overlapIds: Set<string>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onEdit: (item: Item) => void;
  onAdd: () => void;
  form: React.ReactNode;
  onDelete: (id: string) => Promise<void>;
  onPin: (id: string) => Promise<boolean>;
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
    <motion.section
      initial={{ y: 12, opacity: 0.4 }}
      animate={{ y: 0, opacity: 1 }}
      transition={springIos}
    >
      <div className="mb-1.5 mt-3.5 flex items-baseline justify-between gap-3 px-0.5">
        <h3 className="text-[14px] font-bold capitalize tracking-tight">
          {dateLabel.weekday ? `${dateLabel.weekday}, ` : ""}
          {dateLabel.full}
        </h3>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {items.length} aktivitas{lengthKm > 0 ? ` · ±${formatKm(lengthKm)}` : ""}
        </span>
      </div>
      <AnimatePresence initial={false}>
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            layout="position"
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={springIos}
            className={index > 0 && hops[index] == null ? "mt-2" : undefined}
          >
            {hops[index] != null && <TravelHop km={hops[index]!} />}
            <ItineraryItem
              item={item}
              pin={pinInfo.get(item.id)}
              overlaps={overlapIds.has(item.id)}
              active={activeId === item.id}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
              onPin={onPin}
            />
          </motion.div>
        ))}
      </AnimatePresence>
      {form ?? (
        <button
          type="button"
          onClick={onAdd}
          aria-label="Tambah aktivitas"
          className="tap mt-1.5 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-[12px] font-semibold text-brand-red"
        >
          <Plus className="size-3.5" /> Tambah ke {dateLabel.full}
        </button>
      )}
    </motion.section>
  );
}

function ItineraryItem({
  item,
  pin,
  overlaps,
  active,
  onSelect,
  onEdit,
  onDelete,
  onPin,
}: {
  item: Item;
  pin?: AgendaPin | undefined;
  overlaps: boolean;
  active: boolean;
  onSelect: (id: string) => void;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => Promise<void>;
  onPin: (id: string) => Promise<boolean>;
}) {
  const [pinState, setPinState] = useState<"idle" | "busy" | "missed">("idle");
  const point = itemPoint(item);
  const imageUrl = isAllowedImageUrl(item.place_image_url) ? item.place_image_url : null;
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
    <motion.article
      {...(point ? { whileTap: { scale: 0.985 } } : {})}
      transition={springSnappy}
      className={`relative grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2.5 rounded-[14px] bg-surface px-2.5 py-2 ${point ? "cursor-pointer" : ""}`}
      aria-current={active ? "true" : undefined}
      onClick={() => point && onSelect(item.id)}
    >
      {active && (
        <motion.span
          layoutId="agenda-active-ring"
          transition={springSnappy}
          className="pointer-events-none absolute inset-0 rounded-[14px] ring-[1.5px] ring-inset ring-brand-red"
        />
      )}
      {pin ? (
        <motion.div
          animate={{ scale: active ? 1.08 : 1 }}
          transition={springSnappy}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
          style={
            pin.muted && !active
              ? { backgroundColor: "#eceef1", color: "#8a9099" }
              : active
                ? { backgroundColor: pin.color, color: "#fff" }
                : { backgroundColor: `${pin.color}1f`, color: pin.color }
          }
          aria-label={`Titik ${pin.n} di peta`}
        >
          {pin.n}
        </motion.div>
      ) : (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          <Icon className="size-4" strokeWidth={1.8} />
        </div>
      )}
      <div className="min-w-0">
        {time && (
          <p className="text-[11px] font-medium tabular-nums leading-tight text-muted-foreground">
            {time}
            {endTime ? `–${endTime}` : ""}
          </p>
        )}
        <h4 className="text-[14px] font-semibold leading-snug">
          {String(item.title ?? "Aktivitas")}
        </h4>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {item.location ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{String(item.location)}</span>
            </span>
          ) : (
            <span>Lokasi belum diatur</span>
          )}
        </div>
        {!point && (
          <button
            type="button"
            disabled={pinState === "busy"}
            onClick={(event) => {
              event.stopPropagation();
              setPinState("busy");
              void onPin(item.id)
                .then((found) => setPinState(found ? "idle" : "missed"))
                .catch(() => setPinState("missed"));
            }}
            className="tap mr-1.5 mt-1.5 inline-flex items-center gap-1 rounded-full bg-brand-red/10 px-2 py-0.5 text-[10.5px] font-semibold text-brand-red disabled:opacity-60"
          >
            <MapPin className="size-3" />
            {pinState === "busy"
              ? "Mencari di peta…"
              : pinState === "missed"
                ? "Tidak ketemu, ubah lokasi"
                : "Pasang di peta"}
          </button>
        )}
        {overlaps && (
          <span className="mr-1.5 mt-1.5 inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10.5px] font-semibold text-orange-700">
            <TriangleAlert className="size-3" /> Jadwal bentrok
          </span>
        )}
        {item.booking_reference ? (
          <span className="mt-1.5 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
            Booking tersimpan
          </span>
        ) : (
          <span className="mt-1.5 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">
            Perlu booking
          </span>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        {point && (
          <motion.a
            href={googleMapsDirectionsUrl(point)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            whileTap={{ scale: 0.93 }}
            transition={springSnappy}
            className="tap inline-flex min-h-8 items-center gap-1 rounded-lg bg-brand-red-soft px-2.5 text-[11px] font-semibold text-brand-red"
            aria-label={`Rute ke ${String(item.title ?? "aktivitas")} di Google Maps`}
          >
            <Navigation className="size-3.5" /> Rute
          </motion.a>
        )}
        <div className="flex">
          <motion.button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(item);
            }}
            whileTap={{ scale: 0.88 }}
            transition={springSnappy}
            className="tap flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-brand-red"
            aria-label={`Ubah ${String(item.title ?? "aktivitas")}`}
          >
            <Pencil className="size-4" />
          </motion.button>
          <motion.button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void remove();
            }}
            disabled={deleting}
            whileTap={{ scale: 0.88 }}
            transition={springSnappy}
            className="tap flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-brand-red disabled:opacity-50"
            aria-label={`Hapus ${String(item.title ?? "aktivitas")}`}
          >
            <Trash2 className="size-4" />
          </motion.button>
        </div>
      </div>
      {imageUrl && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springIos}
          className="relative col-span-2 col-start-2 mt-0.5 overflow-hidden rounded-xl bg-secondary"
        >
          <img
            src={imageUrl}
            alt={`Foto ${String(item.location ?? item.title ?? "tempat")}`}
            loading="lazy"
            className="h-24 w-full object-cover"
          />
          <span className="absolute bottom-1 right-1.5 rounded bg-black/50 px-1.5 text-[9px] text-white">
            Wikipedia
          </span>
        </motion.div>
      )}
    </motion.article>
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
  initialAdd = false,
}: {
  tripId: string;
  items: Item[];
  onSaved: () => Promise<void>;
  initialAdd?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(initialAdd);
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
  initialAdd = false,
}: {
  tripId: string;
  items: Item[];
  categories: CategoryOption[];
  onSaved: () => Promise<void>;
  initialAdd?: boolean;
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
  const [showForm, setShowForm] = useState(initialAdd);
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
