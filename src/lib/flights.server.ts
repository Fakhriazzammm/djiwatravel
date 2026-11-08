import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { buildSettingAudit } from "./admin-settings";
import { getRequestHeader } from "@tanstack/react-start/server";
import { getAuthenticatedUser } from "./customer-session.fn";
import { flightFeatureStats } from "./flight-features.server";
import {
  AVIASALES_CLICK_TARGET,
  BUDGET_PICK_TARGET,
  DEFAULT_FLIGHTS_CONFIG,
  EMBED_OPEN_TARGET,
  ESIM_OFFER_TARGET,
  FLIGHTS_SETTING_KEY,
  INSIGHT_TARGET,
  SAVE_TRIP_TARGET,
  flightSearchKey,
  normalizeAirlineNames,
  normalizeFlightIdeas,
  normalizeFlightOffers,
  normalizeFlightPlaces,
  normalizeFlightsConfig,
  isIataCode,
  parseBudget,
  parseFlightSearch,
  parseFlightsConfig,
  withinSearchAllowance,
  type FlightIdeasResult,
  type FlightOffer,
  type FlightPlace,
  type FlightSearchResult,
  type FlightsConfig,
} from "./flights";

const CACHE_MS = 60_000;
let cached: { at: number; config: FlightsConfig } | null = null;

async function readFlightsRecord() {
  try {
    const result = await pool.query(
      "select value_json, version from public.admin_settings where setting_key = $1",
      [FLIGHTS_SETTING_KEY],
    );
    const row = result.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    if (!row) return { config: DEFAULT_FLIGHTS_CONFIG, version: 0 };
    return { config: normalizeFlightsConfig(row.value_json), version: Number(row.version) || 0 };
  } catch {
    return { config: DEFAULT_FLIGHTS_CONFIG, version: 0 };
  }
}

/** Customer-safe config, held for a minute because every page render asks for it. */
export async function getFlightsConfigHandler(): Promise<FlightsConfig> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.config;
  const { config } = await readFlightsRecord();
  cached = { at: Date.now(), config };
  return config;
}

/* ----------------------------------------------------------------- search */

const PRICES_URL = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";
const PLACES_URL = "https://autocomplete.travelpayouts.com/places2";
const AIRLINES_URL = "https://api.travelpayouts.com/data/en/airlines.json";
const AIRLINE_CACHE_MS = 24 * 60 * 60_000;
const OFFER_CACHE_MS = 30 * 60_000;
const PLACE_CACHE_MS = 10 * 60_000;
const HOUR_MS = 60 * 60_000;
const PLACE_BURST = { windowMs: 60_000, max: 60 };
const REQUEST_TIMEOUT_MS = 8_000;

/** In-process counters since the last restart; the durable number is the Aviasales click count. */
export const searchStats = {
  searches: 0,
  cacheHits: 0,
  empty: 0,
  rateLimited: 0,
  failed: 0,
  ideaSearches: 0,
};

export const flightsToken = () => process.env["TRAVELPAYOUTS_TOKEN"]?.trim() || null;

const offerCache = new Map<string, { at: number; offers: FlightOffer[] }>();
let airlineCache: { at: number; names: Record<string, string> } | null = null;
const placeCache = new Map<string, { at: number; places: FlightPlace[] }>();
const hits = new Map<string, number[]>();

function takeHit(key: string, windowMs: number, max: number, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < HOUR_MS)) hits.delete(k);
  }
  return true;
}

function trim(map: Map<string, unknown>) {
  if (map.size > 500) map.delete(map.keys().next().value as string);
}

/** Who is asking: a signed-in member, or a guest identified by the proxy's real client address. */
async function searcher(): Promise<{ key: string; member: boolean }> {
  try {
    const user = await getAuthenticatedUser();
    return { key: `m:${user.id}`, member: true };
  } catch {
    let ip = "unknown";
    try {
      ip =
        getRequestHeader("x-real-ip")?.trim() ||
        getRequestHeader("x-forwarded-for")?.split(",").pop()?.trim() ||
        "unknown";
    } catch {
      // Outside a request (tests, scripts) there is no address to read.
    }
    return { key: `ip:${ip.slice(0, 64)}`, member: false };
  }
}

async function fetchJson(url: string, token?: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", ...(token ? { "X-Access-Token": token } : {}) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`provider ${response.status}`);
  return response.json();
}

/**
 * Airline code to name, from the provider's public list, held for a day. A failed read keeps the
 * last list (or none): offers then fall back to the built-in names and finally to the code.
 */
