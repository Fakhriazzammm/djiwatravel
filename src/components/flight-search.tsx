import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ExternalLink, Plane, Repeat2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FlightPlaceField } from "@/components/flight-place-field";
import { btnRed, btnSoft } from "@/components/shell";
import { searchFlightPlaces, searchFlights } from "@/lib/flights.fn";
import { trackClick } from "@/lib/analytics";
import {
  FLIGHT_STATUS_MESSAGE,
  compactFlightPrice,
  durationLabel,
  flightClock,
  flightDay,
  formatFlightPrice,
  parseFlightSearch,
  transfersLabel,
  type FlightOffer,
  type FlightPlace,
  type FlightSearchResult,
} from "@/lib/flights";

export type FlightPrefill = {
  from?: string | undefined;
  to?: string | undefined;
  /** A place name (a trip's destination) resolved to a city code before searching. */
  toText?: string | undefined;
  depart?: string | undefined;
  back?: string | undefined;
};

const ORIGIN_KEY = "djiwa.flights.origin";
const MAX_FILTER_TRANSFERS = 0;

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

const dayLabel = (key: string) => {
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? key
    : new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short" }).format(
        date,
      );
};

/**
 * The flight search: city pickers, dates, cheapest fares and a detail sheet that hands the traveler
 * to Aviasales (with our partner marker) to book. Djiwa never takes a flight payment. The form can
 * start filled from a trip (Ringkas) or from the saved origin, and runs once by itself when it is
 * complete so "Cari tiket" from a trip shows prices immediately.
 */
