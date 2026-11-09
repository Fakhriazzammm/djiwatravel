import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { buildSettingAudit } from "./admin-settings";
import { resolveTripOwner, type TripOwner } from "./guest-trips.server";
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
import { verifyAgendaPlaces } from "./trip-assistant-places.server";
import { jakartaDayStart } from "./receipt-scan";
import {
  ASSISTANT_INTENTS,
  ASSISTANT_MAX_TEXT,
  ASSISTANT_REPLY_SCHEMA,
  DEFAULT_TRIP_ASSISTANT_CONFIG,
  TRIP_ASSISTANT_SETTING_KEY,
  assistantCostIdr,
  buildAssistantContext,
  buildAssistantSystemPrompt,
  cleanAssistantReply,
  detectIntent,
  extractReplyPrefix,
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
    "select count(*)::int as n from public.travel_assistant_runs where customer_auth_subject=$1 and created_at >= $2 and status <> 'blocked'",
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
              json_schema: { name: "trip_assistant", strict: true, schema: ASSISTANT_REPLY_SCHEMA },
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

async function readMessages(tripId: string, limit = 60): Promise<AssistantMessage[]> {
  const result = await pool.query(
    `select * from (
       select m.id, m.role, m.content, m.chips, m.created_at, m.proposal_id,
              p.kind as p_kind, p.title as p_title, p.status as p_status, p.payload as p_payload
       from public.travel_assistant_messages m
       left join public.travel_assistant_proposals p on p.id = m.proposal_id
       where m.trip_id=$1 order by m.created_at desc limit $2
     ) x order by created_at asc`,
    [tripId, limit],
  );
  const rows = result.rows as MessageRow[];
  const previous = await previousItems(
    tripId,
    rows.flatMap((r) => (r.p_payload ? [r.p_payload] : [])),
  );
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    chips: r.chips ?? null,
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
  return { status, messages: await readMessages(data.tripId) };
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

/* ----------------------------------------------------------------------------- sending */

const sendSchema = z.object({
  tripId: z.string().uuid(),
  text: z.string().trim().min(1).max(ASSISTANT_MAX_TEXT),
  intent: z.enum(ASSISTANT_INTENTS as [AssistantIntent, ...AssistantIntent[]]).optional(),
});
export const assistantSendInput = (data: unknown) => sendSchema.parse(data);

export type TurnEvent = { type: "delta"; text: string } | { type: "status"; text: string };

async function runTurn(
  data: ReturnType<typeof assistantSendInput>,
  emit?: (event: TurnEvent) => void,
): Promise<AssistantSendResult> {
  const owner = await resolveTripOwner();
  if (!owner) throw new Error("Autentikasi diperlukan");
  const trip = await ownedTripRow(data.tripId, owner.id);
  const { status, config } = await statusFor(owner);
  if (!status.available)
    return { status: "disabled", message: "Asisten sedang tidak tersedia.", remaining: 0 };
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
  const intent = data.intent ?? detectIntent(data.text);
  const model = isGenerationIntent(intent) ? config.generationModel : config.model;
  try {
    const facts = await loadFacts(data.tripId, intent === "plan");
    const history = (await readMessages(data.tripId, 8)).map((m) => ({
      role: m.role,
      content: m.proposal
        ? `${m.content}\n[usulan ${m.proposal.kind}: ${m.proposal.status}]`
        : m.content,
    }));
    const system = buildAssistantSystemPrompt(config, intent, facts.today);
    const userMessage = `DATA PERJALANAN (JSON):\n${buildAssistantContext(facts)}\n\nPESAN TRAVELER:\n${data.text}`;
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
      await recordRun(owner, data.tripId, intent, "error", model, null, { input: 0, output: 0 });
      return {
        status: "error",
        remaining: status.remaining,
        message: "Asisten sedang sibuk. Coba kirim lagi sebentar lagi.",
      };
    }
    const cleaned = cleanAssistantReply(outcome.parsed, {
      config,
      currency: facts.currency,
      departureDate: facts.departureDate,
      returnDate: facts.returnDate,
      itemIds: new Set(facts.itinerary.map((i) => i.id)),
      budgetNames: facts.budget.map((b) => b.name),
      today: facts.today,
    });
    if (cleaned.proposal?.payload.kind === "agenda" && config.verifyHours) {
      emit?.({ type: "status", text: "Mengecek lokasi dan jam buka…" });
      await verifyAgendaPlaces(cleaned.proposal.payload.items, data.tripId, facts).catch((error) =>
        console.error(
          "[trip-assistant] place check failed",
          error instanceof Error ? error.message : error,
        ),
      );
    }
    if (!cleaned.reply && !cleaned.proposal) {
      await recordRun(owner, data.tripId, intent, "error", model, null, outcome.usage);
      return {
        status: "error",
        remaining: status.remaining,
        message: "Jawaban asisten belum bisa dibaca. Coba ulangi dengan kalimat lain.",
      };
    }
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "insert into public.travel_assistant_messages (trip_id, customer_auth_subject, role, content) values ($1,$2,'user',$3)",
        [data.tripId, owner.id, data.text],
      );
      let proposalId: string | null = null;
      if (cleaned.proposal) {
        proposalId = randomUUID();
        await client.query(
          `insert into public.travel_assistant_proposals (id, trip_id, customer_auth_subject, kind, title, payload)
           values ($1,$2,$3,$4,$5,$6::jsonb)`,
          [
            proposalId,
            data.tripId,
            owner.id,
            cleaned.proposal.payload.kind,
            cleaned.proposal.title,
            JSON.stringify(cleaned.proposal.payload),
          ],
        );
      }
      await client.query(
        `insert into public.travel_assistant_messages (trip_id, customer_auth_subject, role, content, chips, proposal_id, created_at)
         values ($1,$2,'assistant',$3,$4::jsonb,$5, now() + interval '1 millisecond')`,
        [
          data.tripId,
          owner.id,
          cleaned.reply || cleaned.proposal?.title || "Ini usulan saya.",
          cleaned.chips ? JSON.stringify(cleaned.chips) : null,
          proposalId,
        ],
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
      data.tripId,
      intent,
      "ok",
      model,
      cleaned.proposal?.payload.kind ?? null,
      outcome.usage,
    );
    void trip;
    return {
      status: "ok",
      remaining: Math.max(0, status.remaining - 1),
      messages: (await readMessages(data.tripId, 2)).slice(-2),
    };
  } finally {
    inFlight.delete(owner.id);
  }
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
  tripId: string,
  intent: AssistantIntent,
  status: "ok" | "error" | "blocked",
  model: string,
  proposalKind: string | null,
  usage: { input: number; output: number },
) {
  await pool
    .query(
      `insert into public.travel_assistant_runs
         (customer_auth_subject, guest, trip_id, intent, status, model, proposal_kind, tokens_in, tokens_out, cost_idr)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        owner.id,
        owner.guest,
        tripId,
        intent,
        status,
        model,
        proposalKind,
        usage.input,
        usage.output,
        assistantCostIdr(model, usage),
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
      activityCategory: change.category ?? base.activityCategory,
    });
    applied.updated.push({ id: change.itemId!, before });
  }
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
  if (!config.enabled) throw new Error("Asisten sedang tidak tersedia.");
  const payload = proposal.payload;
  if (payload.kind === "agenda" && !config.allowAgenda)
    throw new Error("Perubahan agenda lewat asisten sedang dimatikan.");
  if (payload.kind !== "agenda" && !config.allowBudget)
    throw new Error("Perubahan ini lewat asisten sedang dimatikan.");
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
  return { ok: true as const, status: "applied" as const };
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
  return { ok: true as const, status: "undone" as const };
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
};
export type TripAssistantRecent = {
  at: string;
  intent: string;
  status: string;
  model: string;
  proposalKind: string | null;
  guest: boolean;
  tokens: number;
  costIdr: number;
};

async function readStats(): Promise<TripAssistantStats> {
  const [runs, props, intents] = await Promise.all([
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
  };
}

async function readRecent(): Promise<TripAssistantRecent[]> {
  const result = await pool.query(
    `select created_at, intent, status, model, proposal_kind, guest, tokens_in + tokens_out as tokens, cost_idr::float as cost
     from public.travel_assistant_runs order by created_at desc limit 20`,
  );
  return result.rows.map((x) => ({
    at: new Date(x.created_at).toISOString(),
    intent: String(x.intent),
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
export async function adminClearAssistantHistoryHandler() {
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const messages = await pool.query("delete from public.travel_assistant_messages");
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