async function airlineNames(): Promise<Record<string, string>> {
  if (airlineCache && Date.now() - airlineCache.at < AIRLINE_CACHE_MS) return airlineCache.names;
  try {
    const names = normalizeAirlineNames(await fetchJson(AIRLINES_URL));
    if (Object.keys(names).length > 0) {
      airlineCache = { at: Date.now(), names };
      return names;
    }
  } catch {
    // Names are a nicety: a flight search never fails because the list is unreachable.
  }
  // Retry sooner than a full day when the list could not be read.
  if (airlineCache)
    airlineCache = { ...airlineCache, at: Date.now() - AIRLINE_CACHE_MS + 5 * 60_000 };
  return airlineCache?.names ?? {};
}

const placeInput = z.object({ term: z.string().trim().min(2).max(60) });
export const searchFlightPlacesInput = (data: unknown) => placeInput.parse(data);

export async function searchFlightPlacesHandler({
  data,
}: {
  data: ReturnType<typeof searchFlightPlacesInput>;
}): Promise<{ places: FlightPlace[] }> {
  const config = await getFlightsConfigHandler();
  if (!config.enabled) return { places: [] };
  const who = await searcher();
  if (!who.member && !config.guestSearch) return { places: [] };
  const key = data.term.toLowerCase();
  const hit = placeCache.get(key);
  if (hit && Date.now() - hit.at < PLACE_CACHE_MS) return { places: hit.places };
  if (!takeHit(`places:${who.key}`, PLACE_BURST.windowMs, PLACE_BURST.max)) return { places: [] };
  try {
    const url = new URL(PLACES_URL);
    url.searchParams.set("term", data.term);
    url.searchParams.set("locale", "id");
    url.searchParams.append("types[]", "city");
    url.searchParams.append("types[]", "airport");
    const places = normalizeFlightPlaces(await fetchJson(url.toString()));
    placeCache.set(key, { at: Date.now(), places });
    trim(placeCache);
    return { places };
  } catch {
    return { places: [] };
  }
}

const searchInput = z.object({
  origin: z.string().trim().max(3),
  destination: z.string().trim().max(3),
  departureDate: z.string().trim().max(10),
  returnDate: z.string().trim().max(10).optional(),
});
export const searchFlightsInput = (data: unknown) => searchInput.parse(data);

export async function searchFlightsHandler({
  data,
}: {
  data: ReturnType<typeof searchFlightsInput>;
}): Promise<FlightSearchResult> {
  const config = await getFlightsConfigHandler();
  const token = flightsToken();
  if (!config.enabled || !token) return { status: "unavailable", offers: [] };
  const who = await searcher();
  if (!who.member && !config.guestSearch) return { status: "login_required", offers: [] };
  const search = parseFlightSearch(data);
  if (!search) return { status: "invalid", offers: [] };

  const key = flightSearchKey(search);
  const hit = offerCache.get(key);
  if (hit && Date.now() - hit.at < OFFER_CACHE_MS) {
    searchStats.cacheHits += 1;
    return { status: hit.offers.length ? "ok" : "empty", offers: reMarker(hit.offers, config) };
  }
  if (!takeHit(`search:${who.key}`, HOUR_MS, config.searchesPerHour)) {
    searchStats.rateLimited += 1;
    return { status: "rate_limited", offers: [] };
  }
  try {
    const url = new URL(PRICES_URL);
    url.searchParams.set("origin", search.origin);
    url.searchParams.set("destination", search.destination);
    url.searchParams.set("departure_at", search.departureDate);
    if (search.returnDate) url.searchParams.set("return_at", search.returnDate);
    url.searchParams.set("one_way", search.returnDate ? "false" : "true");
    url.searchParams.set("currency", "idr");
    url.searchParams.set("sorting", "price");
    url.searchParams.set("unique", "false");
    url.searchParams.set("limit", "30");
    const body = (await fetchJson(url.toString(), token)) as { success?: unknown; data?: unknown };
    if (body.success === false) throw new Error("provider rejected");
    // A month search feeds the price calendar (one fare per day); a day search shows the best few.
    const cap = /^\d{4}-\d{2}$/.test(search.departureDate) ? 31 : 12;
    const offers = normalizeFlightOffers(body.data, config.partnerId, cap, await airlineNames());
    searchStats.searches += 1;
    if (!offers.length) searchStats.empty += 1;
    offerCache.set(key, { at: Date.now(), offers });
    trim(offerCache);
    return { status: offers.length ? "ok" : "empty", offers };
  } catch (error) {
    searchStats.failed += 1;
    console.error("[flights] search failed", error instanceof Error ? error.message : error);
    return { status: "failed", offers: [] };
  }
}

