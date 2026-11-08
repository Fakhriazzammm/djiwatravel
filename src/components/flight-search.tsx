import { useEffect, useMemo, useRef, useState } from "react";
import { Repeat2 } from "lucide-react";
import { FlightPlaceField } from "@/components/flight-place-field";
import { FlightResults } from "@/components/flight-results";
import { btnRed } from "@/components/shell";
import { searchFlightPlaces, searchFlights } from "@/lib/flights.fn";
import {
  combineRoundTrip,
  daysBetween,
  parseFlightSearch,
  shiftFlightDay,
  whiteLabelFrameSrc,
  whiteLabelSearchCode,
  type FlightPlace,
  type FlightSearchResult,
  type FlightsConfig,
} from "@/lib/flights";

export type FlightPrefill = {
  from?: string | undefined;
  to?: string | undefined;
  /** A place name (a trip's destination) resolved to a city code before searching. */
  toText?: string | undefined;
  depart?: string | undefined;
  back?: string | undefined;
  /** Generic entry points may show a trip prefill without immediately running the search. */
  autoSearch?: boolean | undefined;
};

const ORIGIN_KEY = "djiwa.flights.origin";

const inputClass =
  "min-h-11 w-full min-w-0 rounded-xl border border-border/70 bg-secondary/70 px-3 text-[14px] outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/15";

function readOrigin(): FlightPlace | null {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(ORIGIN_KEY) ?? "null",
    ) as FlightPlace | null;
    return parsed && /^[A-Z]{3}$/.test(parsed.code) && typeof parsed.name === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function saveOrigin(place: FlightPlace) {
  try {
    window.localStorage.setItem(ORIGIN_KEY, JSON.stringify(place));
  } catch {
    // Storage can be blocked; the search itself does not depend on it.
  }
}

/** A city code or a name to its best place; null when the lookup finds nothing. */
async function resolvePlace(term: string): Promise<FlightPlace | null> {
  try {
    const { places } = await searchFlightPlaces({ data: { term } });
    const code = term.toUpperCase();
    return places.find((place) => place.code === code) ?? places[0] ?? null;
  } catch {
    return null;
  }
}

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

type Searched = { from: FlightPlace; to: FlightPlace; depart: string; back: string };

/**
 * The flight search: a form (it starts filled from a trip or the saved origin and runs by itself
 * when complete), then a results screen with our header, a price calendar, and the full
 * real-time results from the White Label when Admin set it up. Djiwa never takes a flight payment.
 */
