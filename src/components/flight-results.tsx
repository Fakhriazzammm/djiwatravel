import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ExternalLink, Pencil, Plane } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TravelpayoutsWidget } from "@/components/travelpayouts-widget";
import { btnRed, btnSoft } from "@/components/shell";
import { analyticsConsentGranted, CONSENT_EVENT } from "@/lib/cookie-consent";
import { trackClick } from "@/lib/analytics";
import {
  AVIASALES_CLICK_TARGET,
  EMBED_OPEN_TARGET,
  FLIGHT_STATUS_MESSAGE,
  compactFlightPrice,
  durationLabel,
  flightClock,
  flightDay,
  flightPriceStrip,
  formatFlightPrice,
  placeLabel,
  transfersLabel,
  type FlightOffer,
  type FlightPlace,
  type FlightSearchResult,
} from "@/lib/flights";

const EMBED_OK_KEY = "djiwa.flights.embed-ok";

const dayLabel = (key: string) => {
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? key
    : new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short" }).format(
        date,
      );
};
const shortDay = (key: string) => {
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? key
    : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(date);
};

/** True once the visitor agreed to load the third-party results (here or on the cookie notice). */
function useEmbedConsent() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const read = () => {
      let stored = false;
      try {
        stored = window.localStorage.getItem(EMBED_OK_KEY) === "1";
      } catch {
        stored = false;
      }
      setOk(stored || analyticsConsentGranted());
    };
    read();
    window.addEventListener(CONSENT_EVENT, read);
    return () => window.removeEventListener(CONSENT_EVENT, read);
  }, []);
  const grant = () => {
    try {
      window.localStorage.setItem(EMBED_OK_KEY, "1");
    } catch {
      // The choice only lasts for this visit when storage is blocked.
    }
    setOk(true);
  };
  return { ok, grant };
}

/**
 * Results screen of the flight search. Our header and price calendar sit on top; below them are
 * the full real-time results from the Travelpayouts White Label embedded in the page (after the
 * visitor agrees to load the third-party content), or, when no White Label is set up or it is
 * unavailable, the cheapest recorded fares as a list. The traveler books on the partner's site.
 */
