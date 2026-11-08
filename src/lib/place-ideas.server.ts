import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { buildSettingAudit } from "./admin-settings";
import { getAuthenticatedUser } from "./customer-session.fn";
import { distanceKm } from "./itinerary-map";
import { discoverPlaces, wikipediaFacts } from "./place-discovery.server";
import { osmUrl } from "./place-discovery";
import {
  forwardGeocode,
  lookupPlaceImage,
  lookupPlaceImageByName,
  lookupVenuePoint,
  placeSearchTarget,
} from "./itinerary-map.server";
import {
  DEFAULT_PLACE_IDEAS_CONFIG,
  PLACE_IDEAS_SETTING_KEY,
  UNAVAILABLE_PLACE_IDEAS,
  cleanRawIdeas,
  ideaInTripCities,
  normalizePlaceIdeasConfig,
  parsePlaceIdeasConfig,
  placeIdeaCategory,
  placeIdeaKey,
  placeIdeasCacheKey,
  sourceHost,
  type PlaceIdea,
  type PlaceIdeaCategoryId,
  type PlaceIdeasConfig,
  type PlaceIdeasResponse,
  type PlaceIdeasStatus,
} from "./place-ideas";
import { estimateCostIdr, jakartaDayStart } from "./receipt-scan";

/* ------------------------------------------------------------------------------- config */

export type PlaceIdeasConfigRecord = { config: PlaceIdeasConfig; version: number };

export async function readPlaceIdeasConfig(): Promise<PlaceIdeasConfigRecord> {
  try {
    const result = await pool.query(
      "select value_json, version from public.admin_settings where setting_key = $1",
      [PLACE_IDEAS_SETTING_KEY],
    );
    const row = result.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    if (!row) return { config: DEFAULT_PLACE_IDEAS_CONFIG, version: 0 };
    return { config: normalizePlaceIdeasConfig(row.value_json), version: Number(row.version) || 0 };
  } catch {
    return { config: DEFAULT_PLACE_IDEAS_CONFIG, version: 0 };
  }
}

/** Both keys live only on the server. Without them the feature stays hidden for travelers. */
export const placeIdeasConfigured = () =>
  Boolean(process.env["HELIPOD_AI_KEY"] && process.env["TINYFISH_API_KEY"]);
const aiBase = () =>
  (process.env["HELIPOD_AI_BASE_URL"] || "https://ai.helipod.io/v1").replace(/\/$/, "");

async function usedToday(userId: string, now = new Date()) {
  const result = await pool.query(
    "select count(*)::int as n from public.travel_place_idea_runs where customer_auth_subject=$1 and created_at >= $2",
    [userId, jakartaDayStart(now)],
  );
  return Number(result.rows[0]?.n) || 0;
}

export async function placeIdeasStatus(userId: string): Promise<PlaceIdeasStatus> {
  const { config } = await readPlaceIdeasConfig();
  if (!config.enabled || !placeIdeasConfigured()) return UNAVAILABLE_PLACE_IDEAS;
  const used = await usedToday(userId);
  return {
    available: true,
    showStrip: config.showStrip,
    dailyLimit: config.dailyLimit,
    remaining: Math.max(0, config.dailyLimit - used),
  };
}

async function ownedTrip(tripId: string, userId: string) {
  const result = await pool.query(
    "select destination_name from public.travel_trips where id=$1 and customer_auth_subject=$2 limit 1",
    [tripId, userId],
  );
  const row = result.rows[0] as { destination_name?: string } | undefined;
  if (!row) throw new Error("Perjalanan tidak ditemukan");
  return String(row.destination_name ?? "").trim();
}

/* ---------------------------------------------------------------------------- TinyFish */

const TINYFISH_SEARCH = "https://api.search.tinyfish.ai";
const TINYFISH_FETCH = "https://api.fetch.tinyfish.ai";

type Source = { title: string; url: string; text: string };

// TinyFish's free tier allows about 5 searches a minute for the whole key: stay under it.
const recentSearches: number[] = [];
export function reserveSearchSlot(now = Date.now(), limit = 4) {
  while (recentSearches.length && now - recentSearches[0]! > 60_000) recentSearches.shift();
  if (recentSearches.length >= limit) return false;
  recentSearches.push(now);
  return true;
}

