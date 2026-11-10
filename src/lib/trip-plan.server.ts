/**
 * Data for Travo's "Rencana lengkap": per-city daily costs (AI-made once, Admin-editable), places
 * from the map (Nominatim, cached; Overpass is not reachable from the Travel VPS), and the recorded
 * fares and eSIM plans. Nothing here talks to a traveler; the planner decides what to do with it.
 */
import { pool } from "../db/client.server";
import { fetchMonthOffers, searchFlightPlacesHandler } from "./flights.server";
import { travelGuides } from "./travel-guides";
import { resolveTravoCards } from "./travo-cards.server";
import type { TripOwner } from "./guest-trips.server";
import type { TravoCard, TravoCardRequest } from "./trip-assistant";
import {
  COST_KEYS,
  costKey,
  fallbackCosts,
  sanitizeCityCosts,
  type CityCosts,
  type PlaceCandidate,
  type PlaceKind,
  type PlanResearch,
} from "./trip-plan";

/* ------------------------------------------------------------------------------ costs */

export type CostSource = "ai" | "admin" | "default";
export type CityCostRow = {
  cityKey: string;
  cityName: string;
  countryCode: string;
  costs: CityCosts;
  source: CostSource;
  generatedAt: string;
};

const COST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...COST_KEYS],
  properties: Object.fromEntries(COST_KEYS.map((key) => [key, { type: "number" }])),
} as const;
export const CITY_COST_SCHEMA = COST_SCHEMA;

type Ask = (
  system: string,
  user: string,
  schema: { name: string; schema: object },
) => Promise<{ parsed: unknown; usage: { input: number; output: number } }>;

const toRow = (r: Record<string, unknown>): CityCostRow => ({
  cityKey: String(r["city_key"]),
  cityName: String(r["city_name"]),
  countryCode: String(r["country_code"] ?? ""),
  costs: {
    foodBudget: Number(r["food_budget"]),
    foodMid: Number(r["food_mid"]),
    transportDay: Number(r["transport_day"]),
    attractionsDay: Number(r["attractions_day"]),
    hotelBudget: Number(r["hotel_budget"]),
    hotelMid: Number(r["hotel_mid"]),
  },
  source: (r["source"] as CostSource) ?? "ai",
  generatedAt: new Date(String(r["generated_at"])).toISOString(),
});

export async function saveCityCosts(
  city: { name: string; countryCode: string },
  costs: CityCosts,
  source: CostSource,
  by: string | null,
) {
  const key = costKey(city.name, city.countryCode);
  await pool.query(
    `insert into travel_city_costs
       (city_key, city_name, country_code, food_budget, food_mid, transport_day, attractions_day, hotel_budget, hotel_mid, source, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (city_key) do update set
       city_name=excluded.city_name, food_budget=excluded.food_budget, food_mid=excluded.food_mid,
       transport_day=excluded.transport_day, attractions_day=excluded.attractions_day,
       hotel_budget=excluded.hotel_budget, hotel_mid=excluded.hotel_mid, source=excluded.source,
       updated_by=excluded.updated_by, generated_at=case when excluded.source='admin' then travel_city_costs.generated_at else now() end,
       updated_at=now(), version=travel_city_costs.version+1`,
    [
      key,
      city.name,
      city.countryCode.toUpperCase(),
      costs.foodBudget,
      costs.foodMid,
      costs.transportDay,
      costs.attractionsDay,
      costs.hotelBudget,
      costs.hotelMid,
      source,
      by,
    ],
  );
  return key;
}

export async function listCityCosts(): Promise<CityCostRow[]> {
  const rows = await pool.query("select * from travel_city_costs order by city_name limit 200");
  return rows.rows.map(toRow);
}

export async function deleteCityCosts(cityKey: string) {
  await pool.query("delete from travel_city_costs where city_key=$1", [cityKey]);
}

/**
 * The daily costs of a city. Stored once; an Admin edit always wins over a regenerated table. When
 * the model cannot give a valid table twice, a conservative country tier is used and not stored as
 * "ai" (so the next request tries again).
 */
