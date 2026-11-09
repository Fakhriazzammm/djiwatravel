import { pool } from "../db/client.server";
import { destinations, getDest, search as searchDestinations } from "./catalog";
import { getDestinationPackagesHandler } from "./destination-packages.server";
import { searchFlightsHandler } from "./flights.server";
import { getHomeQuickPackagesHandler } from "./home-quick-packages.server";
import { countryScopedPackages } from "./home-quick-packages";
import { packageDataLabel } from "./package-copy";
import { travelGuides } from "./travel-guides";
import type { TripOwner } from "./guest-trips.server";
import type { TravoCard, TravoCardRequest } from "./trip-assistant";

type EsimCard = Extract<TravoCard, { kind: "esim" }>;

/** The AI names a country in words or as a code; only a destination we actually sell counts. */
function destinationFor(text: string) {
  const t = text.trim();
  if (/^[A-Za-z]{2}$/.test(t)) return getDest(t);
  return (
    searchDestinations(t)[0] ?? destinations.find((d) => d.nameId.toLowerCase() === t.toLowerCase())
  );
}

async function esimCard(req: TravoCardRequest): Promise<TravoCard | null> {
  const dest = destinationFor(req.destination);
  if (!dest) return null;
  const head = { code: dest.code.toUpperCase(), name: dest.nameId, flag: dest.flag };
  if (req.days > 0) {
    // A trip length given: the sellable plans closest to it, cheapest first.
    const data = await getDestinationPackagesHandler(dest.code).catch(() => null);
    if (!data) return null;
    const scoped = countryScopedPackages(data.packages, head.code, data.destination.region).filter(
      (p) => p.sellable || p.preorderAvailable,
    );
    const ranked = [...scoped]
      .sort(
        (a, b) =>
          Math.abs(a.durationDays - req.days) - Math.abs(b.durationDays - req.days) ||
          a.priceIdr - b.priceIdr,
      )
      .filter(
        (p, i, all) =>
          all.findIndex(
            (x) => x.durationDays === p.durationDays && x.volumeBytes === p.volumeBytes,
          ) === i,
      )
      .slice(0, 3);
    if (!ranked.length) return null;
    return {
      kind: "esim",
      destination: head,
      picks: ranked.map((p) => ({
        packageCode: p.packageCode,
        tag: null,
        name: p.name,
        dataLabel: packageDataLabel(p),
        days: p.durationDays,
        priceIdr: p.priceIdr,
        preorder: !p.sellable,
      })),
      total: scoped.length,
      fromPriceIdr: Math.min(...scoped.map((p) => p.priceIdr)),
    };
  }
  const quick = await getHomeQuickPackagesHandler(head.code).catch(() => null);
  if (!quick) return null;
  const picks: EsimCard["picks"] = [
    ...quick.picks.map((p) => ({
      packageCode: p.pkg.packageCode,
      tag: p.tag === "best_seller" ? "Terlaris" : "Best Deal",
      name: p.pkg.name,
      dataLabel: packageDataLabel(p.pkg),
      days: p.pkg.durationDays,
      priceIdr: p.pkg.priceIdr,
      preorder: false,
    })),
    ...quick.preorderPicks.map((p) => ({
      packageCode: p.packageCode,
      tag: null,
      name: p.name,
      dataLabel: packageDataLabel(p),
      days: p.durationDays,
      priceIdr: p.priceIdr,
      preorder: true,
    })),
  ];
  if (!picks.length) return null;
  return {
    kind: "esim",
    destination: head,
    picks,
    total: quick.total,
    fromPriceIdr: quick.fromPriceIdr,
  };
}

async function flightCard(req: TravoCardRequest): Promise<TravoCard | null> {
  const result = await searchFlightsHandler({
    data: {
      origin: req.from,
      destination: req.to,
      departureDate: req.date,
      ...(req.returnDate ? { returnDate: req.returnDate } : {}),
    },
  } as never).catch(() => null);
  if (!result) return null;
  const search = new URLSearchParams({ dari: req.from, ke: req.to, berangkat: req.date });
  if (req.returnDate) search.set("pulang", req.returnDate);
  return {
    kind: "tiket",
    status: result.status as never,
    from: req.from,
    to: req.to,
    date: req.date,
    returnDate: req.returnDate || null,
    searchPath: `/tiket?${search.toString()}`,
    offers: [...result.offers]
      .sort((a, b) => a.priceIdr - b.priceIdr)
      .slice(0, 3)
      .map((o) => ({
        airline: o.airlineName,
        flightNumber: o.flightNumber,
        departureAt: o.departureAt,
        transfers: o.transfers,
        priceIdr: o.priceIdr,
        url: o.bookingUrl,
      })),
  };
}

function guideCard(req: TravoCardRequest): TravoCard | null {
  const words = req.query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const scored = travelGuides
    .map((g) => {
      const hay = `${g.title} ${g.description} ${g.slug}`.toLowerCase();
      return { g, score: words.filter((w) => hay.includes(w)).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.g);
  if (!scored.length) return null;
  return {
    kind: "panduan",
    guides: scored.map((g) => ({
      slug: g.slug,
      title: g.title,
      description: g.description,
      readTime: g.readTime,
    })),
  };
}

async function tripCard(owner: TripOwner): Promise<TravoCard | null> {
  const r = await pool
    .query(
      `select id, name, destination_name, to_char(departure_date,'YYYY-MM-DD') as d, to_char(return_date,'YYYY-MM-DD') as r
       from public.travel_trips where customer_auth_subject=$1 order by departure_date desc nulls last limit 5`,
      [owner.id],
    )
    .catch(() => null);
  if (!r?.rows.length) return null;
  return {
    kind: "trip",
    trips: r.rows.map((t) => ({
      id: String(t.id),
      name: String(t.name),
      destination: String(t.destination_name ?? ""),
      from: (t.d as string | null) ?? null,
      to: (t.r as string | null) ?? null,
    })),
  };
}

/** Looks the requested cards up with live data. A card that cannot be built is simply left out. */
export async function resolveTravoCards(
  requests: TravoCardRequest[],
  owner: TripOwner,
): Promise<TravoCard[]> {
  const out = await Promise.all(
    requests.slice(0, 3).map(async (req) => {
      try {
        if (req.kind === "esim") return await esimCard(req);
        if (req.kind === "tiket") return await flightCard(req);
        if (req.kind === "panduan") return guideCard(req);
        return await tripCard(owner);
      } catch (error) {
        console.error(
          "[travo] card failed",
          req.kind,
          error instanceof Error ? error.message : error,
        );
        return null;
      }
    }),
  );
  return out.filter((c): c is TravoCard => c !== null);
}
