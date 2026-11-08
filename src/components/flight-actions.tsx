import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Check, ExternalLink, Plane, Share2, Smartphone, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CustomerAuth } from "@/components/customer-auth";
import { btnRed, btnSoft } from "@/components/shell";
import { trackClick } from "@/lib/analytics";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";
import {
  createFlightAlert,
  createFlightShare,
  deleteFlightAlert,
  listFlightAlerts,
  saveFlightToTrip,
} from "@/lib/flights.fn";
import { getMyTripsHome } from "@/lib/my-trips.fn";
import {
  AVIASALES_CLICK_TARGET,
  ESIM_OFFER_TARGET,
  SAVE_TRIP_TARGET,
  durationLabel,
  flightClock,
  flightDay,
  formatFlightPrice,
  snapshotOffer,
  transfersLabel,
  type FlightOffer,
  type FlightOfferSnapshot,
  type FlightPlace,
  type FlightsConfig,
} from "@/lib/flights";

const sheetClass =
  "mx-auto w-full max-w-md rounded-t-[24px] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4";
const chip =
  "tap inline-flex min-h-8 items-center rounded-full px-3 text-[12px] font-semibold ring-1";

const dayLabel = (key: string) => {
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? key
    : new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short" }).format(
        date,
      );
};

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error && error.message && !/^\[|^\{/.test(error.message)
    ? error.message
    : fallback;

function SignInNote({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-secondary p-3 text-[12px] text-muted-foreground">
      <p>{text}</p>
      <div className="mt-2">
        <CustomerAuth size="compact" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- price alerts */

type Alert = Awaited<ReturnType<typeof listFlightAlerts>>["alerts"][number];

export function FlightAlertSheet({
  open,
  onClose,
  origin,
  destination,
  depart,
  back,
  refPriceIdr,
}: {
  open: boolean;
  onClose: () => void;
  origin: FlightPlace;
  destination: FlightPlace;
  depart: string;
  back: string;
  /** The cheapest recorded fare of the chosen day, used for the preset targets. */
  refPriceIdr: number | null;
}) {
  const { user, loading } = useBetterAuthUser();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [preset, setPreset] = useState<number | "custom">(20);
  const [custom, setCustom] = useState("");
  const [flexible, setFlexible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    let live = true;
    listFlightAlerts()
      .then((res) => live && setAlerts(res.alerts))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, user]);

  const target =
    preset === "custom"
      ? Number(custom.replace(/\D/g, ""))
      : refPriceIdr
        ? Math.round((refPriceIdr * (100 - preset)) / 100 / 1000) * 1000
        : 0;

  async function save() {
    if (!target || target < 50_000) {
      setMessage({ ok: false, text: "Isi target harga yang masuk akal." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { alert } = await createFlightAlert({
        data: {
          origin: origin.code,
          destination: destination.code,
          originName: origin.name,
          destinationName: destination.name,
          departureDate: depart,
          ...(back ? { returnDate: back } : {}),
          flexible,
          targetIdr: target,
        },
      });
      setAlerts((current) => [alert, ...current]);
      setMessage({
        ok: true,
        text: `Dipantau. Kami kabari lewat notifikasi bila harga ≤ ${formatFlightPrice(target)}.`,
      });
    } catch (error) {
      setMessage({ ok: false, text: errorText(error, "Belum bisa menyimpan pantauan.") });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setAlerts((current) => current.filter((item) => item.id !== id));
    await deleteFlightAlert({ data: { id } }).catch(() => undefined);
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className={sheetClass}>
        <SheetHeader className="mb-2 text-left">
          <SheetTitle className="text-[15px]">
            Pantau harga {origin.code} → {destination.code}
          </SheetTitle>
          <SheetDescription className="text-[12px]">
            {dayLabel(depart)}
            {back ? ` – ${dayLabel(back)}` : " · sekali jalan"}
            {refPriceIdr ? ` · harga tercatat ${formatFlightPrice(refPriceIdr)}` : ""}
          </SheetDescription>
        </SheetHeader>
        {!loading && !user ? (
          <SignInNote text="Masuk dulu agar kami bisa mengirim notifikasi saat harga turun." />
        ) : (
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Kabari saya bila harga
              </p>
              <div className="flex flex-wrap gap-1.5">
                {refPriceIdr &&
                  [10, 20].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      aria-pressed={preset === pct}
                      onClick={() => setPreset(pct)}
                      className={`${chip} ${preset === pct ? "bg-brand-red-soft text-brand-red ring-brand-red" : "bg-secondary ring-border/50"}`}
                    >
                      turun {pct}%
                    </button>
                  ))}
                <button
                  type="button"
                  aria-pressed={preset === "custom"}
                  onClick={() => setPreset("custom")}
                  className={`${chip} ${preset === "custom" ? "bg-brand-red-soft text-brand-red ring-brand-red" : "bg-secondary ring-border/50"}`}
                >
                  ≤ angka sendiri
                </button>
              </div>
              {preset === "custom" && (
                <input
                  inputMode="numeric"
                  value={custom}
                  onChange={(event) => setCustom(event.target.value)}
                  placeholder="Contoh: 3000000"
                  aria-label="Target harga dalam rupiah"
                  className="mt-2 min-h-10 w-full rounded-xl border border-border/70 bg-secondary/70 px-3 text-[14px] outline-none focus:border-brand-red"
                />
              )}
              {target > 0 && (
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  Target: {formatFlightPrice(target)}
                </p>
              )}
            </div>
            <label className="flex min-h-9 items-center gap-2 text-[13px] font-medium">
              <input
                type="checkbox"
                checked={flexible}
                onChange={(event) => setFlexible(event.target.checked)}
                className="size-4 accent-[var(--brand-red,#e5383b)]"
              />
              Fleksibel ±3 hari dari tanggal berangkat
            </label>
            {message && (
              <p
                role={message.ok ? "status" : "alert"}
                className={`text-[12px] font-medium ${message.ok ? "text-success" : "text-brand-red"}`}
              >
                {message.text}
              </p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className={`${btnRed} h-11 w-full text-[14px] disabled:opacity-50`}
            >
              {busy ? "Menyimpan…" : "Pantau harga"}
            </button>
            {alerts.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Pantauan aktif
                </p>
                <ul className="divide-y divide-border/40 rounded-xl bg-secondary/60">
                  {alerts.map((item) => (
                    <li key={item.id} className="flex min-h-12 items-center gap-2 px-3 py-2">
                      <Bell className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1 text-[12px]">
                        <span className="block truncate font-semibold">
                          {item.origin} → {item.destination} · {dayLabel(item.departure_date)}
                        </span>
                        <span className="block text-muted-foreground">
                          ≤ {formatFlightPrice(item.target_idr)}
                          {item.last_price_idr
                            ? ` · terakhir ${formatFlightPrice(item.last_price_idr)}`
                            : ""}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void remove(item.id)}
                        aria-label="Hapus pantauan"
                        className="tap grid size-9 place-items-center text-muted-foreground"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ---------------------------------------------------- detail, trip and eSIM */

type TripChoice = { id: string; name: string; departure_date: string | null };

export function FlightDetailSheet({
  offer,
  origin,
  destination,
  config,
  compared,
  onToggleCompare,
  onClose,
}: {
  offer: FlightOffer | null;
  origin: FlightPlace;
  destination: FlightPlace;
  config: FlightsConfig;
  compared: boolean;
  onToggleCompare: (snapshot: FlightOfferSnapshot) => void;
  onClose: () => void;
}) {
  const { user, loading } = useBetterAuthUser();
  const [trips, setTrips] = useState<TripChoice[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPicking(false);
    setSaved(null);
    setError(null);
  }, [offer?.id]);

  if (!offer) {
    return (
      <Sheet open={false}>
        <SheetContent side="bottom" className={sheetClass} />
      </Sheet>
    );
  }
  const originName = offer.origin === origin.code ? origin.name : offer.origin;
  const destinationName =
    offer.destination === destination.code ? destination.name : offer.destination;
  const snapshot = snapshotOffer(offer, originName, destinationName);
  const foreign = Boolean(
    destination.countryCode &&
    destination.countryCode !== "ID" &&
    offer.destination === destination.code,
  );

  async function openPicker() {
    setPicking(true);
    if (trips) return;
    try {
      const home = await getMyTripsHome();
      setTrips(
        home.trips
          .filter((trip) => trip.status !== "past")
          .map((trip) => ({
            id: trip.id,
            name: trip.name,
            departure_date: trip.departure_date,
          })),
      );
    } catch {
      setTrips([]);
    }
  }

  async function saveTo(tripId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await saveFlightToTrip({ data: { tripId, offer: snapshot } });
      trackClick("/tiket", SAVE_TRIP_TARGET);
      setSaved(`Tersimpan di Agenda ${res.dates.map((date) => dayLabel(date)).join(" dan ")}.`);
      setPicking(false);
    } catch (e) {
      setError(errorText(e, "Belum bisa menyimpan ke perjalanan."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className={`${sheetClass} max-h-[88dvh] overflow-y-auto`}>
        <SheetHeader className="mb-2 text-left">
          <SheetTitle className="text-[15px]">{offer.airlineName}</SheetTitle>
          <SheetDescription className="text-[12px]">
            {offer.airline} {offer.flightNumber} · {dayLabel(flightDay(offer.departureAt))} ·{" "}
            {flightClock(offer.departureAt)}
          </SheetDescription>
        </SheetHeader>
        <div className="rounded-xl bg-secondary/60 p-3 text-[12px]">
          <p className="flex items-center gap-1.5 font-semibold">
            <Plane className="size-4 text-brand-red" aria-hidden="true" />
            {originName} ({offer.origin}) → {destinationName} ({offer.destination})
          </p>
          <p className="mt-1 text-muted-foreground">
            {transfersLabel(offer.transfers)}
            {offer.durationMinutes ? ` · ${durationLabel(offer.durationMinutes)}` : ""}
            {offer.returnAt ? ` · pulang ${dayLabel(flightDay(offer.returnAt))}` : ""}
          </p>
          <p className="mt-1.5 text-[22px] font-extrabold leading-none text-success">
            {formatFlightPrice(offer.priceIdr)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Harga tercatat, bisa berubah.</p>
        </div>

        {config.saveToTrip && (
          <div className="mt-3">
            {saved ? (
              <p
                role="status"
                className="flex items-center gap-1.5 text-[13px] font-semibold text-success"
              >
                <Check className="size-4" aria-hidden="true" /> {saved}
              </p>
            ) : !loading && !user ? (
              <SignInNote text="Masuk untuk menyimpan penerbangan ke perjalananmu." />
            ) : picking ? (
              <div className="rounded-xl bg-secondary/60 p-2">
                <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Simpan ke
                </p>
                {trips === null ? (
                  <p className="px-1 py-2 text-[12px] text-muted-foreground">Memuat…</p>
                ) : trips.length === 0 ? (
                  <p className="px-1 py-2 text-[12px] text-muted-foreground">
                    Belum ada perjalanan.{" "}
                    <Link to="/my-trips/new" className="font-semibold text-brand-red">
                      Buat perjalanan
                    </Link>
                  </p>
                ) : (
                  <ul>
                    {trips.map((trip) => (
                      <li key={trip.id}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void saveTo(trip.id)}
                          className="tap flex min-h-11 w-full items-center justify-between rounded-lg px-2 text-left text-[13px] font-semibold disabled:opacity-50"
                        >
                          <span className="truncate">{trip.name}</span>
                          <span className="shrink-0 pl-2 text-[11px] font-normal text-muted-foreground">
                            {trip.departure_date ? dayLabel(trip.departure_date.slice(0, 10)) : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void openPicker()}
                className={`${btnRed} h-11 w-full text-[14px]`}
              >
                Simpan ke perjalanan
              </button>
            )}
            {error && (
              <p role="alert" className="mt-1.5 text-[12px] font-medium text-brand-red">
                {error}
              </p>
            )}
          </div>
        )}

        {config.esimOffer && foreign && (
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-secondary/60 p-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-red-soft text-brand-red">
              <Smartphone className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 text-[12px]">
              <span className="block font-semibold">eSIM {destination.countryName}</span>
              <span className="block text-muted-foreground">Data siap saat kamu mendarat.</span>
            </span>
            <Link
              to="/destination/$code"
              params={{ code: (destination.countryCode ?? "").toLowerCase() }}
              search={{ availability: "all" }}
              onClick={() => trackClick("/tiket", ESIM_OFFER_TARGET)}
              className="tap inline-flex min-h-9 shrink-0 items-center rounded-full bg-brand-red px-3 text-[12px] font-semibold text-white"
            >
              Lihat paket
            </Link>
          </div>
        )}

        <div className="mt-3 flex gap-2">
          {config.share && (
            <button
              type="button"
              aria-pressed={compared}
              onClick={() => onToggleCompare(snapshot)}
              className={`${btnSoft} h-11 flex-1 gap-1.5 text-[13px] ${compared ? "ring-1 ring-brand-red" : ""}`}
            >
              <Share2 className="size-4" aria-hidden="true" />
              {compared ? "Di pembanding" : "Bandingkan"}
            </button>
          )}
          {offer.bookingUrl ? (
            <a
              href={offer.bookingUrl}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={() => trackClick("/tiket", AVIASALES_CLICK_TARGET)}
              className={`${btnSoft} h-11 flex-1 gap-1.5 text-[13px]`}
            >
              Lanjut pesan
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Pemesanan dan pembayaran dilakukan di situs mitra.
        </p>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ compare */

export function CompareTray({
  items,
  onRemove,
  onClear,
}: {
  items: FlightOfferSnapshot[];
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const { user, loading } = useBetterAuthUser();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  if (items.length === 0) return null;

  async function share() {
    setBusy(true);
    setNote(null);
    try {
      const { token, days } = await createFlightShare({ data: { offers: items } });
      const url = `${window.location.origin}/bagikan-tiket/${token}`;
      let how = "Tautan disalin";
      try {
        if (navigator.share) {
          await navigator.share({ title: "Pilih tiket pesawat", url });
          how = "Tautan dibagikan";
        } else {
          await navigator.clipboard.writeText(url);
        }
      } catch {
        how = `Tautan: ${url}`;
      }
      setNote({ ok: true, text: `${how}. Berlaku ${days} hari.` });
    } catch (error) {
      setNote({ ok: false, text: errorText(error, "Belum bisa membuat tautan.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-surface p-3 ring-1 ring-border/40" aria-label="Pembanding tiket">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold">Pembanding ({items.length}/3)</h3>
        <button
          type="button"
          onClick={onClear}
          className="tap min-h-8 px-1 text-[12px] text-muted-foreground"
        >
          Kosongkan
        </button>
      </div>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex min-h-9 items-center gap-2 text-[12px]">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{item.airlineName || item.airline}</span> ·{" "}
              {dayLabel(item.departureAt.slice(0, 10))} · {formatFlightPrice(item.priceIdr)}
            </span>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              aria-label={`Hapus ${item.airlineName || item.airline}`}
              className="tap grid size-8 place-items-center text-muted-foreground"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {!loading && !user ? (
        <SignInNote text="Masuk untuk membuat tautan yang bisa dipilih teman." />
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void share()}
          className={`${btnRed} mt-2 h-10 w-full gap-1.5 text-[13px] disabled:opacity-50`}
        >
          <Share2 className="size-4" aria-hidden="true" />
          {busy ? "Membuat tautan…" : "Bagikan ke teman"}
        </button>
      )}
      {note && (
        <p
          role={note.ok ? "status" : "alert"}
          className={`mt-1.5 break-all text-[12px] font-medium ${note.ok ? "text-success" : "text-brand-red"}`}
        >
          {note.text}
        </p>
      )}
    </div>
  );
}
