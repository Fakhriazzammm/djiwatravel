import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  CheckCircle2,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Expand,
  Focus,
  ChevronLeft,
  ChevronRight,
  LocateFixed,
  MapPin,
  MoreHorizontal,
  Navigation,
  Pencil,
  Plane,
  Plus,
  Shrink,
  Snowflake,
  Sun,
  Ticket,
  Trash2,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import ItineraryMap from "@/components/itinerary-map";
import { FixedLayer } from "@/components/motion-primitives";
import { ConfirmDialog, TripActionSheet, iosGroup, iosHeading } from "@/components/trip-ios";
import {
  buildMapModel,
  googleMapsPointUrl,
  itemPoint,
  type ItineraryMapConfig,
} from "@/lib/itinerary-map";
import { deleteItinerary, patchChecklist } from "@/lib/my-trips.fn";
import { displayChecklistTitle } from "@/lib/my-trips-home";
import { countryBoundsFor } from "@/lib/trip-country-bounds";
import { citiesBounds, type TripCity } from "@/lib/trip-cities";
import { TripCitiesSheet } from "@/components/trip-cities-sheet";
import { runTripMutation } from "@/lib/trip-actions";
import { TripAssistant, type IntroPart } from "@/components/trip-assistant";
import { getTripWeather } from "@/lib/trip-weather.fn";
import {
  describeWeather,
  forecastablePlaces,
  weatherPlaces,
  type DayWeather,
  type WeatherKind,
} from "@/lib/trip-weather";
import {
  buildAttention,
  compactMoney,
  groupOverviewDays,
  pickNowNext,
  pickOverviewDay,
  friendlyTripLine,
} from "@/lib/trip-overview";

type Row = { id: string } & Record<string, unknown>;

type Props = {
  tripId: string;
  name: string;
  destination: string;
  /** ISO country code of the destination; frames the map before any activity has a point. */
  destinationCode?: string | null;
  /** Cities the traveler chose for this trip; they frame the map and scope place search. */
  cities?: TripCity[];
  /** "Hari ke-2", "Berangkat dalam 3 hari", ... from the trip dates. */
  dayLabel: string;
  datesLabel: string;
  itinerary: Row[];
  checklist: Row[];
  bookings: Row[];
  budgetSet: boolean;
  /** Some budget category already has an amount (the AI offers to split it when not). */
  budgetAllocated?: boolean | undefined;
  currency?: string | undefined;
  /** Budget categories and totals the receipt scanner opened from the chat needs. */
  categories?: { id: string; name: string }[] | undefined;
  budgetMinor?: number | undefined;
  spentMinor?: number | undefined;
  departureDate?: string | null | undefined;
  returnDate?: string | null | undefined;
  remainingLabel: string;
  remainingMinor: number;
  mapConfig: ItineraryMapConfig | null;
  /** Flight search for this trip (`/tiket` with its destination and dates); null when Admin turned it off. */
  flightsSearch?: {
    to: "/tiket";
    search: { tujuan?: string; berangkat?: string; pulang?: string };
  } | null;
  onMenu: () => void;
  onChanged: () => Promise<unknown>;
};

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
};

const shortDate = (key: string) => {
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? key
    : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(date);
};

const WEATHER_ICON: Record<WeatherKind, typeof Sun> = {
  sun: Sun,
  partly: CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  storm: CloudLightning,
  snow: Snowflake,
};

const dayOffset = (key: string, today: string) =>
  Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);

const glassBase = "tap grid size-9 shrink-0 place-items-center rounded-xl shadow-md";
const glass = `${glassBase} bg-surface text-foreground`;
/** Round map buttons that switch to an accent colour while on. */
const toggleGlass = (on: boolean, onClass: string) =>
  `${glassBase} ${on ? onClass : "bg-surface text-foreground"}`;

const AGENDA_PREVIEW = 4;

/**
 * Ringkas as a map-first screen: the day's route on top, a sheet below with the numbers that matter
 * and the day's agenda, plus what still needs attention. Every item can be added, edited or deleted
 * from here (the "+" sheet and the row menu open the same editors as the section pages).
 */
