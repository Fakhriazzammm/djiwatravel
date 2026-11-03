import { Link } from "@tanstack/react-router";
import {
  CalendarRange,
  Check,
  ChevronRight,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Landmark,
  Snowflake,
  Sun,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TripMiniRoute } from "@/components/trip-mini-route";
import { formatTripMoney } from "@/lib/trip-money";
import { getItineraryMapConfig } from "@/lib/itinerary-map.fn";
import { DEFAULT_ITINERARY_MAP_CONFIG, type ItineraryMapConfig } from "@/lib/itinerary-map";
import { buildHomeTripWidget, buildMyTripsHome, type HomeTripWidget } from "@/lib/my-trips-home";
import { compactMoney } from "@/lib/trip-overview";
import { getTripWeather } from "@/lib/trip-weather.fn";
import {
  describeWeather,
  forecastablePlaces,
  type DayWeather,
  type WeatherKind,
} from "@/lib/trip-weather";
import { getMyTripsHome } from "@/lib/my-trips.fn";

type Section = "itinerary" | "budget" | "checklist" | "bookings";

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

type State = { status: "loading" } | { status: "ready"; home: ReturnType<typeof buildMyTripsHome> };

const CARD = "ios-card mt-2 p-4";

/**
 * Home entry point for /my-trips. Signed-out users, users without a trip and load failures all
 * land on the same "start planning" call to action; an unavailable trip list never blocks Home.
 */
export function HomeMyTripsWidget({ signedIn }: { signedIn: boolean }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!signedIn) {
      setState({ status: "ready", home: buildMyTripsHome([], [], []) });
      return;
    }
    let cancelled = false;
    void getMyTripsHome()
      .then((home) => !cancelled && setState({ status: "ready", home }))
      .catch(() => !cancelled && setState({ status: "ready", home: buildMyTripsHome([], [], []) }));
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const view = useMemo(
    () => (state.status === "ready" ? buildHomeTripWidget(state.home, new Date()) : null),
    [state],
  );

  if (!view) {
    return (
      <div
        role="status"
        aria-label="Memuat perjalanan"
        className={`${CARD} h-28 animate-pulse motion-reduce:animate-none`}
      />
    );
  }

  if (view.kind === "empty") {
    return (
      <div data-testid="home-trips-widget" data-state="empty">
        <div className="ios-card mt-2 flex items-center gap-3.5 bg-gradient-to-br from-white from-40% to-brand-red-soft py-3.5 pl-4 pr-3.5">
          <span className="relative h-[76px] w-[76px] shrink-0" aria-hidden="true">
            <span className="absolute left-0 top-2.5 grid h-[60px] w-[52px] animate-card-shuffle place-items-center rounded-[14px] bg-gradient-to-b from-[#7fb8ff] to-[#0a84ff] text-white shadow-[0_6px_12px_-6px_rgb(0_0_0/0.35)]">
              <CalendarRange className="size-[22px]" strokeWidth={2} />
            </span>
            <span
              className="absolute left-0 top-2.5 grid h-[60px] w-[52px] animate-card-shuffle place-items-center rounded-[14px] bg-gradient-to-b from-[#ffd27a] to-[#ff9f0a] text-white shadow-[0_6px_12px_-6px_rgb(0_0_0/0.35)]"
              style={{ animationDelay: "-3s" }}
            >
              <Check className="size-[22px]" strokeWidth={2.6} />
            </span>
            <span
              className="absolute left-0 top-2.5 grid h-[60px] w-[52px] animate-card-shuffle place-items-center rounded-[14px] bg-gradient-to-b from-[#ff8a8a] to-brand-red text-white shadow-[0_6px_12px_-6px_rgb(0_0_0/0.35)]"
              style={{ animationDelay: "-6s" }}
            >
              <Landmark className="size-[22px]" strokeWidth={2} />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold leading-tight tracking-[-0.02em]">
              Susun trip pertamamu
            </h3>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
              Itinerary, budget &amp; checklist dalam satu tempat
            </p>
          </div>
          <Link
            to={signedIn ? "/my-trips/new" : "/my-trips"}
            aria-label={signedIn ? "Mulai buat perjalanan" : "Masuk dan mulai merencanakan"}
            className="tap flex h-10 shrink-0 items-center rounded-full bg-brand-red px-4 text-[15px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Mulai
          </Link>
        </div>
        <p className="mt-2 flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
          <span>Pilih destinasi</span>
          <span className="size-[3px] rounded-full bg-[#C4C4C7]" aria-hidden="true" />
          <span>Atur tanggal</span>
          <span className="size-[3px] rounded-full bg-[#C4C4C7]" aria-hidden="true" />
          <span>Siap berangkat</span>
        </p>
      </div>
    );
  }

  return <TripCard view={view} />;
}

