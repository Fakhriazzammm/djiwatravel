import { useEffect, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import { searchPlaces } from "@/lib/itinerary-map.fn";
import type { PlaceResult } from "@/lib/itinerary-map";
import { focusMapOn, searchMapPlaces } from "@/lib/map-place-search";
import { placesNearCity, type TripCity } from "@/lib/trip-cities";
import { PHOTON_ATTRIBUTION, searchPhotonInBrowser } from "@/lib/browser-photon";

export type PickedPlace = { lat: number; lng: number } | null;

const inputClass =
  "min-h-10 w-full min-w-0 rounded-xl border border-border/70 bg-secondary/70 px-3 text-sm outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/15";

/**
 * Location field. Typing searches places through the server (no provider key in the browser);
 * choosing a suggestion stores its coordinates so the activity shows on the Agenda map. Plain
 * typed text still works and saves without a pin.
 */
export function PlaceSearchField({
  id,
  value,
  picked,
  searchEnabled,
  onChange,
  cities = [],
  onPick,
  autoFocus = false,
}: {
  id: string;
  value: string;
  picked: PickedPlace;
  searchEnabled: boolean;
  onChange: (value: string, point: PickedPlace) => void;
  /** Cities of the trip. With any, search is scoped to the chosen one (or all of them). */
  cities?: TripCity[];
  /** Called with the full result when the traveler picks a suggestion (title, category, ...). */
  onPick?: ((place: PlaceResult) => void) | undefined;
  autoFocus?: boolean | undefined;
}) {
  const [cityName, setCityName] = useState<string>(cities[0]?.name ?? "");
  // Keep the chosen city valid when the trip's cities change.
  const scopedCity =
    cities.find((c) => c.name === cityName) ?? (cities.length === 1 ? cities[0] : null);
  const scopedTo = scopedCity ?? null;
  const [results, setResults] = useState<PlaceResult[]>([]);
  // Data credit the server attaches to its answer (GeoNames requires one).
  const [attribution, setAttribution] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "unavailable">("idle");
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function type(next: string) {
    onChange(next, null);
    clearTimeout(timer.current);
    const query = next.trim();
    if (!searchEnabled || query.length < 3) {
      setResults([]);
      setState("idle");
      return;
    }
    // Places on the map answer at once; towns from the server are merged in a moment later.
    const rawOnMap = searchMapPlaces(query);
    const onMap = scopedTo
      ? { ...rawOnMap, places: placesNearCity(rawOnMap.places, scopedTo) }
      : rawOnMap;
    setResults(onMap.places);
    setAttribution(null);
    setState(onMap.places.length ? "idle" : "loading");
    const mine = ++seq.current;
    const merge = (server: PlaceResult[]) => {
      const seen = new Set<string>();
      return [...onMap.places, ...server]
        .filter((p) => {
          const key = `${p.label.toLowerCase()}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`;
          return seen.has(key) ? false : (seen.add(key), true);
        })
        .slice(0, 8);
    };
    // Venues (restaurants, cafes...) come from Photon in the browser, unless a keyed server
    // geocoder already answered them. They join the list a moment later.
    const addVenues = (serverPlaces: PlaceResult[], serverAttribution: string | null) => {
      const near = scopedTo ? { lat: scopedTo.lat, lng: scopedTo.lng } : undefined;
      void searchPhotonInBrowser(query, near).then((found) => {
        if (mine !== seq.current) return;
        const venues = scopedTo ? placesNearCity(found, scopedTo) : found;
        if (!venues.length) return;
        const seen = new Set<string>();
        const all = [...onMap.places, ...venues, ...serverPlaces]
          .filter((p) => {
            const key = `${p.label.toLowerCase()}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`;
            return seen.has(key) ? false : (seen.add(key), true);
          })
          .slice(0, 8);
        setResults(all);
        setState("idle");
        setAttribution([serverAttribution, PHOTON_ATTRIBUTION].filter(Boolean).join(" · "));
      });
    };
    const emptyState = "empty" as const;
    timer.current = setTimeout(async () => {
      try {
        const response = await searchPlaces({
          data: { query, ...(scopedTo ? { near: { lat: scopedTo.lat, lng: scopedTo.lng } } : {}) },
        });
        if (mine !== seq.current) return;
        const merged = merge(response.places);
        setResults(merged);
        setAttribution(response.places.length ? (response.attribution ?? null) : null);
        if (response.status !== "ok" || response.attribution) {
          addVenues(
            response.places,
            response.places.length ? (response.attribution ?? null) : null,
          );
        }
        setState(
          merged.length
            ? "idle"
            : response.status !== "ok" && response.status !== "disabled"
              ? "unavailable"
              : emptyState,
        );
      } catch {
        if (mine === seq.current) {
          setResults(onMap.places);
          setAttribution(null);
          setState(onMap.places.length ? "idle" : "unavailable");
          addVenues([], null);
        }
      }
    }, 350);
  }

  function pick(place: PlaceResult) {
    seq.current += 1;
    setResults([]);
    setAttribution(null);
    setState("idle");
    onChange(place.label, { lat: place.lat, lng: place.lng });
    onPick?.(place);
    // Move the map there so the places around it load and can be searched next.
    focusMapOn({ lat: place.lat, lng: place.lng });
  }

  return (
    <div className="space-y-1.5">
      {cities.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Cari di kota">
          <span className="text-[11px] text-muted-foreground">Di kota</span>
          {cities.map((city) => (
            <button
              key={city.name}
              type="button"
              aria-pressed={scopedCity?.name === city.name}
              onClick={() => setCityName(city.name)}
              className={`tap inline-flex min-h-8 items-center rounded-full px-3 text-xs ${
                scopedCity?.name === city.name
                  ? "bg-brand-red font-semibold text-white"
                  : "border border-border/70 bg-surface"
              }`}
            >
              {city.name}
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          id={id}
          value={value}
          onChange={(event) => type(event.target.value)}
          autoFocus={autoFocus}
          placeholder={
            !searchEnabled
              ? "Tambahkan lokasi"
              : scopedTo
                ? `Cari tempat di ${scopedTo.name}`
                : "Cari tempat atau alamat"
          }
          autoComplete="off"
          className={`${inputClass} ${searchEnabled ? "pr-9" : ""}`}
          aria-describedby={`${id}-hint`}
        />
        {searchEnabled && (
          <Search
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </div>
      {results.length > 0 && (
        <ul
          className="overflow-hidden rounded-xl border border-border/70 bg-surface"
          aria-label="Saran lokasi"
        >
          {results.map((place) => (
            <li
              key={`${place.label}-${place.lat}-${place.lng}`}
              className="border-b border-border/60 last:border-b-0"
            >
              <button
                type="button"
                onClick={() => pick(place)}
                className="tap flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-red-soft text-brand-red">
                  <MapPin className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{place.label}</span>
                  {place.subtitle && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {place.subtitle}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {results.length > 0 && attribution && (
        <p className="px-1 text-[11px] text-muted-foreground">{attribution}</p>
      )}
      <p id={`${id}-hint`} className="text-[11px] text-muted-foreground" aria-live="polite">
        {picked ? (
          <span className="inline-flex items-center gap-2">
            <span className="font-medium text-emerald-700">Titik peta tersimpan.</span>
            <button
              type="button"
              onClick={() => onChange(value, null)}
              className="tap inline-flex items-center gap-0.5 font-semibold text-muted-foreground"
            >
              <X className="size-3" /> Lepas titik
            </button>
          </span>
        ) : state === "loading" ? (
          "Mencari…"
        ) : state === "empty" ? (
          scopedTo ? (
            `Belum ketemu di ${scopedTo.name}. Coba nama lain, pilih kota lain, atau tulis manual tanpa pin.`
          ) : (
            "Tempat tidak ditemukan. Lokasi tetap bisa disimpan sebagai teks."
          )
        ) : state === "unavailable" ? (
          "Pencarian lokasi sedang tidak tersedia. Lokasi tetap bisa disimpan sebagai teks."
        ) : searchEnabled ? (
          "Pilih saran agar aktivitas muncul di peta."
        ) : null}
      </p>
    </div>
  );
}
