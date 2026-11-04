import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { buildSettingAudit } from "./admin-settings";
import { displayBudgetCategory } from "./my-trips-home";
import {
  RECEIPT_SCAN_SETTING_KEY,
  UNAVAILABLE_RECEIPT_SCAN,
  cleanReceiptRead,
  estimateCostIdr,
  jakartaDayStart,
  normalizeReceiptScanConfig,
  parseReceiptScanConfig,
  validateReceipt,
  DEFAULT_RECEIPT_SCAN_CONFIG,
  type ReceiptRead,
  type ReceiptScanConfig,
  type ReceiptScanResponse,
  type ReceiptScanStatus,
  type ReceiptValidation,
} from "./receipt-scan";

/* ------------------------------------------------------------------------------- config */

export type ReceiptScanConfigRecord = { config: ReceiptScanConfig; version: number };

export async function readReceiptScanConfig(): Promise<ReceiptScanConfigRecord> {
  try {
    const result = await pool.query(
      "select value_json, version from public.admin_settings where setting_key = $1",
      [RECEIPT_SCAN_SETTING_KEY],
    );
    const row = result.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    if (!row) return { config: DEFAULT_RECEIPT_SCAN_CONFIG, version: 0 };
    return {
      config: normalizeReceiptScanConfig(row.value_json),
      version: Number(row.version) || 0,
    };
  } catch {
    return { config: DEFAULT_RECEIPT_SCAN_CONFIG, version: 0 };
  }
}

/** The AI key lives only on the server (HELIPOD_AI_KEY); without it the feature stays hidden. */
export const aiConfigured = () => Boolean(process.env["HELIPOD_AI_KEY"]);
const aiBase = () =>
  (process.env["HELIPOD_AI_BASE_URL"] || "https://ai.helipod.io/v1").replace(/\/$/, "");

async function usedToday(userId: string, now = new Date()) {
  const result = await pool.query(
    "select count(*)::int as n from public.travel_receipt_scans where customer_auth_subject=$1 and created_at >= $2",
    [userId, jakartaDayStart(now)],
  );
  return Number(result.rows[0]?.n) || 0;
}

export async function receiptScanStatus(userId: string): Promise<ReceiptScanStatus> {
  const { config } = await readReceiptScanConfig();
  if (!config.enabled || !aiConfigured()) return UNAVAILABLE_RECEIPT_SCAN;
  const used = await usedToday(userId);
  return {
    available: true,
    savePhoto: config.savePhoto,
    maxPhotos: config.maxPhotos,
    maxMb: config.maxMb,
    dailyLimit: config.dailyLimit,
    remaining: Math.max(0, config.dailyLimit - used),
  };
}

async function assertOwnedTrip(tripId: string, userId: string) {
  const result = await pool.query(
    "select id from public.travel_trips where id=$1 and customer_auth_subject=$2 limit 1",
    [tripId, userId],
  );
  if (!result.rows[0]) throw new Error("Perjalanan tidak ditemukan");
}

/* ------------------------------------------------------------------------- the AI call */

const READ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_receipt",
    "readable",
    "merchant",
    "date",
    "currency",
    "total",
    "items",
    "category_guess",
    "uncertain",
    "region",
    "reason",
  ],
  properties: {
    is_receipt: { type: "boolean" },
    readable: { type: "boolean" },
    merchant: { type: ["string", "null"] },
    date: { type: ["string", "null"] },
    currency: { type: ["string", "null"] },
    total: { type: ["number", "null"] },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "amount"],
        properties: { name: { type: "string" }, amount: { type: "number" } },
      },
    },
    category_guess: { type: ["string", "null"] },
    uncertain: { type: "array", items: { type: "string" } },
    region: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["x", "y", "width", "height"],
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
      },
    },
    reason: { type: ["string", "null"] },
  },
} as const;