/** The focus trip card: route preview and weather on top, then what is next and the key numbers. */
function TripCard({ view }: { view: Extract<HomeTripWidget, { kind: "trip" }> }) {
  const [config, setConfig] = useState<ItineraryMapConfig>(DEFAULT_ITINERARY_MAP_CONFIG);
  const [weather, setWeather] = useState<DayWeather | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The map and weather are extras: a failed lookup keeps the card without them.
    getItineraryMapConfig()
      .then((value) => !cancelled && setConfig(value))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const showRoute = Boolean(config.enabled && config.summaryMap && view.route);
  const weatherPlace = useMemo(() => {
    const first = view.route?.pins[0];
    if (!config.weather || !view.route || !first) return null;
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return (
      forecastablePlaces([{ date: view.route.date, lat: first.lat, lng: first.lng }], key)[0] ??
      null
    );
  }, [config.weather, view.route]);
  const weatherKey = weatherPlace
    ? `${weatherPlace.date}|${weatherPlace.lat}|${weatherPlace.lng}`
    : "";

  useEffect(() => {
    if (!weatherPlace) {
      setWeather(null);
      return;
    }
    let cancelled = false;
    getTripWeather({ data: { places: [weatherPlace] } })
      .then(
        (result) =>
          !cancelled && setWeather(result.status === "ok" ? (result.days[0] ?? null) : null),
      )
      .catch(() => !cancelled && setWeather(null));
    return () => {
      cancelled = true;
    };
    // weatherKey stands for weatherPlace's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weatherKey]);

  const WeatherIcon = weather ? WEATHER_ICON[describeWeather(weather.code).kind] : null;
  const badge =
    view.status === "ongoing"
      ? `Sedang berlangsung${view.dayLabel ? ` · ${view.dayLabel}` : ""}`
      : view.countdown;
  const weatherChip =
    weather && WeatherIcon ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold shadow">
        <WeatherIcon className="size-3.5 text-brand-red" aria-hidden="true" />
        {weather.tempMax}°
        {weather.rainPercent !== null && weather.rainPercent >= 30
          ? ` · hujan ${weather.rainPercent}%`
          : ` · ${describeWeather(weather.code).label}`}
      </span>
    ) : null;
  const badgeEl = (
    <span className="inline-flex rounded-full bg-brand-red px-2.5 py-1 text-[11px] font-semibold text-white">
      {badge}
    </span>
  );
  const agendaLink = view.agenda ? (
    <Link
      to="/my-trips/$tripId/$section"
      params={{ tripId: view.tripId, section: "itinerary" }}
      className="tap mt-2.5 flex min-h-12 items-center gap-2.5 rounded-2xl bg-secondary px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-brand-red text-white">
        <CalendarRange className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{view.agenda.title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {[view.agenda.time, view.agenda.location, view.agenda.when].filter(Boolean).join(" · ")}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
    </Link>
  ) : (
    <Link
      to="/my-trips/$tripId/$section"
      params={{
        tripId: view.tripId,
        section: view.checklistTotal > view.checklistDone ? "checklist" : "itinerary",
      }}
      className="tap mt-2.5 flex min-h-12 items-center gap-2.5 rounded-2xl bg-secondary px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{view.nextStep.label}</span>
        <span className="block text-[11px] text-muted-foreground">{view.nextStep.hint}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
    </Link>
  );
  const stats: { section: Section; label: string; value: string }[] = [
    {
      section: "itinerary",
      label: "Agenda",
      value:
        view.status === "ongoing"
          ? `${view.todayAgendaCount} hari ini`
          : `${view.agendaCount} agenda`,
    },
    {
      section: "checklist",
      label: "Checklist",
      value: view.checklistTotal ? `${view.checklistDone}/${view.checklistTotal}` : "Belum ada",
    },
    { section: "bookings", label: "Booking", value: String(view.bookingCount) },
    {
      section: "budget",
      label: "Sisa",
      value: view.budget.set
        ? compactMoney(
            view.budget.remainingMinor,
            formatTripMoney(view.budget.remainingMinor, view.budget.currency),
          )
        : "Atur",
    },
  ];
  return (
    <div className={`${CARD} overflow-hidden`} data-testid="home-trips-widget" data-state="trip">
      {showRoute && view.route && (
        <div className="relative h-[118px]">
          <TripMiniRoute pins={view.route.pins} />
          <div className="absolute left-2.5 top-2.5">{badgeEl}</div>
          {weatherChip && <div className="absolute right-2.5 top-2.5">{weatherChip}</div>}
        </div>
      )}
      <div className="px-3.5 pb-3.5 pt-3">
        {!showRoute && (
          <div className="mb-2 flex items-center justify-between gap-2">
            {badgeEl}
            {weatherChip}
          </div>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-[18px] font-bold tracking-[-0.02em]">{view.title}</h3>
          <p className="shrink-0 text-[11px] text-muted-foreground">
            {view.destination} · {view.dateRange} · {view.travelers} traveler
          </p>
        </div>
        {agendaLink}
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {stats.map((stat) => (
            <Link
              key={stat.section}
              to="/my-trips/$tripId/$section"
              params={{ tripId: view.tripId, section: stat.section }}
              className="tap min-w-0 rounded-xl bg-secondary px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block truncate text-[11px] text-muted-foreground">{stat.label}</span>
              <span className="block truncate text-[14px] font-bold tabular-nums">
                {stat.value}
              </span>
            </Link>
          ))}
        </div>
        <Link
          to="/my-trips/$tripId"
          params={{ tripId: view.tripId }}
          className="tap mt-2.5 flex min-h-10 items-center justify-center rounded-xl bg-brand-red text-[14px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Buka Ringkas
        </Link>
      </div>
    </div>
  );
}
