import { createFileRoute } from "@tanstack/react-router";
import { BackBar, Page } from "@/components/shell";
import { FlightSearch } from "@/components/flight-search";
import { getFlightsStatus } from "@/lib/flights.fn";
import { DEFAULT_FLIGHTS_CONFIG } from "@/lib/flights";
import { getMyTripsHome } from "@/lib/my-trips.fn";

type FlightsSearch = {
  dari?: string;
  ke?: string;
  tujuan?: string;
  berangkat?: string;
  pulang?: string;
};

const code = /^[A-Za-z]{3}$/;
const day = /^\d{4}-\d{2}-\d{2}$/;
const clean = (value: unknown, pattern: RegExp) =>
  typeof value === "string" && pattern.test(value) ? value : undefined;
const textParam = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 60) : undefined;

/**
 * One search page for every entry point: the Home hero tab, the Home/Explore tile and Ringkas.
 * Entry points only differ in what they pass: nothing (the page then uses the traveler's next trip),
 * or `tujuan` / `berangkat` / `pulang` from a trip.
 */
export const Route = createFileRoute("/tiket")({
  validateSearch: (search: Record<string, unknown>): FlightsSearch => {
    const out: FlightsSearch = {};
    const dari = clean(search["dari"], code)?.toUpperCase();
    const ke = clean(search["ke"], code)?.toUpperCase();
    const tujuan = textParam(search["tujuan"]);
    const berangkat = clean(search["berangkat"], day);
    const pulang = clean(search["pulang"], day);
    if (dari) out.dari = dari;
    if (ke) out.ke = ke;
    if (tujuan) out.tujuan = tujuan;
    if (berangkat) out.berangkat = berangkat;
    if (pulang) out.pulang = pulang;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Cari tiket pesawat — Djiwa Travel" },
      {
        name: "description",
        content: "Bandingkan harga tiket pesawat termurah lalu pesan di Aviasales.",
      },
    ],
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const status = await getFlightsStatus().catch(() => ({
      config: DEFAULT_FLIGHTS_CONFIG,
      available: false,
    }));
    // Opened without a trip (the tile): borrow the traveler's next trip, when there is one.
    let prefill = {
      from: deps.dari,
      to: deps.ke,
      toText: deps.tujuan,
      depart: deps.berangkat,
      back: deps.pulang,
      autoSearch: Boolean(deps.ke || deps.tujuan),
    };
    if (!deps.ke && !deps.tujuan) {
      try {
        const home = await getMyTripsHome();
        const trip = home.trips.find((t) => t.status !== "past" && t.departure_date);
        if (trip) {
          prefill = {
            ...prefill,
            toText: trip.destination_name,
            depart: trip.departure_date ?? undefined,
            back: trip.return_date ?? undefined,
            autoSearch: false,
          };
        }
      } catch {
        // No session or no trips: the form simply starts empty.
      }
    }
    return { status, prefill };
  },
  component: FlightsPage,
});

function FlightsPage() {
  const { status, prefill } = Route.useLoaderData();
  return (
    <Page>
      <BackBar title="Tiket pesawat" fallbackTo="/" />
      {status.available ? (
        <FlightSearch prefill={prefill} config={status.config} />
      ) : (
        <div role="status" className="rounded-2xl bg-surface p-6 text-center ring-1 ring-border/40">
          <p className="text-[15px] font-semibold">Pencarian tiket belum tersedia</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Fitur ini sedang disiapkan. Coba lagi nanti.
          </p>
        </div>
      )}
    </Page>
  );
}