export const RECEIPT_SYSTEM_PROMPT = [
  "You read photographed shop receipts (Japanese, English, Indonesian and others). Answer ONLY with JSON that follows the schema.",
  "Read every digit exactly as printed. Never guess or invent a value: when unsure, say so in `uncertain` instead.",
  "Amounts are plain numbers without currency symbols or thousand separators (¥1,480 -> 1480, Rp 25.000 -> 25000, 12.50 -> 12.5).",
  "`items` lists EVERY priced line, including tax, service charge and discounts (negative), so that the items add up to `total`. Do not list subtotal, total, cash given, change or points.",
  "`total` is the final amount payable. `currency` is the ISO 4217 code (JPY, IDR, USD...).",
  "Convert the date to YYYY-MM-DD (Reiwa 8 = 2026). If the year is missing use the most recent plausible year.",
  "If the image is not a receipt set is_receipt=false. If it is too blurry or cut off to read the total set readable=false.",
  "Put any of merchant, date, total, currency, items you are not sure about in `uncertain` and set `region` to the bounding box (0 to 1 of the image) of the doubtful area, otherwise null.",
  "`category_guess` must be exactly one of the category names given by the user, or null.",
].join("\n");

type ModelCall = {
  read: ReceiptRead | null;
  usage: { input: number; output: number };
};

async function readWithModel(
  model: string,
  dataUrl: string,
  categories: string[],
): Promise<ModelCall> {
  const key = process.env["HELIPOD_AI_KEY"];
  if (!key) throw new Error("not_configured");
  const body = (withSchema: boolean) =>
    JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 1800,
      messages: [
        { role: "system", content: RECEIPT_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Category names: ${JSON.stringify(categories)}. Read this receipt.`,
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      ...(withSchema
        ? {
            response_format: {
              type: "json_schema",
              json_schema: { name: "receipt_read", strict: true, schema: READ_SCHEMA },
            },
          }
        : {}),
    });
  const call = (withSchema: boolean) =>
    fetch(`${aiBase()}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: body(withSchema),
      signal: AbortSignal.timeout(60_000),
    });
  let response = await call(true);
  // A model that does not accept structured output still answers JSON text; ask once more plainly.
  if (response.status === 400) response = await call(false);
  if (response.status === 429 || response.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    response = await call(true);
  }
  if (!response.ok) throw new Error(`ai_${response.status}`);
  const json = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = json.choices?.[0]?.message?.content;
  const raw =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((p: { text?: string }) => p?.text ?? "").join("")
        : "";
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
    read: cleanReceiptRead(parsed),
    usage: {
      input: Number(json.usage?.prompt_tokens) || 0,
      output: Number(json.usage?.completion_tokens) || 0,
    },
  };
}

const localDay = (now: Date) => {
  const shifted = new Date(now.getTime() + 7 * 3_600_000);
  return shifted.toISOString().slice(0, 10);
};

const readStatus = (read: ReceiptRead | null, validation: ReceiptValidation | null) => {
  if (!read || !read.isReceipt) return "not_receipt" as const;
  if (!read.readable || read.total === null || read.total <= 0) return "unreadable" as const;
  return (validation?.status ?? "check") as "ready" | "check";
};

function matchCategory(guess: string | null, categories: { id: string; name: string }[]) {
  if (!guess) return null;
  const wanted = guess.trim().toLowerCase();
  const found = categories.find(
    (c) =>
      c.name.toLowerCase() === wanted || displayBudgetCategory(c.name).toLowerCase() === wanted,
  );
  return found?.id ?? null;
}

const MIME_BY_MAGIC: [string, number[]][] = [
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/webp", [0x52, 0x49, 0x46, 0x46]],
];

export function sniffImageMime(bytes: Uint8Array) {
  return MIME_BY_MAGIC.find(([, magic]) => magic.every((b, i) => bytes[i] === b))?.[0] ?? null;
}

/**
 * Reads one receipt photo: quota, size and ownership checks, the AI read, a second read with the
 * stronger model when the items do not add up, then the scan log and (optionally) the photo.
 */