export function FlightSearch({
  prefill,
  config,
}: {
  prefill: FlightPrefill;
  config: FlightsConfig;
}) {
  const today = useMemo(todayKey, []);
  const [origin, setOrigin] = useState<FlightPlace | null>(null);
  const [destination, setDestination] = useState<FlightPlace | null>(null);
  const [depart, setDepart] = useState(prefill.depart ?? "");
  const [back, setBack] = useState(prefill.back ?? "");
  const [oneWay, setOneWay] = useState(!prefill.back);
  const [formError, setFormError] = useState<string | null>(null);
  const [searched, setSearched] = useState<Searched | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FlightSearchResult | null>(null);
  const loadedMonth = useRef<string>("");
  const ran = useRef(false);

  /** One call per route and month feeds the whole price calendar. */
  async function loadMonth(from: FlightPlace, to: FlightPlace, day: string, returnDay = "") {
    const month = day.slice(0, 7);
    const stay = returnDay ? daysBetween(day, returnDay) : 0;
    const key = `${from.code}-${to.code}-${month}-${returnDay ? `${returnDay.slice(0, 7)}-${stay}` : ""}`;
    if (loadedMonth.current === key) return;
    const outbound = parseFlightSearch(
      { origin: from.code, destination: to.code, departureDate: month },
      today,
    );
    // A round trip is priced as two one-way legs (the provider holds almost no round-trip fares).
    const inbound = returnDay
      ? parseFlightSearch(
          { origin: to.code, destination: from.code, departureDate: returnDay.slice(0, 7) },
          today,
        )
      : null;
    if (!outbound || (returnDay && !inbound)) {
      setResult({ status: "invalid", offers: [] });
      return;
    }
    loadedMonth.current = key;
    setLoading(true);
    try {
      const there = await searchFlights({ data: outbound });
      if (!inbound) {
        setResult(there);
      } else {
        const back = await searchFlights({ data: inbound });
        if (there.status !== "ok" || back.status !== "ok") {
          setResult({ status: there.status === "ok" ? back.status : there.status, offers: [] });
        } else {
          const offers = combineRoundTrip(there.offers, back.offers, stay);
          setResult({ status: offers.length ? "ok" : "empty", offers });
        }
      }
    } catch {
      loadedMonth.current = "";
      setResult({ status: "failed", offers: [] });
    } finally {
      setLoading(false);
    }
  }

  function start(from: FlightPlace, to: FlightPlace, departureDate: string, returnDate: string) {
    const valid = parseFlightSearch(
      {
        origin: from.code,
        destination: to.code,
        departureDate,
        returnDate: returnDate || undefined,
      },
      today,
    );
    if (!valid) {
      setFormError("Periksa kota dan tanggal. Tanggal pulang harus sesudah berangkat.");
      return;
    }
    setFormError(null);
    saveOrigin(from);
    setSearched({ from, to, depart: departureDate, back: returnDate });
    void loadMonth(from, to, departureDate, returnDate);
  }

  // Resolve the prefill (saved origin, trip destination) once, then run if the form is complete.
  useEffect(() => {
    let live = true;
    void (async () => {
      const savedOrigin = prefill.from ? await resolvePlace(prefill.from) : readOrigin();
      const target = prefill.to ?? prefill.toText;
      const place = target ? await resolvePlace(target) : null;
      if (!live) return;
      if (savedOrigin) setOrigin(savedOrigin);
      if (place) setDestination(place);
      if (prefill.autoSearch !== false && !ran.current && savedOrigin && place && prefill.depart) {
        ran.current = true;
        start(savedOrigin, place, prefill.depart, prefill.back ?? "");
      }
    })();
    return () => {
      live = false;
    };
    // The prefill comes from the URL once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!origin || !destination) {
      setFormError("Pilih kota asal dan tujuan dari daftar.");
      return;
    }
    if (!depart) {
      setFormError("Pilih tanggal berangkat.");
      return;
    }
    start(origin, destination, depart, oneWay ? "" : back);
  }

  function swap() {
    setOrigin(destination);
    setDestination(origin);
  }

  /** Picking another day moves a round trip's return by the same number of days. */
  function pickDay(day: string) {
    if (!searched) return;
    const delta = Math.round(
      (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${searched.depart}T00:00:00Z`)) / 86400000,
    );
    const nextBack = searched.back ? shiftFlightDay(searched.back, delta) : "";
    setDepart(day);
    setBack(nextBack);
    setSearched({ ...searched, depart: day, back: nextBack });
    void loadMonth(searched.from, searched.to, day, nextBack);
  }

  if (searched) {
    const widgetSrc = whiteLabelFrameSrc(
      config,
      whiteLabelSearchCode({
        origin: searched.from.code,
        destination: searched.to.code,
        departureDate: searched.depart,
        ...(searched.back ? { returnDate: searched.back } : {}),
      }),
    );
    return (
      <FlightResults
        origin={searched.from}
        destination={searched.to}
        depart={searched.depart}
        back={searched.back}
        today={today}
        result={result}
        loading={loading}
        widgetSrc={widgetSrc}
        config={config}
        onBack={() => setSearched(null)}
        onPickDay={pickDay}
      />
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-2.5 rounded-2xl bg-surface p-3 ring-1 ring-border/40"
    >
      <FlightPlaceField id="flight-from" label="Dari" value={origin} onPick={setOrigin} />
      <div className="flex justify-center">
        <button
          type="button"
          onClick={swap}
          aria-label="Tukar asal dan tujuan"
          className="tap grid size-8 place-items-center rounded-full bg-secondary text-muted-foreground"
        >
          <Repeat2 className="size-4" aria-hidden="true" />
        </button>
      </div>
      <FlightPlaceField id="flight-to" label="Ke" value={destination} onPick={setDestination} />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block px-1 text-[12px] font-medium text-muted-foreground">
            Berangkat
          </span>
          <input
            type="date"
            min={today}
            value={depart}
            onChange={(event) => setDepart(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block px-1 text-[12px] font-medium text-muted-foreground">
            Pulang
          </span>
          <input
            type="date"
            min={depart || today}
            value={oneWay ? "" : back}
            disabled={oneWay}
            onChange={(event) => setBack(event.target.value)}
            className={`${inputClass} disabled:opacity-40`}
          />
        </label>
      </div>
      <label className="flex min-h-9 items-center gap-2 px-1 text-[13px] font-medium">
        <input
          type="checkbox"
          checked={oneWay}
          onChange={(event) => setOneWay(event.target.checked)}
          className="size-4 accent-[var(--brand-red,#e5383b)]"
        />
        Sekali jalan
      </label>
      {formError && (
        <p role="alert" className="px-1 text-[12px] font-medium text-brand-red">
          {formError}
        </p>
      )}
      <button type="submit" className={`${btnRed} w-full`}>
        Cari tiket
      </button>
    </form>
  );
}
