import { useEffect, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import { searchPlaces } from "@/lib/itinerary-map.fn";
import type { PlaceResult } from "@/lib/itinerary-map";

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
}: {
  id: string;
  value: string;
  picked: PickedPlace;
  searchEnabled: boolean;
  onChange: (value: string, point: PickedPlace) => void;
}) {
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
    setState("loading");
    const mine = ++seq.current;
    timer.current = setTimeout(async () => {
      try {
        const response = await searchPlaces({ data: { query } });
        if (mine !== seq.current) return;
        setResults(response.places);
        setAttribution(response.attribution ?? null);
        setState(
          response.status !== "ok" && response.status !== "disabled"
            ? "unavailable"
            : response.places.length
              ? "idle"
              : "empty",
        );
      } catch {
        if (mine === seq.current) {
          setResults([]);
          setAttribution(null);
          setState("unavailable");
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
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <input
          id={id}
          value={value}
          onChange={(event) => type(event.target.value)}
          placeholder={searchEnabled ? "Cari tempat atau alamat" : "Tambahkan lokasi"}
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
          "Tempat tidak ditemukan. Lokasi tetap bisa disimpan sebagai teks."
        ) : state === "unavailable" ? (
          "Pencarian lokasi sedang tidak tersedia. Lokasi tetap bisa disimpan sebagai teks."
        ) : searchEnabled ? (
          "Pilih saran agar aktivitas muncul di peta."
        ) : null}
      </p>
    </div>
  );
}
