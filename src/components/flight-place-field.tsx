import { useEffect, useRef, useState } from "react";
import { Plane } from "lucide-react";
import { searchFlightPlaces } from "@/lib/flights.fn";
import { placeLabel, type FlightPlace } from "@/lib/flights";

const inputClass =
  "min-h-11 w-full min-w-0 rounded-xl border border-border/70 bg-secondary/70 px-3 text-[14px] outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/15";

/**
 * City or airport field. Typing searches places through the server; choosing one stores its
 * three-letter code. Free text alone is never a valid place, so the search can only run on a code.
 */
export function FlightPlaceField({
  id,
  label,
  value,
  onPick,
}: {
  id: string;
  label: string;
  value: FlightPlace | null;
  onPick: (place: FlightPlace | null) => void;
}) {
  const [text, setText] = useState(value ? placeLabel(value) : "");
  const [results, setResults] = useState<FlightPlace[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "empty">("idle");
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A parent that sets the place (trip prefill, saved origin) updates the visible text.
  useEffect(() => {
    if (value) setText(placeLabel(value));
  }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function type(next: string) {
    setText(next);
    onPick(null);
    clearTimeout(timer.current);
    const term = next.trim();
    if (term.length < 2) {
      setResults([]);
      setState("idle");
      setOpen(false);
      return;
    }
    setState("loading");
    setOpen(true);
    const mine = ++seq.current;
    timer.current = setTimeout(async () => {
      try {
        const response = await searchFlightPlaces({ data: { term } });
        if (mine !== seq.current) return;
        setResults(response.places);
        setState(response.places.length ? "idle" : "empty");
      } catch {
        if (mine === seq.current) setState("empty");
      }
    }, 300);
  }

  function pick(place: FlightPlace) {
    seq.current += 1;
    setText(placeLabel(place));
    setResults([]);
    setOpen(false);
    setState("idle");
    onPick(place);
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block px-1 text-[12px] font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        value={text}
        onChange={(event) => type(event.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
        placeholder="Kota atau bandara"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        className={inputClass}
      />
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl bg-surface p-1 shadow-lg ring-1 ring-border/60"
        >
          {state === "loading" && (
            <li className="px-3 py-2 text-[12px] text-muted-foreground">Mencari…</li>
          )}
          {state === "empty" && (
            <li className="px-3 py-2 text-[12px] text-muted-foreground">
              Kota atau bandara tidak ditemukan.
            </li>
          )}
          {results.map((place) => (
            <li key={place.code} role="option" aria-selected={value?.code === place.code}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(place)}
                className="tap flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left active:bg-black/[0.04]"
              >
                <Plane className="size-4 shrink-0 text-brand-red" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{place.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {place.countryName}
                    {place.type === "airport" ? " · Bandara" : ""}
                  </span>
                </span>
                <span className="text-[12px] font-bold text-muted-foreground">{place.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
