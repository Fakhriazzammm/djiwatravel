import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, ChevronRight } from "lucide-react";
import { BackBar, Page } from "@/components/shell";
import { formatFlightPrice } from "@/lib/flights";
import { loadPublicFlightFares } from "@/lib/flights.fn";
import { FLIGHT_PRICE_NOTE, flightRouteUrl, type PublicFare } from "@/lib/public-flight-fares";
import { breadcrumbJsonLd, jsonLdScript, SEO_BASE_URL } from "@/lib/seo";

const departureDate = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" });
const checkedDate = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

export const Route = createFileRoute("/tiket_/$rute")({
  loader: async ({ params }) => {
    const [data] = await loadPublicFlightFares({ data: params.rute });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ name: "robots", content: "noindex" }] };
    const { route, fares } = loaderData;
    const url = flightRouteUrl(route);
    const name = `Tiket pesawat ${route.from} ke ${route.to}`;
    const description = `Cek tanggal dan harga indikatif tiket pesawat ${route.from} (${route.origin}) ke ${route.to} (${route.destination}) dalam Rupiah. Tarif dari Aviasales.`;
    return {
      meta: [
        { title: `${name} | Djiwa Travel` },
        { name: "description", content: description },
        { property: "og:title", content: name },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        jsonLdScript(
          breadcrumbJsonLd([
            { name: "Beranda", url: SEO_BASE_URL },
            { name: "Tiket pesawat", url: `${SEO_BASE_URL}/tiket` },
            { name, url },
          ]),
        ),
        ...(fares.length
          ? [
              jsonLdScript({
                "@context": "https://schema.org",
                "@type": "ItemList",
                name: "Referensi tarif Aviasales",
                description: FLIGHT_PRICE_NOTE,
                itemListElement: fares.map((fare, index) => ({
                  "@type": "ListItem",
                  position: index + 1,
                  item: {
                    "@type": "Trip",
                    name: `${fare.origin} ke ${fare.destination}`,
                    departureTime: fare.departureAt,
                    offers: {
                      "@type": "Offer",
                      price: fare.priceIdr,
                      priceCurrency: "IDR",
                      description: FLIGHT_PRICE_NOTE,
                      url: flightSearchUrl(
                        fare.origin,
                        fare.destination,
                        fare.departureAt.slice(0, 10),
                      ),
                    },
                  },
                })),
              }),
            ]
          : []),
      ],
    };
  },
  component: FlightRoutePage,
});

function flightSearchUrl(dari: string, ke: string, berangkat: string) {
  return `${SEO_BASE_URL}/tiket?${new URLSearchParams({ dari, ke, berangkat })}`;
}

function fareSearch(fare: PublicFare) {
  return { dari: fare.origin, ke: fare.destination, berangkat: fare.departureAt.slice(0, 10) };
}

function FlightRoutePage() {
  const { route, fares } = Route.useLoaderData();
  const [lowest, ...otherFares] = fares;
  const routeSearch = { dari: route.origin, ke: route.destination };
  const latestCheck = fares
    .map((fare) => fare.checkedAt)
    .sort()
    .at(-1);
  const checkedLabel = (value: string) => checkedDate.format(new Date(value));
  const lowestSearch = lowest ? fareSearch(lowest) : null;
  const hasMultipleChecks = new Set(fares.map((fare) => checkedLabel(fare.checkedAt))).size > 1;
  const describeFare = (fare: PublicFare) =>
    [
      fare.airlineName,
      fare.origin !== route.origin || fare.destination !== route.destination
        ? `${fare.origin} → ${fare.destination}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
  const dateLabel = (day: string) => departureDate.format(new Date(day));

  return (
    <Page>
      <BackBar title="Tiket pesawat" fallbackTo="/tiket" />
      <header>
        <h1 className="ios-title">
          {route.from} ke {route.to}
        </h1>
        <p className="ios-subtitle mt-1 flex items-center gap-2">
          <span>{route.origin}</span>
          <ArrowRight className="size-3" aria-label="ke" />
          <span>{route.destination}</span>
          <span aria-hidden="true">·</span>
          Sekali jalan
        </p>
      </header>

      {lowest && lowestSearch ? (
        <section className="ios-group mt-4 p-3 ring-1 ring-border/60" aria-labelledby="lowest-fare">
          <h2 id="lowest-fare" className="text-[11px] font-semibold text-muted-foreground">
            Harga terendah tercatat
          </h2>
          <p className="mt-1 text-[25px] leading-tight font-bold tracking-tight tabular-nums">
            {formatFlightPrice(lowest.priceIdr)}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[13px]">
              <time dateTime={lowestSearch.berangkat} className="block font-semibold">
                {dateLabel(lowestSearch.berangkat)}
              </time>
              {describeFare(lowest) && (
                <p className="text-[11px] text-muted-foreground">{describeFare(lowest)}</p>
              )}
            </div>
            <Link
              to="/tiket"
              search={lowestSearch}
              className="ios-btn min-h-11 shrink-0 bg-brand-red text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Cek harga
            </Link>
          </div>
        </section>
      ) : (
        <p role="status" className="ios-group mt-4 p-3 text-[13px] text-muted-foreground">
          Belum ada tarif referensi untuk rute ini. Pilih tanggal untuk mencari penerbangan.
        </p>
      )}

      {otherFares.length > 0 && (
        <section className="mt-4" aria-labelledby="other-fares">
          <h2 id="other-fares" className="ios-section-label">
            Tarif di tanggal lain
          </h2>
          <ul className="ios-group divide-y divide-border/70">
            {otherFares.map((fare) => {
              const search = fareSearch(fare);
              const day = dateLabel(search.berangkat);
              const price = formatFlightPrice(fare.priceIdr);
              return (
                <li key={fare.id}>
                  <Link
                    to="/tiket"
                    search={search}
                    aria-label={`Cek harga untuk ${day}, ${price}`}
                    className="ios-row justify-between focus-visible:bg-secondary"
                  >
                    <span className="min-w-0">
                      <time dateTime={search.berangkat} className="block text-sm font-semibold">
                        {day}
                      </time>
                      {describeFare(fare) && (
                        <span className="block break-words text-[11px] text-muted-foreground">
                          {describeFare(fare)}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-sm font-semibold tabular-nums">
                      {price}
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {latestCheck && (
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
          Tarif indikatif dari Aviasales. Cek harga dan kursi terbaru sebelum memesan.{" "}
          {hasMultipleChecks ? "Data terakhir diambil" : "Data diambil"}{" "}
          <time dateTime={latestCheck}>{checkedLabel(latestCheck)} WIB</time>.
        </p>
      )}

      <nav className="mt-3 flex flex-wrap gap-2" aria-label="Opsi perjalanan">
        <Link
          to="/tiket"
          search={routeSearch}
          className="ios-btn min-h-11 bg-surface ring-1 ring-border/60 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <CalendarDays className="size-4" aria-hidden="true" />
          Cari tanggal lain
        </Link>
        <Link
          to="/destination/$code"
          params={{ code: route.esim }}
          className="ios-btn min-h-11 text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          Lihat paket eSIM
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </nav>
    </Page>
  );
}
