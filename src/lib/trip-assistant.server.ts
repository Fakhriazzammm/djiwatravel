import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { buildSettingAudit } from "./admin-settings";
import { resolveTripOwner, type TripOwner } from "./guest-trips.server";
import { resolveTravoCards } from "./travo-cards.server";
import {
  addBudgetCategory,
  addChecklistItem,
  addExpense,
  addItineraryItem,
  deleteChecklistItem,
  deleteItineraryItem,
  deleteTripItem,
  getTripDashboard,
  patchBudgetCategory,
  updateItineraryItem,
  updateTrip,
} from "./my-trips.server";
import { fetchFxRate } from "./receipt-scan.server";
import {
  hoursNote,
  nominatimVenue,
  pinMissingPlaces,
  tripAnchor,
  verifyAgendaPlaces,
} from "./trip-assistant-places.server";
import {
  alternativesNear,
  deleteCityCosts,
  iataFor,
  getCityCosts,
  listCityCosts,
  saveCityCosts,
  getPlaceCandidates,
  loadPlanResearch,
} from "./trip-plan.server";
import {
  FULL_PLAN_SCHEMA,
  buildDayPools,
  buildFullPlanContext,
  buildFullPlanPrompt,
  buildStrategyRows,
  cleanFullPlan,
  computeBudgetPlan,
  costKey,
  sanitizeCityCosts,
  type PlaceKind,
} from "./trip-plan";
import { jakartaDayStart } from "./receipt-scan";
import { hoursForDay, isOpenAt, weekdayIndex } from "./opening-hours";
import {
  ASSISTANT_INTENTS,
  ASSISTANT_MAX_TEXT,
  ASSISTANT_REPLY_SCHEMA,
  DEFAULT_TRIP_ASSISTANT_CONFIG,
  TRIP_ASSISTANT_SETTING_KEY,
  assistantCostIdr,
  buildAssistantContext,
  buildAssistantSystemPrompt,
  buildGeneralContext,
  buildTravoGeneralPrompt,
  isTravoScope,
  scopeFromCards,
  toMinor,
  type GeneralFacts,
  type TravoConversationSummary,
  type TravoCardRequest,
  type TravoScope,
  cleanAssistantReply,
  detectIntent,
  extractReplyPrefix,
  FLIGHT_WORDS,
  isGenerationIntent,
  normalizeTripAssistantConfig,
  parseJsonLoose,
  parseTripAssistantConfig,
  type AgendaChange,
  type AssistantIntent,
  type AssistantMessage,
  type AssistantSendResult,
  type AssistantStatus,
  type ProposalPayload,
  type ProposalView,
  type TripAssistantConfig,
  type TripFacts,
} from "./trip-assistant";

/* ------------------------------------------------------------------------------- config */

export type TripAssistantConfigRecord = { config: TripAssistantConfig; version: number };

export async function readTripAssistantConfig(): Promise<TripAssistantConfigRecord> {
  try {
    const result = await pool.query(
      "select value_json, version from public.admin_settings where setting_key = $1",
      [TRIP_ASSISTANT_SETTING_KEY],
    );
    const row = result.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    if (!row) return { config: DEFAULT_TRIP_ASSISTANT_CONFIG, version: 0 };
    return {
      config: normalizeTripAssistantConfig(row.value_json),
      version: Number(row.version) || 0,
    };
  } catch {
    return { config: DEFAULT_TRIP_ASSISTANT_CONFIG, version: 0 };
  }
}

/** The key lives only on the server. Without it the chat stays hidden for travelers. */
export const tripAssistantConfigured = () => Boolean(process.env["HELIPOD_AI_KEY"]);
const aiBase = () =>
  (process.env["HELIPOD_AI_BASE_URL"] || "https://ai.helipod.io/v1").replace(/\/$/, "");

const dailyLimitFor = (config: TripAssistantConfig, guest: boolean) =>
  guest ? config.guestDailyMessages : config.dailyMessages;

async function usedToday(subject: string, now = new Date()) {
  const result = await pool.query(
    "select coalesce(sum(units),0)::int as n from public.travel_assistant_runs where customer_auth_subject=$1 and created_at >= $2 and status <> 'blocked'",
    [subject, jakartaDayStart(now)],
  );
  return Number(result.rows[0]?.n) || 0;
}

async function statusFor(owner: TripOwner): Promise<{
  status: AssistantStatus;
  config: TripAssistantConfig;
}> {
  const { config } = await readTripAssistantConfig();
  if (!config.enabled) return { status: { available: false, reason: "off" }, config };
  if (!tripAssistantConfigured()) return { status: { available: false, reason: "key" }, config };
  if (owner.guest && (!config.guestEnabled || config.guestDailyMessages < 1))
    return { status: { available: false, reason: "guest" }, config };
  const limit = dailyLimitFor(config, owner.guest);
  const used = await usedToday(owner.id);
  return {
    config,
    status: {
      available: true,
      guest: owner.guest,
      remaining: Math.max(0, limit - used),
      dailyLimit: limit,
      canAgenda: config.allowAgenda,
      canBudget: config.allowBudget,
    },
  };
}

/* --------------------------------------------------------------------------- trip facts */

type TripRow = {
  id: string;
  name: string;
  destination_name: string;
  destination_code: string;
  departure_date: string | null;
  return_date: string | null;
  travelers_count: number;
  primary_currency: string;
  total_budget_minor: number;
  timezone: string | null;
};

async function ownedTripRow(tripId: string, subject: string): Promise<TripRow> {
  const result = await pool.query(
    `select id, name, destination_name, destination_code,
            to_char(departure_date, 'YYYY-MM-DD') as departure_date,
            to_char(return_date, 'YYYY-MM-DD') as return_date,
            travelers_count, primary_currency, total_budget_minor::bigint::text as total_budget_minor, timezone
     from public.travel_trips where id=$1 and customer_auth_subject=$2 limit 1`,
    [tripId, subject],
  );
  const row = result.rows[0] as
    (Omit<TripRow, "total_budget_minor"> & { total_budget_minor: string }) | undefined;
  if (!row) throw new Error("Perjalanan tidak ditemukan");
  return { ...row, total_budget_minor: Number(row.total_budget_minor) || 0 };
}

const todayJakarta = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

/** Verified places from the shared "Ide tempat" cache, so itineraries start from real places. */
async function knownPlacesFor(names: string[]): Promise<TripFacts["knownPlaces"]> {
  const wanted = names.filter(Boolean).slice(0, 3);
  if (!wanted.length) return [];
  try {
    const out: TripFacts["knownPlaces"] = [];
    for (const name of wanted) {
      const result = await pool.query(
        `select ideas from public.travel_place_idea_cache
         where destination ilike $1 order by created_at desc limit 4`,
        [`%${name.replace(/[%_]/g, "")}%`],
      );
      for (const row of result.rows) {
        for (const idea of (row.ideas as Record<string, unknown>[]) ?? []) {
          const n = String(idea["name"] ?? "").trim();
          if (!n || out.some((p) => p.name === n)) continue;
          out.push({
            name: n,
            area: String(idea["area"] ?? "").slice(0, 60),
            why: String(idea["why"] ?? "").slice(0, 90),
            category: String(idea["category"] ?? ""),
          });
          if (out.length >= 14) return out;
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function loadFacts(tripId: string, withPlaces: boolean): Promise<TripFacts> {
  const dash = await getTripDashboard(tripId);
  const trip = dash.trip as unknown as TripRow & { cities?: { name: string }[] };
  const spentBy = new Map<string, number>();
  for (const e of dash.expenses as {
    category_id?: string | null;
    converted_amount_minor: number;
  }[])
    if (e.category_id)
      spentBy.set(e.category_id, (spentBy.get(e.category_id) ?? 0) + e.converted_amount_minor);
  const cityNames = (trip.cities ?? []).map((c) => c.name);
  return {
    today: todayJakarta(),
    name: String(trip.name),
    destination: String(trip.destination_name),
    departureDate: (trip.departure_date as string | null) ?? null,
    returnDate: (trip.return_date as string | null) ?? null,
    travelers: Number(trip.travelers_count) || 1,
    currency: String(trip.primary_currency || "IDR"),
    totalBudgetMinor: Number(dash.trip.total_budget_minor) || 0,
    spentMinor: dash.totals.spentMinor,
    cities: cityNames,
    originCode:
      (await pool.query("select origin_code from public.travel_trips where id=$1", [tripId]))
        .rows[0]?.origin_code ?? null,
    itinerary: (dash.itinerary as Record<string, unknown>[]).map((i) => ({
      id: String(i["id"]),
      date: String(i["activity_date"] ?? ""),
      start: i["start_time"] ? String(i["start_time"]).slice(0, 5) : null,
      end: i["end_time"] ? String(i["end_time"]).slice(0, 5) : null,
      title: String(i["title"] ?? ""),
      location: i["location"] ? String(i["location"]) : null,
      category: i["activity_category"] ? String(i["activity_category"]) : null,
      costMinor: i["estimated_cost_minor"] ? Number(i["estimated_cost_minor"]) : null,
    })),
    checklist: (dash.checklist as Record<string, unknown>[]).map((c) => ({
      id: String(c["id"]),
      title: String(c["title"] ?? ""),
      done: Boolean(c["is_completed"]),
    })),
    budget: (dash.budget as Record<string, unknown>[]).map((b) => ({
      name: String(b["name"] ?? ""),
      allocatedMinor: Number(b["allocated_minor"]) || 0,
      spentMinor: spentBy.get(String(b["id"])) ?? 0,
    })),
    bookings: (dash.bookings as Record<string, unknown>[]).map((b) => ({
      title: String(b["title"] ?? ""),
      category: String(b["category"] ?? ""),
      status: String(b["status"] ?? ""),
    })),
    knownPlaces: withPlaces
      ? await knownPlacesFor(cityNames.length ? cityNames : [String(trip.destination_name)])
      : [],
  };
}

/* ----------------------------------------------------------------------------- AI call */

type ModelOutcome = {
  parsed: unknown;
  usage: { input: number; output: number };
};

/** Reads an OpenAI-style event stream, calling `onReply` with the new reply text as it arrives. */
async function readModelStream(
  response: Response,
  onReply: (delta: string) => void,
): Promise<{ content: string; usage: { input: number; output: number } | null }> {
  const reader = response.body?.getReader();
  if (!reader) return { content: "", usage: null };
  const decoder = new TextDecoder();
  let pending = "";
  let content = "";
  let shown = 0;
  let usage: { input: number; output: number } | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, nl).trim();
      pending = pending.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: unknown } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const piece = json.choices?.[0]?.delta?.content;
        if (typeof piece === "string" && piece) {
          content += piece;
          const reply = extractReplyPrefix(content).text;
          if (reply.length > shown) {
            onReply(reply.slice(shown));
            shown = reply.length;
          }
        }
        if (json.usage)
          usage = {
            input: Number(json.usage.prompt_tokens) || 0,
            output: Number(json.usage.completion_tokens) || 0,
          };
      } catch {
        /* a partial or non-JSON line is skipped */
      }
    }
  }
  return { content, usage };
}