export function FlightResults({
  origin,
  destination,
  depart,
  back,
  today,
  result,
  loading,
  widgetSrc,
  onBack,
  onPickDay,
}: {
  origin: FlightPlace;
  destination: FlightPlace;
  depart: string;
  back: string;
  today: string;
  result: FlightSearchResult | null;
  loading: boolean;
  /** Frame page of the White Label widget (full real-time results), or null when it is off. */
  widgetSrc: string | null;
  onBack: () => void;
  onPickDay: (day: string) => void;
}) {
  const offers = useMemo(() => result?.offers ?? [], [result]);
  const strip = useMemo(() => flightPriceStrip(offers, depart, today), [offers, depart, today]);
  const consent = useEmbedConsent();
  const [chosen, setChosen] = useState<FlightOffer | null>(null);
  const [directOnly, setDirectOnly] = useState(false);

  // Count each time the full results are opened (Admin shows this next to the clicks).
  useEffect(() => {
    if (widgetSrc && consent.ok) trackClick("/tiket", EMBED_OPEN_TARGET);
  }, [widgetSrc, consent.ok]);

  // With the full results on screen, "no recorded price" is not a dead end, so stay quiet about it.
  const statusMessage =
    result !== null &&
    result.status !== "ok" &&
    !(widgetSrc && (result.status === "empty" || result.status === "failed"))
      ? FLIGHT_STATUS_MESSAGE[result.status]
      : null;

  const list = offers
    .filter((offer) => !directOnly || offer.transfers === 0)
    .sort((a, b) => a.priceIdr - b.priceIdr)
    .slice(0, 12);

  return (
    <section aria-label="Hasil pencarian tiket" className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-border/40">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-red-soft text-brand-red">
          <Plane className="size-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            className="truncate text-[16px] font-bold leading-tight"
            title={`${origin.name} ke ${destination.name}`}
          >
            {placeLabel(origin)}
            <ArrowRight className="mx-1.5 inline size-4 text-muted-foreground" aria-hidden="true" />
            {placeLabel(destination)}
          </h2>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {dayLabel(depart)}
            {back ? ` – ${dayLabel(back)}` : " · sekali jalan"}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          aria-label="Ubah pencarian"
          className="tap inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full bg-secondary px-3 text-[12px] font-semibold"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          Ubah
        </button>
      </div>

      <div>
        <h3 className="px-1 text-[12px] font-semibold text-muted-foreground">
          Harga termurah per hari
        </h3>
        <div
          role="group"
          aria-label="Pilih tanggal berangkat"
          className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 py-1"
        >
          {strip.map((day) => {
            const selected = day.date === depart;
            return (
              <button
                key={day.date}
                type="button"
                aria-pressed={selected}
                onClick={() => onPickDay(day.date)}
                className={`tap flex min-h-11 min-w-[4.25rem] shrink-0 flex-col items-center justify-center rounded-xl px-2 ring-1 ${
                  selected ? "bg-brand-red-soft ring-brand-red" : "bg-surface ring-border/50"
                }`}
              >
                <span className="text-[10px] font-medium leading-tight text-muted-foreground">
                  {shortDay(day.date)}
                </span>
                <span
                  className={`text-[12px] font-bold leading-tight ${day.offer ? "text-success" : "text-muted-foreground"}`}
                >
                  {loading ? "…" : day.offer ? compactFlightPrice(day.offer.priceIdr) : "—"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {widgetSrc ? (
        consent.ok ? (
          <div className="space-y-2">
            <h3 className="px-1 text-[13px] font-bold">Semua penerbangan</h3>
            <TravelpayoutsWidget key={widgetSrc} src={widgetSrc} />
          </div>
        ) : (
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-border/40">
            <h3 className="text-[14px] font-bold">Lihat semua penerbangan</h3>
            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
              Hasil lengkap dimuat dari layanan mitra kami. Lanjutkan kalau kamu setuju.
            </p>
            <button type="button" onClick={consent.grant} className={`${btnRed} mt-3 w-full`}>
              Setuju dan buka
            </button>
          </div>
        )
      ) : null}

      {!loading && statusMessage && (
        <div role="status" className="rounded-2xl bg-surface p-5 text-center ring-1 ring-border/40">
          <Plane className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 text-[14px] font-semibold">{statusMessage}</p>
        </div>
      )}

      {/* Without the full results the recorded fares are the answer; with them they stay a quick view. */}
      {!loading && result?.status === "ok" && !widgetSrc && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[13px] font-bold">{list.length} harga termurah</h3>
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
          {list.length === 0 ? (
            <p className="rounded-2xl bg-surface p-4 text-center text-[13px] text-muted-foreground ring-1 ring-border/40">
              Tidak ada penerbangan langsung di hasil ini.
            </p>
          ) : (
            <ul className="space-y-2">
              {list.map((offer, index) => (
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
                        {offer.airlineName} · {offer.airline} {offer.flightNumber} ·{" "}
                        {transfersLabel(offer.transfers)}
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
        </div>
      )}

      <Sheet open={chosen !== null} onOpenChange={(open) => !open && setChosen(null)}>
        <SheetContent
          side="bottom"
          className="mx-auto w-full max-w-md rounded-t-[24px] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4"
        >
          {chosen && (
            <>
              <SheetHeader className="mb-3 text-left">
                <SheetTitle>{chosen.airlineName}</SheetTitle>
                <SheetDescription>
                  {chosen.airline} {chosen.flightNumber} · {chosen.origin}
                  <ArrowRight className="mx-1 inline size-3.5" aria-hidden="true" />
                  {chosen.destination} · {dayLabel(flightDay(chosen.departureAt))} ·{" "}
                  {flightClock(chosen.departureAt)} · {transfersLabel(chosen.transfers)}
                  {chosen.durationMinutes ? ` · ${durationLabel(chosen.durationMinutes)}` : ""}
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
                  onClick={() => trackClick("/tiket", AVIASALES_CLICK_TARGET)}
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
                Pembayaran dilakukan di Aviasales.
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
    </section>
  );
}