async function searchWeb(query: string): Promise<{ title: string; url: string }[]> {
  const url = new URL(TINYFISH_SEARCH);
  url.searchParams.set("query", query);
  const response = await fetch(url, {
    headers: { "X-API-Key": process.env["TINYFISH_API_KEY"] ?? "" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`search_${response.status}`);
  const json = (await response.json()) as { results?: { title?: string; url?: string }[] };
  return (
    (json.results ?? [])
      .filter((r) => typeof r.url === "string" && /^https:\/\//.test(r.url))
      // Social networks and logins return little readable text.
      .filter((r) => !/instagram\.com|facebook\.com|tiktok\.com|pinterest\./i.test(r.url ?? ""))
      .slice(0, 4)
      .map((r) => ({ title: String(r.title ?? ""), url: String(r.url) }))
  );
}

async function fetchPages(pages: { title: string; url: string }[]): Promise<Source[]> {
  if (!pages.length) return [];
  const response = await fetch(TINYFISH_FETCH, {
    method: "POST",
    headers: {
      "X-API-Key": process.env["TINYFISH_API_KEY"] ?? "",
      "content-type": "application/json",
    },
    body: JSON.stringify({ urls: pages.map((p) => p.url), format: "markdown" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`fetch_${response.status}`);
  const json = (await response.json()) as {
    results?: { url?: string; final_url?: string; title?: string; text?: string }[];
  };
  return (json.results ?? [])
    .filter((r) => typeof r.text === "string" && r.text.length > 200)
    .map((r) => ({
      title: String(r.title ?? ""),
      url: String(r.final_url || r.url),
      text: String(r.text).slice(0, 3500),
    }));
}

/* --------------------------------------------------------------------------- the AI call */

const IDEAS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["places"],
  properties: {
    places: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "category", "why", "source", "city"],
        properties: {
          name: { type: "string" },
          category: { type: "string", enum: ["food", "cafe", "sight", "nature", "shop"] },
          why: { type: "string" },
          source: { type: "integer" },
          city: { type: "string" },
        },
      },
    },
  },
} as const;

export const PLACE_IDEAS_SYSTEM_PROMPT = [
  "You pick places for a traveler's itinerary from web pages. Answer ONLY with JSON that follows the schema.",
  "Use ONLY places that are named in the numbered sources. Never invent a place, never add one from memory.",
  "Each place is a specific, visitable spot (a restaurant, cafe, park, shrine, market, museum...), not a whole city or district.",
  "`name` is the place's own name as written in the source, in Latin letters when the source gives them.",
  "`why` is ONE short sentence in casual Indonesian (max 110 characters) saying why it is worth a visit, based on the source.",
  "`source` is the number of the source that names the place. `category` is one of the allowed values.",
  "`category` must describe what the place IS: castles, temples, museums and landmarks are `sight`, never `cafe`.",
  "`city` is the city or ward where the source says the place is. When trip cities are given, return only places in those cities, never places from other cities or regions.",
  "Prefer places that fit the requested kind and are well recommended; skip duplicates, chains and closed places.",
].join("\n");

const WHY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "why"],
        properties: { id: { type: "integer" }, why: { type: "string" } },
      },
    },
  },
} as const;

const WHY_SYSTEM_PROMPT = [
  "You write short travel blurbs. Answer ONLY with JSON that follows the schema.",
  "For each numbered place write `why`: ONE sentence in casual Indonesian (max 110 characters) on why it is worth a visit.",
  "Use ONLY the facts given for that place. Never invent details, prices, years or opening hours.",
  "When a place has few facts, say simply what it is and where, without praise you cannot support.",
].join("\n");