async function askModel(
  model: string,
  system: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
  onReply?: (delta: string) => void,
  schema?: { name: string; schema: object },
): Promise<ModelOutcome> {
  const key = process.env["HELIPOD_AI_KEY"];
  if (!key) throw new Error("not_configured");
  const body = (withSchema: boolean, withEffort: boolean, stream: boolean) =>
    JSON.stringify({
      model,
      temperature: 0.35,
      max_tokens: maxTokens,
      ...(withEffort ? { reasoning_effort: "low" } : {}),
      ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
      messages: [{ role: "system", content: system }, ...messages],
      ...(withSchema
        ? {
            response_format: {
              type: "json_schema",
              json_schema: {
                name: schema?.name ?? "trip_assistant",
                strict: true,
                schema: schema?.schema ?? ASSISTANT_REPLY_SCHEMA,
              },
            },
          }
        : {}),
    });
  const call = (withSchema: boolean, withEffort: boolean, stream: boolean) =>
    fetch(`${aiBase()}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: body(withSchema, withEffort, stream),
      signal: AbortSignal.timeout(75_000),
    });
  const stream = Boolean(onReply);
  let response = await call(true, true, stream);
  // A model that rejects a parameter still answers when asked more plainly.
  if (response.status === 400) response = await call(true, false, stream);
  if (response.status === 400) response = await call(false, false, stream);
  if (response.status === 429 || response.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    response = await call(true, true, stream);
  }
  if (!response.ok) throw new Error(`ai_${response.status}`);
  const ctype = response.headers.get("content-type") ?? "";
  if (stream && ctype.includes("text/event-stream")) {
    const result = await readModelStream(response, onReply!);
    if (result.content.trim()) {
      return {
        parsed: parseJsonLoose(result.content),
        usage: result.usage ?? {
          input: Math.ceil(
            (system.length + messages.reduce((n, m) => n + m.content.length, 0)) / 3.5,
          ),
          output: Math.ceil(result.content.length / 3.5),
        },
      };
    }
    // An empty stream is retried once as a normal answer rather than shown as a failure.
    response = await call(true, true, false);
    if (!response.ok) throw new Error(`ai_${response.status}`);
  }
  const json = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = json.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : "";
  if (onReply) onReply(extractReplyPrefix(text).text);
  return {
    parsed: parseJsonLoose(text),
    usage: {
      input: Number(json.usage?.prompt_tokens) || 0,
      output: Number(json.usage?.completion_tokens) || 0,
    },
  };
}

/* One call at a time per traveler, and a short burst limit, so a double tap costs nothing. */
const inFlight = new Set<string>();
const recentCalls = new Map<string, number[]>();
/** Tests only: forget the per-traveler burst counters. */
export const clearAssistantBurst = () => recentCalls.clear();
export function allowAssistantBurst(subject: string, now = Date.now(), limit = 8) {
  const list = (recentCalls.get(subject) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= limit) {
    recentCalls.set(subject, list);
    return false;
  }
  list.push(now);
  recentCalls.set(subject, list);
  if (recentCalls.size > 2000) recentCalls.clear();
  return true;
}

/* ---------------------------------------------------------------------------- history */

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  chips: AssistantMessage["chips"];
  blocks: AssistantMessage["blocks"] | null;
  cards: TravoCardRequest[] | null;
  created_at: Date | string;
  proposal_id: string | null;
  p_kind: ProposalView["kind"] | null;
  p_title: string | null;
  p_status: ProposalView["status"] | null;
  p_payload: ProposalPayload | null;
};

async function previousItems(tripId: string, payloads: ProposalPayload[]) {
  const ids = new Set<string>();
  for (const p of payloads)
    if (p.kind === "agenda") for (const c of p.items) if (c.itemId) ids.add(c.itemId);
  if (!ids.size) return {} as ProposalView["previous"];
  const result = await pool.query(
    `select id, title, to_char(activity_date,'YYYY-MM-DD') as d, start_time
     from public.travel_itinerary_items where trip_id=$1 and id = any($2::uuid[])`,
    [tripId, [...ids]],
  );
  const out: ProposalView["previous"] = {};
  for (const r of result.rows)
    out[String(r.id)] = {
      title: String(r.title),
      date: String(r.d),
      startTime: r.start_time ? String(r.start_time).slice(0, 5) : null,
    };
  return out;
}

/** "Ringkas semua" is stored as a marker pair; the card itself is rebuilt from live trip data on every load. */
const SUMMARY_MARKER = "summary" as never;
const SUMMARY_ASK = "Ringkas semua perjalananku";

/** A conversation is read by its trip (the trip chat) or by its own id (a general Travo chat). */
type MessageFilter = { tripId: string } | { conversationId: string };

async function readMessages(
  filter: MessageFilter | string,
  limit = 60,
  owner?: TripOwner,
): Promise<AssistantMessage[]> {
  const f: MessageFilter = typeof filter === "string" ? { tripId: filter } : filter;
  const tripId = "tripId" in f ? f.tripId : null;
  const result = await pool.query(
    `select * from (
       select m.id, m.role, m.content, m.chips, m.blocks, m.cards, m.created_at, m.proposal_id,
              p.kind as p_kind, p.title as p_title, p.status as p_status, p.payload as p_payload
       from public.travel_assistant_messages m
       left join public.travel_assistant_proposals p on p.id = m.proposal_id
       where ${"tripId" in f ? "m.trip_id" : "m.conversation_id"}=$1 order by m.created_at desc limit $2
     ) x order by created_at asc`,
    ["tripId" in f ? f.tripId : f.conversationId, limit],
  );
  const rows = result.rows as MessageRow[];
  const previous = tripId
    ? await previousItems(
        tripId,
        rows.flatMap((r) => (r.p_payload ? [r.p_payload] : [])),
      )
    : {};
  // Cards are looked up again on every read, so prices and plans are live. Only the latest few are resolved.
  const wanted = owner
    ? rows.filter((r) => Array.isArray(r.cards) && r.cards.length).slice(-6)
    : [];
  const resolved = new Map<string, Awaited<ReturnType<typeof resolveTravoCards>>>();
  await Promise.all(
    wanted.map(async (r) => {
      resolved.set(r.id, await resolveTravoCards(r.cards ?? [], owner!));
    }),
  );
  return rows.map((r) => ({
    id: r.id,
    ...((resolved.get(r.id)?.length ?? 0) > 0 ? { cards: resolved.get(r.id)! } : {}),
    role: r.role,
    content: r.content,
    chips: r.chips ?? null,
    blocks: Array.isArray(r.blocks) ? r.blocks.filter((b) => b.kind !== SUMMARY_MARKER) : [],
    ...(r.role === "assistant" &&
    Array.isArray(r.blocks) &&
    r.blocks.some((b) => b.kind === SUMMARY_MARKER)
      ? { local: "summary" as const }
      : r.role === "user" && r.content === SUMMARY_ASK
        ? { local: "summary" as const }
        : {}),
    createdAt: new Date(r.created_at).toISOString(),
    proposal:
      r.proposal_id && r.p_kind && r.p_payload && r.p_status
        ? {
            id: r.proposal_id,
            kind: r.p_kind,
            title: r.p_title ?? "",
            status: r.p_status,
            payload: r.p_payload,
            previous,
          }
        : null,
  }));
}

const tripInput = z.object({ tripId: z.string().uuid() });
export const assistantLoadInput = (data: unknown) => tripInput.parse(data);

export async function assistantLoadHandler({
  data,
}: {
  data: ReturnType<typeof assistantLoadInput>;
}) {
  const owner = await resolveTripOwner();
  if (!owner)
    return { status: { available: false, reason: "off" } as AssistantStatus, messages: [] };
  await ownedTripRow(data.tripId, owner.id);
  const { status } = await statusFor(owner);
  if (!status.available) return { status, messages: [] as AssistantMessage[] };
  return { status, messages: await readMessages(data.tripId, 60, owner) };
}

export async function assistantResetHandler({
  data,
}: {
  data: ReturnType<typeof assistantLoadInput>;
}) {
  const owner = await resolveTripOwner();
  if (!owner) throw new Error("Autentikasi diperlukan");
  await ownedTripRow(data.tripId, owner.id);
  await pool.query(
    "delete from public.travel_assistant_messages where trip_id=$1 and customer_auth_subject=$2",
    [data.tripId, owner.id],
  );
  await pool.query(
    "delete from public.travel_assistant_proposals where trip_id=$1 and customer_auth_subject=$2 and status <> 'applied'",
    [data.tripId, owner.id],
  );
  return { ok: true as const };
}

/* ----------------------------------------------------------------- Travo page (all chats) */

export async function travoEntryHandler() {
  const { config } = await readTripAssistantConfig();
  return { available: config.enabled && tripAssistantConfigured() };
}

const conversationInput = z.object({
  conversationId: z.string().uuid().optional(),
  /** Open the chat of one trip (its conversation, or an empty one that the first message creates). */
  tripId: z.string().uuid().optional(),
});
export const travoLoadInput = (data: unknown) => conversationInput.parse(data ?? {});
const conversationIdInput = z.object({ conversationId: z.string().uuid() });
export const travoConversationInput = (data: unknown) => conversationIdInput.parse(data);

async function tripCurrencyOf(tripId: string): Promise<string | null> {
  const r = await pool.query("select primary_currency from public.travel_trips where id=$1", [
    tripId,
  ]);
  return (r.rows[0]?.primary_currency as string | undefined) ?? null;
}

/** One conversation (or the empty start screen) with the same status the trip chat uses. */
export async function travoLoadHandler({ data }: { data: ReturnType<typeof travoLoadInput> }) {
  const owner = await resolveTripOwner();
  if (!owner)
    return {
      status: { available: false, reason: "off" } as AssistantStatus,
      loggedIn: false as const,
      conversation: null,
      messages: [] as AssistantMessage[],
    };
  const { status } = await statusFor(owner);
  if (!status.available || (!data.conversationId && !data.tripId))
    return {
      status,
      loggedIn: true as const,
      conversation: null,
      messages: [] as AssistantMessage[],
    };
  if (data.tripId) await ownedTripRow(data.tripId, owner.id);
  const found = data.conversationId
    ? await pool.query(
        "select id, trip_id, title, scope from public.travel_assistant_conversations where id=$1 and customer_auth_subject=$2",
        [data.conversationId, owner.id],
      )
    : await pool.query(
        "select id, trip_id, title, scope from public.travel_assistant_conversations where trip_id=$1 and customer_auth_subject=$2",
        [data.tripId, owner.id],
      );
  const row = found.rows[0] as
    { id: string; trip_id: string | null; title: string; scope: string } | undefined;
  if (!row)
    return {
      status,
      loggedIn: true as const,
      // A trip without a chat yet: empty, and the first message creates its conversation.
      conversation: data.tripId
        ? {
            id: null as string | null,
            tripId: data.tripId,
            title: "",
            scope: "trip" as TravoScope,
            tripCurrency: await tripCurrencyOf(data.tripId),
          }
        : null,
      messages: [] as AssistantMessage[],
    };
  const scope: TravoScope = isTravoScope(row.scope) ? row.scope : "all";
  return {
    status,
    loggedIn: true as const,
    conversation: {
      id: row.id as string | null,
      tripId: row.trip_id,
      title: row.title,
      scope,
      tripCurrency: row.trip_id ? await tripCurrencyOf(row.trip_id) : null,
    },
    messages: await readMessages(
      row.trip_id ? { tripId: row.trip_id } : { conversationId: row.id },
      60,
      owner,
    ),
  };
}

/** History: every conversation of this traveler, trip chats included, newest first. */
export async function travoListHandler(): Promise<TravoConversationSummary[]> {
  const owner = await resolveTripOwner();
  if (!owner) return [];
  const result = await pool.query(
    `select c.id, c.trip_id, c.title, c.scope, c.last_message_at,
            (select m.content from public.travel_assistant_messages m
              where m.conversation_id = c.id order by m.created_at desc limit 1) as preview
     from public.travel_assistant_conversations c
     where c.customer_auth_subject=$1
       and exists (select 1 from public.travel_assistant_messages m where m.conversation_id = c.id)
     order by c.last_message_at desc limit 60`,
    [owner.id],
  );
  return result.rows.map((r) => ({
    id: String(r.id),
    tripId: (r.trip_id as string | null) ?? null,
    title: String(r.title || "Obrolan baru"),
    scope: isTravoScope(r.scope) ? r.scope : "all",
    lastMessageAt: new Date(r.last_message_at).toISOString(),
    preview: String(r.preview ?? "").slice(0, 90),
  }));
}

export async function travoDeleteHandler({
  data,
}: {
  data: ReturnType<typeof travoConversationInput>;
}) {
  const owner = await resolveTripOwner();
  if (!owner) throw new Error("Autentikasi diperlukan");
  const found = await pool.query(
    "select trip_id from public.travel_assistant_conversations where id=$1 and customer_auth_subject=$2",
    [data.conversationId, owner.id],
  );
  if (!found.rows[0]) return { ok: true as const };
  const tripId = found.rows[0].trip_id as string | null;
  // The trip chat and its history are one: deleting it from either page empties both.
  await pool.query(
    "delete from public.travel_assistant_messages where conversation_id=$1 and customer_auth_subject=$2",
    [data.conversationId, owner.id],
  );
  if (tripId)
    await pool.query(
      "delete from public.travel_assistant_proposals where trip_id=$1 and customer_auth_subject=$2 and status <> 'applied'",
      [tripId, owner.id],
    );
  await pool.query(
    "delete from public.travel_assistant_conversations where id=$1 and customer_auth_subject=$2",
    [data.conversationId, owner.id],
  );
  return { ok: true as const };
}

/* ----------------------------------------------------------------------------- sending */

const sendSchema = z.object({
  /** A trip chat. Without it, the message belongs to a general Travo conversation. */
  tripId: z.string().uuid().optional(),
  /** An existing conversation (general or trip). Omitted for a new general conversation. */
  conversationId: z.string().uuid().optional(),
  scope: z.string().optional(),
  text: z.string().trim().min(1).max(ASSISTANT_MAX_TEXT),
  intent: z.enum(ASSISTANT_INTENTS as [AssistantIntent, ...AssistantIntent[]]).optional(),
});
export const assistantSendInput = (data: unknown) => sendSchema.parse(data);

export type TurnEvent = { type: "delta"; text: string } | { type: "status"; text: string };

type Conversation = { id: string | null; tripId: string | null; scope: TravoScope };

/** Finds the conversation a message belongs to. A new general one is only created when the turn is stored. */
async function resolveConversation(
  owner: TripOwner,
  data: ReturnType<typeof assistantSendInput>,
): Promise<Conversation> {
  if (data.conversationId) {
    const found = await pool.query(
      "select id, trip_id, scope from public.travel_assistant_conversations where id=$1 and customer_auth_subject=$2",
      [data.conversationId, owner.id],
    );
    const row = found.rows[0] as { id: string; trip_id: string | null; scope: string } | undefined;
    if (!row) throw new Error("Obrolan tidak ditemukan");
    return {
      id: row.id,
      tripId: row.trip_id,
      scope: isTravoScope(row.scope) ? row.scope : "all",
    };
  }
  if (data.tripId) {
    const found = await pool.query(
      "select id from public.travel_assistant_conversations where customer_auth_subject=$1 and trip_id=$2",
      [owner.id, data.tripId],
    );
    return {
      id: (found.rows[0]?.id as string | undefined) ?? null,
      tripId: data.tripId,
      scope: "trip",
    };
  }
  // "trip" is allowed here: a general chat started from "Rencana trip" or "Cek trip saya".
  const scope = isTravoScope(data.scope) ? data.scope : "all";
  return { id: null, tripId: null, scope };
}

async function loadGeneralFacts(owner: TripOwner): Promise<GeneralFacts> {
  const trips = await pool
    .query(
      `select id, name, destination_name,
              to_char(departure_date,'YYYY-MM-DD') as d, to_char(return_date,'YYYY-MM-DD') as r
       from public.travel_trips where customer_auth_subject=$1 order by departure_date desc nulls last limit 8`,
      [owner.id],
    )
    .catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return {
    today: todayJakarta(),
    trips: trips.rows.map((t) => ({
      id: String(t["id"]),
      name: String(t["name"] ?? ""),
      destination: String(t["destination_name"] ?? ""),
      from: (t["d"] as string | null) ?? null,
      to: (t["r"] as string | null) ?? null,
    })),
    esimOrders: [],
  };
}

async function runTurn(
  data: ReturnType<typeof assistantSendInput>,
  emit?: (event: TurnEvent) => void,
): Promise<AssistantSendResult> {
  const owner = await resolveTripOwner();
  if (!owner) throw new Error("Autentikasi diperlukan");
  const conv = await resolveConversation(owner, data);
  const tripId = conv.tripId;
  if (tripId) await ownedTripRow(tripId, owner.id);
  const { status, config } = await statusFor(owner);
  if (!status.available)
    return { status: "disabled", message: "Travo sedang tidak tersedia.", remaining: 0 };
  if (status.remaining <= 0)
    return {
      status: "limit",
      remaining: 0,
      message: owner.guest
        ? "Batas obrolan hari ini habis. Masuk atau daftar untuk batas yang lebih besar, atau coba lagi besok."
        : "Batas obrolan hari ini habis. Coba lagi besok.",
    };
  if (inFlight.has(owner.id) || !allowAssistantBurst(owner.id))
    return {
      status: "busy",
      message: "Sebentar ya, jawaban sebelumnya masih diproses.",
      remaining: status.remaining,
    };
  inFlight.add(owner.id);
  const intent = tripId ? (data.intent ?? detectIntent(data.text)) : "chat";
  if (intent === "full_plan" && tripId) {
    try {
      return await runFullPlanTurn({ owner, conv, tripId, data, status, config, emit });
    } finally {
      inFlight.delete(owner.id);
    }
  }
  const model = isGenerationIntent(intent) ? config.generationModel : config.model;
  const filter: MessageFilter | null = tripId
    ? { tripId }
    : conv.id
      ? { conversationId: conv.id }
      : null;
  try {
    const facts = tripId ? await loadFacts(tripId, intent === "plan") : null;
    const general = tripId ? null : await loadGeneralFacts(owner);
    const history = (filter ? await readMessages(filter, 8) : [])
      .filter((m) => !m.local)
      .map((m) => ({
        role: m.role,
        content: m.proposal
          ? `${m.content}\n[usulan ${m.proposal.kind}: ${m.proposal.status}]`
          : m.content,
      }));
    const system = facts
      ? buildAssistantSystemPrompt(config, intent, facts.today)
      : buildTravoGeneralPrompt(config, conv.scope, general!.today);
    const userMessage = facts
      ? `DATA PERJALANAN (JSON):\n${buildAssistantContext(facts)}\n\nPESAN TRAVELER:\n${data.text}`
      : `DATA PENGGUNA (JSON):\n${buildGeneralContext(general!)}\n\nPESAN TRAVELER:\n${data.text}`;
    let outcome: Awaited<ReturnType<typeof askModel>>;
    try {
      outcome = await askModel(
        model,
        system,
        [...history, { role: "user", content: userMessage }],
        isGenerationIntent(intent) ? 4000 : 1400,
        emit ? (text) => emit({ type: "delta", text }) : undefined,
      );
    } catch (error) {
      console.error(
        "[trip-assistant] model failed",
        error instanceof Error ? error.message : error,
      );
      await recordRun(owner, tripId, conv, intent, "error", model, null, { input: 0, output: 0 });
      return {
        status: "error",
        remaining: status.remaining,
        message: "Travo sedang sibuk. Coba kirim lagi sebentar lagi.",
      };
    }
    // A general conversation can never change trip data: every proposal permission is off.
    const cleaned = cleanAssistantReply(outcome.parsed, {
      config: facts ? config : { ...config, allowAgenda: false, allowBudget: false },
      currency: facts?.currency ?? "IDR",
      departureDate: facts?.departureDate ?? null,
      returnDate: facts?.returnDate ?? null,
      itemIds: new Set(facts?.itinerary.map((i) => i.id) ?? []),
      budgetNames: facts?.budget.map((b) => b.name) ?? [],
      today: facts?.today ?? general!.today,
    });
    // The traveler asked about flights: show the live fares even when the model forgot the card.
    if (
      facts &&
      config.allowCommerce &&
      FLIGHT_WORDS.test(data.text) &&
      !cleaned.cards.some((c) => c.kind === "tiket")
    ) {
      if (!facts.originCode)
        cleaned.followUps.push(
          "Isi kota keberangkatan di Edit perjalanan, supaya aku bisa carikan harga tiketnya.",
        );
      else if (facts.departureDate && (facts.cities[0] || facts.destination)) {
        const to = await iataFor(facts.cities[0] || facts.destination);
        if (to)
          cleaned.cards.push({
            kind: "tiket",
            destination: "",
            query: "",
            from: facts.originCode,
            to,
            date: facts.departureDate,
            returnDate: "",
            days: 0,
          });
      }
    }
    if (facts && tripId && cleaned.proposal?.payload.kind === "agenda" && config.verifyHours) {
      emit?.({ type: "status", text: "Mengecek lokasi dan jam buka…" });
      await verifyAgendaPlaces(cleaned.proposal.payload.items, tripId, facts).catch((error) =>
        console.error(
          "[trip-assistant] place check failed",
          error instanceof Error ? error.message : error,
        ),
      );
    }
    if (
      !cleaned.reply &&
      !cleaned.followUps.length &&
      !cleaned.proposal &&
      !cleaned.blocks.length &&
      !cleaned.cards.length
    ) {
      await recordRun(owner, tripId, conv, intent, "error", model, null, outcome.usage);
      return {
        status: "error",
        remaining: status.remaining,
        message: "Jawaban Travo belum bisa dibaca. Coba ulangi dengan kalimat lain.",
      };
    }
    let conversationId = conv.id;
    let bubbleCount = 1;
    let topic: TravoScope = conv.scope;
    const client = await pool.connect();
    try {
      await client.query("begin");
      if (!conversationId) {
        const created = await client.query(
          tripId
            ? `insert into public.travel_assistant_conversations (customer_auth_subject, trip_id, title, scope)
               values ($1,$2,$3,'trip')
               on conflict (customer_auth_subject, trip_id) where trip_id is not null
               do update set last_message_at = now() returning id`
            : `insert into public.travel_assistant_conversations (customer_auth_subject, trip_id, title, scope)
               values ($1,$2,$3,$4) returning id`,
          tripId
            ? [owner.id, tripId, facts?.name ?? ""]
            : [owner.id, null, data.text.slice(0, 60), conv.scope],
        );
        conversationId = String(created.rows[0].id);
      }
      await client.query(
        "insert into public.travel_assistant_messages (trip_id, conversation_id, customer_auth_subject, role, content) values ($1,$2,$3,'user',$4)",
        [tripId, conversationId, owner.id, data.text],
      );
      let proposalId: string | null = null;
      if (cleaned.proposal && tripId) {
        proposalId = randomUUID();
        await client.query(
          `insert into public.travel_assistant_proposals (id, trip_id, customer_auth_subject, kind, title, payload)
           values ($1,$2,$3,$4,$5,$6::jsonb)`,
          [
            proposalId,
            tripId,
            owner.id,
            cleaned.proposal.payload.kind,
            cleaned.proposal.title,
            JSON.stringify(cleaned.proposal.payload),
          ],
        );
      }
      // The reply may be several bubbles; chips, blocks, cards and the proposal sit on the last one.
      const texts = [cleaned.reply, ...cleaned.followUps].filter(Boolean);
      if (!texts.length) texts.push(cleaned.proposal?.title || "Ini usulan saya.");
      for (let i = 0; i < texts.length; i += 1) {
        const last = i === texts.length - 1;
        await client.query(
          `insert into public.travel_assistant_messages (trip_id, conversation_id, customer_auth_subject, role, content, chips, blocks, cards, proposal_id, created_at)
           values ($1,$2,$3,'assistant',$4,$5::jsonb,$6::jsonb,$7::jsonb,$8, now() + ($9::int * interval '1 millisecond'))`,
          [
            tripId,
            conversationId,
            owner.id,
            texts[i],
            last && cleaned.chips ? JSON.stringify(cleaned.chips) : null,
            last && cleaned.blocks.length ? JSON.stringify(cleaned.blocks) : null,
            last && cleaned.cards.length ? JSON.stringify(cleaned.cards) : null,
            last ? proposalId : null,
            i + 1,
          ],
        );
      }
      bubbleCount = texts.length;
      // A chat that started without a topic takes the one its first product card is about.
      const inferred =
        !tripId && conv.scope === "all" ? scopeFromCards(cleaned.cards.map((c) => c.kind)) : null;
      if (inferred) {
        topic = inferred;
        await client.query(
          "update public.travel_assistant_conversations set scope=$2 where id=$1 and scope='all'",
          [conversationId, inferred],
        );
      }
      await client.query(
        "update public.travel_assistant_conversations set last_message_at = now() where id=$1",
        [conversationId],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    await recordRun(
      owner,
      tripId,
      { ...conv, id: conversationId, scope: topic },
      intent,
      "ok",
      model,
      cleaned.proposal?.payload.kind ?? null,
      outcome.usage,
      cleaned.cards.map((c) => c.kind),
    );
    return {
      status: "ok",
      remaining: Math.max(0, status.remaining - 1),
      conversationId: conversationId!,
      messages: (
        await readMessages(
          tripId ? { tripId } : { conversationId: conversationId! },
          bubbleCount + 1,
          owner,
        )
      ).slice(-(bubbleCount + 1)),
    };
  } finally {
    inFlight.delete(owner.id);
  }
}

/* ------------------------------------------------------------------------ Rencana lengkap */

const FULL_PLAN_MAX_DAYS = 10;
const daysInclusive = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
const datesBetween = (from: string, to: string) =>
  Array.from({ length: daysInclusive(from, to) }, (_, i) =>
    new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10),
  );

/**
 * "Rencana lengkap": one conversation turn that proposes an itinerary (from real map places), a
 * budget (from recorded fares, eSIM prices and the city's daily costs) and preparation items, as
 * three separate proposals the traveler applies one by one. The model only chooses among places we
 * found and writes the words; every number comes from the facts.
 */
async function runFullPlanTurn(input: {
  owner: TripOwner;
  conv: Conversation;
  tripId: string;
  data: ReturnType<typeof assistantSendInput>;
  status: Extract<AssistantStatus, { available: true }>;
  config: TripAssistantConfig;
  emit: ((event: TurnEvent) => void) | undefined;
}): Promise<AssistantSendResult> {
  const { owner, conv, tripId, data, status, config, emit } = input;
  const say = (text: string, remaining = status.remaining): AssistantSendResult => ({
    status: "error",
    message: text,
    remaining,
  });
  if (!config.fullPlan || !config.allowAgenda)
    return say("Rencana lengkap sedang dimatikan. Coba “Buat itinerary” biasa.");
  const planned = await pool.query(
    "select count(*)::int as n from public.travel_assistant_runs where customer_auth_subject=$1 and intent='full_plan' and status='ok'",
    [owner.id],
  );
  if (owner.guest && Number(planned.rows[0]?.n) >= config.fullPlanGuests)
    return {
      status: "limit",
      remaining: status.remaining,
      message:
        config.fullPlanGuests < 1
          ? "Rencana lengkap khusus member. Masuk atau daftar dulu ya."
          : "Rencana lengkap gratis untuk tamu sudah terpakai. Masuk atau daftar untuk membuat lagi.",
    };
  const weight = owner.guest ? 1 : config.fullPlanWeight;
  if (status.remaining < weight)
    return {
      status: "limit",
      remaining: status.remaining,
      message: `Rencana lengkap memakai ${weight} pesan dan sisa kuotamu belum cukup. Coba lagi besok.`,
    };

  const facts = await loadFacts(tripId, false);
  const tripRow = await pool.query(
    "select origin_code, destination_code from travel_trips where id=$1",
    [tripId],
  );
  const originCode = (tripRow.rows[0]?.origin_code as string | null) ?? null;
  const countryCode = String(tripRow.rows[0]?.destination_code ?? "");
  const finish = async (reply: string, chips: string[], intentStatus: "ok" | "error" = "ok") => {
    const saved = await saveFullPlanMessages({
      owner,
      conv,
      tripId,
      facts,
      userText: data.text,
      bubbles: [{ content: reply, chips: chips.length ? { options: chips, multi: false } : null }],
    });
    await recordRun(
      owner,
      tripId,
      conv,
      "full_plan",
      intentStatus === "ok" ? "ok" : "error",
      config.model,
      null,
      { input: 0, output: 0 },
      [],
      1,
    );
    return {
      status: "ok" as const,
      remaining: Math.max(0, status.remaining - 1),
      conversationId: saved.conversationId,
      messages: saved.messages,
    };
  };
  if (!facts.departureDate || !facts.returnDate)
    return finish(
      "Isi dulu tanggal berangkat dan pulang di perjalananmu, lalu aku bisa menyusun rencana lengkapnya.",
      [],
    );
  const dates = datesBetween(facts.departureDate, facts.returnDate);
  if (dates.length > FULL_PLAN_MAX_DAYS)
    return finish(
      `Rencana lengkap saat ini sampai ${FULL_PLAN_MAX_DAYS} hari. Perjalananmu ${dates.length} hari, jadi coba minta aku menyusun per beberapa hari lewat “Buat itinerary”.`,
      ["Buat itinerary"],
    );
  const city = facts.cities[0];
  if (!city)
    return finish(
      `Kota mana di ${facts.destination} yang mau jadi basis rencananya? Ketik nama kotanya, atau pilih kota di Ringkas dulu.`,
      [],
    );

  let tokens = { input: 0, output: 0 };
  const addUsage = (u: { input: number; output: number }) => {
    tokens = { input: tokens.input + u.input, output: tokens.output + u.output };
  };
  const ask = (system: string, user: string, schema: { name: string; schema: object }) =>
    askModel(
      config.generationModel,
      system,
      [{ role: "user", content: user }],
      700,
      undefined,
      schema,
    );
  try {
    emit?.({ type: "status", text: "Mengumpulkan harga tiket, eSIM, dan biaya harian…" });
    const anchor =
      (await tripAnchor(tripId)) ??
      (await nominatimVenue(`${city}, ${facts.destination}`, null).then((hit) =>
        hit ? { lat: hit.lat, lng: hit.lng } : null,
      ));
    if (!anchor)
      return finish(
        `Aku belum menemukan titik peta untuk ${city}. Coba pilih kotanya lagi di Ringkas.`,
        [],
      );
    const cityKey = costKey(city, countryCode);
    const [costResult, researchResult] = await Promise.all([
      getCityCosts({ name: city, countryCode }, ask),
      loadPlanResearch({
        owner,
        originCode,
        cityName: city,
        countryName: facts.destination,
        countryCode,
        departureDate: facts.departureDate,
        returnDate: facts.returnDate,
        days: dates.length,
        flights: true,
        esim: true,
      }),
    ]);
    addUsage(costResult.usage);
    emit?.({ type: "status", text: `Mencari tempat di peta ${city}…` });
    const candidates = await getPlaceCandidates(cityKey, anchor, { budgetMs: 16_000 });
    const sights = candidates.filter((c) => c.kind !== "makan" && c.kind !== "kafe").length;
    if (candidates.length < 8 || sights < 3)
      return finish(
        `Data tempat di peta untuk ${city} masih tipis, jadi aku tidak mau mengarang. Coba “Buat itinerary” biasa, atau pilih kota yang lebih besar.`,
        ["Buat itinerary"],
      );

    const fx =
      facts.currency === "IDR"
        ? 1
        : ((await fetchFxRate({ from: "IDR", to: facts.currency }))?.rate ?? 0);
    if (!fx) return say("Kurs belum bisa diambil. Coba lagi sebentar lagi.");
    const toMinorIdr = (idr: number) => toMinor(idr * fx, facts.currency);
    const budgetPlan = computeBudgetPlan({
      days: dates.length,
      travelers: facts.travelers,
      costs: costResult.costs,
      outboundIdr: researchResult.research.outbound?.priceIdr ?? null,
      returnIdr: researchResult.research.returnLeg?.priceIdr ?? null,
      esimIdr: researchResult.research.esim?.priceIdr ?? null,
      totalBudgetIdr:
        facts.totalBudgetMinor > 0 ? Math.round(facts.totalBudgetMinor / 100 / fx) : 0,
    });
    const pools = buildDayPools(dates, candidates);
    emit?.({ type: "status", text: "Menyusun rencana harian…" });
    const outcome = await askModel(
      config.generationModel,
      buildFullPlanPrompt(facts.today, config.tone),
      [
        {
          role: "user",
          content: `DATA (JSON):\n${buildFullPlanContext({
            name: facts.name,
            destination: facts.destination,
            city,
            dates,
            travelers: facts.travelers,
            tier: budgetPlan.tier,
            pools,
            existing: facts.itinerary.map((i) => `${i.date} ${i.start ?? ""} ${i.title}`),
          })}\n\nPERMINTAAN TRAVELER:\n${data.text}`,
        },
      ],
      6000,
      undefined,
      { name: "full_plan", schema: FULL_PLAN_SCHEMA },
    );
    addUsage(outcome.usage);
    const plan = cleanFullPlan(outcome.parsed, {
      dates,
      candidates,
      costs: costResult.costs,
      tier: budgetPlan.tier,
      travelers: facts.travelers,
      fxFromIdr: fx,
      toMinor: (major) => toMinor(major, facts.currency),
      departureDate: facts.departureDate,
      maxItems: Math.min(dates.length * 6, 48),
      today: facts.today,
    });
    if (plan.agenda.length < Math.min(3, dates.length * 2)) {
      await recordRun(
        owner,
        tripId,
        conv,
        "full_plan",
        "error",
        config.generationModel,
        null,
        tokens,
        [],
        1,
      );
      return say("Rencana lengkap belum berhasil disusun. Coba kirim lagi.");
    }
    for (const item of plan.agenda) {
      const day = item.hours;
      const dayHours = day?.raw ?? null;
      item.note = hoursNote(item.note, day, dayHours);
    }
    const toRequest = (request: TravoCardRequest): TravoCardRequest => request;
    const cards = researchResult.cards.map(toRequest);
    const strategy = buildStrategyRows({
      budget: budgetPlan,
      research: researchResult.research,
      travelers: facts.travelers,
      totalBudgetIdr:
        facts.totalBudgetMinor > 0 ? Math.round(facts.totalBudgetMinor / 100 / fx) : 0,
    });
    const blocks: AssistantMessage["blocks"] = [
      { kind: "facts", title: "Strategi uang", items: strategy.slice(0, 8) },
    ];
    if (plan.tips.length) blocks.push({ kind: "tip", title: `Tips ${city}`, items: plan.tips });
    if (!originCode)
      blocks.push({
        kind: "warning",
        title: "Kota asal",
        items: [
          "Kota keberangkatan belum diisi, jadi harga tiket belum dihitung. Isi di Edit perjalanan.",
        ],
      });
    const budgetPayload: ProposalPayload = {
      kind: "budget",
      budget: {
        totalMinor:
          facts.totalBudgetMinor > 0
            ? null
            : budgetPlan.lines.reduce((sum, l) => sum + toMinorIdr(l.amountIdr), 0),
        categories: budgetPlan.lines.map((l) => ({
          name: l.name,
          allocatedMinor: toMinorIdr(l.amountIdr),
        })),
      },
    };
    const bubbles: Parameters<typeof saveFullPlanMessages>[0]["bubbles"] = [
      {
        content:
          plan.reply ||
          `Ini rencana ${dates.length} hari di ${city}, disusun dari tempat nyata di peta, harga tiket tercatat, dan biaya harian kota ini.`,
        blocks,
        cards,
      },
      {
        content: "Itinerary hari demi hari. Titiknya langsung masuk peta setelah kamu terapkan.",
        proposal: {
          title: `Itinerary ${dates.length} hari di ${city}`,
          payload: { kind: "agenda", items: plan.agenda },
        },
      },
      {
        content:
          budgetPlan.shortfallIdr > 0
            ? "Anggaran perkiraan. Ini sedikit di atas anggaranmu, lihat saran hemat di atas."
            : "Anggaran perkiraan dari harga tercatat dan biaya harian kota ini.",
        proposal: { title: `Anggaran ${budgetPlan.tier}`, payload: budgetPayload },
      },
    ];
    if (plan.checklist.length)
      bubbles.push({
        content: "Terakhir, persiapan sebelum berangkat.",
        proposal: {
          title: `Persiapan ke ${facts.destination}`,
          payload: { kind: "checklist", checklist: { items: plan.checklist } },
        },
      });
    const last = bubbles[bubbles.length - 1]!;
    last.chips = {
      options: [
        ...plan.chips.slice(0, 2),
        "Buka Google Sheets",
        "Simpan ke Drive",
        "Bagikan",
      ].filter((chip, index, all) => all.indexOf(chip) === index),
      multi: false,
    };
    const saved = await saveFullPlanMessages({
      owner,
      conv,
      tripId,
      facts,
      userText: data.text,
      bubbles,
    });
    await pool
      .query(
        `insert into public.travel_trip_plans (trip_id, city, tier, budget, research, costs, tips)
         values ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb)
         on conflict (trip_id) do update set city=excluded.city, tier=excluded.tier, budget=excluded.budget,
           research=excluded.research, costs=excluded.costs, tips=excluded.tips, updated_at=now()`,
        [
          tripId,
          city,
          budgetPlan.tier,
          JSON.stringify(budgetPlan.lines),
          JSON.stringify({
            ...researchResult.research,
            originCode,
            destinationCode: researchResult.destinationCode,
            departureDate: facts.departureDate,
            returnDate: facts.returnDate,
          }),
          JSON.stringify(costResult.costs),
          JSON.stringify(plan.tips),
        ],
      )
      .catch((error) =>
        console.error(
          "[trip-assistant] plan record failed",
          error instanceof Error ? error.message : error,
        ),
      );
    await recordRun(
      owner,
      tripId,
      { ...conv, id: saved.conversationId },
      "full_plan",
      "ok",
      config.generationModel,
      "agenda",
      tokens,
      cards.map((c) => c.kind),
      weight,
    );
    return {
      status: "ok",
      remaining: Math.max(0, status.remaining - weight),
      conversationId: saved.conversationId,
      messages: saved.messages,
    };
  } catch (error) {
    console.error(
      "[trip-assistant] full plan failed",
      error instanceof Error ? error.message : error,
    );
    await recordRun(
      owner,
      tripId,
      conv,
      "full_plan",
      "error",
      config.generationModel,
      null,
      tokens,
      [],
      1,
    );
    return say("Travo sedang sibuk menyusun rencana. Coba kirim lagi sebentar lagi.");
  }
}

type PlanBubble = {
  content: string;
  chips?: { options: string[]; multi: boolean } | null;
  blocks?: AssistantMessage["blocks"];
  cards?: TravoCardRequest[];
  proposal?: { title: string; payload: ProposalPayload };
};

/** Stores the traveler's message and the planner's bubbles (each proposal on its own bubble). */
async function saveFullPlanMessages(input: {
  owner: TripOwner;
  conv: Conversation;
  tripId: string;
  facts: TripFacts;
  userText: string;
  bubbles: PlanBubble[];
}) {
  const { owner, conv, tripId, facts, userText, bubbles } = input;
  const client = await pool.connect();
  let conversationId = conv.id;
  try {
    await client.query("begin");
    if (!conversationId) {
      const created = await client.query(
        `insert into public.travel_assistant_conversations (customer_auth_subject, trip_id, title, scope)
         values ($1,$2,$3,'trip')
         on conflict (customer_auth_subject, trip_id) where trip_id is not null
         do update set last_message_at = now() returning id`,
        [owner.id, tripId, facts.name],
      );
      conversationId = String(created.rows[0].id);
    }
    await client.query(
      "insert into public.travel_assistant_messages (trip_id, conversation_id, customer_auth_subject, role, content) values ($1,$2,$3,'user',$4)",
      [tripId, conversationId, owner.id, userText],
    );
    for (let i = 0; i < bubbles.length; i += 1) {
      const bubble = bubbles[i]!;
      let proposalId: string | null = null;
      if (bubble.proposal) {
        proposalId = randomUUID();
        await client.query(
          `insert into public.travel_assistant_proposals (id, trip_id, customer_auth_subject, kind, title, payload)
           values ($1,$2,$3,$4,$5,$6::jsonb)`,
          [
            proposalId,
            tripId,
            owner.id,
            bubble.proposal.payload.kind,
            bubble.proposal.title,
            JSON.stringify(bubble.proposal.payload),
          ],
        );
      }
      await client.query(
        `insert into public.travel_assistant_messages (trip_id, conversation_id, customer_auth_subject, role, content, chips, blocks, cards, proposal_id, created_at)
         values ($1,$2,$3,'assistant',$4,$5::jsonb,$6::jsonb,$7::jsonb,$8, now() + ($9::int * interval '1 millisecond'))`,
        [
          tripId,
          conversationId,
          owner.id,
          bubble.content,
          bubble.chips ? JSON.stringify(bubble.chips) : null,
          bubble.blocks?.length ? JSON.stringify(bubble.blocks) : null,
          bubble.cards?.length ? JSON.stringify(bubble.cards) : null,
          proposalId,
          i + 1,
        ],
      );
    }
    await client.query(
      "update public.travel_assistant_conversations set last_message_at = now() where id=$1",
      [conversationId],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  const messages = (await readMessages({ tripId }, bubbles.length + 1, owner)).slice(
    -(bubbles.length + 1),
  );
  return { conversationId: conversationId!, messages };
}

export async function assistantSendHandler({
  data,
}: {
  data: ReturnType<typeof assistantSendInput>;
}): Promise<AssistantSendResult> {
  return runTurn(data);
}

export type StreamItem = TurnEvent | { type: "done"; result: AssistantSendResult };

/** Same turn as `assistantSendHandler`, but yields the reply text while the model writes it. */
export async function* assistantStreamHandler({
  data,
}: {
  data: ReturnType<typeof assistantSendInput>;
}): AsyncGenerator<StreamItem> {
  const queue: TurnEvent[] = [];
  let wake: (() => void) | null = null;
  let finished = false;
  let result: AssistantSendResult | null = null;
  let failure: unknown = null;
  const notify = () => {
    const w = wake;
    wake = null;
    w?.();
  };
  void runTurn(data, (event) => {
    queue.push(event);
    notify();
  })
    .then((r) => {
      result = r;
    })
    .catch((error) => {
      failure = error;
    })
    .finally(() => {
      finished = true;
      notify();
    });
  for (;;) {
    while (queue.length) yield queue.shift()!;
    if (finished) break;
    await new Promise<void>((resolve) => {
      wake = resolve;
    });
  }
  while (queue.length) yield queue.shift()!;
  if (failure) throw failure;
  yield { type: "done", result: result! };
}

async function recordRun(
  owner: TripOwner,
  tripId: string | null,
  conv: Conversation,
  intent: AssistantIntent,
  status: "ok" | "error" | "blocked",
  model: string,
  proposalKind: string | null,
  usage: { input: number; output: number },
  cardKinds: string[] = [],
  units = 1,
) {
  await pool
    .query(
      `insert into public.travel_assistant_runs
         (customer_auth_subject, guest, trip_id, conversation_id, scope, intent, status, model, proposal_kind, tokens_in, tokens_out, cost_idr, cards, units)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        owner.id,
        owner.guest,
        tripId,
        conv.id,
        conv.scope,
        intent,
        status,
        model,
        proposalKind,
        usage.input,
        usage.output,
        assistantCostIdr(model, usage),
        cardKinds.length ? cardKinds.join(",") : null,
        units,
      ],
    )
    .catch((error) =>
      console.error(
        "[trip-assistant] run log failed",
        error instanceof Error ? error.message : error,
      ),
    );
}

