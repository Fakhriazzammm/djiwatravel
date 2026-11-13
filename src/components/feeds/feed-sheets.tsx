import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getMyTrips } from "@/lib/my-trips.fn";
import { reportFeedPost, saveFeedPostToAgenda } from "@/lib/feeds.fn";
import { FEED_REPORT_LABEL, FEED_REPORT_REASONS, type FeedReportReason } from "@/lib/feeds";

const sheetClass =
  "mx-auto max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-5";
const primary =
  "tap inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-brand-red px-4 text-[14px] font-semibold text-white disabled:opacity-40";
const secondary =
  "tap inline-flex min-h-9 w-full items-center justify-center rounded-xl bg-secondary px-4 text-[13px] font-semibold";

function Grab() {
  return <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-muted-foreground/25" aria-hidden />;
}

/** "Kenapa dilaporkan?": the report is stored and the post is hidden from the reporter at once. */
export function FeedReportSheet({
  postId,
  open,
  onOpenChange,
  onReported,
}: {
  postId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReported: () => void;
}) {
  const [reason, setReason] = useState<FeedReportReason | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) setReason(null);
  }, [open]);
  async function send() {
    if (!reason) return;
    setBusy(true);
    try {
      await reportFeedPost({ data: { postId, reason } });
      onOpenChange(false);
      onReported();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Laporan belum terkirim.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className={sheetClass}>
        <Grab />
        <SheetHeader className="p-0 text-left">
          <SheetTitle className="text-[16px]">Kenapa dilaporkan?</SheetTitle>
          <SheetDescription className="text-[12px]">
            Laporanmu sampai ke tim Djiwa. Postingan ini disembunyikan dari kamu.
          </SheetDescription>
        </SheetHeader>
        <div role="radiogroup" aria-label="Alasan laporan" className="ios-group mt-3">
          {FEED_REPORT_REASONS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={reason === value}
              onClick={() => setReason(value)}
              className="ios-row w-full border-t border-border/60 text-left text-[14px] first:border-t-0"
            >
              <span className="flex-1">{FEED_REPORT_LABEL[value]}</span>
              <span
                className={`size-[18px] rounded-full border-2 ${reason === value ? "border-brand-red bg-brand-red" : "border-border"}`}
                aria-hidden
              />
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          <button type="button" className={primary} disabled={!reason || busy} onClick={send}>
            Kirim laporan
          </button>
          <button type="button" className={secondary} onClick={() => onOpenChange(false)}>
            Batal
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

type TripRow = {
  id: string;
  name: string;
  destination_name?: string | null;
  departure_date: string | null;
  return_date: string | null;
};

/** Adds the post's place to one of the traveler's trips as an Agenda item. */
export function FeedSaveSheet({
  postId,
  placeName,
  open,
  onOpenChange,
  signedIn,
}: {
  postId: string;
  placeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signedIn: boolean;
}) {
  const [trips, setTrips] = useState<TripRow[] | null>(null);
  const [tripId, setTripId] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !signedIn) return;
    let live = true;
    setTrips(null);
    getMyTrips()
      .then((rows) => {
        if (!live) return;
        const list = (rows as TripRow[]).filter((t) => t.departure_date);
        setTrips(list);
        const first = list[0];
        if (first) {
          setTripId(first.id);
          setDate(first.departure_date ?? "");
        }
      })
      .catch(() => live && setTrips([]));
    return () => {
      live = false;
    };
  }, [open, signedIn]);

  const trip = trips?.find((t) => t.id === tripId);
  const inRange =
    !trip || !date || (date >= (trip.departure_date ?? "") && date <= (trip.return_date ?? "9999"));

  async function save() {
    if (!trip || !date) return;
    setBusy(true);
    setError("");
    try {
      await saveFeedPostToAgenda({ data: { postId, tripId: trip.id, activityDate: date } });
      onOpenChange(false);
      toast.success(`Tersimpan ke Agenda ${trip.name}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Belum bisa menyimpan ke Agenda.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className={sheetClass}>
        <Grab />
        <SheetHeader className="p-0 text-left">
          <SheetTitle className="text-[16px]">Simpan ke Agenda</SheetTitle>
          <SheetDescription className="text-[12px]">
            {placeName} akan ditambahkan sebagai satu item Agenda.
          </SheetDescription>
        </SheetHeader>
        {!signedIn ? (
          <p className="mt-3 text-[13px] text-muted-foreground">
            Masuk dulu untuk menyimpan ke Agenda.
          </p>
        ) : trips === null ? (
          <p role="status" className="mt-3 text-[13px] text-muted-foreground">
            Memuat perjalananmu…
          </p>
        ) : trips.length === 0 ? (
          <div className="mt-3 text-[13px] text-muted-foreground">
            Kamu belum punya perjalanan.{" "}
            <Link to="/my-trips/new" className="font-semibold text-brand-red">
              Buat perjalanan
            </Link>
          </div>
        ) : (
          <>
            <div role="radiogroup" aria-label="Pilih perjalanan" className="ios-group mt-3">
              {trips.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={tripId === t.id}
                  onClick={() => {
                    setTripId(t.id);
                    setDate(t.departure_date ?? "");
                  }}
                  className="ios-row w-full border-t border-border/60 text-left first:border-t-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{t.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {t.departure_date} – {t.return_date}
                    </span>
                  </span>
                  <span
                    className={`size-[18px] rounded-full border-2 ${tripId === t.id ? "border-brand-red bg-brand-red" : "border-border"}`}
                    aria-hidden
                  />
                </button>
              ))}
            </div>
            <label className="mt-3 block text-[12px] font-medium text-muted-foreground">
              Tanggal
              <input
                type="date"
                value={date}
                min={trip?.departure_date ?? undefined}
                max={trip?.return_date ?? undefined}
                onChange={(event) => setDate(event.target.value)}
                className="mt-1 block min-h-10 w-full rounded-xl border border-border bg-background px-3 text-[14px] text-foreground"
              />
            </label>
            {!inRange && (
              <p role="alert" className="mt-2 text-[12px] text-destructive">
                Pilih tanggal di dalam perjalanan.
              </p>
            )}
            {error && (
              <p role="alert" className="mt-2 text-[12px] text-destructive">
                {error}
              </p>
            )}
            <div className="mt-3 space-y-2">
              <button
                type="button"
                className={primary}
                disabled={!trip || !date || !inRange || busy}
                onClick={save}
              >
                Simpan
              </button>
              <button type="button" className={secondary} onClick={() => onOpenChange(false)}>
                Batal
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