async function askModel(
  model: string,
  userContent: string,
  mode: { system: string; schema: object; name: string } = {
    system: PLACE_IDEAS_SYSTEM_PROMPT,
    schema: IDEAS_SCHEMA,
    name: "place_ideas",
  },
) {
  const key = process.env["HELIPOD_AI_KEY"];
  if (!key) throw new Error("not_configured");
  // The model "thinks" before answering. On long pages that used up every token and cut the JSON
  // off (verified live), so thinking is kept low and the answer has room to finish.
  const body = (withSchema: boolean, withEffort: boolean) =>
    JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 3000,
      ...(withEffort ? { reasoning_effort: "low" } : {}),
      messages: [
        { role: "system", content: mode.system },
        { role: "user", content: userContent },
      ],
      ...(withSchema
        ? {
            response_format: {
              type: "json_schema",
              json_schema: { name: mode.name, strict: true, schema: mode.schema },
            },
          }
        : {}),
    });
  const call = (withSchema: boolean, withEffort: boolean) =>
    fetch(`${aiBase()}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: body(withSchema, withEffort),
      signal: AbortSignal.timeout(60_000),
    });
  let response = await call(true, true);
  // A model that rejects a parameter still answers when asked more plainly.
  if (response.status === 400) response = await call(true, false);
  if (response.status === 400) response = await call(false, false);
  if (response.status === 429 || response.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    response = await call(true, true);
  }
  if (!response.ok) throw new Error(`ai_${response.status}`);
  const json = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = json.choices?.[0]?.message?.content;
  const raw = typeof content === "string" ? content : "";
  const cleaned = raw
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        parsed = null;
      }
    }
  }
  return {
    parsed,
    usage: {
      input: Number(json.usage?.prompt_tokens) || 0,
      output: Number(json.usage?.completion_tokens) || 0,
    },
  };
}

/* ------------------------------------------------------------------------- map checking */

async function geocode(query: string, bias?: { lat: number; lng: number }) {
  const target = placeSearchTarget();
  if (!target) return null;
  // Batch lookups of named places: no typeahead, a few candidates, biased to the destination.
  const outcome = await forwardGeocode(target, {
    query,
    limit: 3,
    lang: "en",
    autocomplete: false,
    ...(bias ? { proximity: bias } : {}),
  });
  return outcome.ok ? (outcome.places[0] ?? null) : null;
}

/** Centre of the trip's first findable city (else the destination) to bias and bound venue lookups. */
async function tripAnchor(cities: string[], destination: string) {
  for (const name of [...cities, destination]) {
    const hit = await geocode(name).catch(() => null);
    if (hit) return hit;
  }
  return null;
}

/** One map centre per trip city (up to 3), so ideas cover every city; the destination if none. */
async function tripAnchors(cities: string[], destination: string) {
  const list: { lat: number; lng: number; name: string }[] = [];
  for (const name of cities.slice(0, 3)) {
    const hit = await geocode(name).catch(() => null);
    if (hit) list.push({ lat: hit.lat, lng: hit.lng, name });
  }
  if (list.length) return list;
  const fallback = await tripAnchor([], destination);
  return fallback ? [{ lat: fallback.lat, lng: fallback.lng, name: destination }] : [];
}

/** A place farther than this from the trip's destination is treated as a wrong match. */
const MAX_DISTANCE_KM = 60;

async function verifyIdeas(
  raw: ReturnType<typeof cleanRawIdeas>,
  sources: Source[],
  destination: string,
  cities: string[] = [],
): Promise<PlaceIdea[]> {
  // The town gazetteer cannot find venues. Then ideas stay grounded in the pages we fetched
  // (each cites one) and are shown without a pin, instead of every idea being dropped.
  const venueCheck = placeSearchTarget()?.provider !== "gazetteer";
  const anchor = await tripAnchor(cities, destination);
  const bias = anchor ? { lat: anchor.lat, lng: anchor.lng } : undefined;
  const checked = await Promise.all(
    raw.map(async (idea): Promise<PlaceIdea | null> => {
      // A real venue point first (OpenStreetMap, free); the town gazetteer only as a last resort.
      const venue = bias ? await lookupVenuePoint(idea.name, bias).catch(() => null) : null;
      const hit = venue
        ? { lat: venue.lat, lng: venue.lng, label: venue.label, subtitle: "" }
        : await geocode(`${idea.name} ${destination}`, bias);
      if (!hit && venueCheck) return null;
      if (hit && anchor && distanceKm(bias!, { lat: hit.lat, lng: hit.lng }) > MAX_DISTANCE_KM)
        return null;
      const image =
        (hit
          ? await lookupPlaceImage({ lat: hit.lat, lng: hit.lng }, [idea.name]).catch(() => null)
          : null) ?? (await lookupPlaceImageByName(idea.name, destination).catch(() => null));
      const source = sources[idea.source - 1]!;
      return {
        key: placeIdeaKey(idea.name, hit?.lat ?? null, hit?.lng ?? null),
        name: idea.name,
        category: idea.category,
        why: idea.why,
        area: hit ? hit.subtitle || hit.label : destination,
        lat: hit?.lat ?? null,
        lng: hit?.lng ?? null,
        sourceHost: sourceHost(source.url),
        sourceUrl: source.url,
        imageUrl: image?.url ?? null,
      };
    }),
  );
  return checked.filter((idea): idea is PlaceIdea => idea !== null);
}

/* ------------------------------------------------------------- ideas from the map (OpenStreetMap) */

const CATEGORY_WORD: Record<string, string> = {
  food: "Tempat makan",
  cafe: "Kafe",
  sight: "Tempat wisata",
  nature: "Taman / alam",
  shop: "Tempat belanja",
};

/**
 * Places come from the map (always with coordinates); Wikipedia adds the text and the photo, and
 * the AI only phrases one sentence from those facts.
 */
async function ideasFromMap(
  anchors: { lat: number; lng: number; name: string }[],
  category: PlaceIdeaCategoryId,
  limit: number,
  destination: string,
  model: string,
) {
  // Each city gets its share of the list, taken in turns so no city crowds the others out.
  const perCity = await Promise.all(
    anchors.map((anchor) => discoverPlaces(anchor, category, limit + 4)),
  );
  const found: Awaited<ReturnType<typeof discoverPlaces>> = [];
  for (let round = 0; found.length < limit + 4 && round < limit + 4; round += 1) {
    for (const list of perCity) {
      const next = list[round];
      if (next && found.length < limit + 4) found.push(next);
    }
  }
  const withFacts = await Promise.all(
    found.map(async (candidate) => ({ candidate, wiki: await wikipediaFacts(candidate) })),
  );
  const list = withFacts.map(({ candidate, wiki }, index) => {
    const facts = [wiki.extract, ...candidate.facts].filter(Boolean).join(" | ");
    return `[${index + 1}] ${candidate.name} (${CATEGORY_WORD[candidate.category]})${facts ? `: ${facts}` : ""}`;
  });
  let usage = { input: 0, output: 0 };
  const why = new Map<number, string>();
  if (list.length) {
    try {
      const answer = await askModel(model, `City: ${destination}\n${list.join("\n")}`, {
        system: WHY_SYSTEM_PROMPT,
        schema: WHY_SCHEMA,
        name: "place_why",
      });
      usage = answer.usage;
      const items = (answer.parsed as { items?: { id?: unknown; why?: unknown }[] } | null)?.items;
      for (const item of items ?? []) {
        if (Number.isInteger(item.id) && typeof item.why === "string" && item.why.trim())
          why.set(Number(item.id), item.why.trim().slice(0, 140));
      }
    } catch {
      // Fall back to the plain description below.
    }
  }
  const ideas = await Promise.all(
    withFacts.map(async ({ candidate, wiki }, index): Promise<PlaceIdea> => {
      const image =
        wiki.imageUrl ??
        (await lookupPlaceImage({ lat: candidate.lat, lng: candidate.lng }, [candidate.name])
          .then((r) => r?.url ?? null)
          .catch(() => null)) ??
        (await lookupPlaceImageByName(candidate.name, destination)
          .then((r) => r?.url ?? null)
          .catch(() => null));
      const fromWiki = Boolean(wiki.pageUrl);
      return {
        key: placeIdeaKey(candidate.name, candidate.lat, candidate.lng),
        name: candidate.name,
        category: candidate.category,
        why: why.get(index + 1) ?? CATEGORY_WORD[candidate.category] ?? "Tempat",
        area: destination,
        lat: candidate.lat,
        lng: candidate.lng,
        sourceHost: fromWiki ? "wikipedia.org" : "openstreetmap.org",
        sourceUrl: wiki.pageUrl ?? osmUrl(candidate),
        imageUrl: image,
      };
    }),
  );
  return { ideas, usage };
}

/* --------------------------------------------------------------------------- main entry */

const inputSchema = z.object({
  tripId: z.string().uuid(),
  category: z.enum(["all", "food", "cafe", "sight", "nature", "shop"]).default("all"),
  query: z.string().trim().max(80).default(""),
});
export const placeIdeasInput = (data: unknown) => inputSchema.parse(data);

const inFlight = new Map<string, Promise<PlaceIdeasResponse>>();

async function hiddenKeys() {
  try {
    const result = await pool.query("select place_key from public.travel_place_idea_hidden");
    return new Set(result.rows.map((row) => String(row.place_key)));
  } catch {
    return new Set<string>();
  }
}

export async function getPlaceIdeas(
  userId: string,
  input: ReturnType<typeof placeIdeasInput>,
  now = new Date(),
): Promise<PlaceIdeasResponse> {
  const { config } = await readPlaceIdeasConfig();
  if (!config.enabled || !placeIdeasConfigured())
    return { status: "disabled", message: "Ide tempat sedang tidak tersedia.", remaining: 0 };
  const destination = await ownedTrip(input.tripId, userId);
  if (!destination)
    return {
      status: "empty",
      message: "Isi tujuan perjalanan dulu agar ide tempat bisa dicari.",
      remaining: 0,
    };
  // The trip's cities keep ideas inside them ("Tokyo"), not anywhere in the country.
  const cityRows = await pool
    .query(
      "select name from public.travel_trip_cities where trip_id=$1 order by sort_order, created_at",
      [input.tripId],
    )
    .catch(() => null);
  const tripCities = (cityRows?.rows ?? []).map((r) => String(r.name)).filter(Boolean);
  const scope = tripCities.length ? `${tripCities.join(", ")}, ${destination}` : destination;
  const used = await usedToday(userId, now);
  const remaining = Math.max(0, config.dailyLimit - used);
  const cacheKey = `${input.query ? "" : "map3|"}${placeIdeasCacheKey(scope, input.category, input.query)}`;
  const hidden = await hiddenKeys();
  const visible = (ideas: PlaceIdea[]) =>
    ideas.filter((idea) => !hidden.has(idea.key)).slice(0, config.maxIdeas);

  // A fresh cached answer is free and does not count toward the daily limit.
  const cached = await pool
    .query(
      `select ideas from public.travel_place_idea_cache
       where cache_key = $1 and created_at > now() - ($2::int * interval '1 day')`,
      [cacheKey, config.cacheDays],
    )
    .catch(() => null);
  const hit = cached?.rows[0]?.ideas as PlaceIdea[] | undefined;
  if (hit && visible(hit).length) {
    const shown = visible(hit);
    // Older cached answers may lack a map point or a photo: find them by name and save for everyone.
    const missing = shown.filter((idea) => !idea.imageUrl || idea.lat === null);
    if (missing.length) {
      const anchor = await tripAnchor(tripCities, destination);
      let changed = false;
      for (const idea of missing) {
        if (idea.lat === null && anchor) {
          const venue = await lookupVenuePoint(idea.name, anchor).catch(() => null);
          if (venue && distanceKm(anchor, venue) <= MAX_DISTANCE_KM) {
            idea.lat = venue.lat;
            idea.lng = venue.lng;
            idea.area = venue.label || idea.area;
            changed = true;
          }
        }
        if (!idea.imageUrl) {
          const image = await lookupPlaceImageByName(idea.name, destination).catch(() => null);
          if (image) {
            idea.imageUrl = image.url;
            changed = true;
          }
        }
      }
      if (changed) {
        await pool
          .query(
            "update public.travel_place_idea_cache set ideas = $2::jsonb where cache_key = $1",
            [cacheKey, JSON.stringify(hit)],
          )
          .catch(() => undefined);
      }
    }
    return { status: "ok", ideas: shown, cached: true, remaining, destination };
  }

  if (remaining <= 0)
    return {
      status: "limit",
      message: `Pencarian ide hari ini habis (${config.dailyLimit}x). Besok bisa lagi.`,
      remaining: 0,
    };

  const running = inFlight.get(cacheKey);
  if (running) return running;
  const job = (async (): Promise<PlaceIdeasResponse> => {
    if (!reserveSearchSlot())
      return { status: "busy", message: "Sedang ramai. Coba lagi sebentar.", remaining };
    const kind = placeIdeaCategory(input.category);
    const phrase = input.query ? `${input.query}` : kind.search;
    let usage = { input: 0, output: 0 };
    try {
      const mapAnchors = input.query ? [] : await tripAnchors(tripCities, destination);
      if (mapAnchors.length) {
        const result = await ideasFromMap(
          mapAnchors,
          input.category,
          config.maxIdeas,
          tripCities.join(", ") || destination,
          config.model,
        );
        if (result.ideas.length) {
          await pool
            .query(
              `insert into public.travel_place_idea_runs
                 (customer_auth_subject, trip_id, cache_key, status, model, places, tokens_in, tokens_out, cost_idr)
               values ($1,$2,$3,'ok',$4,$5,$6,$7,$8)`,
              [
                userId,
                input.tripId,
                cacheKey,
                config.model,
                result.ideas.length,
                result.usage.input,
                result.usage.output,
                estimateCostIdr(config.model, result.usage),
              ],
            )
            .catch(() => undefined);
          await pool
            .query(
              `insert into public.travel_place_idea_cache (cache_key, destination, category, query, ideas, created_at)
               values ($1,$2,$3,$4,$5::jsonb, now())
               on conflict (cache_key) do update set ideas = excluded.ideas, created_at = now()`,
              [cacheKey, destination, input.category, input.query, JSON.stringify(result.ideas)],
            )
            .catch(() => undefined);
          return {
            status: "ok",
            ideas: visible(result.ideas),
            cached: false,
            remaining: Math.max(0, remaining - 1),
            destination,
          };
        }
      }
      const found = await searchWeb(`${phrase} in ${scope} travel guide`);
      const sources = await fetchPages(found);
      if (!sources.length) throw new Error("no_sources");
      const prompt = [
        `Destination: ${destination}`,
        ...(tripCities.length
          ? [`Trip cities: ${tripCities.join(", ")} (only places in these cities)`]
          : []),
        `Wanted: ${input.query || kind.label}`,
        `Return up to ${config.maxIdeas + 2} places.`,
        ...sources.map((s, i) => `\n[${i + 1}] ${s.title} (${s.url})\n${s.text}`),
      ].join("\n");
      const answer = await askModel(config.model, prompt);
      usage = answer.usage;
      const raw = cleanRawIdeas(answer.parsed, sources.length, config.maxIdeas + 6).filter((idea) =>
        ideaInTripCities(idea.city, tripCities),
      );
      const ideas = await verifyIdeas(raw, sources, destination, tripCities);
      await pool
        .query(
          `insert into public.travel_place_idea_runs
             (customer_auth_subject, trip_id, cache_key, status, model, places, tokens_in, tokens_out, cost_idr)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            userId,
            input.tripId,
            cacheKey,
            ideas.length ? "ok" : "empty",
            config.model,
            ideas.length,
            usage.input,
            usage.output,
            estimateCostIdr(config.model, usage),
          ],
        )
        .catch(() => undefined);
      if (!ideas.length)
        return {
          status: "empty",
          message: "Belum ada ide yang cocok. Coba kata kunci lain.",
          remaining: Math.max(0, remaining - 1),
        };
      await pool
        .query(
          `insert into public.travel_place_idea_cache (cache_key, destination, category, query, ideas, created_at)
           values ($1,$2,$3,$4,$5::jsonb, now())
           on conflict (cache_key) do update set ideas = excluded.ideas, created_at = now()`,
          [cacheKey, destination, input.category, input.query, JSON.stringify(ideas)],
        )
        .catch(() => undefined);
      return {
        status: "ok",
        ideas: visible(ideas),
        cached: false,
        remaining: Math.max(0, remaining - 1),
        destination,
      };
    } catch (error) {
      console.error("[place-ideas] search failed", error instanceof Error ? error.message : error);
      await pool
        .query(
          `insert into public.travel_place_idea_runs
             (customer_auth_subject, trip_id, cache_key, status, model) values ($1,$2,$3,'error',$4)`,
          [userId, input.tripId, cacheKey, config.model],
        )
        .catch(() => undefined);
      return { status: "error", message: "Ide belum bisa dimuat. Coba lagi sebentar.", remaining };
    }
  })().finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, job);
  return job;
}