const IDEAS_URL = "https://api.travelpayouts.com/aviasales/v3/search_by_price_range";
const ideaCache = new Map<string, { at: number; result: FlightIdeasResult }>();

const ideasInput = z.object({
  origin: z.string().trim().max(3),
  budget: z.union([z.number(), z.string().max(20)]),
});
export const searchFlightIdeasInput = (data: unknown) => ideasInput.parse(data);

/**
 * "Cari sesuai budget": the cheapest recorded fares from one city under a price, one per
 * destination. Same guests, allowance and cache rules as the fare search; the token stays here.
 */
export async function searchFlightIdeasHandler({
  data,
}: {
  data: ReturnType<typeof searchFlightIdeasInput>;
}): Promise<FlightIdeasResult> {
  const config = await getFlightsConfigHandler();
  const token = flightsToken();
  if (!config.enabled || !config.budgetSearch || !token)
    return { status: "unavailable", ideas: [] };
  const who = await searcher();
  if (!who.member && !config.guestSearch) return { status: "login_required", ideas: [] };
  const origin = data.origin.toUpperCase();
  const budget = parseBudget(data.budget);
  if (!isIataCode(origin) || budget === null) return { status: "invalid", ideas: [] };
  // Round to the nearest 100 thousand so close budgets share one provider call.
  const cap = Math.round(budget / 100_000) * 100_000;
  const key = `${origin}|${cap}`;
  const hit = ideaCache.get(key);
  if (hit && Date.now() - hit.at < OFFER_CACHE_MS) {
    searchStats.cacheHits += 1;
    return hit.result;
  }
  if (!takeHit(`ideas:${who.key}`, HOUR_MS, config.searchesPerHour)) {
    searchStats.rateLimited += 1;
    return { status: "rate_limited", ideas: [] };
  }
  try {
    const url = new URL(IDEAS_URL);
    url.searchParams.set("origin", origin);
    url.searchParams.set("destination", "-");
    url.searchParams.set("value_min", "1");
    url.searchParams.set("value_max", String(cap));
    url.searchParams.set("one_way", "true");
    url.searchParams.set("direct", "false");
    url.searchParams.set("locale", "en");
    url.searchParams.set("currency", "idr");
    url.searchParams.set("limit", "50");
    const body = (await fetchJson(url.toString(), token)) as { success?: unknown; data?: unknown };
    if (body.success === false) throw new Error("provider rejected");
    const ideas = normalizeFlightIdeas(body.data, origin).filter((idea) => idea.priceIdr <= cap);
    searchStats.ideaSearches += 1;
    const result: FlightIdeasResult = { status: ideas.length ? "ok" : "empty", ideas };
    ideaCache.set(key, { at: Date.now(), result });
    trim(ideaCache);
    return result;
  } catch (error) {
    searchStats.failed += 1;
    console.error("[flights] ideas failed", error instanceof Error ? error.message : error);
    return { status: "failed", ideas: [] };
  }
}

/**
 * One month of cheapest-per-day fares for a route, for background jobs (price alerts). It shares
 * the search cache but never counts against a member's hourly allowance. Throws on a provider error.
 */
export async function fetchMonthOffers(
  origin: string,
  destination: string,
  month: string,
): Promise<FlightOffer[]> {
  const config = await getFlightsConfigHandler();
  const token = flightsToken();
  if (!config.enabled || !token) return [];
  const search = parseFlightSearch({ origin, destination, departureDate: month });
  if (!search) return [];
  const key = flightSearchKey(search);
  const hit = offerCache.get(key);
  if (hit && Date.now() - hit.at < OFFER_CACHE_MS) return hit.offers;
  const url = new URL(PRICES_URL);
  url.searchParams.set("origin", search.origin);
  url.searchParams.set("destination", search.destination);
  url.searchParams.set("departure_at", search.departureDate);
  url.searchParams.set("one_way", "true");
  url.searchParams.set("currency", "idr");
  url.searchParams.set("sorting", "price");
  url.searchParams.set("unique", "false");
  url.searchParams.set("limit", "30");
  const body = (await fetchJson(url.toString(), token)) as { success?: unknown; data?: unknown };
  if (body.success === false) throw new Error("provider rejected");
  const offers = normalizeFlightOffers(body.data, config.partnerId, 31, await airlineNames());
  offerCache.set(key, { at: Date.now(), offers });
  trim(offerCache);
  return offers;
}

