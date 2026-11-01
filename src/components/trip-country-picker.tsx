import { Check, ChevronDown, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { searchCountries, TRIP_COUNTRIES, type TripCountry } from "@/lib/trip-countries";

/**
 * Searchable country field for a new trip: type to filter the full country list, then pick from
 * the dropdown. Keyboard: arrows move, Enter picks, Escape closes.
 */
export function TripCountryPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (country: TripCountry) => void;
}) {
  const selected = TRIP_COUNTRIES.find((c) => c.code === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const results = useMemo(() => searchCountries(query).slice(0, 80), [query]);

  const pick = (country: TripCountry) => {
    onChange(country);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-end gap-1.5 text-right text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden="true">{selected?.flag}</span>
        <span className="truncate">{selected?.name ?? "Pilih negara"}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(18rem,80vw)] overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-[0_16px_40px_-12px_rgb(0_0_0/0.25)]">
          <label className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
            <Search className="size-4 text-muted-foreground" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((i) => Math.min(i + 1, results.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (event.key === "Enter" && results[active]) {
                  event.preventDefault();
                  pick(results[active]);
                } else if (event.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="Cari negara"
              aria-label="Cari negara"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          <ul id={listId} role="listbox" aria-label="Daftar negara" className="max-h-64 overflow-y-auto py-1">
            {results.length === 0 && (
              <li className="px-3 py-3 text-center text-sm text-muted-foreground">
                Negara tidak ditemukan
              </li>
            )}
            {results.map((country, index) => (
              <li
                key={country.code}
                role="option"
                aria-selected={country.code === value}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(country);
                }}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm ${
                  index === active ? "bg-secondary" : ""
                }`}
              >
                <span aria-hidden="true" className="text-base">{country.flag}</span>
                <span className="min-w-0 flex-1 truncate">{country.name}</span>
                {country.code === value && <Check className="size-4 text-brand-red" aria-hidden="true" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