export async function placeIdeasHandler({ data }: { data: ReturnType<typeof placeIdeasInput> }) {
  const user = await getAuthenticatedUser();
  return getPlaceIdeas(user.id, data);
}

export async function placeIdeasStatusHandler() {
  const user = await getAuthenticatedUser();
  return placeIdeasStatus(user.id);
}

/* ------------------------------------------------------------------------------- admin */

export type PlaceIdeasStats = {
  searches: number;
  failedPercent: number;
  costIdr: number;
  cachedCities: number;
  hidden: number;
};

async function readStats(): Promise<PlaceIdeasStats> {
  try {
    const [runs, cache, hidden] = await Promise.all([
      pool.query(
        `select count(*)::int as searches,
                count(*) filter (where status = 'error')::int as failed,
                coalesce(sum(cost_idr), 0)::float as cost
         from public.travel_place_idea_runs where created_at > now() - interval '30 days'`,
      ),
      pool.query("select count(*)::int as n from public.travel_place_idea_cache"),
      pool.query("select count(*)::int as n from public.travel_place_idea_hidden"),
    ]);
    const row = (runs.rows[0] ?? {}) as Record<string, number>;
    const searches = Number(row["searches"]) || 0;
    return {
      searches,
      failedPercent: searches ? Math.round((Number(row["failed"]) / searches) * 1000) / 10 : 0,
      costIdr: Math.round(Number(row["cost"]) || 0),
      cachedCities: Number(cache.rows[0]?.n) || 0,
      hidden: Number(hidden.rows[0]?.n) || 0,
    };
  } catch {
    return { searches: 0, failedPercent: 0, costIdr: 0, cachedCities: 0, hidden: 0 };
  }
}

