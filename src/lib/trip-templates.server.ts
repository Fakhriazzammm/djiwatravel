import { randomBytes } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { recordAdminAction } from "./admin-audit.server";
import { readAffiliateConfig } from "./affiliate.server";
import {
  prepareTemplateFeedPost,
  insertTemplateFeedPost,
  syncTemplateFeedPost,
} from "./feeds.server";
import { resolveTripOwner, type TripOwner } from "./guest-trips.server";
import { createTrip } from "./my-trips.server";
import { jakartaDayStart } from "./receipt-scan";
import { fetchFxRate } from "./receipt-scan.server";
import { resolveTemplateCover } from "./template-cover.server";
import { tripCurrencyFor } from "./trip-countries";
import { assistantCostIdr, parseJsonLoose } from "./trip-assistant";
import {
  allowAssistantBurst,
  askModel,
  readTripAssistantConfig,
  tripAssistantConfigured,
} from "./trip-assistant.server";
import {
  TEMPLATE_MAX_DAYS,
  TEMPLATE_MAX_ITEMS,
  TEMPLATE_DRAFT_SCHEMA,
  TRIP_TEMPLATES_SETTING_KEY,
  DEFAULT_TRIP_TEMPLATES_CONFIG,
  cleanTemplateBudget,
  cleanTemplateDraft,
  dateForDay,
  dayIndexFor,
  makeSlug,
  normalizeCategory,
  normalizeTripTemplatesConfig,
  parseTripTemplatesConfig,
  returnDateFor,
  templateDraftPrompt,
  type TemplateBudget,
  type TemplateItem,
  type TripTemplatesConfig,
} from "./trip-templates";

/* ------------------------------------------------------------------ config */

export async function readTripTemplatesConfig(): Promise<{
  config: TripTemplatesConfig;
  version: number;
}> {
  try {
    const result = await pool.query(
      "select value_json, version from admin_settings where setting_key = $1",
      [TRIP_TEMPLATES_SETTING_KEY],
    );
    const row = result.rows[0];
    if (!row) return { config: DEFAULT_TRIP_TEMPLATES_CONFIG, version: 0 };
    return {
      config: normalizeTripTemplatesConfig(row.value_json),
      version: Number(row.version) || 0,
    };
  } catch {
    return { config: DEFAULT_TRIP_TEMPLATES_CONFIG, version: 0 };
  }
}

/** Public: whether the feature and its tile are on (never throws). */
export async function templatesStatusHandler() {
  const { config } = await readTripTemplatesConfig();
  return { enabled: config.enabled, showTile: config.enabled && config.showTile };
}

async function requireEnabled() {
  const { config } = await readTripTemplatesConfig();
  if (!config.enabled) throw new Error("Template perjalanan sedang tidak tersedia");
  return config;
}

/** Publishing and copying need a real account; a guest is sent to login by the UI. */
async function requireMember(): Promise<TripOwner> {
  const owner = await resolveTripOwner();
  if (!owner || owner.guest) throw new Error("Autentikasi diperlukan");
  return owner;
}

const firstName = (value: unknown) => {
  const first = String(value ?? "")
    .trim()
    .split(/\s+/)[0];
  return first ? first.slice(0, 24) : null;
};

async function ownerName(subject: string) {
  const result = await pool
    .query("select display_name from customer_profiles where auth_user_id = $1", [subject])
    .catch(() => ({ rows: [] as { display_name?: string }[] }));
  return firstName(result.rows[0]?.display_name);
}

/** The member's own affiliate code, so the share link earns commission through the existing program. */
async function affiliateFor(subject: string) {
  const { config } = await readAffiliateConfig();
  const row = await pool
    .query(
      "select code from affiliate_accounts where customer_auth_subject = $1 and status = 'active'",
      [subject],
    )
    .catch(() => ({ rows: [] as { code?: string }[] }));
  return {
    programOn: config.enabled,
    commissionPercent: config.commissionPercent,
    code: config.enabled && row.rows[0]?.code ? String(row.rows[0].code) : null,
  };
}

/* ------------------------------------------------------------------ writing */

const timeText = (value: unknown) => (value ? String(value).slice(0, 5) : null);
const dateText = (value: unknown) => {
  if (value instanceof Date)
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  return String(value ?? "").slice(0, 10);
};

type Snapshot = {
  items: (TemplateItem & { lat: number | null; lng: number | null })[];
  days: number;
  budget: TemplateBudget | null;
};

/** Planned amounts of a trip in rupiah per traveler (null when no rate is available). */
async function plannedBudgetIdr(tripId: string, trip: Record<string, unknown>) {
  const currency = String(trip["primary_currency"] ?? "IDR")
    .trim()
    .toUpperCase();
  const travelers = Math.max(1, Number(trip["travelers_count"]) || 1);
  let rate = 1;
  if (currency !== "IDR") {
    const fx = await fetchFxRate({ from: currency, to: "IDR" }).catch(() => null);
    if (!fx) return { rate: null as number | null, budget: null, travelers, currency };
    rate = fx.rate;
  }
  // Amounts are stored in minor units (x100) for every currency in My Trips.
  const toIdr = (minor: unknown) => Math.round((Number(minor) / 100) * rate);
  const perPerson = (idr: number) => Math.round(idr / travelers / 1000) * 1000;
  const categories = await pool.query(
    "select name, allocated_minor from travel_budget_categories where trip_id=$1 and allocated_minor > 0 order by sort_order, created_at",
    [tripId],
  );
  let budget = cleanTemplateBudget(
    categories.rows.map((row) => ({
      name: String(row.name),
      amountIdr: perPerson(toIdr(row.allocated_minor)),
    })),
  );
  if (!budget && Number(trip["total_budget_minor"]) > 0)
    budget = cleanTemplateBudget([
      { name: "Total anggaran", amountIdr: perPerson(toIdr(trip["total_budget_minor"])) },
    ]);
  return { rate, budget, travelers, currency };
}

