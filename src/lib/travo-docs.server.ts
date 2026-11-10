import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { resolveTripOwner, type TripOwner } from "./guest-trips.server";
import {
  AGENT_SLUG,
  DEFAULT_AGENT,
  DEFAULT_SKILLS,
  DOC_BODY_MAX,
  MEMORY_MAX_ITEMS,
  buildGuideBlock,
  buildMemoryBlock,
  checkMemoryText,
  sanitizeDoc,
  selectSkills,
  type MemoryRow,
  type TravoDoc,
} from "./travo-docs";

/* ------------------------------------------------------------------------------ documents */

const rowToDoc = (r: Record<string, unknown>): TravoDoc => ({
  kind: r["kind"] as TravoDoc["kind"],
  slug: String(r["slug"]),
  title: String(r["title"]),
  body: String(r["body"]),
  enabled: Boolean(r["enabled"]),
  triggers: {
    intents: ((r["triggers"] as Record<string, string[]> | null)?.["intents"] ?? []) as string[],
    scopes: ((r["triggers"] as Record<string, string[]> | null)?.["scopes"] ?? []) as string[],
    keywords: ((r["triggers"] as Record<string, string[]> | null)?.["keywords"] ?? []) as string[],
  },
  version: Number(r["version"]) || 1,
  updatedAt: new Date(String(r["updated_at"])).toISOString(),
});

let cache: { at: number; docs: TravoDoc[] } | null = null;
export const clearTravoDocsCache = () => {
  cache = null;
};

/** The saved documents; with none saved yet, the built-in defaults (Admin can then edit and save them). */
export async function readTravoDocs(): Promise<{ docs: TravoDoc[]; isDefault: boolean }> {
  if (cache && Date.now() - cache.at < 60_000)
    return { docs: cache.docs, isDefault: cache.docs.every((d) => d.version === undefined) };
  const rows = await pool.query("select * from public.travel_assistant_docs order by kind, slug");
  const docs = rows.rows.length ? rows.rows.map(rowToDoc) : [DEFAULT_AGENT, ...DEFAULT_SKILLS];
  cache = { at: Date.now(), docs };
  return { docs, isDefault: !rows.rows.length };
}

/* ------------------------------------------------------------------------------- memory */

export async function listMemory(subject: string): Promise<MemoryRow[]> {
  const rows = await pool.query(
    "select id, text, source, created_at from public.travel_assistant_memory where customer_auth_subject=$1 order by created_at",
    [subject],
  );
  return rows.rows.map((r) => ({
    id: String(r["id"]),
    text: String(r["text"]),
    source: r["source"] as MemoryRow["source"],
    createdAt: new Date(String(r["created_at"])).toISOString(),
  }));
}

export type MemoryResult =
  { ok: true; items: MemoryRow[] } | { ok: false; message: string; items: MemoryRow[] };

export async function addMemory(
  owner: TripOwner,
  value: string,
  source: MemoryRow["source"],
): Promise<MemoryResult> {
  const items = owner.guest ? [] : await listMemory(owner.id);
  if (owner.guest)
    return { ok: false, message: "Masuk dulu supaya Travo bisa mengingat pilihanmu.", items };
  const checked = checkMemoryText(value);
  if (!checked.ok) return { ok: false, message: checked.message, items };
  if (items.some((i) => i.text.toLowerCase() === checked.text.toLowerCase()))
    return { ok: true, items };
  if (items.length >= MEMORY_MAX_ITEMS)
    return { ok: false, message: `Penuh (${MEMORY_MAX_ITEMS} catatan). Hapus satu dulu.`, items };
  await pool.query(
    "insert into public.travel_assistant_memory (customer_auth_subject, text, source) values ($1,$2,$3)",
    [owner.id, checked.text, source],
  );
  return { ok: true, items: await listMemory(owner.id) };
}

export async function deleteMemory(owner: TripOwner, id: string) {
  await pool.query(
    "delete from public.travel_assistant_memory where id=$1 and customer_auth_subject=$2",
    [id, owner.id],
  );
  return listMemory(owner.id);
}

