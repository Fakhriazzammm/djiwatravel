import { useEffect, useRef, useState } from "react";
import type { AddLayerObject, Map as MapLibreMap, Marker } from "maplibre-gl";
import {
  POI_CATEGORIES,
  boundsOf,
  curvedRoute,
  type MapPin,
  type MapRoute,
  type PoiCategoryId,
} from "@/lib/itinerary-map";

export type PickedPoi = { category: PoiCategoryId; label: string; lat: number; lng: number };

const ROUTE_SOURCE = "agenda-route";
const RED = "#c4353b";

type Props = {
  pins: MapPin[];
  routes: MapRoute[];
  /** Focus mode: only the selected day's points and route, framed tightly, no helper markers. */
  focus?: boolean;
  /** The traveler's position from the device, shown as a blue dot. */
  userPoint?: { lat: number; lng: number } | null;
  activeId: string | null;
  onSelect: (id: string) => void;
  styleUrl: string;
  /** Categories shown on the map. Empty = no helper layers at all. */
  poiCategories?: PoiCategoryId[];
  onPoiSelect?: (poi: PickedPoi) => void;
  className?: string;
  /** Room kept free at the top and bottom when framing pins (for controls drawn over the map). */
  framePadding?: { top: number; bottom: number };
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

type MarkerEntry = {
  marker: Marker;
  el: HTMLElement;
  n: number;
  title: string;
  color: string;
  muted: boolean;
};

function paintMarker(entry: MarkerEntry, active: boolean, animate = false) {
  const { el, n, title, color, muted } = entry;
  const size = active ? 30 : muted ? 20 : 24;
  // `el` is positioned by MapLibre (its own class and transform): never touch those, draw inside.
  el.replaceChildren();
  el.style.zIndex = active ? "3" : muted ? "1" : "2";
  const root = document.createElement("div");
  root.className = "djiwa-pin";
  if (!animate) root.style.animation = "none";
  if (muted && !active) root.style.opacity = "0.85";
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
    `background:${active ? color : "#fff"};color:${active ? "#fff" : color}`,
    `border:2px solid ${active ? "#fff" : color}`,
    muted && !active ? "font-size:10px" : "",
    `box-shadow:0 1px 6px rgba(0,0,0,.35)`,
  ].join(";");
  if (active) {
    const pulse = document.createElement("span");
    pulse.className = "djiwa-pin-pulse";
    pulse.style.background = color;
    body.prepend(pulse);
  }
  const tip = document.createElement("div");
  tip.className = "djiwa-pin-tip";
  tip.style.borderTop = `7px solid ${active ? color : "#fff"}`;
  root.append(body, tip);
}