/** The shareable part of a trip: titles, places, times, category, map point and photo. Never notes, costs or bookings. */
async function snapshotTrip(
  tripId: string,
  subject: string,
  only?: string[],
): Promise<{
  trip: { name: string; destination_code: string; destination_name: string };
  snapshot: Snapshot;
}> {
  const tripResult = await pool.query(
    "select name, destination_code, destination_name, departure_date, return_date, primary_currency, travelers_count, total_budget_minor from travel_trips where id=$1 and customer_auth_subject=$2",
    [tripId, subject],
  );
  const trip = tripResult.rows[0];
  if (!trip) throw new Error("Perjalanan tidak ditemukan");
  const start = dateText(trip.departure_date);
  const end = dateText(trip.return_date);
  const rows = await pool.query(
    `select id, activity_date, start_time, end_time, title, location, activity_category, latitude, longitude, place_image_url,
            estimated_cost_minor, currency
       from travel_itinerary_items where trip_id=$1 order by activity_date, start_time nulls last, created_at`,
    [tripId],
  );
  const planned = await plannedBudgetIdr(tripId, trip);
  const items: Snapshot["items"] = [];
  for (const row of rows.rows) {
    if (only && !only.includes(String(row.id))) continue;
    const day = dayIndexFor(start, dateText(row.activity_date));
    if (!day) continue;
    items.push({
      day,
      start: timeText(row.start_time),
      end: timeText(row.end_time),
      title: String(row.title).slice(0, 160),
      location: row.location ? String(row.location).slice(0, 200) : null,
      category: normalizeCategory(row.activity_category),
      lat: row.latitude == null ? null : Number(row.latitude),
      lng: row.longitude == null ? null : Number(row.longitude),
      image: row.place_image_url ? String(row.place_image_url) : null,
      costIdr: itemCostIdr(row, planned),
    });
    if (items.length >= TEMPLATE_MAX_ITEMS) break;
  }
  if (!items.length)
    throw new Error("Tambahkan kegiatan di Agenda dulu sebelum dijadikan template");
  const span = dayIndexFor(start, end) ?? Math.max(...items.map((i) => i.day));
  return {
    trip: {
      name: String(trip.name),
      destination_code: String(trip.destination_code),
      destination_name: String(trip.destination_name),
    },
    snapshot: {
      items,
      days: Math.min(TEMPLATE_MAX_DAYS, Math.max(span, ...items.map((i) => i.day))),
      budget: planned.budget,
    },
  };
}

/** An activity's planned cost per traveler in rupiah (its own currency, converted at today's rate). */
function itemCostIdr(
  row: Record<string, unknown>,
  planned: { rate: number | null; travelers: number; currency: string },
) {
  const minor = Number(row["estimated_cost_minor"]);
  if (!Number.isFinite(minor) || minor <= 0) return null;
  const cur = String(row["currency"] ?? planned.currency)
    .trim()
    .toUpperCase();
  if (cur !== planned.currency && cur !== "IDR") return null;
  const rate = cur === "IDR" ? 1 : planned.rate;
  if (!rate) return null;
  return Math.round(((minor / 100) * rate) / planned.travelers / 1000) * 1000 || null;
}

type Client = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

