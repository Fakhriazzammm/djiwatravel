import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Box, ExternalLink, MapPinned } from "lucide-react";
import { getItineraryMapConfig } from "@/lib/itinerary-map.fn";
import {
  buildMapModel,
  googleMapsDayRouteUrl,
  itemPoint,
  type ItineraryMapConfig,
} from "@/lib/itinerary-map";

// maplibre is heavy: it only loads on public pages that actually have points to draw.
const ItineraryMap = lazy(() => import("@/components/itinerary-map"));

export type SharedMapDay = {
  key: string;
  label: string;
  items: { id: string; title: string; latitude: unknown; longitude: unknown }[];
};

const chip =
  "tap inline-flex min-h-8 shrink-0 items-center rounded-full px-3 text-[11px] font-semibold";

/**
 * Read-only interactive map of a shared itinerary or a template: numbered pins, a dotted route per
 * day, a day switcher and an optional 3D tilt. It renders nothing when Admin switched the itinerary
 * map off, when no activity has a point, or when the map cannot load: the list below always works.
 */
export function SharedItineraryMap({
  days,
  activeId: controlledActive,
  onActiveChange,
  className = "",
}: {
  days: SharedMapDay[];
  activeId?: string | null;
  onActiveChange?: (id: string) => void;
  className?: string;
}) {
  const [config, setConfig] = useState<ItineraryMapConfig | null>(null);
  const [scope, setScope] = useState<string>("all");
  const [own, setOwn] = useState<string | null>(null);
  const [tilt, setTilt] = useState(false);
  const [broken, setBroken] = useState(false);
  const activeId = controlledActive === undefined ? own : controlledActive;

  useEffect(() => {
    let live = true;
    void getItineraryMapConfig()
      .then((value) => {
        if (live) setConfig(value as ItineraryMapConfig);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const model = useMemo(
    () =>
      buildMapModel(
        days.map((day) => ({ date: day.key, items: day.items })),
        scope,
      ),
    [days, scope],
  );
  const pinnedDays = useMemo(
    () => days.filter((day) => day.items.some((item) => itemPoint(item))),
    [days],
  );
  const dayRoute = useMemo(() => {
    const day = days.find((d) => d.key === scope);
    const points = (day?.items ?? []).flatMap((item) => {
      const point = itemPoint(item);
      return point ? [point] : [];
    });
    return points.length ? googleMapsDayRouteUrl(points) : null;
  }, [days, scope]);

  if (!config?.enabled || broken || model.pins.length === 0) return null;

  const select = (id: string) => {
    if (controlledActive === undefined) setOwn(id);
    onActiveChange?.(id);
    const row = document.getElementById(`item-${id}`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <section aria-label="Peta itinerary" className={className}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <MapPinned className="size-4 text-brand-red" aria-hidden="true" />
        <h2 className="text-[13px] font-bold">Peta perjalanan</h2>
        <span className="text-[11px] text-muted-foreground">
          {model.pins.length} titik · geser dan ketuk pin
        </span>
      </div>
      {pinnedDays.length > 1 && (
        <div className="-mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4">
          <button
            type="button"
            onClick={() => setScope("all")}
            className={`${chip} ${scope === "all" ? "bg-brand-red text-white" : "bg-secondary text-secondary-foreground"}`}
          >
            Semua hari
          </button>
          {pinnedDays.map((day) => (
            <button
              key={day.key}
              type="button"
              onClick={() => setScope(day.key)}
              className={`${chip} ${scope === day.key ? "bg-brand-red text-white" : "bg-secondary text-secondary-foreground"}`}
            >
              {day.label}
            </button>
          ))}
        </div>
      )}
      <div className="relative h-[260px] overflow-hidden rounded-[18px] bg-secondary ring-1 ring-border/60">
        <Suspense fallback={null}>
          <ItineraryMap
            pins={model.pins}
            routes={model.routes}
            focus={scope !== "all"}
            activeId={activeId}
            onSelect={select}
            styleUrl={config.styleUrl}
            tilt={tilt}
            onUnavailable={() => setBroken(true)}
          />
        </Suspense>
        <button
          type="button"
          onClick={() => setTilt((value) => !value)}
          aria-pressed={tilt}
          className={`tap absolute right-2 top-2 z-10 inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold shadow ${tilt ? "bg-brand-red text-white" : "bg-surface text-foreground"}`}
        >
          <Box className="size-3.5" aria-hidden="true" />
          3D
        </button>
      </div>
      {dayRoute && (
        <a
          href={dayRoute}
          target="_blank"
          rel="noreferrer"
          className="tap mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-red"
        >
          Buka rute hari ini di Google Maps
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      )}
    </section>
  );
}
