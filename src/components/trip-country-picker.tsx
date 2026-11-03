import { Check, ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { searchCountries, TRIP_COUNTRIES, type TripCountry } from "@/lib/trip-countries";

/**
 * Country field for a new trip. Tapping it opens a bottom sheet with a search field and the full
 * country list. A sheet (not an inline dropdown) keeps the list out of the card's overflow clip.
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
  const results = useMemo(() => searchCountries(query).slice(0, 120), [query]);

  const pick = (country: TripCountry) => {
    onChange(country);
    setQuery("");
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="tap flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden="true">{selected?.flag}</span>
        <span className="truncate">{selected?.name ?? "Pilih negara"}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <SheetContent side="bottom" className="flex max-h-[85vh] flex-col rounded-t-[28px] p-0">
          <SheetHeader className="px-4 pb-2 pt-5 text-left">
            <SheetTitle className="text-[18px]">Pilih negara tujuan</SheetTitle>
            <SheetDescription className="text-[13px]">
              Ketik nama negara untuk mencari.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-3">
            <label className="flex h-11 items-center gap-2 rounded-xl bg-secondary px-3">
              <Search className="size-4 text-muted-foreground" aria-hidden="true" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari negara"
                aria-label="Cari negara"
                className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>
          <ul
            role="listbox"
            aria-label="Daftar negara"
            className="flex-1 overflow-y-auto border-t border-border/70 pb-[max(env(safe-area-inset-bottom),1rem)]"
          >
            {results.length === 0 && (
              <li className="px-4 py-3 text-center text-sm text-muted-foreground">
                Negara tidak ditemukan
              </li>
            )}
            {results.map((country) => (
              <li key={country.code} role="option" aria-selected={country.code === value}>
                <button
                  type="button"
                  onClick={() => pick(country)}
                  className="tap flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] active:bg-secondary"
                >
                  <span aria-hidden="true" className="text-xl">
                    {country.flag}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{country.name}</span>
                  {country.code === value && (
                    <Check className="size-5 text-brand-red" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