async function writeItems(client: Client, templateId: string, items: Snapshot["items"]) {
  const perDay = new Map<number, number>();
  for (const item of items) {
    const order = perDay.get(item.day) ?? 0;
    perDay.set(item.day, order + 1);
    await client.query(
      `insert into trip_template_items (template_id,day_index,sort_order,start_time,end_time,title,location,category,latitude,longitude,place_image_url,cost_idr)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        templateId,
        item.day,
        order,
        item.start,
        item.end,
        item.title,
        item.location,
        item.category,
        item.lat ?? null,
        item.lng ?? null,
        item.image ?? null,
        item.costIdr ?? null,
      ],
    );
  }
}

async function assertQuota(subject: string, config: TripTemplatesConfig) {
  const count = await pool.query(
    "select count(*)::int as n from trip_templates where owner_subject=$1 and status <> 'unpublished'",
    [subject],
  );
  if (Number(count.rows[0]?.n) >= config.maxPerUser)
    throw new Error(
      `Maksimal ${config.maxPerUser} template aktif. Hapus atau nonaktifkan yang lama.`,
    );
}

const textField = (min: number, max: number) => z.string().trim().min(min).max(max);

const publishTripSchema = z.object({
  tripId: z.string().uuid(),
  title: textField(3, 120),
  description: z.string().trim().max(600).optional(),
  itemIds: z.array(z.string().uuid()).max(TEMPLATE_MAX_ITEMS).optional(),
  shareToFeed: z.boolean().default(true),
});
export const publishTripTemplateInput = (data: unknown) => publishTripSchema.parse(data);

/** Cover lookup that never blocks publishing for long: a slow lookup just means no photo yet. */
async function coverFor(input: Parameters<typeof resolveTemplateCover>[0]) {
  return Promise.race([
    resolveTemplateCover(input).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 7000)),
  ]);
}

async function insertTemplate(
  owner: TripOwner,
  input: {
    title: string;
    description: string;
    destinationCode: string;
    destinationName: string;
    days: number;
    source: "trip" | "travo";
    sourceTripId: string | null;
    items: Snapshot["items"];
    budget: TemplateBudget | null;
    shareToFeed: boolean;
  },
) {
  const name = await ownerName(owner.id);
  const cover =
    input.items.find((i) => i.image)?.image ??
    (await coverFor({
      destinationCode: input.destinationCode,
      destinationName: input.destinationName,
      locations: input.items.map((i) => i.location),
    }));
  const slug = makeSlug(input.title, randomBytes(5).toString("hex"));
  const affiliate = await affiliateFor(owner.id);
  const post = input.shareToFeed
    ? await prepareTemplateFeedPost({
        ...input,
        subject: owner.id,
        slug,
        coverUrl: cover,
        affiliateCode: affiliate.code,
      })
    : null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await client.query(
      `insert into trip_templates (slug,owner_subject,owner_name,title,description,destination_code,destination_name,day_count,cover_url,source,source_trip_id,budget_json,published_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,now()) returning id, slug`,
      [
        slug,
        owner.id,
        name,
        input.title,
        input.description || null,
        input.destinationCode.toUpperCase(),
        input.destinationName,
        input.days,
        cover,
        input.source,
        input.sourceTripId,
        input.budget ? JSON.stringify(input.budget) : null,
      ],
    );
    const id = String(result.rows[0]!["id"]);
    await writeItems(client, id, input.items);
    const feed = post
      ? await insertTemplateFeedPost(client, post)
      : { posted: false, pending: false };

    await client.query("commit");
    return { id, slug, affiliate, feed };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** "Jadikan template": snapshot an owned trip and publish it right away. */
export async function publishTripTemplateHandler({ data }: { data: unknown }) {
  const input = publishTripTemplateInput(data);
  const config = await requireEnabled();
  const owner = await requireMember();
  await assertQuota(owner.id, config);
  const { trip, snapshot } = await snapshotTrip(input.tripId, owner.id, input.itemIds);
  return insertTemplate(owner, {
    shareToFeed: config.shareToFeed && input.shareToFeed,
    title: input.title,
    description: input.description ?? "",
    destinationCode: trip.destination_code,
    destinationName: trip.destination_name,
    days: snapshot.days,
    source: "trip",
    sourceTripId: input.tripId,
    items: snapshot.items,
    budget: snapshot.budget,
  });
}

const draftItemSchema = z.object({
  day: z.number().int().min(1).max(TEMPLATE_MAX_DAYS),
  start: z.string().nullable().optional(),
  end: z.string().nullable().optional(),
  title: textField(1, 160),
  location: z.string().max(200).nullable().optional(),
  category: z.string().max(40).nullable().optional(),
  costIdr: z.number().int().min(0).max(50_000_000).nullable().optional(),
});
const publishDraftSchema = z.object({
  title: textField(3, 120),
  description: z.string().trim().max(600).optional(),
  destinationName: textField(1, 120),
  destinationCode: z.string().trim().min(2).max(8),
  days: z.number().int().min(1).max(TEMPLATE_MAX_DAYS),
  items: z.array(draftItemSchema).min(1).max(TEMPLATE_MAX_ITEMS),
  budget: z
    .array(z.object({ name: textField(1, 40), amountIdr: z.number().int().min(0).max(50_000_000) }))
    .max(8)
    .optional(),
  shareToFeed: z.boolean().default(true),
});
export const publishDraftTemplateInput = (data: unknown) => publishDraftSchema.parse(data);

/** Publish a (Travo or hand-edited) draft; it is cleaned again here because the browser is not trusted. */
export async function publishDraftTemplateHandler({ data }: { data: unknown }) {
  const input = publishDraftTemplateInput(data);
  const config = await requireEnabled();
  const owner = await requireMember();
  await assertQuota(owner.id, config);
  const draft = cleanTemplateDraft(
    {
      title: input.title,
      description: input.description,
      destinationName: input.destinationName,
      destinationCode: input.destinationCode,
      days: input.days,
      items: input.items.map((i) => ({ ...i, start: i.start ?? "", end: i.end ?? "" })),
      budget: input.budget ?? [],
    },
    input.days,
  );
  if (!draft) throw new Error("Template belum lengkap");
  return insertTemplate(owner, {
    shareToFeed: config.shareToFeed && input.shareToFeed,
    title: draft.title,
    description: draft.description,
    destinationCode: input.destinationCode,
    destinationName: draft.destinationName,
    days: draft.days,
    source: "travo",
    sourceTripId: null,
    items: draft.items.map((i) => ({ ...i, lat: null, lng: null })),
    budget: draft.budget,
  });
}

/* ------------------------------------------------------------------ Travo draft */

const draftBriefSchema = z.object({
  brief: textField(8, 300),
  days: z.number().int().min(1).max(7),
});
export const generateTemplateDraftInput = (data: unknown) => draftBriefSchema.parse(data);

async function draftsToday(subject: string) {
  const result = await pool.query(
    "select count(*)::int as n from travel_assistant_runs where customer_auth_subject=$1 and intent='template_draft' and status <> 'blocked' and created_at >= $2",
    [subject, jakartaDayStart(new Date())],
  );
  return Number(result.rows[0]?.n) || 0;
}

/** Travo proposes a template from a short brief. Nothing is saved: the member reviews and publishes. */
export async function generateTemplateDraftHandler({ data }: { data: unknown }) {
  const input = generateTemplateDraftInput(data);
  const config = await requireEnabled();
  const owner = await requireMember();
  const assistant = (await readTripAssistantConfig()).config;
  if (!config.aiEnabled || !assistant.enabled || !tripAssistantConfigured())
    throw new Error("Travo belum bisa membuat template saat ini");
  const used = await draftsToday(owner.id);
  if (used >= config.aiDailyDrafts)
    return {
      status: "limit" as const,
      message: "Batas draf Travo hari ini sudah habis. Coba lagi besok.",
    };
  if (!allowAssistantBurst(owner.id, Date.now(), 3))
    return { status: "limit" as const, message: "Terlalu cepat. Tunggu sebentar lalu coba lagi." };
  const prompt = templateDraftPrompt(input.brief, input.days);
  const model = assistant.generationModel;
  try {
    const outcome = await askModel(
      model,
      prompt.system,
      [{ role: "user", content: prompt.user }],
      3500,
      undefined,
      { name: "trip_template_draft", schema: TEMPLATE_DRAFT_SCHEMA },
    );
    const parsed =
      typeof outcome.parsed === "string" ? parseJsonLoose(outcome.parsed) : outcome.parsed;
    const draft = cleanTemplateDraft(parsed, input.days);
    await logRun(owner, model, draft ? "ok" : "error", outcome.usage);
    if (!draft)
      return {
        status: "error" as const,
        message: "Travo belum berhasil menyusun template. Coba tulis permintaan lebih jelas.",
      };
    return { status: "ok" as const, draft };
  } catch (error) {
    await logRun(owner, model, "error", { input: 0, output: 0 });
    console.error("[trip-templates] draft failed", error instanceof Error ? error.message : error);
    return { status: "error" as const, message: "Travo sedang sibuk. Coba lagi sebentar lagi." };
  }
}

async function logRun(
  owner: TripOwner,
  model: string,
  status: "ok" | "error",
  usage: { input: number; output: number },
) {
  await pool
    .query(
      `insert into travel_assistant_runs (customer_auth_subject, guest, intent, status, model, tokens_in, tokens_out, cost_idr, scope, units)
       values ($1,false,'template_draft',$2,$3,$4,$5,$6,'template',1)`,
      [owner.id, status, model, usage.input, usage.output, assistantCostIdr(model, usage)],
    )
    .catch(() => undefined);
}

/* ------------------------------------------------------------------ owner management */

const idSchema = z.object({ id: z.string().uuid() });
export const templateIdInput = (data: unknown) => idSchema.parse(data);

const updateSchema = z.object({
  id: z.string().uuid(),
  title: textField(3, 120),
  description: z.string().trim().max(600).optional(),
  status: z.enum(["published", "unpublished"]).optional(),
});
export const updateTemplateInput = (data: unknown) => updateSchema.parse(data);

export async function updateTemplateHandler({ data }: { data: unknown }) {
  const input = updateTemplateInput(data);
  const config = await requireEnabled();
  const owner = await requireMember();
  if (input.status === "published") await assertQuota(owner.id, config);
  const result = await pool.query(
    `update trip_templates set title=$3, description=$4,
       status = case when status='hidden' then 'hidden' else coalesce($5, status) end,
       published_at = case when $5='published' and published_at is null then now() else published_at end,
       updated_at=now()
     where id=$1 and owner_subject=$2 returning id, status, slug`,
    [input.id, owner.id, input.title, input.description || null, input.status ?? null],
  );
  if (!result.rows[0]) throw new Error("Template tidak ditemukan");
  await syncTemplateFeedPost(
    String(result.rows[0].slug),
    result.rows[0].status === "published" ? "live" : "off",
  );
  return { id: input.id, status: String(result.rows[0].status) };
}

/** Re-snapshot the source trip into the same template (new version, same link). */
export async function refreshTemplateHandler({ data }: { data: unknown }) {
  const { id } = templateIdInput(data);
  await requireEnabled();
  const owner = await requireMember();
  const found = await pool.query(
    "select source_trip_id from trip_templates where id=$1 and owner_subject=$2",
    [id, owner.id],
  );
  const tripId = found.rows[0]?.source_trip_id ? String(found.rows[0].source_trip_id) : null;
  if (!found.rows[0]) throw new Error("Template tidak ditemukan");
  if (!tripId) throw new Error("Template ini tidak berasal dari perjalanan");
  const { snapshot } = await snapshotTrip(tripId, owner.id);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from trip_template_items where template_id=$1", [id]);
    await writeItems(client, id, snapshot.items);
    await client.query(
      `update trip_templates set day_count=$2, version=version+1, cover_url=coalesce($3, cover_url),
              budget_json=$4::jsonb, updated_at=now() where id=$1`,
      [
        id,
        snapshot.days,
        snapshot.items.find((i) => i.image)?.image ?? null,
        snapshot.budget ? JSON.stringify(snapshot.budget) : null,
      ],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return { id };
}

export async function deleteTemplateHandler({ data }: { data: unknown }) {
  const { id } = templateIdInput(data);
  const owner = await requireMember();
  const result = await pool.query(
    "delete from trip_templates where id=$1 and owner_subject=$2 returning id, slug",
    [id, owner.id],
  );
  if (result.rows[0]) await syncTemplateFeedPost(String(result.rows[0].slug), "deleted");
  return { deleted: Boolean(result.rows[0]) };
}

export async function listMyTemplatesHandler() {
  const config = (await readTripTemplatesConfig()).config;
  const owner = await resolveTripOwner();
  if (!owner || owner.guest) return { enabled: config.enabled, signedIn: false as const };
  const result = await pool.query(
    `select id, slug, title, destination_name, day_count, status, source, source_trip_id, version,
            view_count, use_count, featured, hidden_reason, created_at
       from trip_templates where owner_subject=$1 order by created_at desc limit 100`,
    [owner.id],
  );
  const affiliate = await affiliateFor(owner.id);
  const earned = await pool
    .query(
      `select count(*)::int as referrals from affiliate_referrals r
         join affiliate_accounts a on a.id = r.affiliate_id where a.customer_auth_subject=$1`,
      [owner.id],
    )
    .catch(() => ({ rows: [{ referrals: 0 }] }));
  return {
    enabled: config.enabled,
    signedIn: true as const,
    aiAvailable: config.aiEnabled && tripAssistantConfigured(),
    maxPerUser: config.maxPerUser,
    affiliate,
    referrals: Number(earned.rows[0]?.referrals) || 0,
    templates: result.rows.map((row) => ({
      id: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      destinationName: String(row.destination_name),
      days: Number(row.day_count),
      status: String(row.status),
      source: String(row.source),
      hasSourceTrip: Boolean(row.source_trip_id),
      version: Number(row.version),
      views: Number(row.view_count),
      uses: Number(row.use_count),
      featured: Boolean(row.featured),
      hiddenReason: row.hidden_reason ? String(row.hidden_reason) : null,
    })),
  };
}

/* ------------------------------------------------------------------ public read */

type PublicItem = {
  day: number;
  start: string | null;
  end: string | null;
  title: string;
  location: string | null;
  category: string | null;
  lat: number | null;
  lng: number | null;
  image: string | null;
  costIdr: number | null;
};

export async function getPublicTemplateHandler({ data }: { data: unknown }) {
  const { slug } = z.object({ slug: z.string().trim().min(6).max(80) }).parse(data);
  const { config } = await readTripTemplatesConfig();
  if (!config.enabled) return null;
  const found = await pool.query(
    `select id, slug, owner_subject, owner_name, title, description, destination_code, destination_name,
            day_count, cover_url, version, use_count, view_count, featured, source, budget_json
       from trip_templates where slug=$1 and status='published'`,
    [slug],
  );
  const row = found.rows[0];
  if (!row) return null;
  void pool
    .query("update trip_templates set view_count = view_count + 1 where id=$1", [row.id])
    .catch(() => undefined);
  const items = await pool.query(
    `select day_index, start_time, end_time, title, location, category, latitude, longitude, place_image_url, cost_idr
       from trip_template_items where template_id=$1 order by day_index, sort_order`,
    [row.id],
  );
  const viewer = await resolveTripOwner().catch(() => null);
  const isOwner = Boolean(viewer && !viewer.guest && viewer.id === row.owner_subject);
  // A template without a photo gets one the first time it is opened (kept for next time).
  let coverUrl: string | null = row.cover_url ? String(row.cover_url) : null;
  if (!coverUrl) {
    coverUrl =
      items.rows.map((r) => (r.place_image_url ? String(r.place_image_url) : null)).find(Boolean) ??
      (await coverFor({
        destinationCode: String(row.destination_code),
        destinationName: String(row.destination_name),
        locations: items.rows.map((r) => (r.location ? String(r.location) : null)),
      }));
    if (coverUrl)
      void pool
        .query("update trip_templates set cover_url=$2 where id=$1 and cover_url is null", [
          row.id,
          coverUrl,
        ])
        .catch(() => undefined);
  }
  return {
    template: {
      id: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      description: row.description ? String(row.description) : "",
      destinationCode: String(row.destination_code),
      destinationName: String(row.destination_name),
      days: Number(row.day_count),
      coverUrl,
      uses: Number(row.use_count),
      featured: Boolean(row.featured),
      byTravo: row.source === "travo",
      ownerName: row.owner_name ? String(row.owner_name) : null,
      budget: cleanTemplateBudget((row.budget_json as { categories?: unknown } | null)?.categories),
    },
    isOwner,
    /** Only the creator gets their affiliate code back, so sharing from here keeps earning commission. */
    shareCode: isOwner && viewer ? (await affiliateFor(viewer.id)).code : null,
    signedIn: Boolean(viewer && !viewer.guest),
    items: items.rows.map((r): PublicItem => ({
      day: Number(r.day_index),
      start: timeText(r.start_time),
      end: timeText(r.end_time),
      title: String(r.title),
      location: r.location ? String(r.location) : null,
      category: r.category ? String(r.category) : null,
      lat: r.latitude == null ? null : Number(r.latitude),
      lng: r.longitude == null ? null : Number(r.longitude),
      image: r.place_image_url ? String(r.place_image_url) : null,
      costIdr: r.cost_idr ? Number(r.cost_idr) : null,
    })),
  };
}

const gallerySchema = z.object({
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2,8}$/)
    .optional(),
  q: z.string().trim().max(60).optional(),
});

async function backfillCover(slug: string) {
  try {
    const found = await pool.query(
      `select t.id, t.destination_code, t.destination_name,
              (select array_agg(i.location) from trip_template_items i where i.template_id = t.id) as locations
         from trip_templates t where t.slug=$1 and t.cover_url is null`,
      [slug],
    );
    const row = found.rows[0];
    if (!row) return;
    const url = await resolveTemplateCover({
      destinationCode: String(row.destination_code),
      destinationName: String(row.destination_name),
      locations: (row.locations as (string | null)[] | null) ?? [],
    });
    if (url)
      await pool.query("update trip_templates set cover_url=$2 where id=$1 and cover_url is null", [
        row.id,
        url,
      ]);
  } catch {
    // The card keeps its placeholder; the next visit tries again.
  }
}

export async function listTemplateGalleryHandler({ data }: { data: unknown }) {
  const input = gallerySchema.parse(data ?? {});
  const { config } = await readTripTemplatesConfig();
  if (!config.enabled) return { enabled: false as const, templates: [], countries: [] };
  const values: unknown[] = [];
  let where = "status='published'";
  if (input.country) {
    values.push(input.country.toUpperCase());
    where += ` and destination_code=$${values.length}`;
  }
  if (input.q) {
    values.push(`%${input.q.replace(/[%_]/g, " ")}%`);
    where += ` and (title ilike $${values.length} or destination_name ilike $${values.length})`;
  }
  const [list, countries] = await Promise.all([
    pool.query(
      `select slug, title, destination_name, destination_code, day_count, cover_url, use_count, featured, owner_name, source
         from trip_templates where ${where}
         order by featured desc, use_count desc, published_at desc nulls last limit 48`,
      values,
    ),
    pool.query(
      `select destination_code as code, min(destination_name) as name, count(*)::int as n
         from trip_templates where status='published' group by destination_code order by n desc limit 12`,
    ),
  ]);
  // Cards without a photo get one in the background; it shows from the next visit.
  for (const row of list.rows.filter((r) => !r.cover_url).slice(0, 4))
    void backfillCover(String(row.slug));
  return {
    enabled: true as const,
    templates: list.rows.map((row) => ({
      slug: String(row.slug),
      title: String(row.title),
      destinationName: String(row.destination_name),
      destinationCode: String(row.destination_code),
      days: Number(row.day_count),
      coverUrl: row.cover_url ? String(row.cover_url) : null,
      uses: Number(row.use_count),
      featured: Boolean(row.featured),
      ownerName: row.owner_name ? String(row.owner_name) : null,
      byTravo: row.source === "travo",
    })),
    countries: countries.rows.map((row) => ({
      code: String(row.code),
      name: String(row.name),
      count: Number(row.n),
    })),
  };
}

/* ------------------------------------------------------------------ use + report */

const useSchema = z.object({
  slug: z.string().trim().min(6).max(80),
  departureDate: z.string().date(),
  travelers: z.number().int().min(1).max(50).default(1),
});
export const copyTemplateInput = (data: unknown) => useSchema.parse(data);

function todayJakarta() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Copy a template into a new trip owned by the signed-in member. The template itself never changes. */
export async function copyTemplateHandler({ data }: { data: unknown }) {
  const input = copyTemplateInput(data);
  const config = await requireEnabled();
  const owner = await requireMember();
  if (input.departureDate < todayJakarta()) throw new Error("Tanggal berangkat sudah lewat");
  const found = await pool.query(
    `select id, owner_subject, title, destination_code, destination_name, day_count, version, budget_json
       from trip_templates where slug=$1 and status='published'`,
    [input.slug],
  );
  const template = found.rows[0];
  if (!template) throw new Error("Template tidak ditemukan");
  const usedToday = await pool.query(
    "select count(*)::int as n from trip_template_uses where user_subject=$1 and created_at >= $2",
    [owner.id, jakartaDayStart(new Date())],
  );
  if (Number(usedToday.rows[0]?.n) >= config.dailyUses)
    throw new Error("Batas pemakaian template hari ini sudah habis. Coba lagi besok.");
  const items = await pool.query(
    `select day_index, sort_order, start_time, end_time, title, location, category, latitude, longitude, place_image_url, cost_idr
       from trip_template_items where template_id=$1 order by day_index, sort_order`,
    [template.id],
  );
  const days = Number(template.day_count);
  const code = String(template.destination_code);
  // Planned amounts are per traveler in rupiah; the new trip gets them for its own group, in its currency.
  const budget = cleanTemplateBudget(
    (template.budget_json as { categories?: unknown } | null)?.categories,
  );
  let currency: string = tripCurrencyFor(code);
  let rate = 1;
  if (currency !== "IDR") {
    const fx = await fetchFxRate({ from: "IDR", to: currency }).catch(() => null);
    if (fx) rate = fx.rate;
    else currency = "IDR";
  }
  const minorFor = (idrPerPerson: number) =>
    Math.round(idrPerPerson * input.travelers * rate * 100);
  const trip = (await createTrip({
    name: String(template.title).slice(0, 120),
    destinationCode: code,
    destinationName: String(template.destination_name),
    departureDate: input.departureDate,
    returnDate: returnDateFor(input.departureDate, days),
    travelersCount: input.travelers,
    primaryCurrency: currency as ReturnType<typeof tripCurrencyFor>,
    totalBudgetMinor: budget ? minorFor(budget.totalIdr) : 0,
  })) as { id: string };
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const row of items.rows) {
      await client.query(
        `insert into travel_itinerary_items (trip_id,activity_date,start_time,end_time,title,location,activity_category,latitude,longitude,place_image_url,estimated_cost_minor,currency)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          trip.id,
          dateForDay(input.departureDate, Number(row.day_index)),
          row.start_time,
          row.end_time,
          row.title,
          row.location,
          row.category,
          row.latitude,
          row.longitude,
          row.place_image_url,
          row.cost_idr ? minorFor(Number(row.cost_idr)) : null,
          row.cost_idr ? currency : null,
        ],
      );
    }
    for (const [index, line] of (budget?.categories ?? []).entries()) {
      await client.query(
        `insert into travel_budget_categories (trip_id,name,allocated_minor,currency,sort_order)
         values ($1,$2,$3,$4,$5) on conflict do nothing`,
        [trip.id, line.name, minorFor(line.amountIdr), currency, index],
      );
    }
    await client.query("update travel_trips set source_template_id=$2 where id=$1", [
      trip.id,
      template.id,
    ]);
    await client.query(
      "insert into trip_template_uses (template_id,template_version,user_subject,trip_id) values ($1,$2,$3,$4)",
      [template.id, template.version, owner.id, trip.id],
    );
    if (template.owner_subject !== owner.id)
      await client.query("update trip_templates set use_count = use_count + 1 where id=$1", [
        template.id,
      ]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    // Do not leave an empty trip behind when the copy failed.
    await pool.query("delete from travel_trips where id=$1", [trip.id]).catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return { tripId: trip.id };
}