function poiIconUrl(color: string, icon: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><circle cx="28" cy="28" r="25" fill="${color}" stroke="#fff" stroke-width="3"/><g transform="translate(14 14) scale(1.1667)" stroke="#fff" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image(56, 56);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function addPoiLayers(map: MapLibreMap, enabled: PoiCategoryId[]) {
  // Our category layers replace the basemap's own POI icons so each place shows once.
  for (const layer of map.getStyle().layers ?? []) {
    if (/^poi_|^airport$/.test(layer.id)) map.setLayoutProperty(layer.id, "visibility", "none");
  }
  if (!map.getSource("openmaptiles")) return;
  try {
    const images = await Promise.all(
      POI_CATEGORIES.map((c) => loadImage(poiIconUrl(c.color, c.icon))),
    );
    POI_CATEGORIES.forEach((c, i) => {
      if (!map.hasImage(`djiwa-${c.id}`))
        map.addImage(`djiwa-${c.id}`, images[i]!, { pixelRatio: 2 });
    });
  } catch (error) {
    console.error("[itinerary-map] poi icons failed", error);
    return;
  }
  const addSymbol = (layer: Record<string, unknown>) =>
    map.addLayer(layer as unknown as AddLayerObject);
  const label = ["coalesce", ["get", "name:latin"], ["get", "name_en"], ["get", "name"]];
  for (const c of POI_CATEGORIES) {
    const visible = enabled.includes(c.id) ? "visible" : "none";
    const layout = {
      "icon-image": `djiwa-${c.id}`,
      "icon-size": 0.78,
      "icon-padding": 4,
      "text-field": label,
      "text-font": ["Noto Sans Regular"],
      "text-size": 10,
      "text-anchor": "top",
      "text-offset": [0, 1.05],
      "text-optional": true,
      "text-max-width": 7,
      visibility: visible,
    } as const;
    const paint = { "text-color": "#374151", "text-halo-color": "#ffffff", "text-halo-width": 1.4 };
    addSymbol({
      id: `djiwa-poi-${c.id}`,
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "poi",
      minzoom: c.minZoom,
      filter: ["match", ["get", "class"], c.classes, true, false],
      layout: { ...layout, "symbol-sort-key": ["get", "rank"] },
      paint,
    });
    if (c.id === "airport") {
      addSymbol({
        id: `djiwa-poi-${c.id}-iata`,
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "aerodrome_label",
        minzoom: c.minZoom,
        filter: ["has", "iata"],
        layout,
        paint,
      });
    }
  }
}

const poiLayerIds = () =>
  POI_CATEGORIES.flatMap((c) => [`djiwa-poi-${c.id}`, `djiwa-poi-${c.id}-iata`]);

/**
 * MapLibre map (OpenStreetMap data) with numbered pins and a dashed route per day. Loaded in the
 * browser only; the library never runs during server rendering.
 */
export default function ItineraryMap({
  pins,
  routes,
  focus = false,
  userPoint = null,
  activeId,
  onSelect,
  styleUrl,
  poiCategories = [],
  onPoiSelect,
  className,
  framePadding,
  onUnavailable,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Map<string, MarkerEntry>>(new Map());
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef({ pins, routes, activeId, onSelect, onUnavailable, onPoiSelect });
  latest.current = { pins, routes, activeId, onSelect, onUnavailable, onPoiSelect };
  const poiRef = useRef(poiCategories);
  poiRef.current = poiCategories;

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
        map.once("style.load", async () => {
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
            paint: {
              "line-color": ["get", "color"],
              "line-width": 3.5,
              "line-dasharray": [0.01, 2.2],
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          await addPoiLayers(map, poiRef.current);
          if (disposed) return;
          const ids = poiLayerIds().filter((id) => map.getLayer(id));
          if (ids.length) {
            map.on("click", ids, (event) => {
              const feature = event.features?.[0];
              if (!feature || feature.geometry.type !== "Point") return;
              const props = (feature.properties ?? {}) as Record<string, unknown>;
              const name = String(props["name:latin"] ?? props["name_en"] ?? props["name"] ?? "");
              const category = POI_CATEGORIES.find((c) =>
                feature.layer.id.startsWith(`djiwa-poi-${c.id}`),
              );
              const [lng, lat] = feature.geometry.coordinates as [number, number];
              if (name && category)
                latest.current.onPoiSelect?.({ category: category.id, label: name, lat, lng });
            });
            ids.forEach((id) => {
              map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
              map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
            });
          }
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
      userMarker.current?.remove();
      userMarker.current = null;
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
        const changed =
          existing.n !== pin.n || existing.color !== pin.color || existing.muted !== pin.muted;
        existing.n = pin.n;
        existing.title = pin.title;
        existing.color = pin.color;
        existing.muted = pin.muted;
        if (changed) paintMarker(existing, pin.id === latest.current.activeId);
        existing.el.style.display = focus && pin.muted ? "none" : "";
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
      const entry: MarkerEntry = {
        marker,
        el,
        n: pin.n,
        title: pin.title,
        color: pin.color,
        muted: pin.muted,
      };
      paintMarker(entry, pin.id === latest.current.activeId, true);
      el.style.display = focus && pin.muted ? "none" : "";
      markers.current.set(pin.id, entry);
    }
    const source = map.getSource(ROUTE_SOURCE) as { setData: (data: unknown) => void } | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: routes
        .filter((route) => !(focus && route.muted))
        .map((route) => ({
          type: "Feature",
          properties: { color: route.color },
          geometry: {
            type: "LineString",
            coordinates: curvedRoute(route.points).map((p) => [p.lng, p.lat]),
          },
        })),
    });
    const framed = pins.filter((pin) => !pin.muted);
    const fitPins = framed.length ? framed : pins;
    const bounds = boundsOf(fitPins);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (bounds) {
      const duration = reduce ? 0 : 450;
      // Leave room for the chips drawn over the top of the map.
      const padding = {
        top: framePadding?.top ?? (focus ? 60 : 96),
        bottom: framePadding?.bottom ?? 56,
        left: 44,
        right: 44,
      };
      if (fitPins.length === 1)
        map.easeTo({ center: [fitPins[0]!.lng, fitPins[0]!.lat], zoom: 14, duration });
      else map.fitBounds(bounds, { padding, maxZoom: 15, duration });
    }
  }, [pins, routes, ready, focus, framePadding?.top, framePadding?.bottom]);

  // The traveler's own position.
  const userMarker = useRef<Marker | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    const maplibre = lib.current;
    if (!ready || !map || !maplibre) return;
    if (!userPoint) {
      userMarker.current?.remove();
      userMarker.current = null;
      return;
    }
    if (!userMarker.current) {
      const el = document.createElement("div");
      el.setAttribute("aria-label", "Lokasi kamu");
      el.style.cssText =
        "width:16px;height:16px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.25),0 1px 6px rgba(0,0,0,.4)";
      userMarker.current = new maplibre.Marker({ element: el })
        .setLngLat([userPoint.lng, userPoint.lat])
        .addTo(map);
    } else {
      userMarker.current.setLngLat([userPoint.lng, userPoint.lat]);
    }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    map.easeTo({
      center: [userPoint.lng, userPoint.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: reduce ? 0 : 500,
    });
  }, [userPoint, ready]);

  // Category helper layers follow the chips.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const c of POI_CATEGORIES) {
      const visibility = !focus && poiCategories.includes(c.id) ? "visible" : "none";
      for (const id of [`djiwa-poi-${c.id}`, `djiwa-poi-${c.id}-iata`]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
      }
    }
  }, [poiCategories, ready, focus]);

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