export type AdminIdeaRow = {
  key: string;
  name: string;
  destination: string;
  category: string;
  sourceHost: string;
  hidden: boolean;
};

/** Recent cached ideas so the team can hide a wrong or closed place. */
async function readRecentIdeas(): Promise<AdminIdeaRow[]> {
  try {
    const [cache, hidden] = await Promise.all([
      pool.query(
        "select destination, ideas from public.travel_place_idea_cache order by created_at desc limit 8",
      ),
      hiddenKeys(),
    ]);
    const rows: AdminIdeaRow[] = [];
    for (const entry of cache.rows) {
      for (const idea of (entry.ideas as PlaceIdea[]) ?? []) {
        rows.push({
          key: idea.key,
          name: idea.name,
          destination: String(entry.destination),
          category: idea.category,
          sourceHost: idea.sourceHost,
          hidden: hidden.has(idea.key),
        });
      }
    }
    return rows.slice(0, 40);
  } catch {
    return [];
  }
}

export const getAdminPlaceIdeasHandler = async () => {
  await requireAdmin();
  const [record, stats, recent] = await Promise.all([
    readPlaceIdeasConfig(),
    readStats(),
    readRecentIdeas(),
  ]);
  return {
    ...record,
    stats,
    recent,
    keys: {
      ai: Boolean(process.env["HELIPOD_AI_KEY"]),
      tinyfish: Boolean(process.env["TINYFISH_API_KEY"]),
    },
  };
};