const reportSchema = z.object({
  slug: z.string().trim().min(6).max(80),
  reason: textField(3, 300),
});

export async function reportTemplateHandler({ data }: { data: unknown }) {
  const input = reportSchema.parse(data);
  const owner = await requireMember();
  const found = await pool.query("select id from trip_templates where slug=$1", [input.slug]);
  if (!found.rows[0]) throw new Error("Template tidak ditemukan");
  const recent = await pool.query(
    "select count(*)::int as n from trip_template_reports where reporter_subject=$1 and created_at > now() - interval '1 day'",
    [owner.id],
  );
  if (Number(recent.rows[0]?.n) >= 10) throw new Error("Terlalu banyak laporan hari ini");
  await pool.query(
    "insert into trip_template_reports (template_id, reporter_subject, reason) values ($1,$2,$3)",
    [found.rows[0].id, owner.id, input.reason],
  );
  return { ok: true };
}

/* ------------------------------------------------------------------ admin */

export async function getAdminTemplatesHandler() {
  await requireAdmin();
  const { config, version } = await readTripTemplatesConfig();
  const [templates, reports, stats] = await Promise.all([
    pool.query(
      `select t.id, t.slug, t.title, t.destination_name, t.day_count, t.status, t.source, t.featured,
              t.view_count, t.use_count, t.owner_name, t.hidden_reason, t.created_at,
              a.code as affiliate_code,
              (select count(*)::int from trip_template_reports r where r.template_id=t.id and r.handled_at is null) as open_reports,
              (select count(*)::int from affiliate_referrals f where f.affiliate_id=a.id) as referrals
         from trip_templates t
         left join affiliate_accounts a on a.customer_auth_subject = t.owner_subject
        order by t.created_at desc limit 200`,
    ),
    pool.query(
      `select r.id, r.reason, r.created_at, t.id as template_id, t.title, t.slug
         from trip_template_reports r join trip_templates t on t.id=r.template_id
        where r.handled_at is null order by r.created_at desc limit 50`,
    ),
    pool.query(
      `select
         (select count(*)::int from trip_templates where status='published') as published,
         (select count(*)::int from trip_templates where source='travo') as by_travo,
         (select count(*)::int from trip_template_uses where created_at > now() - interval '7 days') as uses_7d,
         (select count(*)::int from trip_template_uses) as uses_total,
         (select count(*)::int from travel_assistant_runs where intent='template_draft' and created_at > now() - interval '7 days') as drafts_7d`,
    ),
  ]);
  const s = stats.rows[0] ?? {};
  return {
    config,
    version,
    stats: {
      published: Number(s.published) || 0,
      byTravo: Number(s.by_travo) || 0,
      uses7d: Number(s.uses_7d) || 0,
      usesTotal: Number(s.uses_total) || 0,
      drafts7d: Number(s.drafts_7d) || 0,
    },
    templates: templates.rows.map((row) => ({
      id: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      destinationName: String(row.destination_name),
      days: Number(row.day_count),
      status: String(row.status),
      source: String(row.source),
      featured: Boolean(row.featured),
      views: Number(row.view_count),
      uses: Number(row.use_count),
      ownerName: row.owner_name ? String(row.owner_name) : null,
      hiddenReason: row.hidden_reason ? String(row.hidden_reason) : null,
      affiliateCode: row.affiliate_code ? String(row.affiliate_code) : null,
      referrals: Number(row.referrals) || 0,
      openReports: Number(row.open_reports) || 0,
      createdAt: new Date(row.created_at as string).toISOString(),
    })),
    reports: reports.rows.map((row) => ({
      id: String(row.id),
      reason: String(row.reason),
      templateId: String(row.template_id),
      title: String(row.title),
      slug: String(row.slug),
      createdAt: new Date(row.created_at as string).toISOString(),
    })),
  };
}

const adminActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["hide", "restore", "feature", "unfeature", "delete", "dismiss_reports"]),
  reason: z.string().trim().min(4).max(300),
});
export const adminTemplateActionInput = (data: unknown) => adminActionSchema.parse(data);

export async function adminTemplateActionHandler({ data }: { data: unknown }) {
  const input = adminTemplateActionInput(data);
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      "select id, slug, title, status, featured from trip_templates where id=$1 for update",
      [input.id],
    );
    const before = current.rows[0];
    if (!before) {
      await client.query("rollback");
      throw new Error("Template tidak ditemukan");
    }
    if (input.action === "hide")
      await client.query(
        "update trip_templates set status='hidden', hidden_reason=$2, updated_at=now() where id=$1",
        [input.id, input.reason],
      );
    else if (input.action === "restore")
      await client.query(
        "update trip_templates set status='published', hidden_reason=null, updated_at=now() where id=$1",
        [input.id],
      );
    else if (input.action === "feature" || input.action === "unfeature")
      await client.query("update trip_templates set featured=$2, updated_at=now() where id=$1", [
        input.id,
        input.action === "feature",
      ]);
    else if (input.action === "delete")
      await client.query("delete from trip_templates where id=$1", [input.id]);
    if (input.action === "hide" || input.action === "delete" || input.action === "dismiss_reports")
      await client.query(
        "update trip_template_reports set handled_at=now() where template_id=$1 and handled_at is null",
        [input.id],
      );
    // After commit the timeline post follows the template (see below); it is derived state.
    await recordAdminAction(
      {
        actor,
        action: `trip_template.${input.action}`,
        entityType: "trip_template",
        entityId: input.id,
        reason: input.reason,
        before: { title: before.title, status: before.status, featured: before.featured },
        after: { action: input.action },
      },
      client,
    );
    await client.query("commit");
    const slug = String(before.slug);
    if (input.action === "hide") await syncTemplateFeedPost(slug, "off");
    else if (input.action === "restore") await syncTemplateFeedPost(slug, "live");
    else if (input.action === "delete") await syncTemplateFeedPost(slug, "deleted");
    return { ok: true };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const saveConfigSchema = z.object({
  config: z.unknown(),
  reason: z.string().trim().min(4).max(300),
  expectedVersion: z.number().int().min(0),
});
export const saveTemplatesConfigInput = (data: unknown) => saveConfigSchema.parse(data);

export async function saveTemplatesConfigHandler({ data }: { data: unknown }) {
  const input = saveTemplatesConfigInput(data);
  await requireAdmin();
  const config = parseTripTemplatesConfig(input.config);
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      "select value_json, version from admin_settings where setting_key = $1 for update",
      [TRIP_TEMPLATES_SETTING_KEY],
    );
    const row = current.rows[0];
    const version = row ? Number(row.version) : 0;
    if (version !== input.expectedVersion) {
      await client.query("rollback");
      return { ok: false as const, conflict: true as const, version };
    }
    await client.query(
      `insert into admin_settings (setting_key, value_json, version, updated_at)
       values ($1, $2::jsonb, 1, now())
       on conflict (setting_key) do update
       set value_json = excluded.value_json, version = admin_settings.version + 1, updated_at = now()`,
      [TRIP_TEMPLATES_SETTING_KEY, JSON.stringify(config)],
    );
    await recordAdminAction(
      {
        actor,
        action: "trip_templates.config",
        entityType: "admin_setting",
        entityId: TRIP_TEMPLATES_SETTING_KEY,
        reason: input.reason,
        before: row?.value_json ?? null,
        after: config,
      },
      client,
    );
    await client.query("commit");
    return { ok: true as const, version: version + 1 };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