/* ------------------------------------------------------------------- apply / undo / dismiss */

type Applied = {
  created: string[];
  updated: { id: string; before: Record<string, unknown> }[];
  removed: { before: Record<string, unknown> }[];
  prevTotalMinor?: number;
  prevAlloc?: { id: string; allocatedMinor: number }[];
  createdCategories?: string[];
  /** A trip city the agenda proposal added because the trip had none (frames the maps). */
  createdCity?: string;
  expenseId?: string;
};

const proposalInput = z.object({ proposalId: z.string().uuid() });
export const assistantProposalInput = (data: unknown) => proposalInput.parse(data);

type ProposalRow = {
  id: string;
  trip_id: string;
  kind: ProposalView["kind"];
  payload: ProposalPayload;
  status: ProposalView["status"];
  applied: Applied | null;
};

async function ownedProposal(id: string, subject: string): Promise<ProposalRow> {
  const result = await pool.query(
    "select id, trip_id, kind, payload, status, applied from public.travel_assistant_proposals where id=$1 and customer_auth_subject=$2",
    [id, subject],
  );
  if (!result.rows[0]) throw new Error("Usulan tidak ditemukan");
  return result.rows[0] as ProposalRow;
}

async function itemRow(id: string, tripId: string) {
  const result = await pool.query(
    `select id, to_char(activity_date,'YYYY-MM-DD') as activity_date, start_time, end_time, title,
            location, latitude, longitude, notes, estimated_cost_minor::bigint::text as estimated_cost_minor,
            currency, activity_category, timezone
     from public.travel_itinerary_items where id=$1 and trip_id=$2`,
    [id, tripId],
  );
  return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
}