const adminSaveSchema = z.object({
  config: z.unknown(),
  reason: z.string().trim().min(4).max(300),
  expectedVersion: z.number().int().min(0),
});
export const savePlaceIdeasConfigInput = (data: unknown) => adminSaveSchema.parse(data);

export async function savePlaceIdeasConfigHandler({
  data,
}: {
  data: ReturnType<typeof savePlaceIdeasConfigInput>;
}) {
  await requireAdmin();
  const config = parsePlaceIdeasConfig(data.config);
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      "select value_json, version from public.admin_settings where setting_key = $1 for update",
      [PLACE_IDEAS_SETTING_KEY],
    );
    const row = current.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    const version = row ? Number(row.version) : 0;
    if (version !== data.expectedVersion) {
      await client.query("rollback");
      return { ok: false as const, conflict: true as const, version };
    }
    const audit = buildSettingAudit(
      PLACE_IDEAS_SETTING_KEY,
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
      [PLACE_IDEAS_SETTING_KEY, JSON.stringify(config)],
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
    return { ok: true as const, conflict: false as const, version: version + 1, config };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const hideSchema = z.object({
  key: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(120),
  destination: z.string().trim().max(120).default(""),
  hidden: z.boolean(),
});
export const hidePlaceIdeaInput = (data: unknown) => hideSchema.parse(data);

/** Hides (or shows again) one idea for every traveler, and records it in the audit log. */
export async function hidePlaceIdeaHandler({
  data,
}: {
  data: ReturnType<typeof hidePlaceIdeaInput>;
}) {
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  if (data.hidden) {
    await pool.query(
      `insert into public.travel_place_idea_hidden (place_key, name, destination, hidden_by)
       values ($1,$2,$3,$4) on conflict (place_key) do nothing`,
      [data.key, data.name, data.destination, actor],
    );
  } else {
    await pool.query("delete from public.travel_place_idea_hidden where place_key = $1", [
      data.key,
    ]);
  }
  await pool.query(
    `insert into public.admin_audit_logs (id, action, entity_type, entity_id, reason, before_json, after_json)
     values ($1, $2, 'place_idea', $3, $4, '{}'::jsonb, $5::jsonb)`,
    [
      randomUUID(),
      data.hidden ? "place_idea.hide" : "place_idea.unhide",
      data.key,
      `${actor}: ${data.hidden ? "sembunyikan" : "tampilkan kembali"} ${data.name}`,
      JSON.stringify({ hidden: data.hidden }),
    ],
  );
  return { ok: true as const };
}

/** Drops every cached answer so the next search fetches fresh ideas. */
export async function clearPlaceIdeasCacheHandler() {
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const result = await pool.query("delete from public.travel_place_idea_cache");
  await pool.query(
    `insert into public.admin_audit_logs (id, action, entity_type, entity_id, reason, before_json, after_json)
     values ($1, 'place_idea.clear_cache', 'place_idea', 'cache', $2, '{}'::jsonb, $3::jsonb)`,
    [
      randomUUID(),
      `${actor}: bersihkan cache ide tempat`,
      JSON.stringify({ deleted: result.rowCount ?? 0 }),
    ],
  );
  return { ok: true as const, deleted: result.rowCount ?? 0 };
}

/* ------------------------------------------------------------ pin an existing activity on the map */

const pinSchema = z.object({ itemId: z.string().uuid() });
export const pinItemInput = (data: unknown) => pinSchema.parse(data);

/**
 * The traveler taps "Pasang di peta" on an activity that has no point: find the place by name near
 * the trip's city and save the point. Only on request, so typed locations never move on their own.
 */
export async function pinItemOnMapHandler({ data }: { data: ReturnType<typeof pinItemInput> }) {
  const user = await getAuthenticatedUser();
  const row = (
    await pool.query(
      `select i.id, i.title, i.location, i.latitude, t.id as trip_id, t.destination_name
       from public.travel_itinerary_items i join public.travel_trips t on t.id = i.trip_id
       where i.id = $1 and t.customer_auth_subject = $2`,
      [data.itemId, user.id],
    )
  ).rows[0] as
    | {
        title: string;
        location: string | null;
        latitude: number | null;
        trip_id: string;
        destination_name: string | null;
      }
    | undefined;
  if (!row) throw new Error("Aktivitas tidak ditemukan");
  if (row.latitude !== null) return { found: true };
  const cities = (
    await pool
      .query(
        "select name, latitude, longitude from public.travel_trip_cities where trip_id=$1 order by sort_order, created_at",
        [row.trip_id],
      )
      .catch(() => null)
  )?.rows as { name: string; latitude: number | null; longitude: number | null }[] | undefined;
  const stored = cities?.find((c) => c.latitude !== null && c.longitude !== null);
  const anchor = stored
    ? { lat: Number(stored.latitude), lng: Number(stored.longitude) }
    : await tripAnchor(
        (cities ?? []).map((c) => c.name),
        String(row.destination_name ?? ""),
      );
  if (!anchor) return { found: false };
  const names = [row.location, row.title].filter((n): n is string => Boolean(n?.trim()));
  for (const name of names) {
    const venue = await lookupVenuePoint(name, anchor).catch(() => null);
    if (venue && distanceKm(anchor, venue) <= MAX_DISTANCE_KM) {
      await pool.query(
        "update public.travel_itinerary_items set latitude=$2, longitude=$3, place_label=$4 where id=$1",
        [data.itemId, venue.lat, venue.lng, venue.label.slice(0, 200)],
      );
      return { found: true };
    }
  }
  return { found: false };
}