export async function scanReceipt(input: {
  userId: string;
  tripId: string;
  bytes: Uint8Array;
  now?: Date;
}): Promise<ReceiptScanResponse> {
  const now = input.now ?? new Date();
  const { config } = await readReceiptScanConfig();
  if (!config.enabled || !aiConfigured())
    return { ok: false, code: "disabled", message: "Scan struk sedang tidak tersedia." };
  const mime = sniffImageMime(input.bytes);
  if (!mime) return { ok: false, code: "bad_image", message: "File bukan foto yang didukung." };
  if (input.bytes.length > config.maxMb * 1024 * 1024)
    return { ok: false, code: "too_large", message: `Foto lebih dari ${config.maxMb} MB.` };
  await assertOwnedTrip(input.tripId, input.userId);

  const used = await usedToday(input.userId, now);
  if (used >= config.dailyLimit)
    return {
      ok: false,
      code: "limit",
      message: `Scan harian habis (${config.dailyLimit} struk). Besok bisa lagi.`,
      remaining: 0,
    };

  const categoryRows = await pool.query(
    "select id, name from public.travel_budget_categories where trip_id=$1 order by sort_order",
    [input.tripId],
  );
  const categories = categoryRows.rows.map((r) => ({ id: String(r.id), name: String(r.name) }));
  const dataUrl = `data:${mime};base64,${Buffer.from(input.bytes).toString("base64")}`;
  const today = localDay(now);

  let model = config.model;
  let escalated = false;
  let tokensIn = 0;
  let tokensOut = 0;
  let cost = 0;
  let first: ModelCall;
  try {
    first = await readWithModel(
      config.model,
      dataUrl,
      categories.map((c) => c.name),
    );
  } catch (error) {
    console.error("[receipt-scan] read failed", error instanceof Error ? error.message : error);
    await pool
      .query(
        `insert into public.travel_receipt_scans (trip_id, customer_auth_subject, status, model)
         values ($1, $2, 'error', $3)`,
        [input.tripId, input.userId, config.model],
      )
      .catch(() => undefined);
    return {
      ok: false,
      code: "unavailable",
      message: "Struk belum bisa dibaca. Coba lagi sebentar.",
    };
  }
  tokensIn += first.usage.input;
  tokensOut += first.usage.output;
  cost += estimateCostIdr(config.model, first.usage);
  let read = first.read;
  let validation = read ? validateReceipt(read, today) : null;

  const doubtful =
    read?.isReceipt && (validation?.status === "check" || !read.readable || read.total === null);
  if (doubtful && config.retryStrongModel && config.strongModel !== config.model) {
    try {
      const second = await readWithModel(
        config.strongModel,
        dataUrl,
        categories.map((c) => c.name),
      );
      tokensIn += second.usage.input;
      tokensOut += second.usage.output;
      cost += estimateCostIdr(config.strongModel, second.usage);
      escalated = true;
      const secondValidation = second.read ? validateReceipt(second.read, today) : null;
      const better =
        second.read &&
        second.read.isReceipt &&
        (!read ||
          secondValidation!.issues.length < (validation?.issues.length ?? 99) ||
          (secondValidation!.status === "ready" && validation?.status !== "ready"));
      if (better) {
        read = second.read;
        validation = secondValidation;
        model = config.strongModel;
      }
    } catch (error) {
      console.error(
        "[receipt-scan] strong read failed",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const status = readStatus(read, validation);
  const scan = await pool.query(
    `insert into public.travel_receipt_scans
       (trip_id, customer_auth_subject, status, model, escalated, tokens_in, tokens_out, cost_idr)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [input.tripId, input.userId, status, model, escalated, tokensIn, tokensOut, cost.toFixed(4)],
  );
  const scanId = String(scan.rows[0].id);

  let photoStored = false;
  if (config.savePhoto && (status === "ready" || status === "check")) {
    try {
      await pool.query(
        `insert into public.travel_receipt_photos (scan_id, trip_id, customer_auth_subject, mime, bytes)
         values ($1, $2, $3, $4, $5)`,
        [scanId, input.tripId, input.userId, mime, Buffer.from(input.bytes)],
      );
      photoStored = true;
    } catch (error) {
      console.error(
        "[receipt-scan] photo store failed",
        error instanceof Error ? error.message : error,
      );
    }
  }
  // Photos nobody saved are kept for a day only.
  void pool
    .query(
      "delete from public.travel_receipt_photos where expense_id is null and created_at < now() - interval '1 day'",
    )
    .catch(() => undefined);

  return {
    ok: true,
    scanId,
    status,
    read: status === "not_receipt" ? null : read,
    validation: status === "not_receipt" ? null : validation,
    categoryId: read ? matchCategory(read.categoryGuess, categories) : null,
    photoStored,
    escalated,
    remaining: Math.max(0, config.dailyLimit - used - 1),
  };
}

/* ------------------------------------------------------------------------ exchange rate */

export type FxRate = { rate: number; rateDate: string; source: string } | null;

const fxCache = new Map<string, { at: number; value: FxRate }>();
const FX_TTL_MS = 6 * 60 * 60 * 1000;
export const FX_SOURCE = "ECB via Frankfurter";

const fxSchema = z.object({
  from: z
    .string()
    .trim()
    .length(3)
    .transform((v) => v.toUpperCase()),
  to: z
    .string()
    .trim()
    .length(3)
    .transform((v) => v.toUpperCase()),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export const fxRateInput = (data: unknown) => fxSchema.parse(data);

/** Reference rate (European Central Bank) for the receipt's date, so the conversion is traceable. */
export async function fetchFxRate(input: ReturnType<typeof fxRateInput>): Promise<FxRate> {
  const { from, to } = input;
  const today = localDay(new Date());
  if (from === to) return { rate: 1, rateDate: input.date ?? today, source: "Mata uang sama" };
  const date = input.date && input.date <= today ? input.date : "latest";
  const key = `${from}>${to}|${date}`;
  const hit = fxCache.get(key);
  if (hit && Date.now() - hit.at < FX_TTL_MS) return hit.value;
  let value: FxRate = null;
  try {
    const response = await fetch(
      `https://api.frankfurter.dev/v1/${date}?base=${from}&symbols=${to}`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) },
    );
    if (response.ok) {
      const json = (await response.json()) as { date?: string; rates?: Record<string, number> };
      const rate = Number(json.rates?.[to]);
      if (Number.isFinite(rate) && rate > 0 && json.date)
        value = { rate, rateDate: json.date, source: FX_SOURCE };
    }
  } catch (error) {
    console.error("[receipt-scan] fx failed", error instanceof Error ? error.message : error);
  }
  if (value) {
    fxCache.set(key, { at: Date.now(), value });
    if (fxCache.size > 300) fxCache.clear();
  }
  return value;
}

/* ----------------------------------------------------------------------- saving expenses */

const currency = z
  .string()
  .trim()
  .length(3)
  .transform((v) => v.toUpperCase());
const saveItem = z.object({
  scanId: z.string().uuid(),
  description: z.string().trim().min(1).max(160),
  transactionDate: z.string().date(),
  originalAmountMinor: z.number().int().positive(),
  originalCurrency: currency,
  exchangeRate: z.number().positive().optional(),
  exchangeRateSource: z.string().trim().max(120).optional(),
  convertedAmountMinor: z.number().int().positive(),
  convertedCurrency: currency,
  categoryId: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
  edited: z.boolean().default(false),
  keepPhoto: z.boolean().default(false),
});
const saveSchema = z.object({
  tripId: z.string().uuid(),
  items: z.array(saveItem).min(1).max(20),
});
export const saveScannedInput = (data: unknown) => saveSchema.parse(data);

/** Creates the expenses of a reviewed scan batch in one transaction and links the kept photos. */
export async function saveScannedExpenses(
  userId: string,
  data: ReturnType<typeof saveScannedInput>,
) {
  await assertOwnedTrip(data.tripId, userId);
  const { config } = await readReceiptScanConfig();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const ids: string[] = [];
    for (const item of data.items) {
      const scan = await client.query(
        `select id from public.travel_receipt_scans
         where id=$1 and trip_id=$2 and customer_auth_subject=$3 and saved_expense_id is null
         for update`,
        [item.scanId, data.tripId, userId],
      );
      if (!scan.rows[0]) throw new Error("Struk sudah disimpan atau tidak ditemukan");
      if (item.categoryId) {
        const category = await client.query(
          "select id from public.travel_budget_categories where id=$1 and trip_id=$2",
          [item.categoryId, data.tripId],
        );
        if (!category.rows[0]) throw new Error("Kategori anggaran tidak ditemukan");
      }
      const expense = await client.query(
        `insert into public.travel_expenses
           (trip_id,category_id,description,transaction_date,original_amount_minor,original_currency,exchange_rate,exchange_rate_source,exchange_rate_status,exchange_rate_as_of,converted_amount_minor,converted_currency,notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'estimated',now(),$9,$10,$11) returning id`,
        [
          data.tripId,
          item.categoryId ?? null,
          item.description,
          item.transactionDate,
          item.originalAmountMinor,
          item.originalCurrency,
          item.exchangeRate ?? null,
          item.exchangeRateSource ?? null,
          item.convertedAmountMinor,
          item.convertedCurrency,
          item.notes ?? null,
        ],
      );
      const expenseId = String(expense.rows[0].id);
      ids.push(expenseId);
      await client.query(
        "update public.travel_receipt_scans set saved_expense_id=$1, edited=$2 where id=$3",
        [expenseId, item.edited, item.scanId],
      );
      if (item.keepPhoto && config.savePhoto) {
        await client.query(
          "update public.travel_receipt_photos set expense_id=$1 where scan_id=$2 and customer_auth_subject=$3",
          [expenseId, item.scanId, userId],
        );
      } else {
        await client.query("delete from public.travel_receipt_photos where scan_id=$1", [
          item.scanId,
        ]);
      }
    }
    await client.query("commit");
    return { expenseIds: ids };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** The photo of an expense, only for the trip's owner. */
export async function readReceiptPhoto(userId: string, scanId: string) {
  if (!z.string().uuid().safeParse(scanId).success) return null;
  const result = await pool.query(
    `select p.mime, p.bytes from public.travel_receipt_photos p
     join public.travel_trips t on t.id = p.trip_id
     where p.scan_id=$1 and t.customer_auth_subject=$2`,
    [scanId, userId],
  );
  const row = result.rows[0] as { mime: string; bytes: Buffer } | undefined;
  return row ? { mime: row.mime, bytes: row.bytes } : null;
}

/* ------------------------------------------------------------------------------- admin */

export type ReceiptScanStats = {
  scans: number;
  needsCheckPercent: number;
  editedPercent: number;
  costIdr: number;
  saved: number;
};

async function readStats(): Promise<ReceiptScanStats> {
  try {
    const result = await pool.query(
      `select count(*) filter (where status <> 'error')::int as scans,
              count(*) filter (where status = 'check')::int as needs_check,
              count(*) filter (where saved_expense_id is not null)::int as saved,
              count(*) filter (where saved_expense_id is not null and edited)::int as edited,
              coalesce(sum(cost_idr), 0)::float as cost
       from public.travel_receipt_scans where created_at > now() - interval '30 days'`,
    );
    const row = (result.rows[0] ?? {}) as Record<string, number>;
    const scans = Number(row["scans"]) || 0;
    const saved = Number(row["saved"]) || 0;
    return {
      scans,
      needsCheckPercent: scans ? Math.round((Number(row["needs_check"]) / scans) * 1000) / 10 : 0,
      editedPercent: saved ? Math.round((Number(row["edited"]) / saved) * 100) : 0,
      costIdr: Math.round(Number(row["cost"]) || 0),
      saved,
    };
  } catch {
    return { scans: 0, needsCheckPercent: 0, editedPercent: 0, costIdr: 0, saved: 0 };
  }
}

export const getAdminReceiptScanHandler = async () => {
  await requireAdmin();
  const [record, stats] = await Promise.all([readReceiptScanConfig(), readStats()]);
  return { ...record, stats, aiConfigured: aiConfigured() };
};

const adminSaveSchema = z.object({
  config: z.unknown(),
  reason: z.string().trim().min(4).max(300),
  expectedVersion: z.number().int().min(0),
});
export const saveReceiptScanConfigInput = (data: unknown) => adminSaveSchema.parse(data);

export async function saveReceiptScanConfigHandler({
  data,
}: {
  data: ReturnType<typeof saveReceiptScanConfigInput>;
}) {
  await requireAdmin();
  const config = parseReceiptScanConfig(data.config);
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      "select value_json, version from public.admin_settings where setting_key = $1 for update",
      [RECEIPT_SCAN_SETTING_KEY],
    );
    const row = current.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    const version = row ? Number(row.version) : 0;
    if (version !== data.expectedVersion) {
      await client.query("rollback");
      return { ok: false as const, conflict: true as const, version };
    }
    const audit = buildSettingAudit(
      RECEIPT_SCAN_SETTING_KEY,
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
      [RECEIPT_SCAN_SETTING_KEY, JSON.stringify(config)],
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
