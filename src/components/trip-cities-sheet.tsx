import { useEffect, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { postTripCities } from "@/lib/my-trips.fn";
import { searchPlaces } from "@/lib/itinerary-map.fn";
import type { PlaceResult } from "@/lib/itinerary-map";
import { MAX_TRIP_CITIES, popularCitiesFor, type TripCity } from "@/lib/trip-cities";

const sameCity = (a: TripCity, b: TripCity) => a.name.toLowerCase() === b.name.toLowerCase();

/**
 * "Mau ke kota mana saja di Jepang?": the traveler picks the cities of the trip. They frame the
 * Ringkas and Agenda maps and scope place search in "Tambah aktivitas". Optional: "Lewati dulu"
 * keeps the trip working with the country only.
 */
export function TripCitiesSheet({
  open,
  onOpenChange,
  tripId,
  destinationName,
  destinationCode,
  initial,
  searchEnabled,
  onSaved,
  onSkip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  destinationName: string;
  destinationCode?: string | null | undefined;
  initial: TripCity[];
  searchEnabled: boolean;
  onSaved: () => Promise<unknown> | void;
  onSkip?: (() => void) | undefined;
}) {
  const [selected, setSelected] = useState<TripCity[]>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const popular = popularCitiesFor(destinationCode);

  useEffect(() => {
    if (open) setSelected(initial);
    // Reset only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const has = (city: TripCity) => selected.some((c) => sameCity(c, city));
  function toggle(city: TripCity) {
    setSelected((current) =>
      current.some((c) => sameCity(c, city))
        ? current.filter((c) => !sameCity(c, city))
        : current.length >= MAX_TRIP_CITIES
          ? current
          : [...current, city],
    );
  }

  function type(next: string) {
    setQuery(next);
    clearTimeout(timer.current);
    const q = next.trim();
    if (!searchEnabled || q.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const mine = ++seq.current;
    timer.current = setTimeout(async () => {
      try {
        const response = await searchPlaces({ data: { query: q } });
        if (mine !== seq.current) return;
        setResults(response.places.slice(0, 5));
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 350);
  }

  async function save() {
    setSaving(true);
    try {
      await postTripCities({ data: { tripId, cities: selected } });
      onOpenChange(false);
      await onSaved();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Kota belum tersimpan.");
    } finally {
      setSaving(false);
    }
  }

  const extra = selected.filter((c) => !popular.some((p) => sameCity(p, c)));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[24px] border-border/70 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-6 sm:rounded-t-[24px]"
      >
        <div
          className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted-foreground/25"
          aria-hidden="true"
        />
        <SheetTitle className="pr-8 text-[22px] font-bold leading-tight tracking-tight">
          Mau ke kota mana saja di {destinationName}?
        </SheetTitle>
        <SheetDescription className="mt-1 text-[12px] leading-snug">
          Peta dan pencarian tempat akan mengikuti kota yang kamu pilih. Boleh lebih dari satu.
        </SheetDescription>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {searchEnabled && (
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(event) => type(event.target.value)}
                placeholder="Cari kota lain"
                aria-label="Cari kota"
                autoComplete="off"
                className="min-h-10 w-full rounded-xl border border-border/70 bg-secondary/70 pl-9 pr-3 text-[14px] outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/15"
              />
            </div>
          )}
          {query.trim().length >= 3 && (
            <ul className="mt-2 overflow-hidden rounded-xl border border-border/70 bg-surface">
              {results.map((place) => (
                <li
                  key={`${place.label}-${place.lat}-${place.lng}`}
                  className="border-b border-border/60 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => {
                      toggle({ name: place.label, lat: place.lat, lng: place.lng });
                      setQuery("");
                      setResults([]);
                    }}
                    className="tap flex min-h-11 w-full flex-col justify-center px-3 py-1.5 text-left"
                  >
                    <span className="truncate text-[14px] font-semibold">{place.label}</span>
                    {place.subtitle && (
                      <span className="truncate text-[11px] text-muted-foreground">
                        {place.subtitle}
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {!results.length && (
                <li className="px-3 py-2.5 text-[12px] text-muted-foreground">
                  {searching ? "Mencari…" : "Kota tidak ditemukan."}
                </li>
              )}
            </ul>
          )}

          {popular.length > 0 && (
            <>
              <p className="px-1 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Populer di {destinationName}
              </p>
              <div className="flex flex-wrap gap-2">
                {popular.map((city) => (
                  <CityChip key={city.name} city={city} on={has(city)} onToggle={toggle} />
                ))}
              </div>
            </>
          )}
          {extra.length > 0 && (
            <>
              <p className="px-1 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Kota lain
              </p>
              <div className="flex flex-wrap gap-2">
                {extra.map((city) => (
                  <CityChip key={city.name} city={city} on onToggle={toggle} />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-1">
          <button
            type="button"
            disabled={saving || (!selected.length && !initial.length)}
            onClick={() => void save()}
            className="tap min-h-11 rounded-xl bg-brand-red text-[14px] font-semibold text-white disabled:opacity-60"
          >
            {saving
              ? "Menyimpan…"
              : selected.length
                ? `Lanjut dengan ${selected.length} kota`
                : initial.length
                  ? "Simpan tanpa kota"
                  : "Pilih kota dulu"}
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onSkip?.();
            }}
            className="tap min-h-10 text-[13px] text-muted-foreground"
          >
            Lewati dulu
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CityChip({
  city,
  on,
  onToggle,
}: {
  city: TripCity;
  on: boolean;
  onToggle: (city: TripCity) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onToggle(city)}
      className={`tap inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] ${
        on
          ? "bg-brand-red font-semibold text-white"
          : "border border-border/70 bg-surface text-foreground"
      }`}
    >
      {on && <Check className="size-3.5" aria-hidden="true" />}
      {city.name}
      {on && <X className="size-3 opacity-70" aria-hidden="true" />}
    </button>
  );
}
