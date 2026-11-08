import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plane, ThumbsUp } from "lucide-react";
import { BackBar, Page, btnRed } from "@/components/shell";
import { CustomerAuth } from "@/components/customer-auth";
import { getFlightShare, voteFlightShare } from "@/lib/flights.fn";
import {
  durationLabel,
  flightClock,
  flightDay,
  formatFlightPrice,
  transfersLabel,
} from "@/lib/flights";

export const Route = createFileRoute("/bagikan-tiket/$token")({
  loader: async ({ params }) => {
    try {
      return await getFlightShare({ data: { token: params.token } });
    } catch {
      return null;
    }
  },
  head: () => ({
    meta: [
      { title: "Pilih tiket pesawat — Djiwa Travel" },
      { name: "description", content: "Pilihan tiket pesawat yang dibagikan lewat Djiwa Travel." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SharedFlights,
});

const dayLabel = (key: string) => {
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? key
    : new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short" }).format(
        date,
      );
};

function SharedFlights() {
  const data = Route.useLoaderData();
  const { token } = Route.useParams();
  const [counts, setCounts] = useState<Record<string, number>>(data?.counts ?? {});
  const [mine, setMine] = useState<string | null>(data?.mine ?? null);
  const [error, setError] = useState<string | null>(null);

  if (!data) {
    return (
      <Page>
        <BackBar title="Pilih tiket" />
        <div className="mt-3 rounded-2xl bg-surface p-4 text-center ring-1 ring-border/40">
          <Plane className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 text-[14px] font-semibold">Tautan ini sudah tidak berlaku.</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Minta temanmu membagikan ulang, atau cari tiketmu sendiri.
          </p>
          <Link
            to="/tiket"
            className={`${btnRed} mt-3 inline-flex w-full items-center justify-center`}
          >
            Cari tiket
          </Link>
        </div>
      </Page>
    );
  }

  async function vote(offerId: string) {
    setError(null);
    const before = { counts, mine };
    setCounts((current) => {
      const next = { ...current };
      if (mine) next[mine] = Math.max(0, (next[mine] ?? 1) - 1);
      next[offerId] = (next[offerId] ?? 0) + (mine === offerId ? 0 : 1);
      return next;
    });
    setMine(offerId);
    try {
      await voteFlightShare({ data: { token, offerId } });
    } catch {
      setCounts(before.counts);
      setMine(before.mine);
      setError("Suara belum tersimpan. Coba lagi.");
    }
  }

  const top = Math.max(0, ...Object.values(counts));
  return (
    <Page>
      <BackBar title="Pilih tiket" />
      <p className="mt-2 px-1 text-[12px] text-muted-foreground">
        Temanmu membagikan {data.offers.length} pilihan. Ketuk satu untuk memberi suara. Harga
        tercatat dan bisa berubah.
      </p>
      <ul className="mt-3 space-y-2">
        {data.offers.map((offer) => {
          const picked = mine === offer.id;
          const n = counts[offer.id] ?? 0;
          return (
            <li key={offer.id} className="rounded-2xl bg-surface p-3 ring-1 ring-border/40">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">
                    {offer.airlineName || offer.airline} · {offer.airline}
                    {offer.flightNumber}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {offer.originName} ({offer.origin}) → {offer.destinationName} (
                    {offer.destination})
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {dayLabel(flightDay(offer.departureAt))} · {flightClock(offer.departureAt)} ·{" "}
                    {transfersLabel(offer.transfers)}
                    {offer.durationMinutes ? ` · ${durationLabel(offer.durationMinutes)}` : ""}
                  </p>
                </div>
                <p className="text-[15px] font-extrabold text-success">
                  {formatFlightPrice(offer.priceIdr)}
                </p>
              </div>
              {data.signedIn ? (
                <button
                  type="button"
                  aria-pressed={picked}
                  onClick={() => void vote(offer.id)}
                  className={`tap mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold ring-1 ${
                    picked
                      ? "bg-brand-red-soft text-brand-red ring-brand-red"
                      : "bg-secondary ring-border/50"
                  }`}
                >
                  <ThumbsUp className="size-3.5" aria-hidden="true" />
                  {picked ? "Pilihanmu" : "Pilih ini"} · {n}
                  {n > 0 && n === top ? " · terbanyak" : ""}
                </button>
              ) : (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  {n} suara{n > 0 && n === top ? " · terbanyak" : ""}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-2 px-1 text-[12px] font-medium text-brand-red">
          {error}
        </p>
      )}
      {!data.signedIn && (
        <div className="mt-3 rounded-2xl bg-secondary p-3 text-[12px] text-muted-foreground">
          <p>Masuk untuk memberi suara.</p>
          <div className="mt-2">
            <CustomerAuth size="compact" />
          </div>
        </div>
      )}
      <Link
        to="/tiket"
        className="tap mt-3 flex min-h-11 items-center justify-center text-[13px] font-semibold text-brand-red"
      >
        Cari tiket sendiri
      </Link>
    </Page>
  );
}