/** Cached offers carry the marker of the moment they were fetched; refresh it on every read. */
function reMarker(offers: FlightOffer[], config: FlightsConfig): FlightOffer[] {
  return offers.map((offer) => {
    if (!offer.bookingUrl) return offer;
    try {
      const url = new URL(offer.bookingUrl);
      url.searchParams.set("marker", config.partnerId);
      return { ...offer, bookingUrl: url.toString() };
    } catch {
      return { ...offer, bookingUrl: null };
    }
  });
}

/** Whether the search can run at all, for the pages that decide to show an entry point. */
export async function getFlightsStatusHandler() {
  const config = await getFlightsConfigHandler();
  return { config, available: config.enabled && Boolean(flightsToken()) };
}

/* ------------------------------------------------------------------ admin */

const saveSchema = z.object({
  config: z.unknown(),
  reason: z.string().trim().min(4).max(300),
  expectedVersion: z.number().int().min(0),
});

export const saveFlightsConfigInput = (data: unknown) => saveSchema.parse(data);

export const getAdminFlightsHandler = async () => {
  await requireAdmin();
  const record = await readFlightsRecord();
  const clicks = await countFlightClicks();
  return {
    ...record,
    tokenConfigured: Boolean(flightsToken()),
    stats: {
      ...searchStats,
      clicks7d: clicks.aviasales,
      embedOpens7d: clicks.embed,
      saves7d: clicks.saves,
      insightPicks7d: clicks.insight,
      esimOffers7d: clicks.esim,
      budgetPicks7d: clicks.budget,
      ...(await flightFeatureStats()),
    },
  };
};

async function countFlightClicks() {
  const counts = { aviasales: 0, embed: 0, saves: 0, insight: 0, esim: 0, budget: 0 };
  try {
    const result = await pool.query(
      `select target, count(*)::int as n from site_events
       where event_name = 'click' and target = any($1) and created_at > now() - interval '7 days'
       group by target`,
      [
        [
          AVIASALES_CLICK_TARGET,
          EMBED_OPEN_TARGET,
          SAVE_TRIP_TARGET,
          INSIGHT_TARGET,
          ESIM_OFFER_TARGET,
          BUDGET_PICK_TARGET,
        ],
      ],
    );
    for (const row of result.rows as { target?: unknown; n?: unknown }[]) {
      if (row.target === AVIASALES_CLICK_TARGET) counts.aviasales = Number(row.n) || 0;
      if (row.target === EMBED_OPEN_TARGET) counts.embed = Number(row.n) || 0;
      if (row.target === SAVE_TRIP_TARGET) counts.saves = Number(row.n) || 0;
      if (row.target === INSIGHT_TARGET) counts.insight = Number(row.n) || 0;
      if (row.target === ESIM_OFFER_TARGET) counts.esim = Number(row.n) || 0;
      if (row.target === BUDGET_PICK_TARGET) counts.budget = Number(row.n) || 0;
    }
  } catch {
    // Counters are a monitoring nicety; the settings still load.
  }
  return counts;
}

export async function saveFlightsConfigHandler({
  data,
}: {
  data: ReturnType<typeof saveFlightsConfigInput>;
}) {
  await requireAdmin();
  const config = parseFlightsConfig(data.config);
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      "select value_json, version from public.admin_settings where setting_key = $1 for update",
      [FLIGHTS_SETTING_KEY],
    );
    const row = current.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    const version = row ? Number(row.version) : 0;
    if (version !== data.expectedVersion) {
      await client.query("rollback");
      return { ok: false as const, conflict: true as const, version };
    }
    const audit = buildSettingAudit(
      FLIGHTS_SETTING_KEY,
      row?.value_json ?? null,
      config,
      actor,
      data.reason,
    );
    await client.query(
      `insert into public.admin_settings (setting_key, value_json, version, updated_at)
       values ($1, $2::jsonb, 1, now())
       on conflict (setting_key) do update
       set value_json = excluded.value_json, version = admin_settings.version + 1, updated_at = now()`,
      [FLIGHTS_SETTING_KEY, JSON.stringify(config)],
    );
    await client.query(
      `insert into public.admin_audit_logs
         (id, action, entity_type, entity_id, reason, before_json, after_json)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [
        randomUUID(),
        audit.action,
        audit.entityType,
        audit.entityId,
        `${actor}: ${audit.reason}`,
        JSON.stringify(audit.beforeJson),
        JSON.stringify(audit.afterJson),
      ],
    );
    await client.query("commit");
    cached = null;
    return { ok: true as const, conflict: false as const, version: version + 1, config };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
