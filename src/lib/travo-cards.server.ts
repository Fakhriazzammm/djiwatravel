import { pool } from "../db/client.server";
import { ORDER_STATUS_LABEL } from "./esim-status";
import { mapGuestOrderRecord } from "./guest-order-view";
import { getCustomerWalletHandler } from "./customer-wallet.server";
import { getMemberOrdersHandler } from "./member-orders.server";
import { getShopperCatalogHandler, listMyShoppingOrdersHandler } from "./personal-shopper.server";
import { destinations, getDest, search as searchDestinations } from "./catalog";
import { getDestinationPackagesHandler } from "./destination-packages.server";
import { fetchMonthOffers, searchFlightsHandler } from "./flights.server";
import { getHomeQuickPackagesHandler } from "./home-quick-packages.server";
import { countryScopedPackages } from "./home-quick-packages";
import { packageDataLabel } from "./package-copy";
import { travelGuides } from "./travel-guides";
import type { TripOwner } from "./guest-trips.server";
import type { EsimProfile } from "./providers";
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

/** Every sellable plan of one country, shortest first: what "Paket lain" shows without asking the AI again. */
export async function listEsimPlansHandler(code: string): Promise<EsimCard["picks"]> {
  const dest = getDest(code);
  if (!dest) return [];
  const data = await getDestinationPackagesHandler(dest.code).catch(() => null);
  if (!data) return [];
  return countryScopedPackages(data.packages, dest.code.toUpperCase(), data.destination.region)
    .filter((p) => p.sellable || p.preorderAvailable)
    .sort((a, b) => a.durationDays - b.durationDays || a.priceIdr - b.priceIdr)
    .slice(0, 16)
    .map((p) => ({
      packageCode: p.packageCode,
      tag: null,
      name: p.name,
      dataLabel: packageDataLabel(p),
      days: p.durationDays,
      priceIdr: p.priceIdr,
      preorder: !p.sellable,
    }));
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
        id: o.id,
        airlineCode: o.airline,
        durationMinutes: o.durationMinutes,
        returnAt: o.returnAt,
      })),
    cheapDates: await cheapestDays(req.from, req.to, req.date),
  };
}

/** The four cheapest days of the departure month from the recorded fares (empty when none or unavailable). */
async function cheapestDays(from: string, to: string, date: string) {
  try {
    const offers = await fetchMonthOffers(from, to, date.slice(0, 7));
    const best = new Map<string, number>();
    for (const o of offers) {
      const day = String(o.departureAt).slice(0, 10);
      if (day < new Date().toISOString().slice(0, 10)) continue;
      if (!best.has(day) || o.priceIdr < best.get(day)!) best.set(day, o.priceIdr);
    }
    return [...best]
      .map(([day, priceIdr]) => ({ date: day, priceIdr }))
      .sort((a, b) => a.priceIdr - b.priceIdr)
      .slice(0, 4)
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
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

async function orderCard(owner: TripOwner): Promise<TravoCard> {
  if (owner.guest) return { kind: "pesanan", loggedIn: false, orders: [] };
  const records = await getMemberOrdersHandler().catch(() => null);
  if (!records) return { kind: "pesanan", loggedIn: false, orders: [] };
  const raw = new Map(records.map((r) => [r.id, r]));
  const views = records
    .map((r) => mapGuestOrderRecord(r as never))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);
  return {
    kind: "pesanan",
    loggedIn: true,
    orders: views.map((o) => {
      const total = o.usageVolumeBytes ?? o.volumeBytes ?? 0;
      const usagePercent =
        o.usedGb != null && total > 0
          ? Math.min(100, Math.round(((o.usedGb * 1_000_000_000) / total) * 100))
          : null;
      const ready = o.status === "READY" || o.status === "INSTALLED";
      return {
        id: o.id,
        name: o.packageName ?? o.packageId,
        status: o.status,
        statusLabel: ORDER_STATUS_LABEL[o.status as keyof typeof ORDER_STATUS_LABEL] ?? o.status,
        usagePercent,
        packageId: o.packageId,
        needsPayment: o.status === "ORDER_CREATED" || o.status === "WAITING_PAYMENT",
        esim: ready ? ((raw.get(o.id) as { esim?: EsimProfile } | undefined)?.esim ?? null) : null,
      };
    }),
  };
}

async function walletCard(owner: TripOwner): Promise<TravoCard> {
  if (owner.guest)
    return { kind: "dompet", status: "login_required", balanceIdr: null, creditedIdr: null };
  const wallet = await getCustomerWalletHandler({ data: { scope: "all" } } as never).catch(
    () => null,
  );
  if (!wallet)
    return { kind: "dompet", status: "unavailable", balanceIdr: null, creditedIdr: null };
  return {
    kind: "dompet",
    status: "ok",
    balanceIdr: Number(wallet.wallet?.available_balance ?? 0),
    creditedIdr: Number(wallet.wallet?.total_credited ?? 0),
  };
}

function newTripCard(req: TravoCardRequest): TravoCard | null {
  const dest = destinationFor(req.destination);
  if (!dest || !req.date || !req.returnDate || req.returnDate < req.date) return null;
  return {
    kind: "buat_trip",
    name: req.query || `Trip ke ${dest.nameId}`,
    destinationCode: dest.code.toUpperCase(),
    destinationName: dest.nameId,
    departureDate: req.date,
    returnDate: req.returnDate,
    travelers: Math.max(1, Math.min(20, req.days || 1)),
  };
}

async function shopCard(req: TravoCardRequest, owner: TripOwner): Promise<TravoCard | null> {
  const country = req.destination.toUpperCase();
  const [catalog, orders] = await Promise.all([
    getShopperCatalogHandler({ data: { country } } as never).catch(() => null),
    owner.guest ? Promise.resolve([]) : listMyShoppingOrdersHandler().catch(() => []),
  ]);
  const words = req.query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const products = (catalog?.products ?? [])
    .map((p) => ({
      p,
      hit: words.filter((w) => `${p.name} ${p.nameId ?? ""} ${p.brand}`.toLowerCase().includes(w))
        .length,
    }))
    .sort((a, b) => b.hit - a.hit || b.p.sold - a.p.sold || b.p.trend - a.p.trend)
    .slice(0, 4)
    .map(({ p }) => ({ id: p.id, name: p.nameId || p.name, price: p.price, imageUrl: p.imageUrl }));
  return {
    kind: "titip",
    country,
    open: Boolean(catalog?.open),
    products,
    orders: orders
      .filter((o) => o.country === country)
      .slice(0, 3)
      .map((o) => ({ id: o.id, code: o.code, statusLabel: o.statusLabel, totalIdr: o.totalIdr })),
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
        if (req.kind === "pesanan") return await orderCard(owner);
        if (req.kind === "dompet") return await walletCard(owner);
        if (req.kind === "buat_trip") return newTripCard(req);
        if (req.kind === "titip") return await shopCard(req, owner);
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