export function TripOverview(props: Props) {
  const { tripId, mapConfig } = props;
  const navigate = useNavigate();
  const today = useMemo(localToday, []);
  const days = useMemo(() => groupOverviewDays(props.itinerary), [props.itinerary]);
  const [picked, setPicked] = useState<string>("");
  const scope =
    picked === "all" || days.some((day) => day.date === picked)
      ? picked
      : pickOverviewDay(
          days.map((day) => day.date),
          today,
        );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [mapBroken, setMapBroken] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [focus, setFocus] = useState(false);
  const [tilt, setTilt] = useState(false);
  const [forecast, setForecast] = useState<DayWeather[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  // The AI chat reports whether it is live (Admin switch, key, guest rule); off keeps the old layout.
  // null = not known yet (the chat asks the server once), so nothing pops up before it answers.
  const [assistantState, setAssistantState] = useState<boolean | null>(null);
  const assistantOn = assistantState === true;
  const cities = props.cities ?? [];
  const cityFlow = Boolean(mapConfig?.cityOnboarding);
  const [citiesOpen, setCitiesOpen] = useState(false);
  // A trip without cities asks once on arrival; "Lewati dulu" is remembered on this device.
  useEffect(() => {
    // With the chat on, the city question is part of the conversation instead of a pop-up.
    if (assistantState !== false || !cityFlow || cities.length > 0) return;
    try {
      if (window.localStorage.getItem(`djiwa-cities-skip-${tripId}`) !== "1") setCitiesOpen(true);
    } catch {
      setCitiesOpen(true);
    }
    // Decide once per trip, not on every refresh of the cities list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, cityFlow, assistantState]);
  const [rowMenu, setRowMenu] = useState<Row | null>(null);
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const weatherWanted = useMemo(
    () => (mapConfig?.weather ? forecastablePlaces(weatherPlaces(days), today) : []),
    [mapConfig?.weather, days, today],
  );
  const weatherKey = JSON.stringify(weatherWanted);
  useEffect(() => {
    if (!weatherWanted.length) {
      setForecast([]);
      return;
    }
    let cancelled = false;
    // Weather is an extra: a failed or disabled lookup just hides the strip.
    getTripWeather({ data: { places: weatherWanted } })
      .then((result) => {
        if (!cancelled) setForecast(result.status === "ok" ? result.days : []);
      })
      .catch(() => {
        if (!cancelled) setForecast([]);
      });
    return () => {
      cancelled = true;
    };
    // weatherKey stands for weatherWanted's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weatherKey]);

  const weatherDetail = forecast.find((day) => day.date === scope) ?? null;

  const model = useMemo(() => buildMapModel(days, scope || "all"), [days, scope]);
  const pinInfo = useMemo(() => new Map(model.pins.map((pin) => [pin.id, pin])), [model]);
  // The map shows once a point exists or the trip has a destination country to frame.
  const countryBounds = citiesBounds(cities) ?? countryBoundsFor(props.destinationCode);
  const mapOn =
    Boolean(mapConfig?.enabled && mapConfig.summaryMap) &&
    (model.pins.length > 0 || countryBounds !== null) &&
    !mapBroken;
  const dayItems =
    scope === "all" ? props.itinerary : (days.find((d) => d.date === scope)?.items ?? []);
  const shown = dayItems.slice(0, AGENDA_PREVIEW) as Row[];
  const done = props.checklist.filter((row) => Boolean(row["is_completed"])).length;
  const activeBookings = props.bookings.filter(
    (row) => !/^(cancelled|canceled|dibatalkan)$/i.test(String(row["status"] ?? "")),
  ).length;
  const attention = buildAttention(props.checklist, props.bookings, 6);
  const { current, next } = useMemo(() => {
    const now = new Date();
    return pickNowNext(props.itinerary, today, now.getHours() * 60 + now.getMinutes());
  }, [props.itinerary, today]);
  const focusRow = (current ?? next) as Row | null;

  function locateMe() {
    if (!navigator.geolocation) {
      toast.error("Perangkat ini tidak mendukung GPS.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setMe({ lat: position.coords.latitude, lng: position.coords.longitude });
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

  const goAdd = (section: "itinerary" | "bookings" | "checklist" | "expenses") =>
    void navigate({
      to: "/my-trips/$tripId/$section",
      params: { tripId, section },
      search: { add: true },
    });

  async function removeActivity() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await runTripMutation({
        action: () => deleteItinerary({ data: { id: toDelete.id } }),
        refresh: props.onChanged,
        successMessage: "Aktivitas dihapus",
        failureMessage: "Aktivitas belum terhapus. Coba lagi.",
      });
      setToDelete(null);
      setActiveId(null);
    } finally {
      setBusy(false);
    }
  }

  async function completeChecklist(id: string) {
    await runTripMutation({
      action: () => patchChecklist({ data: { id, completed: true } }),
      refresh: props.onChanged,
      successMessage: "Checklist selesai",
      failureMessage: "Checklist belum tersimpan. Coba lagi.",
    });
  }

  const stat = (
    section: "itinerary" | "bookings" | "checklist" | "budget",
    label: string,
    value: string,
  ) => (
    <Link
      to="/my-trips/$tripId/$section"
      params={{ tripId, section }}
      className={`tap min-w-0 rounded-xl bg-surface px-2.5 py-2 ring-1 ring-border/40`}
    >
      <span className="block truncate text-[11px] text-muted-foreground">{label}</span>
      <span className="block truncate text-[14px] font-bold tabular-nums">{value}</span>
    </Link>
  );

  const nudgeInput = useMemo(
    () => ({
      today,
      departureDate: props.departureDate ?? null,
      returnDate: props.returnDate ?? null,
      itineraryDates: days.map((day) => day.date),
      checklistOpen: props.checklist.length - done,
      budgetSet: props.budgetSet,
      budgetAllocated: props.budgetAllocated ?? true,
      bookingsActive: activeBookings,
    }),
    [
      today,
      props.departureDate,
      props.returnDate,
      days,
      props.checklist.length,
      done,
      props.budgetSet,
      props.budgetAllocated,
      activeBookings,
    ],
  );

  const agendaPart = (
    <>
      <div className="mt-3 flex items-end justify-between">
        <h2 className={`${iosHeading} px-1`}>
          Agenda{scope && scope !== "all" ? ` · ${shortDate(scope)}` : ""}
        </h2>
        <Link
          to="/my-trips/$tripId/$section"
          params={{ tripId, section: "itinerary" }}
          className="tap px-1 pb-1.5 text-xs font-semibold text-brand-red"
        >
          Kelola
        </Link>
      </div>
      <div className={iosGroup}>
        {shown.length ? (
          shown.map((item) => {
            const pin = pinInfo.get(item.id);
            const point = itemPoint(item);
            const time = String(item["start_time"] ?? "").slice(0, 5);
            const where = String(item["location"] ?? "");
            return (
              <div
                key={item.id}
                className={`flex min-h-12 items-center gap-2 border-b border-border/60 pr-1 pl-3 last:border-b-0 ${activeId === item.id ? "bg-brand-red/5" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => (point ? setActiveId(item.id) : setRowMenu(item))}
                  className="tap flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left"
                >
                  <span
                    className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: pin && !pin.muted ? pin.color : "#9aa0a6" }}
                  >
                    {pin ? pin.n : <CalendarDays className="size-3.5" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">
                      {String(item["title"] ?? "Aktivitas")}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[
                        scope === "all"
                          ? shortDate(String(item["activity_date"] ?? "").slice(0, 10))
                          : "",
                        time,
                        where,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Tanpa jam"}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Menu ${String(item["title"] ?? "aktivitas")}`}
                  onClick={() => setRowMenu(item)}
                  className="tap grid size-11 shrink-0 place-items-center text-muted-foreground"
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </button>
              </div>
            );
          })
        ) : (
          <button
            type="button"
            onClick={() => goAdd("itinerary")}
            className="tap flex min-h-12 w-full items-center gap-2.5 px-3 text-left text-[14px] text-brand-red"
          >
            <Plus className="size-4" aria-hidden="true" />
            {props.itinerary.length
              ? "Belum ada agenda di hari ini. Tambah"
              : "Tambah aktivitas pertama"}
          </button>
        )}
        {dayItems.length > AGENDA_PREVIEW && (
          <Link
            to="/my-trips/$tripId/$section"
            params={{ tripId, section: "itinerary" }}
            className="tap flex min-h-10 items-center justify-between border-t border-border/60 px-3 text-[13px] text-brand-red"
          >
            Lihat semua ({dayItems.length})
            <ChevronRight className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </Link>
        )}
      </div>
    </>
  );

  const cityPart = (
    <>
      {cityFlow && (
        <div className={`${iosGroup} mt-4`}>
          <button
            type="button"
            onClick={() => setCitiesOpen(true)}
            className="tap flex min-h-12 w-full items-center gap-2.5 px-3 text-left"
          >
            <MapPin className="size-4 shrink-0 text-brand-red" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">
                {cities.length ? cities.map((c) => c.name).join(", ") : "Pilih kota tujuan"}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {cities.length
                  ? "Peta dan pencarian tempat mengikuti kota ini"
                  : "Agar peta dan pencarian tempat langsung tepat"}
              </span>
            </span>
            <span className="text-xs font-semibold text-brand-red">
              {cities.length ? "Atur kota" : "Pilih"}
            </span>
          </button>
        </div>
      )}
    </>
  );

  const attentionPart = (
    <>
      {attention.length > 0 && (
        <>
          <h2 className={`${iosHeading} mt-4 px-1`}>Perlu perhatian</h2>
          <div className={iosGroup}>
            {attention.map((entry) =>
              entry.kind === "checklist" ? (
                <div
                  key={`c-${entry.id}`}
                  className="flex min-h-12 items-center gap-2 border-b border-border/60 pl-1 pr-3 last:border-b-0"
                >
                  <button
                    type="button"
                    aria-label={`Tandai selesai: ${displayChecklistTitle(entry.title)}`}
                    onClick={() => void completeChecklist(entry.id)}
                    className="tap grid size-11 shrink-0 place-items-center text-brand-red"
                  >
                    <CheckCircle2 className="size-5" strokeWidth={1.8} aria-hidden="true" />
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">
                      {displayChecklistTitle(entry.title)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      Checklist belum selesai
                    </span>
                  </span>
                  <Link
                    to="/my-trips/$tripId/$section"
                    params={{ tripId, section: "checklist" }}
                    className="tap text-xs font-semibold text-brand-red"
                  >
                    Buka
                  </Link>
                </div>
              ) : (
                <Link
                  key={`b-${entry.id}`}
                  to="/my-trips/$tripId/$section"
                  params={{ tripId, section: "bookings" }}
                  className="tap flex min-h-12 items-center gap-2.5 border-b border-border/60 px-3 last:border-b-0"
                >
                  <Ticket className="size-4 shrink-0 text-brand-red" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{entry.title}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Menunggu konfirmasi
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-brand-red">Detail</span>
                </Link>
              ),
            )}
          </div>
        </>
      )}
    </>
  );

  const budgetPart = (
    <>
      <div className={`${iosGroup} mt-4 flex items-center gap-2.5 p-3`}>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-red-soft text-brand-red">
          <WalletCards className="size-4" aria-hidden="true" />
        </span>
        <Link
          to="/my-trips/$tripId/$section"
          params={{ tripId, section: "budget" }}
          className="tap min-w-0 flex-1"
        >
          <span className="block text-[11px] text-muted-foreground">Sisa anggaran</span>
          <span className="block truncate text-[15px] font-bold">
            {props.budgetSet ? props.remainingLabel : "Belum diatur"}
          </span>
        </Link>
        <button
          type="button"
          onClick={() => goAdd("expenses")}
          className="tap inline-flex min-h-9 shrink-0 items-center gap-1 rounded-xl bg-secondary px-3 text-xs font-semibold"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Catat biaya
        </button>
      </div>
    </>
  );

  const flightsPart = (
    <>
      {props.flightsSearch && (
        <Link
          to={props.flightsSearch.to}
          search={props.flightsSearch.search}
          data-track="ringkas_flights"
          className={`${iosGroup} tap mt-2 flex min-h-12 items-center gap-2.5 p-3`}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-red-soft text-brand-red">
            <Plane className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">Cari tiket pesawat</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              Bandingkan harga ke {props.destination}
            </span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground/60" aria-hidden="true" />
        </Link>
      )}
    </>
  );

  const focusPart = (
    <>
      {focusRow && (
        <div
          className={`mt-3 flex items-center gap-2.5 rounded-2xl p-3 ${current ? "bg-brand-red text-white" : "bg-surface ring-1 ring-border/40"}`}
        >
          <div className="min-w-0 flex-1">
            <p
              className={`text-[11px] font-semibold uppercase tracking-wide ${current ? "text-white/80" : "text-brand-red"}`}
            >
              {current ? "Sedang berlangsung" : "Berikutnya"}
            </p>
            <p className="truncate text-[15px] font-bold">
              {String(focusRow["title"] ?? "Aktivitas")}
            </p>
            <p
              className={`truncate text-[11px] ${current ? "text-white/80" : "text-muted-foreground"}`}
            >
              {[
                String(focusRow["activity_date"] ?? "").slice(0, 10) === today
                  ? ""
                  : shortDate(String(focusRow["activity_date"] ?? "").slice(0, 10)),
                String(focusRow["start_time"] ?? "").slice(0, 5) || "Fleksibel",
                String(focusRow["location"] ?? ""),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {itemPoint(focusRow) && (
            <a
              href={googleMapsPointUrl(itemPoint(focusRow)!)}
              target="_blank"
              rel="noopener noreferrer"
              className={`tap inline-flex min-h-9 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-semibold ${current ? "bg-white text-brand-red" : "bg-brand-red text-white"}`}
            >
              <Navigation className="size-3.5" aria-hidden="true" />
              Rute
            </a>
          )}
        </div>
      )}
    </>
  );

  const staticCards = (
    <>
      {focusRow && focusPart}
      {agendaPart}
      {cityPart}
      {attentionPart}
      {budgetPart}
      {flightsPart}
    </>
  );

  // The chat tells the same things one message at a time, in this order.
  const intro: IntroPart[] = [
    ...(focusRow
      ? [
          {
            id: "next",
            lead: current ? "Ini yang sedang berlangsung:" : "Berikutnya di perjalananmu:",
            node: focusPart,
          },
        ]
      : []),
    {
      id: "agenda",
      lead: dayItems.length
        ? `Ini agenda ${scope && scope !== "all" ? shortDate(scope) : "perjalananmu"}:`
        : "Agendanya masih kosong. Kamu bisa tambah sendiri, atau minta saya menyusunnya.",
      node: agendaPart,
    },
    ...(cityFlow
      ? [
          {
            id: "city",
            lead: cities.length
              ? "Kota yang kamu pilih untuk trip ini:"
              : "Kotanya belum dipilih. Peta dan pencarian tempat mengikuti kota ini:",
            node: cityPart,
          },
        ]
      : []),
    ...(attention.length
      ? [{ id: "attention", lead: "Ini yang masih perlu perhatianmu:", node: attentionPart }]
      : []),
    {
      id: "budget",
      lead: props.budgetSet
        ? "Posisi anggaranmu sekarang:"
        : "Anggaran belum diatur. Kita bisa bagi bersama.",
      node: budgetPart,
    },
    ...(props.flightsSearch
      ? [{ id: "flights", lead: "Kalau tiket belum ada:", node: flightsPart }]
      : []),
  ];

  return (
    <div className={`mx-auto min-h-dvh w-full max-w-md ${assistantOn ? "" : "pb-28"}`}>
      {mapOn && expanded && <div className="h-[300px]" aria-hidden="true" />}
      <section
        aria-label="Peta perjalanan"
        className={`overflow-hidden ${
          mapOn
            ? expanded
              ? "fixed inset-0 z-50 h-dvh bg-secondary"
              : "relative h-[300px] bg-secondary"
            : "relative bg-brand-red pb-5 text-white"
        }`}
      >
        {mapOn && (
          <ItineraryMap
            pins={model.pins}
            routes={model.routes}
            focus={focus}
            userPoint={me}
            activeId={activeId}
            onSelect={setActiveId}
            styleUrl={mapConfig!.styleUrl}
            framePadding={{ top: 120, bottom: 48 }}
            focusBounds={countryBounds}
            tilt={tilt}
            onUnavailable={() => setMapBroken(true)}
          />
        )}
        {mapOn && model.pins.length === 0 && (
          <p className="pointer-events-none absolute inset-x-4 bottom-8 z-10 rounded-xl bg-surface/95 px-3 py-2 text-center text-[12px] text-muted-foreground shadow">
            Beri titik lokasi pada agenda untuk melihat rute di peta.
          </p>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 safe-top px-4">
          <div className="pointer-events-auto flex items-center gap-2">
            <Link to="/my-trips" aria-label="Kembali ke Perjalanan" className={glass}>
              <ChevronLeft className="size-5" aria-hidden="true" />
            </Link>
            <div className="flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface px-3 text-foreground shadow-md">
              <span className="truncate text-[13px] font-bold">
                {friendlyTripLine(props.dayLabel, props.destination)}
              </span>
              <span className="max-w-[30%] shrink-0 truncate text-[11px] text-muted-foreground">
                · {props.name}
              </span>
            </div>
            <button
              type="button"
              aria-label="Menu perjalanan"
              onClick={props.onMenu}
              className={glass}
            >
              <MoreHorizontal className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
        {mapOn && (
          <div className="absolute right-4 top-[calc(max(env(safe-area-inset-top),0.75rem)+3.25rem)] flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-label={expanded ? "Tutup peta layar penuh" : "Buka peta layar penuh"}
              className={glass}
            >
              {expanded ? (
                <Shrink className="size-4" aria-hidden="true" />
              ) : (
                <Expand className="size-4" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setFocus((value) => !value)}
              aria-pressed={focus}
              aria-label={focus ? "Matikan mode fokus" : "Mode fokus: hanya titik agenda"}
              className={toggleGlass(focus, "bg-brand-red text-white")}
            >
              <Focus className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setTilt((value) => !value)}
              aria-pressed={tilt}
              aria-label={tilt ? "Kembali ke peta 2D" : "Tampilan 3D"}
              className={`${toggleGlass(tilt, "bg-brand-red text-white")} text-[11px] font-bold`}
            >
              3D
            </button>
            {mapConfig?.locateMe && (
              <button
                type="button"
                onClick={locateMe}
                disabled={locating}
                aria-label="Lokasi saya"
                className={toggleGlass(Boolean(me), "bg-blue-600 text-white")}
              >
                <LocateFixed className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        {!mapOn && (
          <div className="px-4 pt-16">
            <p className="text-xs text-white/85">{props.destination}</p>
            <p className="text-[22px] font-bold leading-tight">{props.dayLabel}</p>
            <p className="text-xs text-white/85">{props.datesLabel}</p>
            {mapConfig?.enabled && mapConfig.summaryMap && !mapBroken && (
              <p className="mt-2 text-xs text-white/85">
                Beri titik lokasi pada agenda untuk melihat rute di peta.
              </p>
            )}
          </div>
        )}
      </section>

      <div
        className={`relative bg-background px-4 pt-2 ${assistantOn ? "min-h-[calc(100dvh-300px)] pb-52" : "pb-4"} ${mapOn ? "-mt-5 rounded-t-[20px] shadow-[0_-4px_16px_rgb(0_0_0/0.12)]" : "mt-3"}`}
      >
        {mapOn && (
          <div
            className="mx-auto mb-2 h-1 w-9 rounded-full bg-muted-foreground/30"
            aria-hidden="true"
          />
        )}
        <div className="grid grid-cols-4 gap-2">
          {stat(
            "itinerary",
            "Agenda",
            `${dayItems.length} ${scope === today ? "hari ini" : "aktivitas"}`,
          )}
          {stat("bookings", "Booking", `${activeBookings} aktif`)}
          {stat("checklist", "Checklist", `${done}/${props.checklist.length}`)}
          {stat(
            "budget",
            "Sisa",
            props.budgetSet ? compactMoney(props.remainingMinor, props.remainingLabel) : "Atur",
          )}
        </div>

        {days.length > 0 && (
          <section aria-label="Hari dan cuaca" className="mt-3">
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
              {days.map((day) => {
                const wx = forecast.find((item) => item.date === day.date);
                const info = wx ? describeWeather(wx.code) : null;
                const Icon = info ? WEATHER_ICON[info.kind] : null;
                const offset = dayOffset(day.date, today);
                const label =
                  offset === 0 ? "Hari ini" : offset === 1 ? "Besok" : shortDate(day.date);
                const selected = scope === day.date;
                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setPicked(day.date)}
                    aria-pressed={selected}
                    aria-label={
                      wx && info
                        ? `${label}: ${info.label}, ${wx.tempMax} derajat tertinggi, ${wx.tempMin} terendah${wx.rainPercent !== null ? `, peluang hujan ${wx.rainPercent} persen` : ""}`
                        : label
                    }
                    className={`tap inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 ${
                      selected
                        ? "bg-brand-red text-white ring-brand-red"
                        : "bg-surface text-foreground ring-border/40"
                    }`}
                  >
                    {label}
                    {wx && Icon && (
                      <span className="inline-flex items-center gap-0.5 tabular-nums">
                        <Icon
                          className={`size-3.5 ${selected ? "text-white" : "text-brand-red"}`}
                          aria-hidden="true"
                        />
                        {wx.tempMax}°
                      </span>
                    )}
                  </button>
                );
              })}
              {days.length > 1 && (
                <button
                  type="button"
                  onClick={() => setPicked("all")}
                  aria-pressed={scope === "all"}
                  className={`tap inline-flex min-h-9 shrink-0 items-center rounded-full px-3 text-xs font-semibold ring-1 ${
                    scope === "all"
                      ? "bg-brand-red text-white ring-brand-red"
                      : "bg-surface text-foreground ring-border/40"
                  }`}
                >
                  Semua
                </button>
              )}
            </div>
            {weatherDetail && scope !== "all" && (
              <p className="mt-1.5 px-1 text-[11px] text-muted-foreground" aria-live="polite">
                <span className="font-semibold text-foreground">
                  {describeWeather(weatherDetail.code).label}
                </span>
                {` · ${weatherDetail.tempMax}°/${weatherDetail.tempMin}°`}
                {weatherDetail.rainPercent !== null && ` · hujan ${weatherDetail.rainPercent}%`}
              </p>
            )}
          </section>
        )}

        <TripAssistant
          tripId={tripId}
          destination={props.destination}
          currency={props.currency ?? "IDR"}
          categories={props.categories ?? []}
          budget={
            props.budgetMinor && props.budgetMinor > 0
              ? { budgetMinor: props.budgetMinor, spentMinor: props.spentMinor ?? 0 }
              : null
          }
          nudgeInput={nudgeInput}
          onChanged={props.onChanged}
          onAdd={() => setAddOpen(true)}
          intro={intro}
          onFocusDays={(dates) => setPicked(dates.length === 1 ? dates[0]! : "all")}
          onAvailability={setAssistantState}
        >
          {staticCards}
        </TripAssistant>
      </div>

      {assistantState === false && (
        <FixedLayer>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            aria-label="Tambah"
            className="tap fixed bottom-24 right-[max(1rem,calc((100vw-28rem)/2+1rem))] z-40 grid size-11 place-items-center rounded-full bg-brand-red text-white shadow-lg"
          >
            <Plus className="size-5" aria-hidden="true" />
          </button>
        </FixedLayer>
      )}

      <TripCitiesSheet
        open={citiesOpen}
        onOpenChange={setCitiesOpen}
        tripId={tripId}
        destinationName={props.destination}
        destinationCode={props.destinationCode}
        initial={cities}
        searchEnabled={Boolean(mapConfig?.enabled && mapConfig.placeSearch)}
        onSaved={props.onChanged}
        onSkip={() => {
          try {
            window.localStorage.setItem(`djiwa-cities-skip-${tripId}`, "1");
          } catch {
            /* remembered only when storage is available */
          }
        }}
      />
      <TripActionSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Tambah ke perjalanan"
        actions={[
          { label: "Aktivitas agenda", icon: CalendarDays, onSelect: () => goAdd("itinerary") },
          { label: "Pemesanan", icon: Ticket, onSelect: () => goAdd("bookings") },
          { label: "Item checklist", icon: CheckCircle2, onSelect: () => goAdd("checklist") },
          { label: "Catat biaya", icon: WalletCards, onSelect: () => goAdd("expenses") },
        ]}
      />
      <TripActionSheet
        open={Boolean(rowMenu)}
        onOpenChange={(open) => !open && setRowMenu(null)}
        title={String(rowMenu?.["title"] ?? "Aktivitas")}
        actions={
          rowMenu
            ? [
                {
                  label: "Edit",
                  icon: Pencil,
                  onSelect: () =>
                    void navigate({
                      to: "/my-trips/$tripId/$section",
                      params: { tripId, section: "itinerary" },
                      search: { edit: rowMenu.id },
                    }),
                },
                ...(itemPoint(rowMenu)
                  ? [
                      {
                        label: "Buka di Google Maps",
                        icon: Navigation,
                        onSelect: () =>
                          window.open(
                            googleMapsPointUrl(itemPoint(rowMenu)!),
                            "_blank",
                            "noopener",
                          ),
                      },
                    ]
                  : []),
                {
                  label: "Hapus",
                  icon: Trash2,
                  destructive: true,
                  onSelect: () => setToDelete(rowMenu),
                },
              ]
            : []
        }
      />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Hapus aktivitas?"
        description={`“${String(toDelete?.["title"] ?? "Aktivitas")}” dihapus dari agenda.`}
        confirmLabel="Hapus"
        destructive
        busy={busy}
        onConfirm={removeActivity}
      />
    </div>
  );
}
