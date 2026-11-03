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
  MoreHorizontal,
  Navigation,
  Pencil,
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
import { runTripMutation } from "@/lib/trip-actions";
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
} from "@/lib/trip-overview";

type Row = { id: string } & Record<string, unknown>;

type Props = {
  tripId: string;
  name: string;
  destination: string;
  /** "Hari ke-2", "Berangkat dalam 3 hari", ... from the trip dates. */
  dayLabel: string;
  datesLabel: string;
  itinerary: Row[];
  checklist: Row[];
  bookings: Row[];
  budgetSet: boolean;
  remainingLabel: string;
  remainingMinor: number;
  mapConfig: ItineraryMapConfig | null;
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
  const [forecast, setForecast] = useState<DayWeather[]>([]);
  const [addOpen, setAddOpen] = useState(false);
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

  const weatherDetail = forecast.find((day) => day.date === scope) ?? forecast[0] ?? null;

  const model = useMemo(() => buildMapModel(days, scope || "all"), [days, scope]);
  const pinInfo = useMemo(() => new Map(model.pins.map((pin) => [pin.id, pin])), [model]);
  const mapOn =
    Boolean(mapConfig?.enabled && mapConfig.summaryMap) && model.pins.length > 0 && !mapBroken;
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

  const chip = (selected: boolean) =>
    `tap inline-flex min-h-8 shrink-0 items-center rounded-full px-3 text-xs font-semibold shadow ${
      selected ? "bg-brand-red text-white" : "bg-surface text-foreground"
    }`;

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

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md pb-28">
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
            onUnavailable={() => setMapBroken(true)}
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 safe-top px-4">
          <div className="pointer-events-auto flex items-center gap-2">
            <Link to="/my-trips" aria-label="Kembali ke Perjalanan" className={glass}>
              <ChevronLeft className="size-5" aria-hidden="true" />
            </Link>
            <div className="flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface px-3 text-foreground shadow-md">
              <span className="truncate text-[13px] font-bold">{props.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">· {props.dayLabel}</span>
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
          {mapOn && (
            <div className="pointer-events-auto -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {days.map((day) => (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setPicked(day.date)}
                  aria-pressed={scope === day.date}
                  className={chip(scope === day.date)}
                >
                  {shortDate(day.date)}
                  {day.date === today ? " · Hari ini" : ""}
                </button>
              ))}
              {days.length > 1 && (
                <button
                  type="button"
                  onClick={() => setPicked("all")}
                  aria-pressed={scope === "all"}
                  className={chip(scope === "all")}
                >
                  Semua
                </button>
              )}
            </div>
          )}
        </div>
        {mapOn && (
          <div className="absolute right-4 top-[calc(max(env(safe-area-inset-top),0.75rem)+5.75rem)] flex flex-col gap-2">
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
        className={`relative bg-background px-4 pb-4 pt-2 ${mapOn ? "-mt-5 rounded-t-[20px] shadow-[0_-4px_16px_rgb(0_0_0/0.12)]" : "mt-3"}`}
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

        {forecast.length > 0 && (
          <section aria-label="Prakiraan cuaca" className="mt-3">
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
              {forecast.map((day) => {
                const info = describeWeather(day.code);
                const Icon = WEATHER_ICON[info.kind];
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
                    aria-label={`${label}: ${info.label}, ${day.tempMax} derajat tertinggi, ${day.tempMin} terendah${day.rainPercent !== null ? `, peluang hujan ${day.rainPercent} persen` : ""}`}
                    className={`tap flex min-h-11 shrink-0 flex-col items-center justify-center rounded-xl px-2.5 ring-1 ${
                      selected ? "bg-brand-red/5 ring-brand-red" : "bg-surface ring-border/40"
                    }`}
                  >
                    <span className="text-[10px] font-semibold leading-tight text-muted-foreground">
                      {label}
                    </span>
                    <span className="flex items-center gap-1 text-[13px] font-bold leading-tight tabular-nums">
                      <Icon className="size-4 text-brand-red" aria-hidden="true" />
                      {day.tempMax}°
                    </span>
                  </button>
                );
              })}
            </div>
            {weatherDetail && (
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
                      <span className="block truncate text-[14px] font-semibold">
                        {entry.title}
                      </span>
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
      </div>

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