export function FlightSearch({ prefill }: { prefill: FlightPrefill }) {
  const today = useMemo(todayKey, []);
  const [origin, setOrigin] = useState<FlightPlace | null>(null);
  const [destination, setDestination] = useState<FlightPlace | null>(null);
  const [depart, setDepart] = useState(prefill.depart ?? "");
  const [back, setBack] = useState(prefill.back ?? "");
  const [oneWay, setOneWay] = useState(!prefill.back);
  const [directOnly, setDirectOnly] = useState(false);
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "done"; result: FlightSearchResult }
  >({ kind: "idle" });
  const [chosen, setChosen] = useState<FlightOffer | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const ran = useRef(false);

  async function run(
    from: FlightPlace,
    to: FlightPlace,
    departureDate: string,
    returnDate: string,
  ) {
    const input = parseFlightSearch(
      {
        origin: from.code,
        destination: to.code,
        departureDate,
        returnDate: returnDate || undefined,
      },
      today,
    );
    if (!input) {
      setFormError("Periksa kota dan tanggal. Tanggal pulang harus sesudah berangkat.");
      return;
    }
    setFormError(null);
    setState({ kind: "loading" });
    saveOrigin(from);
    try {
      const result = await searchFlights({ data: input });
      setState({ kind: "done", result });
    } catch {
      setState({ kind: "done", result: { status: "failed", offers: [] } });
    }
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
      if (!ran.current && savedOrigin && place && prefill.depart) {
        ran.current = true;
        void run(savedOrigin, place, prefill.depart, prefill.back ?? "");
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
    void run(origin, destination, depart, oneWay ? "" : back);
  }

  function swap() {
    setOrigin(destination);
    setDestination(origin);
  }

  const offers =
    state.kind === "done"
      ? state.result.offers.filter(
          (offer) => !directOnly || offer.transfers <= MAX_FILTER_TRANSFERS,
        )
      : [];

  return (
    <div className="space-y-3">
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
        <button
          type="submit"
          disabled={state.kind === "loading"}
          className={`${btnRed} w-full disabled:opacity-60`}
        >
          {state.kind === "loading" ? "Mencari…" : "Cari tiket"}
        </button>
      </form>

      {state.kind === "loading" && (
        <div role="status" aria-label="Mencari harga" className="space-y-2">
          {[0, 1, 2].map((n) => (
            <div
              key={n}
              className="h-16 animate-pulse rounded-2xl bg-secondary motion-reduce:animate-none"
            />
          ))}
        </div>
      )}

      {state.kind === "done" && state.result.status !== "ok" && (
        <div role="status" className="rounded-2xl bg-surface p-5 text-center ring-1 ring-border/40">
          <Plane className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 text-[14px] font-semibold">
            {FLIGHT_STATUS_MESSAGE[state.result.status]}
          </p>
        </div>
      )}

      {state.kind === "done" && state.result.status === "ok" && (
        <section aria-label="Hasil pencarian tiket" className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[13px] font-bold">
              {origin?.code} → {destination?.code} · {offers.length} harga
            </h2>
            <label className="flex items-center gap-1.5 text-[12px] font-medium">
              <input
                type="checkbox"
                checked={directOnly}
                onChange={(event) => setDirectOnly(event.target.checked)}
                className="size-4 accent-[var(--brand-red,#e5383b)]"
              />
              Langsung saja
            </label>
          </div>
          {offers.length === 0 ? (
            <p className="rounded-2xl bg-surface p-4 text-center text-[13px] text-muted-foreground ring-1 ring-border/40">
              Tidak ada penerbangan langsung di hasil ini.
            </p>
          ) : (
            <ul className="space-y-2">
              {offers.map((offer, index) => (
                <li key={offer.id}>
                  <button
                    type="button"
                    onClick={() => setChosen(offer)}
                    className="tap flex min-h-16 w-full items-center gap-3 rounded-2xl bg-surface p-3 text-left ring-1 ring-border/40"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-red-soft text-[11px] font-bold text-brand-red">
                      {offer.airline || "✈"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold">
                        {flightClock(offer.departureAt)} · {dayLabel(flightDay(offer.departureAt))}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {offer.airline} {offer.flightNumber} · {transfersLabel(offer.transfers)}
                        {offer.durationMinutes ? ` · ${durationLabel(offer.durationMinutes)}` : ""}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[15px] font-extrabold text-success">
                        {compactFlightPrice(offer.priceIdr)}
                      </span>
                      {index === 0 && (
                        <span className="block text-[10px] font-semibold text-brand-red">
                          Termurah
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="px-1 text-[11px] text-muted-foreground">
            Harga dari data Aviasales dan bisa berubah saat kamu memesan.
          </p>
        </section>
      )}

      <Sheet open={chosen !== null} onOpenChange={(open) => !open && setChosen(null)}>
        <SheetContent
          side="bottom"
          className="mx-auto w-full max-w-md rounded-t-[24px] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4"
        >
          {chosen && (
            <>
              <SheetHeader className="mb-3 text-left">
                <SheetTitle>
                  {chosen.airline} {chosen.flightNumber} · {chosen.origin}
                  <ArrowRight className="mx-1 inline size-4" aria-hidden="true" />
                  {chosen.destination}
                </SheetTitle>
                <SheetDescription>
                  {dayLabel(flightDay(chosen.departureAt))} · {flightClock(chosen.departureAt)} ·{" "}
                  {transfersLabel(chosen.transfers)}
                  {chosen.durationMinutes ? ` · ${durationLabel(chosen.durationMinutes)}` : ""}
                  {chosen.returnAt ? ` · pulang ${dayLabel(flightDay(chosen.returnAt))}` : ""}
                </SheetDescription>
              </SheetHeader>
              <p className="text-[24px] font-extrabold text-success">
                {formatFlightPrice(chosen.priceIdr)}
              </p>
              {chosen.bookingUrl ? (
                <a
                  href={chosen.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  onClick={() => trackClick("/tiket", "flights_aviasales")}
                  className={`${btnRed} mt-3 flex w-full items-center justify-center gap-1.5`}
                >
                  Lihat & pesan di Aviasales
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              ) : (
                <p className="mt-3 text-[13px] text-muted-foreground">
                  Tautan pemesanan tidak tersedia untuk penerbangan ini.
                </p>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Pembayaran dilakukan di Aviasales. Djiwa dapat komisi tanpa biaya tambahan untukmu.
              </p>
              <button
                type="button"
                onClick={() => setChosen(null)}
                className={`${btnSoft} mt-3 w-full`}
              >
                Tutup
              </button>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
