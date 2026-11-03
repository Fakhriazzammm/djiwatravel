import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { boundsOf, curvedRoute, type MapPin } from "@/lib/itinerary-map";

const ROUTE_SOURCE = "agenda-route";
const RED = "#c4353b";

type Props = {
  pins: MapPin[];
  routes: { lat: number; lng: number }[][];
  activeId: string | null;
  onSelect: (id: string) => void;
  styleUrl: string;
  className?: string;
  onUnavailable?: () => void;
};

const STYLE_ID = "djiwa-pin-style";
function ensurePinStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes djiwa-pin-pop{0%{transform:scale(.2);opacity:0}70%{transform:scale(1.12);opacity:1}100%{transform:scale(1)}}
    @keyframes djiwa-pin-pulse{0%{transform:scale(.8);opacity:.5}100%{transform:scale(2);opacity:0}}
    .djiwa-pin{display:flex;flex-direction:column;align-items:center;cursor:pointer;animation:djiwa-pin-pop .35s cubic-bezier(.3,1.4,.5,1) both;transform-origin:50% 100%}
    .djiwa-pin-body{position:relative;display:grid;place-items:center;border-radius:9999px;font:700 12px/1 system-ui,sans-serif;transition:transform .2s,background .2s,color .2s}
    .djiwa-pin-tip{width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;margin-top:-1px}
    .djiwa-pin-label{max-width:140px;margin-bottom:6px;padding:3px 9px;border-radius:9999px;background:#fff;color:#1b1d21;font:600 11px/1.3 system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 6px rgba(0,0,0,.25)}
    .djiwa-pin-pulse{position:absolute;inset:-2px;border-radius:9999px;background:${RED};animation:djiwa-pin-pulse 1.6s ease-out infinite;pointer-events:none}
    @media (prefers-reduced-motion:reduce){.djiwa-pin,.djiwa-pin-pulse{animation:none}}
  `;
  document.head.appendChild(style);
}

type MarkerEntry = { marker: Marker; el: HTMLElement; n: number; title: string };

function paintMarker(entry: MarkerEntry, active: boolean) {
  const { el, n, title } = entry;
  const size = active ? 30 : 24;
  // `el` is positioned by MapLibre (its own class and transform): never touch those, draw inside.
  el.replaceChildren();
  el.style.zIndex = active ? "2" : "1";
  const root = document.createElement("div");
  root.className = "djiwa-pin";
  el.appendChild(root);
  if (active) {
    const label = document.createElement("div");
    label.className = "djiwa-pin-label";
    label.textContent = title;
    root.appendChild(label);
  }
  const body = document.createElement("div");
  body.className = "djiwa-pin-body";
  body.textContent = String(n);
  body.style.cssText = [
    `width:${size}px;height:${size}px`,
    `background:${active ? RED : "#fff"};color:${active ? "#fff" : RED}`,
    `border:2px solid ${active ? "#fff" : RED}`,
    `box-shadow:0 1px 6px rgba(0,0,0,.35)`,
  ].join(";");
  if (active) {
    const pulse = document.createElement("span");
    pulse.className = "djiwa-pin-pulse";
    body.prepend(pulse);
  }
  const tip = document.createElement("div");
  tip.className = "djiwa-pin-tip";
  tip.style.borderTop = `7px solid ${active ? RED : "#fff"}`;
  root.append(body, tip);
}

/**
 * MapLibre map (OpenStreetMap data) with numbered pins and a dashed route per day. Loaded in the
 * browser only; the library never runs during server rendering.
 */
export default function ItineraryMap({
  pins,
  routes,
  activeId,
  onSelect,
  styleUrl,
  className,
  onUnavailable,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Map<string, MarkerEntry>>(new Map());
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef({ pins, routes, activeId, onSelect, onUnavailable });
  latest.current = { pins, routes, activeId, onSelect, onUnavailable };

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | null = null;
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    const markerStore = markers.current;
    void (async () => {
      try {
        const [maplibre, workerModule] = await Promise.all([
          import("maplibre-gl"),
          // MapLibre guesses its worker file next to its own chunk, which does not exist once the
          // bundler renames chunks. Point it at the worker Vite builds for us.
          import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"),
          import("maplibre-gl/dist/maplibre-gl.css"),
        ]);
        maplibre.setWorkerUrl(workerModule.default);
        if (disposed || !host.current) return;
        ensurePinStyle();
        lib.current = maplibre;
        const map = new maplibre.Map({
          container: host.current,
          style: styleUrl,
          center: [latest.current.pins[0]?.lng ?? 106.8, latest.current.pins[0]?.lat ?? -6.2],
          zoom: 11,
          attributionControl: { compact: true },
          cooperativeGestures: false,
        });
        mapRef.current = map;
        // Tile or sprite hiccups are logged only. If the basemap never finishes loading, the
        // timeout below reports it so the Agenda can show a clear message instead of a blank box.
        map.on("error", (event) => {
          console.error("[itinerary-map]", event.error?.message ?? event);
        });
        // Keep the required attribution, but collapsed to its small "i" button.
        const collapseAttribution = () => {
          const attribution = host.current?.querySelector(".maplibregl-ctrl-attrib");
          attribution?.removeAttribute("open");
          attribution?.classList.remove("maplibregl-compact-show");
        };
        collapseAttribution();
        map.once("idle", collapseAttribution);
        loadTimer = setTimeout(() => {
          if (!disposed && !map.loaded()) latest.current.onUnavailable?.();
        }, 12000);
        map.once("style.load", () => {
          if (disposed) return;
          clearTimeout(loadTimer);
          map.addSource(ROUTE_SOURCE, {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          map.addLayer({
            id: "agenda-route-casing",
            type: "line",
            source: ROUTE_SOURCE,
            paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.95 },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          map.addLayer({
            id: "agenda-route-line",
            type: "line",
            source: ROUTE_SOURCE,
            paint: { "line-color": RED, "line-width": 3.5, "line-dasharray": [0.01, 2.2] },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          setReady(true);
        });
        observer = new ResizeObserver(() => map.resize());
        observer.observe(host.current);
      } catch (error) {
        console.error("[itinerary-map] failed to load", error);
        latest.current.onUnavailable?.();
      }
    })();
    return () => {
      disposed = true;
      clearTimeout(loadTimer);
      observer?.disconnect();
      markerStore.forEach(({ marker }) => marker.remove());
      markerStore.clear();
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // The basemap style is fixed for the life of the map; a new style URL remounts the component.
  }, [styleUrl]);

  // Pins, route and framing follow the data.
  useEffect(() => {
    const map = mapRef.current;
    const maplibre = lib.current;
    if (!ready || !map || !maplibre) return;
    const wanted = new Map(pins.map((p) => [p.id, p]));
    markers.current.forEach((entry, id) => {
      if (!wanted.has(id)) {
        entry.marker.remove();
        markers.current.delete(id);
      }
    });
    for (const pin of pins) {
      const existing = markers.current.get(pin.id);
      if (existing) {
        existing.marker.setLngLat([pin.lng, pin.lat]);
        existing.n = pin.n;
        existing.title = pin.title;
        continue;
      }
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `${pin.n}. ${pin.title}`);
      el.style.cssText = "background:none;border:0;padding:0";
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        latest.current.onSelect(pin.id);
      });
      const marker = new maplibre.Marker({ element: el, anchor: "bottom" })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);
      const entry: MarkerEntry = { marker, el, n: pin.n, title: pin.title };
      paintMarker(entry, pin.id === latest.current.activeId);
      markers.current.set(pin.id, entry);
    }
    const source = map.getSource(ROUTE_SOURCE) as { setData: (data: unknown) => void } | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: routes.map((route) => ({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: curvedRoute(route).map((p) => [p.lng, p.lat]),
        },
      })),
    });
    const bounds = boundsOf(pins);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (bounds) {
      if (pins.length === 1)
        map.easeTo({ center: [pins[0]!.lng, pins[0]!.lat], zoom: 14, duration: reduce ? 0 : 400 });
      else map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: reduce ? 0 : 400 });
    }
  }, [pins, routes, ready]);

  // Active pin styling and re-centering.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    markers.current.forEach((entry, id) => paintMarker(entry, id === activeId));
    const active = pins.find((p) => p.id === activeId);
    if (active) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      map.easeTo({ center: [active.lng, active.lat], duration: reduce ? 0 : 300 });
    }
  }, [activeId, pins, ready]);

  return (
    <div
      ref={host}
      role="region"
      aria-label="Peta agenda"
      className={className ?? "h-full w-full"}
    />
  );
}
