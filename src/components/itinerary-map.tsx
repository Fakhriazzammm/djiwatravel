import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { boundsOf, type MapPin } from "@/lib/itinerary-map";

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

function paintMarker(el: HTMLElement, n: number, active: boolean) {
  el.textContent = String(n);
  el.style.cssText = [
    "display:grid;place-items:center;border-radius:9999px;font:700 12px/1 system-ui,sans-serif;cursor:pointer",
    `width:${active ? 30 : 24}px;height:${active ? 30 : 24}px`,
    `background:${active ? RED : "#fff"};color:${active ? "#fff" : RED}`,
    `border:2px solid ${active ? "#fff" : RED}`,
    `box-shadow:0 1px 6px rgba(0,0,0,.35)${active ? `,0 0 0 6px ${RED}2e` : ""}`,
    `z-index:${active ? 2 : 1}`,
  ].join(";");
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
  const markers = useRef<Map<string, { marker: Marker; el: HTMLElement; n: number }>>(new Map());
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef({ pins, routes, activeId, onSelect, onUnavailable });
  latest.current = { pins, routes, activeId, onSelect, onUnavailable };

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | null = null;
    const markerStore = markers.current;
    void (async () => {
      try {
        const [maplibre] = await Promise.all([
          import("maplibre-gl"),
          import("maplibre-gl/dist/maplibre-gl.css"),
        ]);
        if (disposed || !host.current) return;
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
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");
        map.on("error", (event) => {
          // A broken basemap must not take the Agenda with it: fall back to the list.
          if (!map.isStyleLoaded() && !disposed) latest.current.onUnavailable?.();
          console.error("[itinerary-map]", event.error?.message ?? event);
        });
        map.on("load", () => {
          if (disposed) return;
          map.addSource(ROUTE_SOURCE, {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          map.addLayer({
            id: "agenda-route-casing",
            type: "line",
            source: ROUTE_SOURCE,
            paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          map.addLayer({
            id: "agenda-route-line",
            type: "line",
            source: ROUTE_SOURCE,
            paint: { "line-color": RED, "line-width": 3, "line-dasharray": [0.1, 2] },
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
        continue;
      }
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `${pin.n}. ${pin.title}`);
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        latest.current.onSelect(pin.id);
      });
      const marker = new maplibre.Marker({ element: el }).setLngLat([pin.lng, pin.lat]).addTo(map);
      markers.current.set(pin.id, { marker, el, n: pin.n });
    }
    const source = map.getSource(ROUTE_SOURCE) as { setData: (data: unknown) => void } | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: routes.map((route) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: route.map((p) => [p.lng, p.lat]) },
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
    markers.current.forEach((entry, id) => paintMarker(entry.el, entry.n, id === activeId));
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