export async function clearMemory(owner: TripOwner) {
  await pool.query("delete from public.travel_assistant_memory where customer_auth_subject=$1", [
    owner.id,
  ]);
  return [] as MemoryRow[];
}

/* ----------------------------------------------------------------------------- the prompt */

/**
 * The team guide, the skills this request needs and what Travo remembers about this traveler, as one
 * text appended to the prompt. Empty when switched off (Admin) or when there is nothing to add.
 */
export async function buildTravoGuide(
  owner: TripOwner,
  ctx: { intent: string; scope: string; text: string },
  flags: { teamGuide: boolean; memory: boolean },
): Promise<string> {
  const parts: string[] = [];
  try {
    if (flags.teamGuide) {
      const { docs } = await readTravoDocs();
      const agent = docs.find((d) => d.kind === "agent" && d.slug === AGENT_SLUG) ?? null;
      const block = buildGuideBlock(agent, selectSkills(docs, ctx));
      if (block) parts.push(block);
    }
    if (flags.memory && !owner.guest) {
      const block = buildMemoryBlock(await listMemory(owner.id));
      if (block) parts.push(block);
    }
  } catch (error) {
    console.error("[travo-docs] guide failed", error instanceof Error ? error.message : error);
  }
  return parts.join("\n\n");
}

/* ------------------------------------------------------------------------------ handlers */

const memoryInput = z.object({
  text: z.string().trim().min(1).max(400),
  source: z.enum(["chat", "wizard", "manual"]).default("manual"),
});
export const addMemoryInput = (data: unknown) => memoryInput.parse(data);
const memoryIdInput = z.object({ id: z.string().uuid() });
export const memoryIdInputParse = (data: unknown) => memoryIdInput.parse(data);

async function member() {
  const owner = await resolveTripOwner();
  if (!owner) throw new Error("Autentikasi diperlukan");
  return owner;
}

export async function listMemoryHandler() {
  const owner = await member();
  return { guest: owner.guest, items: owner.guest ? [] : await listMemory(owner.id) };
}
export async function addMemoryHandler({ data }: { data: ReturnType<typeof addMemoryInput> }) {
  return addMemory(await member(), data.text, data.source);
}
export async function deleteMemoryHandler({
  data,
}: {
  data: ReturnType<typeof memoryIdInputParse>;
}) {
  return { items: await deleteMemory(await member(), data.id) };
}
export async function clearMemoryHandler() {
  return { items: await clearMemory(await member()) };
}

const docInput = z.object({
  kind: z.enum(["agent", "skill"]),
  slug: z.string().trim().max(40).optional(),
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().min(1).max(DOC_BODY_MAX),
  enabled: z.boolean(),
  triggers: z
    .object({
      intents: z.array(z.string()).max(8),
      scopes: z.array(z.string()).max(8),
      keywords: z.array(z.string()).max(12),
    })
    .optional(),
  reason: z.string().trim().min(4).max(200),
});
export const saveDocInput = (data: unknown) => docInput.parse(data);
const docKeyInput = z.object({
  kind: z.enum(["agent", "skill"]),
  slug: z.string().trim().max(40),
  reason: z.string().trim().min(4).max(200),
});
export const deleteDocInput = (data: unknown) => docKeyInput.parse(data);

