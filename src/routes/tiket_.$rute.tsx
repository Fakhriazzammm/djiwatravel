import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { BackBar, Page } from "@/components/shell";
import { formatFlightPrice } from "@/lib/flights";
import { loadPublicFlightFares } from "@/lib/flights.fn";
import { FLIGHT_PRICE_NOTE, flightRouteUrl } from "@/lib/public-flight-fares";
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

function FlightRoutePage() {
  const { route, fares } = Route.useLoaderData();
  return (
    <Page>
      <BackBar title="Tiket pesawat" fallbackTo="/tiket" />
      <h1 className="ios-title">
        Tiket pesawat {route.from} ke {route.to}
      </h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {route.origin} → {route.destination}. {FLIGHT_PRICE_NOTE}
      </p>
      {fares.length ? (
        <ul className="ios-group mt-4 divide-y divide-border" aria-label="Tarif sekali jalan">
          {fares.map((fare) => {
            const day = fare.departureAt.slice(0, 10);
            return (
              <li key={fare.id}>
                <Link
                  to="/tiket"
                  search={{ dari: fare.origin, ke: fare.destination, berangkat: day }}
                  className="ios-row flex min-h-12 items-center justify-between gap-2"
                >
                  <span>
                    <time dateTime={day} className="block text-sm font-semibold">
                      {departureDate.format(new Date(day))}
                    </time>
                    <span className="block text-[11px] text-muted-foreground">
                      {fare.origin} → {fare.destination}
                      {fare.airlineName && ` · ${fare.airlineName}`}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      Data diambil{" "}
                      <time dateTime={fare.checkedAt}>
                        {checkedDate.format(new Date(fare.checkedAt))} WIB
                      </time>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums">
                      {formatFlightPrice(fare.priceIdr)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">Cek harga</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p role="status" className="ios-group mt-4 p-3 text-[13px] text-muted-foreground">
          Belum ada tarif referensi untuk rute ini.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/tiket"
          search={{ dari: route.origin, ke: route.destination }}
          className="ios-chip text-[13px]"
        >
          Cari tanggal lain
        </Link>
        <Link
          to="/destination/$code"
          params={{ code: route.esim }}
          className="ios-chip text-[13px]"
        >
          Lihat paket eSIM
        </Link>
      </div>
    </Page>
  );
}
