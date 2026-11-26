import type { FlightOffer } from "./flights";
import { SEO_BASE_URL } from "./seo";

export const PUBLIC_FLIGHT_ROUTES = [
  {
    slug: "jakarta-bali",
    origin: "CGK",
    destination: "DPS",
    from: "Jakarta",
    to: "Bali",
    esim: "id",
  },
  {
    slug: "jakarta-surabaya",
    origin: "CGK",
    destination: "SUB",
    from: "Jakarta",
    to: "Surabaya",
    esim: "id",
  },
  {
    slug: "jakarta-singapura",
    origin: "CGK",
    destination: "SIN",
    from: "Jakarta",
    to: "Singapura",
    esim: "sg",
  },
  {
    slug: "jakarta-kuala-lumpur",
    origin: "CGK",
    destination: "KUL",
    from: "Jakarta",
    to: "Kuala Lumpur",
    esim: "my",
  },
  {
    slug: "jakarta-bangkok",
    origin: "CGK",
    destination: "BKK",
    from: "Jakarta",
    to: "Bangkok",
    esim: "th",
  },
  {
    slug: "jakarta-tokyo",
    origin: "CGK",
    destination: "TYO",
    from: "Jakarta",
    to: "Tokyo",
    esim: "jp",
  },
  {
    slug: "jakarta-seoul",
    origin: "CGK",
    destination: "SEL",
    from: "Jakarta",
    to: "Seoul",
    esim: "kr",
  },
  {
    slug: "jakarta-jeddah",
    origin: "CGK",
    destination: "JED",
    from: "Jakarta",
    to: "Jeddah",
    esim: "sa",
  },
] as const;

export type PublicFlightRoute = (typeof PUBLIC_FLIGHT_ROUTES)[number];
export type PublicFare = Pick<
  FlightOffer,
  "id" | "origin" | "destination" | "airlineName" | "departureAt" | "priceIdr"
> & { checkedAt: string };
export type PublicFlightFares = { route: PublicFlightRoute; fares: PublicFare[] };

export const FLIGHT_PRICE_NOTE =
  "Harga indikatif sekali jalan dalam Rupiah, berdasarkan pencarian yang tercatat di Aviasales. Cek ulang harga dan kursi untuk tanggal pilihanmu sebelum memesan.";

export function publicFlightMonths(now: Date) {
  const month = new Date(now.toISOString().slice(0, 7) + "-01T00:00:00Z");
  const current = month.toISOString().slice(0, 7);
  month.setUTCMonth(month.getUTCMonth() + 1);
  return [current, month.toISOString().slice(0, 7)];
}

export function selectPublicFares(
  snapshots: ReadonlyArray<{ at: number; offers: FlightOffer[] }>,
  now: number,
): PublicFare[] {
  const dates = new Set<string>();
  return snapshots
    .flatMap(({ at, offers }) => offers.map((offer) => ({ offer, at })))
    .filter(
      ({ offer }) =>
        offer.returnAt == null &&
        Date.parse(offer.departureAt) > now &&
        (offer.expiresAt == null || Date.parse(offer.expiresAt) > now) &&
        Number.isSafeInteger(offer.priceIdr) &&
        offer.priceIdr > 0,
    )
    .sort((a, b) => a.offer.priceIdr - b.offer.priceIdr)
    .flatMap(({ offer, at }) => {
      const day = offer.departureAt.slice(0, 10);
      if (dates.has(day)) return [];
      dates.add(day);
      const { id, origin, destination, airlineName, departureAt, priceIdr } = offer;
      return [
        {
          id,
          origin,
          destination,
          airlineName,
          departureAt,
          priceIdr,
          checkedAt: new Date(at).toISOString(),
        },
      ];
    })
    .slice(0, 5);
}

export function flightRouteUrl(route: PublicFlightRoute) {
  return `${SEO_BASE_URL}/tiket/${route.slug}`;
}