async function audit(
  action: string,
  entity: string,
  reason: string,
  before: unknown,
  after: unknown,
) {
  const actor = (await getAdminEmailHandler()) ?? "admin";
  await pool.query(
    `insert into public.admin_audit_logs (id, action, entity_type, entity_id, reason, before_json, after_json)
     values ($1, $2, 'trip_assistant_doc', $3, $4, $5::jsonb, $6::jsonb)`,
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

export async function adminListDocsHandler() {
  await requireAdmin();
  const { docs, isDefault } = await readTravoDocs();
  return { docs, isDefault, memory: await memoryStats() };
}

/** The first save copies the defaults, so editing one document never makes the others vanish. */
async function ensureSaved(actor: string | null) {
  const count = await pool.query("select count(*)::int as n from public.travel_assistant_docs");
  if (Number(count.rows[0]?.n) > 0) return;
  for (const d of [DEFAULT_AGENT, ...DEFAULT_SKILLS])
    await pool.query(
      `insert into public.travel_assistant_docs (kind, slug, title, body, enabled, triggers, updated_by)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7) on conflict (kind, slug) do nothing`,
      [d.kind, d.slug, d.title, d.body, d.enabled, JSON.stringify(d.triggers), actor],
    );
}

export async function adminSaveDocHandler({ data }: { data: ReturnType<typeof saveDocInput> }) {
  await requireAdmin();
  const doc = sanitizeDoc({
    kind: data.kind,
    slug: data.slug,
    title: data.title,
    body: data.body,
    enabled: data.enabled,
    triggers: data.triggers,
  });
  if (!doc)
    throw new Error("Dokumen tidak valid (nama tampilan, slug huruf kecil dan strip, isi wajib).");
  const actor = (await getAdminEmailHandler()) ?? null;
  await ensureSaved(actor);
  const before = await pool.query(
    "select * from public.travel_assistant_docs where kind=$1 and slug=$2",
    [doc.kind, doc.slug],
  );
  await pool.query(
    `insert into public.travel_assistant_docs (kind, slug, title, body, enabled, triggers, updated_by)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7)
     on conflict (kind, slug) do update set title=excluded.title, body=excluded.body, enabled=excluded.enabled,
       triggers=excluded.triggers, updated_by=excluded.updated_by, updated_at=now(),
       version=travel_assistant_docs.version+1`,
    [doc.kind, doc.slug, doc.title, doc.body, doc.enabled, JSON.stringify(doc.triggers), actor],
  );
  await audit(
    "assistant.doc_saved",
    `${doc.kind}:${doc.slug}`,
    data.reason,
    before.rows[0]
      ? {
          title: before.rows[0]["title"],
          body: before.rows[0]["body"],
          enabled: before.rows[0]["enabled"],
        }
      : null,
    { title: doc.title, body: doc.body, enabled: doc.enabled },
  );
  clearTravoDocsCache();
  return adminListDocsHandler();
}

export async function adminDeleteDocHandler({ data }: { data: ReturnType<typeof deleteDocInput> }) {
  await requireAdmin();
  if (data.kind === "agent")
    throw new Error("Dokumen agent tidak bisa dihapus. Matikan atau ubah isinya.");
  await ensureSaved((await getAdminEmailHandler()) ?? null);
  const before = await pool.query(
    "select title, body from public.travel_assistant_docs where kind=$1 and slug=$2",
    [data.kind, data.slug],
  );
  await pool.query("delete from public.travel_assistant_docs where kind=$1 and slug=$2", [
    data.kind,
    data.slug,
  ]);
  await audit(
    "assistant.doc_deleted",
    `${data.kind}:${data.slug}`,
    data.reason,
    before.rows[0] ?? null,
    {},
  );
  clearTravoDocsCache();
  return adminListDocsHandler();
}

/** Puts every built-in document back (overwriting edits to those slugs); custom skills stay. */
export async function adminRestoreDocsHandler({ data }: { data: { reason: string } }) {
  await requireAdmin();
  const reason = z.string().trim().min(4).max(200).parse(data.reason);
  const actor = (await getAdminEmailHandler()) ?? null;
  for (const d of [DEFAULT_AGENT, ...DEFAULT_SKILLS])
    await pool.query(
      `insert into public.travel_assistant_docs (kind, slug, title, body, enabled, triggers, updated_by)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7)
       on conflict (kind, slug) do update set title=excluded.title, body=excluded.body, enabled=excluded.enabled,
         triggers=excluded.triggers, updated_by=excluded.updated_by, updated_at=now(), version=travel_assistant_docs.version+1`,
      [d.kind, d.slug, d.title, d.body, d.enabled, JSON.stringify(d.triggers), actor],
    );
  await audit("assistant.docs_restored", "all", reason, {}, {});
  clearTravoDocsCache();
  return adminListDocsHandler();
}

export async function memoryStats() {
  const r = await pool.query(
    "select count(*)::int as items, count(distinct customer_auth_subject)::int as travelers from public.travel_assistant_memory",
  );
  return { items: Number(r.rows[0]?.items) || 0, travelers: Number(r.rows[0]?.travelers) || 0 };
}