export async function getCityCosts(
  city: { name: string; countryCode: string },
  ask: Ask | null,
): Promise<{ costs: CityCosts; source: CostSource; usage: { input: number; output: number } }> {
  const usage = { input: 0, output: 0 };
  const key = costKey(city.name, city.countryCode);
  const found = await pool.query("select * from travel_city_costs where city_key=$1", [key]);
  if (found.rows[0]) {
    const row = toRow(found.rows[0]);
    return { costs: row.costs, source: row.source, usage };
  }
  if (ask) {
    const system =
      "You estimate typical daily travel costs in a city for an Indonesian traveler, in Indonesian Rupiah (IDR, whole numbers). Answer ONLY with JSON following the schema. Be realistic and conservative; use current price levels. foodBudget/foodMid = all meals for ONE person for a day (street food/casual vs sit-down restaurants); transportDay = local transport per person per day; attractionsDay = average entrance fees per person per day; hotelBudget/hotelMid = ONE hotel room per night (clean budget hotel vs comfortable 3-4 star).";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const out = await ask(
          system,
          `City: ${city.name}, country code: ${city.countryCode || "?"}`,
          {
            name: "city_costs",
            schema: COST_SCHEMA,
          },
        );
        usage.input += out.usage.input;
        usage.output += out.usage.output;
        const costs = sanitizeCityCosts(out.parsed);
        if (costs) {
          await saveCityCosts(city, costs, "ai", null).catch(() => undefined);
          return { costs, source: "ai", usage };
        }
      } catch (error) {
        console.error(
          "[trip-plan] city costs failed",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
  return { costs: fallbackCosts(city.countryCode), source: "default", usage };
}

/* ----------------------------------------------------------------------------- places */

const PLACE_TTL_MS = 7 * 24 * 3600 * 1000;
const QUERIES: { q: string; kind: PlaceKind }[] = [
  { q: "tourist attraction", kind: "atraksi" },
  { q: "museum", kind: "atraksi" },
  { q: "temple shrine", kind: "atraksi" },
  { q: "park garden", kind: "taman" },
  { q: "shopping mall market", kind: "belanja" },
  { q: "restaurant", kind: "makan" },
  { q: "local food", kind: "makan" },
  { q: "cafe", kind: "kafe" },
];

let lastRequest = 0;
const throttle = async () => {
  const slot = Math.max(Date.now(), lastRequest + 1100);
  lastRequest = slot;
  if (slot > Date.now()) await new Promise((resolve) => setTimeout(resolve, slot - Date.now()));
};

type RawPlace = Omit<PlaceCandidate, "id">;

/** Maps a Nominatim result to our kinds; anything that is not a visitable place is dropped. */
export function kindOf(category: string, type: string, wanted: PlaceKind): PlaceKind | null {
  if (category === "amenity") {
    if (["restaurant", "fast_food", "food_court", "pub", "bar"].includes(type))
      return type === "bar" || type === "pub" ? null : "makan";
    if (type === "cafe") return "kafe";
    if (type === "marketplace") return "belanja";
    if (type === "place_of_worship") return wanted === "atraksi" ? "atraksi" : null;
    return null;
  }
  if (category === "tourism")
    return [
      "attraction",
      "museum",
      "gallery",
      "viewpoint",
      "zoo",
      "theme_park",
      "aquarium",
    ].includes(type)
      ? "atraksi"
      : null;
  if (category === "historic") return wanted === "atraksi" ? "atraksi" : null;
  if (category === "leisure")
    return ["park", "garden", "nature_reserve"].includes(type) ? "taman" : null;
  if (category === "shop") return ["mall", "department_store"].includes(type) ? "belanja" : null;
  return null;
}

async function queryNominatim(
  q: string,
  wanted: PlaceKind,
  anchor: { lat: number; lng: number },
  fetcher: typeof fetch,
): Promise<RawPlace[]> {
  await throttle();
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    format: "jsonv2",
    limit: "40",
    extratags: "1",
    addressdetails: "1",
    "accept-language": "en",
    bounded: "1",
    viewbox: `${anchor.lng - 0.22},${anchor.lat + 0.18},${anchor.lng + 0.22},${anchor.lat - 0.18}`,
    q,
  }).toString();
  const response = await fetcher(url, {
    headers: { "User-Agent": "DjiwaTravel/1.0 (https://djiwatravel.com)" },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) return [];
  const rows = (await response.json()) as {
    lat: string;
    lon: string;
    name?: string;
    category?: string;
    type?: string;
    address?: Record<string, string>;
    extratags?: Record<string, string>;
  }[];
  const out: RawPlace[] = [];
  for (const row of rows) {
    const kind = kindOf(String(row.category ?? ""), String(row.type ?? ""), wanted);
    const name = String(row.name ?? "").trim();
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    if (!kind || !name || name.length > 90 || !Number.isFinite(lat) || !Number.isFinite(lng))
      continue;
    const a = row.address ?? {};
    const area = [
      a["suburb"] ?? a["neighbourhood"] ?? a["city_district"] ?? a["quarter"],
      a["city"] ?? a["town"],
    ]
      .filter(Boolean)
      .join(", ");
    out.push({
      name,
      kind,
      lat,
      lng,
      hours: row.extratags?.["opening_hours"]?.trim() || null,
      area,
    });
  }
  return out;
}

const dedupe = (places: RawPlace[]) => {
  const seen = new Set<string>();
  return places.filter((p) => {
    const key = `${p.name.toLowerCase()}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Places around a city, from the cache or the map. Fresh rows are reused for a week; missing
 * queries are fetched one per second until the time budget is spent (what was found is kept).
 */
export async function getPlaceCandidates(
  cityKey: string,
  anchor: { lat: number; lng: number },
  options: { budgetMs?: number; fetcher?: typeof fetch; onStatus?: (text: string) => void } = {},
): Promise<PlaceCandidate[]> {
  const fetcher = options.fetcher ?? fetch;
  const deadline = Date.now() + (options.budgetMs ?? 16_000);
  const cached = await pool.query(
    "select kind, places, fetched_at from travel_place_cache where city_key=$1",
    [cityKey],
  );
  const fresh = new Map<string, RawPlace[]>();
  for (const row of cached.rows)
    if (Date.now() - new Date(String(row.fetched_at)).getTime() < PLACE_TTL_MS)
      fresh.set(String(row.kind), row.places as RawPlace[]);
  for (const query of QUERIES) {
    const cacheKey = query.q;
    if (fresh.has(cacheKey)) continue;
    if (Date.now() + 1500 > deadline) break;
    try {
      const places = await queryNominatim(query.q, query.kind, anchor, fetcher);
      fresh.set(cacheKey, places);
      await pool.query(
        `insert into travel_place_cache (city_key, kind, places, fetched_at) values ($1,$2,$3::jsonb,now())
         on conflict (city_key, kind) do update set places=excluded.places, fetched_at=now()`,
        [cityKey, cacheKey, JSON.stringify(places)],
      );
    } catch (error) {
      console.error(
        "[trip-plan] place query failed",
        query.q,
        error instanceof Error ? error.message : error,
      );
    }
  }
  const all = dedupe([...fresh.values()].flat());
  // Stable ids: sorted by kind then name, so a re-read gives the same ids.
  all.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  return all.map((p, index) => ({ ...p, id: `p${index + 1}` }));
}

/** Other places of the same kind near a point, nearest first, for "Ganti tempat ini". */
export async function alternativesNear(
  cityKey: string,
  kind: PlaceKind,
  point: { lat: number; lng: number },
  excludeNames: readonly string[],
  limit = 3,
): Promise<PlaceCandidate[]> {
  const rows = await pool.query("select places from travel_place_cache where city_key=$1", [
    cityKey,
  ]);
  const all = dedupe(rows.rows.flatMap((r) => r.places as RawPlace[]));
  const { haversineKm } = await import("./trip-plan");
  const taken = new Set(excludeNames.map((n) => n.toLowerCase()));
  return all
    .filter((p) => p.kind === kind && !taken.has(p.name.toLowerCase()))
    .map((p) => ({ p, d: haversineKm(p, point) }))
    .filter((x) => x.d <= 4)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x, index) => ({ ...x.p, id: `alt${index + 1}` }));
}

/* -------------------------------------------------------------------------- research */

const within = <T>(promise: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);

async function iataFor(cityName: string): Promise<string | null> {
  const result = await within(searchFlightPlacesHandler({ data: { term: cityName } }), 5000);
  const place = result?.places.find((p) => p.type === "city") ?? result?.places[0];
  return place?.code ?? null;
}

export type ResearchInput = {
  owner: TripOwner;
  originCode: string | null;
  cityName: string;
  countryName: string;
  countryCode: string;
  departureDate: string;
  returnDate: string;
  days: number;
  flights: boolean;
  esim: boolean;
};

export type ResearchResult = {
  research: PlanResearch;
  /** Product cards (live prices) the planner shows under its first sentence. */
  cards: TravoCardRequest[];
  destinationCode: string | null;
};

/** Recorded fares, the cheapest day of the month, the best-fitting eSIM and relevant guides. */
export async function loadPlanResearch(input: ResearchInput): Promise<ResearchResult> {
  const down: string[] = [];
  const research: PlanResearch = {
    outbound: null,
    returnLeg: null,
    cheapestOutbound: null,
    esim: null,
    guides: [],
    sourcesDown: down,
  };
  const cards: TravoCardRequest[] = [];
  let destinationCode: string | null = null;
  const blank = (kind: TravoCardRequest["kind"]): TravoCardRequest => ({
    kind,
    destination: "",
    query: "",
    from: "",
    to: "",
    date: "",
    returnDate: "",
    days: 0,
  });
  const jobs: Promise<void>[] = [];
  if (input.flights && input.originCode) {
    jobs.push(
      (async () => {
        destinationCode = await iataFor(input.cityName);
        if (!destinationCode) return void down.push("tiket");
        const from = input.originCode!;
        const to = destinationCode;
        const requests = [
          { ...blank("tiket"), from, to, date: input.departureDate },
          { ...blank("tiket"), from: to, to: from, date: input.returnDate },
        ];
        const resolved = await within(resolveTravoCards(requests, input.owner), 12_000);
        const priced = (card: TravoCard | undefined) =>
          card && card.kind === "tiket" && card.offers[0]
            ? { priceIdr: card.offers[0].priceIdr, date: card.date }
            : null;
        const flights = (resolved ?? []).filter((c) => c.kind === "tiket");
        research.outbound = priced(flights[0]);
        research.returnLeg = priced(flights[1]);
        if (!research.outbound && !research.returnLeg) down.push("tiket");
        cards.push(requests[0]!);
        const month = input.departureDate.slice(0, 7);
        const offers = await within(fetchMonthOffers(from, to, month), 8000);
        const cheapest = [...(offers ?? [])].sort((a, b) => a.priceIdr - b.priceIdr)[0];
        if (cheapest)
          research.cheapestOutbound = {
            priceIdr: cheapest.priceIdr,
            date: String(cheapest.departureAt).slice(0, 10),
          };
      })(),
    );
  }
  if (input.esim) {
    jobs.push(
      (async () => {
        const request = {
          ...blank("esim"),
          destination: input.countryCode || input.countryName,
          days: input.days,
        };
        const resolved = await within(resolveTravoCards([request], input.owner), 8000);
        const card = resolved?.find((c) => c.kind === "esim");
        if (card && card.kind === "esim" && card.picks.length) {
          const pick =
            [...card.picks]
              .filter((p) => p.days >= Math.min(input.days, 30))
              .sort((a, b) => a.priceIdr - b.priceIdr)[0] ??
            [...card.picks].sort((a, b) => b.days - a.days)[0]!;
          research.esim = { name: pick.name, days: pick.days, priceIdr: pick.priceIdr };
          cards.push(request);
        } else down.push("esim");
      })(),
    );
  }
  await Promise.all(jobs);
  research.guides = travelGuides
    .filter((g) =>
      g.relatedDestinations.some((d) => d.code.toUpperCase() === input.countryCode.toUpperCase()),
    )
    .slice(0, 3)
    .map((g) => ({ title: g.title, slug: g.slug }));
  return { research, cards, destinationCode };
}
