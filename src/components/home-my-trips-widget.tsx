import { Link } from "@tanstack/react-router";
import {
  CalendarRange,
  Check,
  ListChecks,
  Ticket,
  Wallet,
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
import ItineraryMap from "@/components/itinerary-map";
import { TripMiniRoute } from "@/components/trip-mini-route";
import { formatTripMoney } from "@/lib/trip-money";
import { getItineraryMapConfig } from "@/lib/itinerary-map.fn";
import {
  BRAND_RED,
  DEFAULT_ITINERARY_MAP_CONFIG,
  type ItineraryMapConfig,
  type MapPin,
  type MapRoute,
} from "@/lib/itinerary-map";
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

/** The focus trip card: route and weather on top, then a hero with what is next, today's timeline and the key numbers. */
function TripCard({ view }: { view: Extract<HomeTripWidget, { kind: "trip" }> }) {
  const [config, setConfig] = useState<ItineraryMapConfig>(DEFAULT_ITINERARY_MAP_CONFIG);
  const [weather, setWeather] = useState<DayWeather | null>(null);
  const [mapBroken, setMapBroken] = useState(false);

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
  // The same map as Ringkas and Agenda (MapLibre + OpenStreetMap), framed on the day's pins.
  const mapModel = useMemo(() => {
    if (!view.route) return { pins: [] as MapPin[], routes: [] as MapRoute[] };
    const pins: MapPin[] = view.route.pins.map((pin) => ({
      ...pin,
      date: view.route!.date,
      color: BRAND_RED,
      muted: false,
    }));
    const routes: MapRoute[] =
      pins.length > 1
        ? [
            {
              date: view.route.date,
              color: BRAND_RED,
              muted: false,
              points: pins.map((pin) => ({ lat: pin.lat, lng: pin.lng })),
            },
          ]
        : [];
    return { pins, routes };
  }, [view.route]);
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
      <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-foreground shadow">
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
  const focusHref = view.agenda
    ? "itinerary"
    : view.checklistTotal > view.checklistDone
      ? "checklist"
      : "itinerary";
  const focusText = view.agenda
    ? `${view.agenda.title}${view.agenda.time ? ` ${view.agenda.time}` : ""} · ${view.agenda.when}`
    : `${view.nextStep.label} · ${view.nextStep.hint}`;
  const stats: { section: Section; Icon: typeof Sun; value: string; unit: string }[] = [
    {
      section: "checklist",
      Icon: ListChecks,
      value: view.checklistTotal ? `${view.checklistDone}/${view.checklistTotal}` : "Belum ada",
      unit: "",
    },
    { section: "bookings", Icon: Ticket, value: String(view.bookingCount), unit: "booking" },
    {
      section: "budget",
      Icon: Wallet,
      value: view.budget.set
        ? compactMoney(
            view.budget.remainingMinor,
            formatTripMoney(view.budget.remainingMinor, view.budget.currency),
          )
        : "Atur",
      unit: view.budget.set ? "sisa" : "",
    },
  ];
  return (
    <div className={`${CARD} overflow-hidden`} data-testid="home-trips-widget" data-state="trip">
      {showRoute && view.route && (
        <div className="relative h-[118px]">
          {mapBroken ? (
            <TripMiniRoute pins={view.route.pins} />
          ) : (
            <ItineraryMap
              pins={mapModel.pins}
              routes={mapModel.routes}
              focus
              activeId={null}
              onSelect={() => undefined}
              styleUrl={config.styleUrl}
              framePadding={{ top: 44, bottom: 16 }}
              onUnavailable={() => setMapBroken(true)}
            />
          )}
          <Link
            to="/my-trips/$tripId"
            params={{ tripId: view.tripId }}
            aria-label="Buka peta di Ringkas"
            className="absolute inset-0 z-10"
          />
          <div className="pointer-events-none absolute left-2.5 top-2.5 z-20">{badgeEl}</div>
          {weatherChip && (
            <div className="pointer-events-none absolute right-2.5 top-2.5 z-20">{weatherChip}</div>
          )}
        </div>
      )}
      <div className="bg-gradient-to-br from-[#c4485a] to-[#8f2c3c] px-3.5 pb-3 pt-3 text-white">
        <div className="flex items-center justify-between gap-2">
          {showRoute ? (
            <p className="min-w-0 truncate text-[11px] text-white/75">
              {view.destination} · {view.dateRange} · {view.travelers} traveler
            </p>
          ) : (
            <span className="inline-flex rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold">
              {badge}
            </span>
          )}
          <Link
            to="/my-trips/$tripId"
            params={{ tripId: view.tripId }}
            className="tap shrink-0 rounded-full bg-white px-3 py-1 text-[12px] font-bold text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Buka Ringkas ›
          </Link>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <h3 className="truncate text-[20px] font-bold tracking-[-0.02em]">{view.title}</h3>
          {!showRoute && weatherChip}
        </div>
        {!showRoute && (
          <p className="truncate text-[11px] text-white/75">
            {view.destination} · {view.dateRange} · {view.travelers} traveler
          </p>
        )}
        <Link
          to="/my-trips/$tripId/$section"
          params={{ tripId: view.tripId, section: focusHref }}
          className="tap mt-2 inline-flex max-w-full items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[12px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="truncate">{focusText}</span>
          <ChevronRight className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
        </Link>
        {view.timeline.length > 0 && (
          <ol className="relative mt-3 flex" aria-label="Agenda berikutnya">
            <span className="absolute inset-x-0 top-[5px] h-0.5 bg-white/25" aria-hidden="true" />
            {view.timeline.map((item, index) => (
              <li
                key={item.id}
                className={`relative min-w-0 flex-1 pr-1 pt-3.5 text-[10px] ${index === 0 ? "font-semibold text-white" : "text-white/70"}`}
              >
                <span
                  className={`absolute left-0 top-px size-2.5 rounded-full ${index === 0 ? "bg-white ring-[3px] ring-white/30" : "bg-white/40"}`}
                  aria-hidden="true"
                />
                <span className="block text-[11px] font-semibold tabular-nums">
                  {item.time ?? "—"}
                </span>
                <span className="block truncate">{item.title}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-white/20 pt-2.5 text-[12px]">
          {stats.map(({ section, Icon, value, unit }) => (
            <Link
              key={section}
              to="/my-trips/$tripId/$section"
              params={{ tripId: view.tripId, section }}
              className="tap inline-flex min-h-8 items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="size-3.5 opacity-80" aria-hidden="true" />
              <b className="font-bold tabular-nums">{value}</b>
              {unit && <span className="text-[11px] opacity-75">{unit}</span>}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