/** Fields of an existing activity in the shape `addItineraryItem` / `updateItineraryItem` take. */
function itemInput(row: Record<string, unknown>) {
  const t = (v: unknown) => (v ? String(v).slice(0, 5) : undefined);
  const s = (v: unknown) => (v ? String(v) : undefined);
  const lat = row["latitude"] == null ? undefined : Number(row["latitude"]);
  const lng = row["longitude"] == null ? undefined : Number(row["longitude"]);
  const cost =
    row["estimated_cost_minor"] == null ? undefined : Number(row["estimated_cost_minor"]);
  return {
    activityDate: String(row["activity_date"]),
    startTime: t(row["start_time"]),
    endTime: t(row["end_time"]),
    timezone: s(row["timezone"]),
    title: String(row["title"]),
    location: s(row["location"]),
    latitude: lat,
    longitude: lng,
    notes: s(row["notes"]),
    estimatedCostMinor: cost,
    currency: s(row["currency"]),
    activityCategory: s(row["activity_category"]),
  };
}

/** A trip with no city yet gets the one its new places are in, so the maps frame the right area. */
async function ensureTripCity(tripId: string, items: AgendaChange[], applied: Applied) {
  const have = await pool.query(
    "select 1 from public.travel_trip_cities where trip_id=$1 limit 1",
    [tripId],
  );
  if (have.rows[0]) return;
  const points = items.filter((i) => i.op === "add" && i.lat != null && i.lng != null);
  if (!points.length) return;
  const lat = points.reduce((n, i) => n + (i.lat as number), 0) / points.length;
  const lng = points.reduce((n, i) => n + (i.lng as number), 0) / points.length;
  const name = (points.map((i) => i.location).find(Boolean) ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .pop();
  if (!name || name.length > 120) return;
  const row = await pool.query(
    `insert into public.travel_trip_cities (trip_id, name, latitude, longitude, sort_order)
     values ($1,$2,$3,$4,0) on conflict (trip_id, name) do nothing returning id`,
    [tripId, name, lat, lng],
  );
  if (row.rows[0]) applied.createdCity = String(row.rows[0].id);
}

async function applyAgenda(tripId: string, items: AgendaChange[], trip: TripRow, applied: Applied) {
  for (const change of items) {
    if (change.op === "add") {
      const created = (await addItineraryItem({
        tripId,
        activityDate: change.date,
        startTime: change.startTime ?? undefined,
        endTime: change.endTime ?? undefined,
        timezone: trip.timezone ?? undefined,
        title: change.title,
        location: change.location ?? undefined,
        latitude: change.lat ?? undefined,
        longitude: change.lng ?? undefined,
        notes: change.note ?? undefined,
        estimatedCostMinor: change.estimatedCostMinor ?? undefined,
        currency: change.estimatedCostMinor ? trip.primary_currency : undefined,
        activityCategory: change.category ?? undefined,
      })) as { id: string };
      applied.created.push(created.id);
      continue;
    }
    const before = change.itemId ? await itemRow(change.itemId, tripId) : null;
    if (!before) continue; // the activity was removed meanwhile: skip it, apply the rest
    if (change.op === "remove") {
      await deleteItineraryItem({ id: change.itemId });
      applied.removed.push({ before });
      continue;
    }
    const base = itemInput(before);
    await updateItineraryItem({
      id: change.itemId,
      ...base,
      activityDate: change.date || base.activityDate,
      startTime: change.startTime ?? base.startTime,
      endTime: change.endTime ?? (change.startTime ? undefined : base.endTime),
      title: change.title || base.title,
      location: change.location ?? base.location,
      latitude: change.lat ?? base.latitude,
      longitude: change.lng ?? base.longitude,
      activityCategory: change.category ?? base.activityCategory,
    });
    applied.updated.push({ id: change.itemId!, before });
  }
  await ensureTripCity(tripId, items, applied).catch(() => undefined);
}

async function applyBudget(
  tripId: string,
  budget: Extract<ProposalPayload, { kind: "budget" }>["budget"],
  trip: TripRow,
  applied: Applied,
) {
  const dash = await getTripDashboard(tripId);
  const existing = dash.budget as { id: string; name: string; allocated_minor: number }[];
  applied.prevTotalMinor = Number(dash.trip.total_budget_minor) || 0;
  applied.prevAlloc = existing.map((c) => ({ id: c.id, allocatedMinor: c.allocated_minor }));
  applied.createdCategories = [];
  const total =
    budget.totalMinor ??
    Math.max(
      applied.prevTotalMinor,
      budget.categories.reduce((s, c) => s + c.allocatedMinor, 0),
    );
  if (total !== applied.prevTotalMinor) await setTotalBudget(trip, total);
  for (const cat of budget.categories) {
    let row = existing.find((c) => c.name.toLowerCase() === cat.name.toLowerCase());
    if (!row) {
      const created = (await addBudgetCategory({ tripId, name: cat.name })) as {
        id: string;
        name: string;
        allocated_minor: number;
      };
      applied.createdCategories.push(created.id);
      row = created;
    }
    await patchBudgetCategory({ id: row.id, allocatedMinor: cat.allocatedMinor });
  }
}

async function setTotalBudget(trip: TripRow, totalMinor: number) {
  await updateTrip({
    tripId: trip.id,
    name: trip.name,
    destinationCode: trip.destination_code,
    destinationName: trip.destination_name,
    departureDate: trip.departure_date,
    returnDate: trip.return_date,
    travelersCount: trip.travelers_count,
    primaryCurrency: trip.primary_currency,
    totalBudgetMinor: totalMinor,
    timezone: trip.timezone ?? undefined,
  });
}

async function applyExpense(
  tripId: string,
  e: Extract<ProposalPayload, { kind: "expense" }>["expense"],
  trip: TripRow,
  applied: Applied,
) {
  let converted = e.amountMinor;
  let rate: number | undefined;
  let source: string | undefined;
  if (e.currency !== trip.primary_currency) {
    const fx = await fetchFxRate({ from: e.currency, to: trip.primary_currency, date: e.date });
    if (!fx) throw new Error("Kurs belum tersedia. Catat biaya ini lewat halaman Biaya.");
    rate = fx.rate;
    source = fx.source;
    converted = Math.max(1, Math.round(e.amountMinor * fx.rate));
  }
  const dash = await getTripDashboard(tripId);
  const category = e.categoryName
    ? (dash.budget as { id: string; name: string }[]).find(
        (c) => c.name.toLowerCase() === e.categoryName!.toLowerCase(),
      )
    : undefined;
  const created = (await addExpense({
    tripId,
    description: e.description,
    transactionDate: e.date,
    originalAmountMinor: e.amountMinor,
    originalCurrency: e.currency,
    exchangeRate: rate,
    exchangeRateSource: source,
    exchangeRateStatus: rate ? "estimated" : "manual",
    convertedAmountMinor: converted,
    convertedCurrency: trip.primary_currency,
    categoryId: category?.id,
    notes: "Dicatat lewat asisten",
  })) as { id: string };
  applied.expenseId = created.id;
}

async function revert(tripId: string, trip: TripRow, kind: ProposalRow["kind"], applied: Applied) {
  if (kind === "agenda") {
    for (const id of applied.created) await deleteItineraryItem({ id }).catch(() => undefined);
    if (applied.createdCity)
      await pool
        .query("delete from public.travel_trip_cities where id=$1 and trip_id=$2", [
          applied.createdCity,
          tripId,
        ])
        .catch(() => undefined);
    for (const u of applied.updated)
      await updateItineraryItem({ id: u.id, ...itemInput(u.before) }).catch(() => undefined);
    for (const r of applied.removed)
      await addItineraryItem({ tripId, ...itemInput(r.before) }).catch(() => undefined);
  } else if (kind === "budget") {
    for (const a of applied.prevAlloc ?? [])
      await patchBudgetCategory({ id: a.id, allocatedMinor: a.allocatedMinor }).catch(
        () => undefined,
      );
    for (const id of applied.createdCategories ?? [])
      await pool
        .query(
          "delete from public.travel_budget_categories c using public.travel_trips t where c.id=$1 and c.trip_id=t.id and t.id=$2",
          [id, tripId],
        )
        .catch(() => undefined);
    if (applied.prevTotalMinor !== undefined)
      await setTotalBudget(trip, applied.prevTotalMinor).catch(() => undefined);
  } else if (kind === "checklist") {
    for (const id of applied.created) await deleteChecklistItem({ id }).catch(() => undefined);
  } else if (kind === "expense" && applied.expenseId) {
    await deleteTripItem({ id: applied.expenseId }).catch(() => undefined);
  }
}

export async function assistantApplyHandler({
  data,
}: {
  data: ReturnType<typeof assistantProposalInput>;
}) {
  const owner = await resolveTripOwner();
  if (!owner) throw new Error("Autentikasi diperlukan");
  const proposal = await ownedProposal(data.proposalId, owner.id);
  const trip = await ownedTripRow(proposal.trip_id, owner.id);
  const { config } = await readTripAssistantConfig();
  if (!config.enabled) throw new Error("Travo sedang tidak tersedia.");
  const payload = proposal.payload;
  if (payload.kind === "agenda" && !config.allowAgenda)
    throw new Error("Perubahan agenda lewat Travo sedang dimatikan.");
  if (payload.kind !== "agenda" && !config.allowBudget)
    throw new Error("Perubahan ini lewat Travo sedang dimatikan.");
  // Claim first: a double tap or a second device cannot apply the same proposal twice.
  const claim = await pool.query(
    "update public.travel_assistant_proposals set status='applied', applied_at=now() where id=$1 and status='proposed' returning id",
    [proposal.id],
  );
  if (!claim.rows[0]) throw new Error("Usulan ini sudah diproses.");
  const applied: Applied = { created: [], updated: [], removed: [] };
  try {
    if (payload.kind === "agenda") await applyAgenda(trip.id, payload.items, trip, applied);
    else if (payload.kind === "budget") await applyBudget(trip.id, payload.budget, trip, applied);
    else if (payload.kind === "checklist")
      for (const item of payload.checklist.items) {
        const row = (await addChecklistItem({
          tripId: trip.id,
          title: item.title,
          dueDate: item.dueDate ?? undefined,
        })) as { id: string };
        applied.created.push(row.id);
      }
    else await applyExpense(trip.id, payload.expense, trip, applied);
  } catch (error) {
    await revert(trip.id, trip, proposal.kind, applied);
    await pool.query(
      "update public.travel_assistant_proposals set status='proposed', applied_at=null where id=$1",
      [proposal.id],
    );
    throw error instanceof Error ? error : new Error("Usulan belum bisa diterapkan");
  }
  await pool.query("update public.travel_assistant_proposals set applied=$2::jsonb where id=$1", [
    proposal.id,
    JSON.stringify(applied),
  ]);
  // Whatever the change did, every activity of the trip should be on the map.
  const pins =
    payload.kind === "agenda"
      ? await pinMissingPlaces(trip.id, { budgetMs: 8000 }).catch(() => null)
      : null;
  // A plan changes the spreadsheet and the Drive document too (members with Google connected only).
  if (!owner.guest) {
    const { afterPlanChange } = await import("./google-plan-doc.server");
    afterPlanChange(owner.id, proposal.trip_id);
  }
  return { ok: true as const, status: "applied" as const, pinned: pins?.pinned ?? 0 };
}

export async function assistantUndoHandler({
  data,
}: {
  data: ReturnType<typeof assistantProposalInput>;
}) {
  const owner = await resolveTripOwner();
  if (!owner) throw new Error("Autentikasi diperlukan");
  const proposal = await ownedProposal(data.proposalId, owner.id);
  const trip = await ownedTripRow(proposal.trip_id, owner.id);
  const claim = await pool.query(
    "update public.travel_assistant_proposals set status='undone' where id=$1 and status='applied' returning id",
    [proposal.id],
  );
  if (!claim.rows[0]) throw new Error("Usulan ini belum diterapkan.");
  await revert(
    trip.id,
    trip,
    proposal.kind,
    proposal.applied ?? { created: [], updated: [], removed: [] },
  );
  if (!owner.guest) {
    const { afterPlanChange } = await import("./google-plan-doc.server");
    afterPlanChange(owner.id, proposal.trip_id);
  }
  return { ok: true as const, status: "undone" as const };
}

const swapSchema = z.object({
  proposalId: z.string().uuid(),
  index: z.number().int().min(0).max(80),
});
export const assistantSwapInput = (data: unknown) => swapSchema.parse(data);

/**
 * "Ganti tempat ini": replaces one place of a still-open itinerary proposal with the nearest other
 * place of the same kind from the cached map places. The proposal stays server-trusted: only the
 * owner, only while it is `proposed`, only with places we found on the map.
 */
export async function assistantSwapPlaceHandler({
  data,
}: {
  data: ReturnType<typeof assistantSwapInput>;
}) {
  const owner = await resolveTripOwner();
  if (!owner) throw new Error("Autentikasi diperlukan");
  const proposal = await ownedProposal(data.proposalId, owner.id);
  if (proposal.kind !== "agenda" || proposal.status !== "proposed")
    throw new Error("Usulan ini sudah tidak bisa diubah");
  const payload = proposal.payload as Extract<ProposalPayload, { kind: "agenda" }>;
  const item = payload.items[data.index];
  if (!item || !item.placeKind || item.lat == null || item.lng == null)
    throw new Error("Tempat ini tidak bisa diganti");
  const trip = await pool.query(
    `select t.destination_code, (select c.name from public.travel_trip_cities c where c.trip_id=t.id order by c.sort_order, c.created_at limit 1) as city
     from public.travel_trips t where t.id=$1 and t.customer_auth_subject=$2`,
    [proposal.trip_id, owner.id],
  );
  const city = String(trip.rows[0]?.city ?? "");
  if (!city) throw new Error("Kota perjalanan belum dipilih");
  const alternatives = await alternativesNear(
    costKey(city, String(trip.rows[0]?.destination_code ?? "")),
    item.placeKind as PlaceKind,
    { lat: item.lat, lng: item.lng },
    payload.items.map((i) => i.place ?? "").filter(Boolean),
    1,
  );
  const next = alternatives[0];
  if (!next)
    throw new Error("Belum ada tempat lain yang dekat. Coba minta Travo mencari opsi lain.");
  const prefix = /^[^:]{3,16}: /.exec(item.title)?.[0] ?? "";
  let hours: AgendaChange["hours"] = null;
  let dayHours: string | null = null;
  if (next.hours && item.startTime) {
    const weekday = weekdayIndex(item.date);
    if (weekday !== null) {
      dayHours = hoursForDay(next.hours, weekday);
      hours = {
        raw: dayHours ?? next.hours,
        open: isOpenAt(
          next.hours,
          weekday,
          Number(item.startTime.slice(0, 2)) * 60 + Number(item.startTime.slice(3)),
        ),
      };
    }
  }
  payload.items[data.index] = {
    ...item,
    title: `${prefix}${next.name}`.slice(0, 160),
    place: next.name,
    lat: next.lat,
    lng: next.lng,
    location: next.area || item.location,
    hours,
    note: hoursNote(null, hours, dayHours),
  };
  await pool.query(
    "update public.travel_assistant_proposals set payload=$2::jsonb where id=$1 and status='proposed'",
    [data.proposalId, JSON.stringify(payload)],
  );
  return { ok: true as const, payload };
}

const googleInput = z.object({ tripId: z.string().uuid(), target: z.enum(["sheet", "drive"]) });
export const assistantGoogleInput = (data: unknown) => googleInput.parse(data);

/** "Buka Google Sheets" / "Simpan ke Drive" from the chat: the link, or what to do first. */
export async function assistantOpenGoogleHandler({
  data,
}: {
  data: ReturnType<typeof assistantGoogleInput>;
}) {
  const owner = await resolveTripOwner();
  if (!owner) throw new Error("Autentikasi diperlukan");
  const { openTripGoogle } = await import("./google-plan-doc.server");
  return openTripGoogle(owner.id, owner.guest, data.tripId, data.target);
}

export async function assistantRecordSummaryHandler({
  data,
}: {
  data: ReturnType<typeof assistantLoadInput>;
}) {
  const owner = await resolveTripOwner();
  if (!owner) throw new Error("Autentikasi diperlukan");
  await ownedTripRow(data.tripId, owner.id);
  const now = Date.now();
  await pool.query(
    `insert into public.travel_assistant_messages (trip_id, customer_auth_subject, role, content, created_at)
     values ($1,$2,'user',$3,$4)`,
    [data.tripId, owner.id, SUMMARY_ASK, new Date(now)],
  );
  await pool.query(
    `insert into public.travel_assistant_messages (trip_id, customer_auth_subject, role, content, blocks, created_at)
     values ($1,$2,'assistant',$3,$4::jsonb,$5)`,
    [
      data.tripId,
      owner.id,
      "Ini ringkasan lengkap perjalananmu. Semua datanya dari halaman Agenda, Biaya, Checklist, dan Booking.",
      JSON.stringify([{ kind: "summary", title: "", items: [] }]),
      new Date(now + 1),
    ],
  );
  return { ok: true as const };
}

export async function assistantDismissHandler({
  data,
}: {
  data: ReturnType<typeof assistantProposalInput>;
}) {
  const owner = await resolveTripOwner();
  if (!owner) throw new Error("Autentikasi diperlukan");
  await ownedProposal(data.proposalId, owner.id);
  await pool.query(
    "update public.travel_assistant_proposals set status='dismissed' where id=$1 and status='proposed'",
    [data.proposalId],
  );
  return { ok: true as const, status: "dismissed" as const };
}

/** Called by the minute task: drops conversations older than the Admin retention. */
let lastPurge = 0;
export async function purgeAssistantHistory(now = Date.now()) {
  // The timer ticks every minute; a delete by date once an hour is plenty.
  if (now - lastPurge < 3_600_000) return { messages: 0, proposals: 0 };
  lastPurge = now;
  const { config } = await readTripAssistantConfig();
  const days = config.historyDays;
  const messages = await pool.query(
    "delete from public.travel_assistant_messages where created_at < now() - ($1::int * interval '1 day')",
    [days],
  );
  const proposals = await pool.query(
    "delete from public.travel_assistant_proposals where created_at < now() - ($1::int * interval '1 day') and status <> 'applied'",
    [days],
  );
  await pool.query(
    "delete from public.travel_assistant_conversations c where not exists (select 1 from public.travel_assistant_messages m where m.conversation_id = c.id) and c.created_at < now() - interval '1 day'",
  );
  await pool.query(
    "delete from public.travel_assistant_runs where created_at < now() - interval '180 days'",
  );
  return { messages: messages.rowCount ?? 0, proposals: proposals.rowCount ?? 0 };
}

/* ------------------------------------------------------------------------------- Admin */

export type TripAssistantStats = {
  messages: number;
  guestMessages: number;
  travelers: number;
  failedPercent: number;
  costIdr: number;
  avgCostIdr: number;
  proposals: number;
  applied: number;
  undone: number;
  appliedPercent: number;
  byIntent: { intent: string; n: number }[];
  /** Messages per Travo scope (trip chat vs. the standalone /travo page). */
  byScope: { scope: string; n: number }[];
  /** How often each product card was shown (eSIM, tiket, pesanan, ...). */
  byCard: { card: string; n: number }[];
  conversations: number;
};
export type TripAssistantRecent = {
  at: string;
  intent: string;
  scope: string;
  status: string;
  model: string;
  proposalKind: string | null;
  guest: boolean;
  tokens: number;
  costIdr: number;
};

async function readStats(): Promise<TripAssistantStats> {
  const [runs, props, intents, scopes, convs, cards] = await Promise.all([
    pool.query(
      `select count(*)::int as n,
              count(*) filter (where guest)::int as guests,
              count(distinct customer_auth_subject)::int as travelers,
              count(*) filter (where status='error')::int as failed,
              coalesce(sum(cost_idr),0)::float as cost
       from public.travel_assistant_runs where created_at > now() - interval '30 days' and status <> 'blocked'`,
    ),
    pool.query(
      `select count(*)::int as n,
              count(*) filter (where status in ('applied','undone'))::int as applied,
              count(*) filter (where status='undone')::int as undone
       from public.travel_assistant_proposals where created_at > now() - interval '30 days'`,
    ),
    pool.query(
      `select intent, count(*)::int as n from public.travel_assistant_runs
       where created_at > now() - interval '30 days' and status='ok' group by intent order by n desc`,
    ),
    pool.query(
      `select coalesce(scope, 'trip') as scope, count(*)::int as n from public.travel_assistant_runs
       where created_at > now() - interval '30 days' and status='ok' group by 1 order by n desc`,
    ),
    pool.query(
      `select count(*)::int as n from public.travel_assistant_conversations where created_at > now() - interval '30 days'`,
    ),
    pool.query(
      `select k as card, count(*)::int as n
       from public.travel_assistant_runs r, unnest(string_to_array(r.cards, ',')) as k
       where r.created_at > now() - interval '30 days' and r.status='ok' and r.cards is not null
       group by k order by n desc`,
    ),
  ]);
  const r = runs.rows[0] ?? {};
  const p = props.rows[0] ?? {};
  const n = Number(r.n) || 0;
  const pn = Number(p.n) || 0;
  const cost = Math.round(Number(r.cost) || 0);
  return {
    messages: n,
    guestMessages: Number(r.guests) || 0,
    travelers: Number(r.travelers) || 0,
    failedPercent: n ? Math.round(((Number(r.failed) || 0) / n) * 1000) / 10 : 0,
    costIdr: cost,
    avgCostIdr: n ? Math.round(cost / n) : 0,
    proposals: pn,
    applied: Number(p.applied) || 0,
    undone: Number(p.undone) || 0,
    appliedPercent: pn ? Math.round(((Number(p.applied) || 0) / pn) * 100) : 0,
    byIntent: intents.rows.map((x) => ({ intent: String(x.intent), n: Number(x.n) })),
    byScope: scopes.rows.map((x) => ({ scope: String(x.scope), n: Number(x.n) })),
    byCard: cards.rows.map((x) => ({ card: String(x.card), n: Number(x.n) })),
    conversations: Number(convs.rows[0]?.n) || 0,
  };
}

async function readRecent(): Promise<TripAssistantRecent[]> {
  const result = await pool.query(
    `select created_at, intent, coalesce(scope, 'trip') as scope, status, model, proposal_kind, guest, tokens_in + tokens_out as tokens, cost_idr::float as cost
     from public.travel_assistant_runs order by created_at desc limit 20`,
  );
  return result.rows.map((x) => ({
    at: new Date(x.created_at).toISOString(),
    intent: String(x.intent),
    scope: String(x.scope),
    status: String(x.status),
    model: String(x.model),
    proposalKind: x.proposal_kind ? String(x.proposal_kind) : null,
    guest: Boolean(x.guest),
    tokens: Number(x.tokens) || 0,
    costIdr: Math.round((Number(x.cost) || 0) * 100) / 100,
  }));
}

export const getAdminTripAssistantHandler = async () => {
  await requireAdmin();
  const [record, stats, recent] = await Promise.all([
    readTripAssistantConfig(),
    readStats().catch((): TripAssistantStats => ({
      messages: 0,
      guestMessages: 0,
      travelers: 0,
      failedPercent: 0,
      costIdr: 0,
      avgCostIdr: 0,
      proposals: 0,
      applied: 0,
      undone: 0,
      appliedPercent: 0,
      byIntent: [],
      byScope: [],
      byCard: [],
      conversations: 0,
    })),
    readRecent().catch(() => [] as TripAssistantRecent[]),
  ]);
  const reminders = await import("./trip-assistant-reminders.server")
    .then((m) => m.reminderStats())
    .catch(() => ({ sent30d: 0 }));
  return { ...record, stats, recent, reminders, keyConfigured: tripAssistantConfigured() };
};

const adminSaveSchema = z.object({
  config: z.unknown(),
  reason: z.string().trim().min(4).max(300),
  expectedVersion: z.number().int().min(0),
});
export const saveTripAssistantConfigInput = (data: unknown) => adminSaveSchema.parse(data);

export async function saveTripAssistantConfigHandler({
  data,
}: {
  data: ReturnType<typeof saveTripAssistantConfigInput>;
}) {
  await requireAdmin();
  const config = parseTripAssistantConfig(data.config);
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      "select value_json, version from public.admin_settings where setting_key = $1 for update",
      [TRIP_ASSISTANT_SETTING_KEY],
    );
    const row = current.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    const version = row ? Number(row.version) : 0;
    if (version !== data.expectedVersion) {
      await client.query("rollback");
      return { ok: false as const, conflict: true as const, version };
    }
    const audit = buildSettingAudit(
      TRIP_ASSISTANT_SETTING_KEY,
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
      [TRIP_ASSISTANT_SETTING_KEY, JSON.stringify(config)],
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

/** Admin: delete every stored conversation (privacy request or a prompt change). Audited. */
const cityCostsSchema = z.object({
  cityName: z.string().trim().min(1).max(80),
  countryCode: z.string().trim().max(2).default(""),
  costs: z.object({
    foodBudget: z.number(),
    foodMid: z.number(),
    transportDay: z.number(),
    attractionsDay: z.number(),
    hotelBudget: z.number(),
    hotelMid: z.number(),
  }),
  reason: z.string().trim().min(4).max(200),
});
export const adminSaveCityCostsInput = (data: unknown) => cityCostsSchema.parse(data);
const cityKeyInput = z.object({
  cityKey: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(4).max(200),
});
export const adminDeleteCityCostsInput = (data: unknown) => cityKeyInput.parse(data);

async function auditCityCosts(
  action: string,
  entity: string,
  reason: string,
  before: unknown,
  after: unknown,
) {
  const actor = (await getAdminEmailHandler()) ?? "admin";
  await pool.query(
    `insert into public.admin_audit_logs (id, action, entity_type, entity_id, reason, before_json, after_json)
     values ($1, $2, 'trip_city_costs', $3, $4, $5::jsonb, $6::jsonb)`,
    [
      randomUUID(),
      action,
      entity,
      `${actor}: ${reason}`,
      JSON.stringify(before ?? {}),
      JSON.stringify(after ?? {}),
    ],
  );
}

export async function adminListCityCostsHandler() {
  await requireAdmin();
  return listCityCosts();
}

export async function adminSaveCityCostsHandler({
  data,
}: {
  data: ReturnType<typeof adminSaveCityCostsInput>;
}) {
  await requireAdmin();
  const costs = sanitizeCityCosts(data.costs);
  if (!costs) throw new Error("Angka biaya tidak valid");
  const key = costKey(data.cityName, data.countryCode);
  const before = (await listCityCosts()).find((row) => row.cityKey === key) ?? null;
  await saveCityCosts(
    { name: data.cityName, countryCode: data.countryCode },
    costs,
    "admin",
    (await getAdminEmailHandler()) ?? null,
  );
  await auditCityCosts("assistant.city_costs_saved", key, data.reason, before?.costs, costs);
  return { ok: true as const, costs, cityKey: key };
}

/** Deleting a table makes Travo generate a fresh one the next time that city is planned. */
export async function adminDeleteCityCostsHandler({
  data,
}: {
  data: ReturnType<typeof adminDeleteCityCostsInput>;
}) {
  await requireAdmin();
  const before = (await listCityCosts()).find((row) => row.cityKey === data.cityKey) ?? null;
  await deleteCityCosts(data.cityKey);
  await auditCityCosts(
    "assistant.city_costs_deleted",
    data.cityKey,
    data.reason,
    before?.costs,
    {},
  );
  return { ok: true as const };
}

export async function adminClearAssistantHistoryHandler() {
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const messages = await pool.query("delete from public.travel_assistant_messages");
  await pool.query("delete from public.travel_assistant_conversations");
  await pool.query("delete from public.travel_assistant_proposals where status <> 'applied'");
  await pool.query(
    `insert into public.admin_audit_logs (id, action, entity_type, entity_id, reason, before_json, after_json)
     values ($1, 'assistant.history_cleared', 'trip_assistant', 'history', $2, $3::jsonb, '{}'::jsonb)`,
    [
      randomUUID(),
      `${actor}: hapus semua riwayat asisten`,
      JSON.stringify({ messages: messages.rowCount ?? 0 }),
    ],
  );
  return { deleted: messages.rowCount ?? 0 };
}

/** "Pasang pin di peta": gives every activity without a point one, for the traveler's own trip. */
export async function assistantPinHandler({
  data,
}: {
  data: ReturnType<typeof assistantLoadInput>;
}) {
  const owner = await resolveTripOwner();
  if (!owner) throw new Error("Autentikasi diperlukan");
  await ownedTripRow(data.tripId, owner.id);
  return pinMissingPlaces(data.tripId, { budgetMs: 25_000 });
}
