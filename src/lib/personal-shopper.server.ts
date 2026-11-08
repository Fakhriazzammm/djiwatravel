import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { buildSettingAudit } from "./admin-settings";
import { getAuthenticatedUser } from "./customer-session.fn";
import { readCustomerProfile } from "./customer-profile.server";
import { createCustomerNotification } from "./push.server";
import {
  buildMayarInvoicePayload,
  configuredAppOrigin,
  fetchMayarTransaction,
  findExistingMayarInvoice,
  mayarConfig,
} from "./mayar-gateway";
import {
  buildTravelFinanceGatewayPayload,
  postTravelFinanceSettlement,
} from "./mayar-settlement.server";
import {
  ADMIN_NEXT,
  ORDER_STATUS_LABEL,
  SHOPPER_BRANDS,
  SHOPPER_SEEDS,
  SHOPPER_SETTING_KEY,
  STORE_HOSTS,
  DEFAULT_SHOPPER_CONFIG,
  brandEnabled,
  canAdminCancel,
  countryByCode,
  countryEnabled,
  mapStoreItem,
  normalizeShopperConfig,
  orderIsPaid,
  parseShopperConfig,
  quoteShopperOrder,
  toIdr,
  validateShopperAddress,
  type CatalogRow,
  type ShopperConfig,
  type ShopperCountryCode,
  type ShopperOrderStatus,
  type ShopperProduct,
} from "./personal-shopper";

/* ------------------------------------------------------------------ config */

const CACHE_MS = 60_000;
let cachedConfig: { at: number; config: ShopperConfig } | null = null;

async function readConfigRecord() {
  try {
    const result = await pool.query(
      "select value_json, version from public.admin_settings where setting_key = $1",
      [SHOPPER_SETTING_KEY],
    );
    const row = result.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    if (!row) return { config: DEFAULT_SHOPPER_CONFIG, version: 0 };
    return { config: normalizeShopperConfig(row.value_json), version: Number(row.version) || 0 };
  } catch {
    return { config: DEFAULT_SHOPPER_CONFIG, version: 0 };
  }
}

export async function getShopperConfig(): Promise<ShopperConfig> {
  if (cachedConfig && Date.now() - cachedConfig.at < CACHE_MS) return cachedConfig.config;
  const { config } = await readConfigRecord();
  cachedConfig = { at: Date.now(), config };
  return config;
}

const paymentConfigured = () => Boolean(process.env["MAYAR_API_KEY"]);
const aiConfigured = () => Boolean(process.env["HELIPOD_AI_KEY"]);

/** Customer-safe status: what the screens and the Home tile read. */
export async function getShopperStatusHandler() {
  const config = await getShopperConfig();
  return { config, available: config.enabled && paymentConfigured() };
}

/* ------------------------------------------------------------------ catalog */

const UA = "Mozilla/5.0 (compatible; DjiwaTravelCatalog/1.0; +https://djiwatravel.com)";
const PAGE_SIZE = 24;

async function fetchSeed(brand: "uniqlo" | "gu", query: string): Promise<unknown[]> {
  const url = `${STORE_HOSTS[brand]}/api/commerce/v5/ja/products?q=${encodeURIComponent(query)}&limit=${PAGE_SIZE}&offset=0&imageRatio=3x4&httpFailure=true`;
  const response = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`store_${response.status}`);
  const body = (await response.json()) as { status?: string; result?: { items?: unknown } };
  if (body.status !== "ok" || !Array.isArray(body.result?.items)) throw new Error("store_format");
  return body.result.items as unknown[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let refreshing: Promise<unknown> | null = null;

async function upsertRows(rows: CatalogRow[]) {
  for (const r of rows) {
    await pool.query(
      `insert into shopping_catalog_items
         (country, brand, product_code, name, category, price_minor, original_minor, currency,
          image_url, product_url, rating, rating_count, trend_score, is_new, sizes, colors, fetched_at)
       values ('JP', $1, $2, $3, $4, $5, $6, 'JPY', $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, now())
       on conflict (brand, product_code) do update set
         name = excluded.name,
         name_id = case when shopping_catalog_items.name = excluded.name then shopping_catalog_items.name_id else null end,
         category = excluded.category, price_minor = excluded.price_minor,
         original_minor = excluded.original_minor, image_url = excluded.image_url,
         product_url = excluded.product_url, rating = excluded.rating,
         rating_count = excluded.rating_count, trend_score = excluded.trend_score,
         is_new = excluded.is_new, sizes = excluded.sizes, colors = excluded.colors, fetched_at = now()`,
      [
        r.brand,
        r.productCode,
        r.name,
        r.category,
        r.priceMinor,
        r.originalMinor,
        r.imageUrl,
        r.productUrl,
        r.rating,
        r.ratingCount,
        r.trendScore,
        r.isNew,
        JSON.stringify(r.sizes),
        JSON.stringify(r.colors),
      ],
    );
  }
}

/** One brand: run the seed searches, keep the best position of each product, save, log the run. */
async function refreshBrand(brand: "uniqlo" | "gu", trigger: string) {
  const run = await pool.query(
    "insert into shopping_catalog_runs (brand, trigger) values ($1, $2) returning id",
    [brand, trigger],
  );
  const runId = (run.rows[0] as { id: string }).id;
  const best = new Map<string, CatalogRow>();
  let seen = 0;
  let firstError: string | null = null;
  for (const seed of SHOPPER_SEEDS[brand]) {
    try {
      const items = await fetchSeed(brand, seed.query);
      items.forEach((raw, position) => {
        seen += 1;
        const row = mapStoreItem(raw, brand, seed.category, position, items.length);
        if (!row) return;
        const current = best.get(row.productCode);
        if (!current || row.trendScore > current.trendScore) best.set(row.productCode, row);
      });
    } catch (error) {
      firstError ??= error instanceof Error ? error.message.slice(0, 120) : "store_error";
    }
    await sleep(600);
  }
  const rows = [...best.values()];
  // Never wipe or flag a catalog because the store changed its format: we only add or update.
  if (rows.length > 0) await upsertRows(rows);
  await pool.query(
    "update shopping_catalog_runs set finished_at = now(), items_seen = $2, items_saved = $3, error = $4 where id = $1",
    [runId, seen, rows.length, rows.length === 0 ? (firstError ?? "no_items") : firstError],
  );
  return { brand, seen, saved: rows.length, error: firstError };
}

const NAME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "id"],
        properties: { code: { type: "string" }, id: { type: "string" } },
      },
    },
  },
};

/** Store names are Japanese. Short English names make the catalog readable; optional. */
async function translateBatch(key: string, rows: { id: string; name: string }[]): Promise<number> {
  const base = (process.env["HELIPOD_AI_BASE_URL"] || "https://ai.helipod.io/v1").replace(
    /\/$/,
    "",
  );
  const list = rows.map((r) => ({ code: r.id, name: r.name }));
  const call = (withSchema: boolean, withEffort: boolean) =>
    fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "glm-5.3-flash",
        temperature: 0,
        max_tokens: 3000,
        // The model "thinks" first; on a long list that used every token and cut the JSON off.
        ...(withEffort ? { reasoning_effort: "low" } : {}),
        messages: [
          {
            role: "system",
            content:
              'Translate Japanese clothing product names to short natural English names (keep brand terms like HEATTECH, AIRism, UT as is). Answer only JSON {"items":[{"code":"<same code>","id":"<English name>"}]}.',
          },
          { role: "user", content: JSON.stringify(list) },
        ],
        ...(withSchema
          ? {
              response_format: {
                type: "json_schema",
                json_schema: { name: "names", strict: true, schema: NAME_SCHEMA },
              },
            }
          : {}),
      }),
      signal: AbortSignal.timeout(60_000),
    });
  let response = await call(true, true);
  if (response.status === 400) response = await call(true, false);
  if (response.status === 400) response = await call(false, false);
  if (!response.ok) return 0;
  const json = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = String(json.choices?.[0]?.message?.content ?? "")
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  let parsed: { items?: { code?: unknown; id?: unknown }[] } | null = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    return 0;
  }
  const known = new Set(list.map((l) => l.code));
  let saved = 0;
  for (const item of parsed?.items ?? []) {
    const code = String(item.code ?? "");
    const name = String(item.id ?? "")
      .trim()
      .slice(0, 200);
    if (!known.has(code) || name.length < 2) continue;
    await pool.query(
      "update shopping_catalog_items set name_id = $2 where id = $1 and name_id is null",
      [code, name],
    );
    saved += 1;
  }
  return saved;
}

let translating = false;

/** Small batches, so a slow or cut-off answer loses a few names instead of the whole run. */
async function translateMissingNames(limit = 90, batch = 15) {
  const key = process.env["HELIPOD_AI_KEY"];
  if (!key || translating) return 0;
  translating = true;
  try {
    const missing = await pool.query(
      "select id, name from shopping_catalog_items where name_id is null and hidden = false order by trend_score desc limit $1",
      [limit],
    );
    const rows = missing.rows as { id: string; name: string }[];
    let saved = 0;
    for (let i = 0; i < rows.length; i += batch) {
      saved += await translateBatch(key, rows.slice(i, i + batch)).catch(() => 0);
    }
    if (saved > 0) catalogCache.clear();
    return saved;
  } finally {
    translating = false;
  }
}

export async function refreshShopperCatalog(trigger: "schedule" | "admin" | "lazy") {
  if (refreshing) return refreshing as Promise<Awaited<ReturnType<typeof runRefresh>>>;
  refreshing = runRefresh(trigger).finally(() => {
    refreshing = null;
  });
  return refreshing as Promise<Awaited<ReturnType<typeof runRefresh>>>;
}

async function runRefresh(trigger: string) {
  const config = await getShopperConfig();
  const results = [];
  for (const brand of SHOPPER_BRANDS) {
    if (!brand.adapter || !config.brands[brand.id]) continue;
    results.push(await refreshBrand(brand.id as "uniqlo" | "gu", trigger));
  }
  const translated = await translateMissingNames().catch(() => 0);
  catalogCache.clear();
  return { results, translated };
}

/** Scheduled task entry: refreshes when the newest run is older than the configured age. */
export async function sweepShopperCatalog() {
  const config = await getShopperConfig();
  if (!config.enabled) return { skipped: "disabled" as const };
  const last = await pool.query(
    "select max(started_at) as at from shopping_catalog_runs where error is null or items_saved > 0",
  );
  const at = (last.rows[0] as { at: Date | null } | undefined)?.at;
  if (at && Date.now() - new Date(at).getTime() < config.catalogRefreshHours * 3_600_000) {
    // Fresh catalog: finish any names that are still untranslated, a few per minute.
    await translateMissingNames(45).catch(() => 0);
    return { skipped: "fresh" as const };
  }
  return refreshShopperCatalog("schedule");
}

const catalogCache = new Map<string, { at: number; value: unknown }>();

type CatalogRowDb = {
  id: string;
  brand: ShopperProduct["brand"];
  product_code: string;
  name: string;
  name_id: string | null;
  category: ShopperProduct["category"];
  price_minor: number;
  original_minor: number | null;
  image_url: string | null;
  product_url: string;
  rating: string | null;
  rating_count: number;
  trend_score: number;
  is_new: boolean;
  sizes: string[];
  colors: ShopperProduct["colors"];
  sold: number | string | null;
};

const toProduct = (r: CatalogRowDb): ShopperProduct => ({
  id: r.id,
  brand: r.brand,
  code: r.product_code,
  name: r.name,
  nameId: r.name_id,
  category: r.category,
  price: r.price_minor,
  originalPrice: r.original_minor,
  imageUrl: r.image_url,
  productUrl: r.product_url,
  rating: r.rating === null ? null : Number(r.rating),
  ratingCount: r.rating_count,
  trend: r.trend_score,
  sold: Number(r.sold ?? 0),
  isNew: r.is_new,
  sizes: Array.isArray(r.sizes) ? r.sizes : [],
  colors: Array.isArray(r.colors) ? r.colors : [],
});

const catalogInput = (data: unknown) =>
  z.object({ country: z.enum(["JP", "KR", "TH", "SG"]) }).parse(data);
export { catalogInput as shopperCatalogInput };

export async function getShopperCatalogHandler({
  data,
}: {
  data: ReturnType<typeof catalogInput>;
}) {
  const config = await getShopperConfig();
  const code = data.country as ShopperCountryCode;
  if (!countryEnabled(config, code)) return { open: false as const, products: [], updatedAt: null };
  const hit = catalogCache.get(code);
  if (hit && Date.now() - hit.at < CACHE_MS)
    return hit.value as { open: true; products: ShopperProduct[]; updatedAt: string | null };
  const brands = SHOPPER_BRANDS.filter((b) => b.country === code && brandEnabled(config, b.id)).map(
    (b) => b.id,
  );
  const rows = await pool.query(
    `select c.*, coalesce(s.qty, 0) as sold
       from shopping_catalog_items c
       left join (
         select i.brand, i.product_code, sum(i.quantity)::int as qty
           from shopping_order_items i join shopping_orders o on o.id = i.order_id
          where o.status in ('PAID','PURCHASED','SHIPPED','ARRIVED','DELIVERED')
            and o.created_at > now() - interval '90 days'
          group by i.brand, i.product_code
       ) s on s.brand = c.brand and s.product_code = c.product_code
      where c.country = $1 and c.hidden = false and c.brand = any($2)
        and c.fetched_at > now() - ($3 || ' hours')::interval`,
    [code, brands, String(config.catalogRefreshHours * 4)],
  );
  const products = (rows.rows as CatalogRowDb[]).map(toProduct);
  const updatedAt = await pool
    .query("select max(fetched_at) as at from shopping_catalog_items where country = $1", [code])
    .then((r) =>
      (r.rows[0] as { at: Date | null }).at
        ? new Date((r.rows[0] as { at: Date }).at).toISOString()
        : null,
    );
  if (products.length === 0) void refreshShopperCatalog("lazy").catch(() => undefined);
  const value = { open: true as const, products, updatedAt };
  catalogCache.set(code, { at: Date.now(), value });
  return value;
}

/* ------------------------------------------------------------------- orders */

const addressSchema = z.object({
  recipientName: z.string().trim().min(2).max(120),
  whatsapp: z.string().trim().min(8).max(20),
  addressLine: z.string().trim().min(8).max(400),
  city: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().min(3).max(10),
});

const createOrderSchema = z.object({
  country: z.enum(["JP", "KR", "TH", "SG"]),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        size: z.string().trim().min(1).max(20),
        color: z.string().trim().max(40).nullable().optional(),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(50),
  address: addressSchema,
  note: z.string().trim().max(400).nullable().optional(),
});
export const createShoppingOrderInput = (data: unknown) => createOrderSchema.parse(data);

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newOrderCode = () =>
  "TB-" + Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

type OrderRow = {
  id: string;
  public_code: string;
  customer_auth_subject: string;
  country: string;
  currency: string;
  rate_idr: string;
  subtotal_idr: number;
  fee_idr: number;
  shipping_idr: number;
  total_idr: number;
  status: ShopperOrderStatus;
  payment_state: string;
  invoice_id: string | null;
  transaction_id: string | null;
  payment_url: string | null;
  payment_expires_at: Date;
  paid_at: Date | null;
  finance_error: string | null;
  recipient_name: string;
  recipient_whatsapp: string;
  address_line: string;
  city: string;
  postal_code: string;
  customer_note: string | null;
  courier: string | null;
  tracking_number: string | null;
  admin_note: string | null;
  refund_needed: boolean;
  created_at: Date;
  updated_at: Date;
};

async function logEvent(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  orderId: string,
  status: string,
  actor: string,
  note?: string | null,
) {
  await client.query(
    "insert into shopping_order_events (order_id, status, actor, note) values ($1, $2, $3, $4)",
    [orderId, status, actor, note ?? null],
  );
}

async function notifyOrder(
  order: Pick<OrderRow, "id" | "public_code" | "customer_auth_subject">,
  status: string,
  body: string,
) {
  await createCustomerNotification({
    subject: order.customer_auth_subject,
    type: "shopping_order",
    title: `Titip Belanja ${order.public_code}`,
    body,
    href: `/titip-belanja/pesanan/${order.id}`,
    eventKey: `shopping:${order.id}:${status}`,
    source: "personal-shopper",
  }).catch(() => undefined);
}

/** Creates (or recovers) the Mayar invoice for an unpaid order. Never creates a second one. */
async function ensureInvoice(order: OrderRow, email: string, mobile: string) {
  if (order.payment_url && order.payment_state === "CONFIRMED") return order.payment_url;
  const { apiKey, baseUrl } = mayarConfig();
  const description = `Djiwa Titip Belanja ${order.public_code}`;
  const claim = await pool.query(
    `update shopping_orders set payment_state = 'REQUESTING', updated_at = now()
      where id = $1 and status = 'PAYMENT_PENDING' and payment_state in ('NONE','FAILED','UNKNOWN') returning id`,
    [order.id],
  );
  if (claim.rows.length === 0) {
    const fresh = await pool.query("select payment_url from shopping_orders where id = $1", [
      order.id,
    ]);
    const url = (fresh.rows[0] as { payment_url: string | null } | undefined)?.payment_url;
    if (url) return url;
    throw new Error("Tagihan sedang diproses, coba lagi sebentar");
  }
  // After an unknown outcome the provider may already hold the invoice: adopt it, never duplicate.
  if (order.payment_state === "UNKNOWN") {
    const existing = await findExistingMayarInvoice(baseUrl, apiKey, description);
    if (existing) {
      await pool.query(
        `update shopping_orders set payment_state = 'CONFIRMED', invoice_id = $2, transaction_id = $3, payment_url = $4, updated_at = now() where id = $1`,
        [order.id, existing.invoiceId, existing.transactionId, existing.paymentUrl],
      );
      return existing.paymentUrl;
    }
  }
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/invoices/create`, {
      method: "POST",
      headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
      body: JSON.stringify(
        buildMayarInvoicePayload({
          orderId: order.id,
          amountIdr: order.total_idr,
          customerName: order.recipient_name,
          customerEmail: email,
          customerMobile: mobile,
          description,
          redirectUrl: `${configuredAppOrigin()}/titip-belanja/pesanan/${order.id}`,
        }),
      ),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    await pool.query(
      "update shopping_orders set payment_state = 'UNKNOWN', updated_at = now() where id = $1",
      [order.id],
    );
    throw new Error(
      "Tagihan belum terkonfirmasi. Coba bayar lagi, kami tidak akan membuat tagihan ganda.",
    );
  }
  const body = (await response.json().catch(() => ({}))) as {
    data?: Record<string, unknown>;
    messages?: string;
    message?: string;
  };
  if (!response.ok) {
    await pool.query(
      "update shopping_orders set payment_state = 'FAILED', updated_at = now() where id = $1",
      [order.id],
    );
    throw new Error(body.messages || body.message || "Pembayaran belum bisa dibuat, coba lagi");
  }
  const invoiceId = String(body.data?.["id"] ?? "");
  const transactionId = String(body.data?.["transactionId"] ?? "");
  const paymentUrl = String(body.data?.["link"] ?? body.data?.["paymentUrl"] ?? "");
  if (!invoiceId || !transactionId || !paymentUrl) {
    await pool.query(
      "update shopping_orders set payment_state = 'UNKNOWN', updated_at = now() where id = $1",
      [order.id],
    );
    throw new Error("Respons tagihan tidak lengkap. Coba bayar lagi.");
  }
  await pool.query(
    `update shopping_orders set payment_state = 'CONFIRMED', invoice_id = $2, transaction_id = $3, payment_url = $4, updated_at = now() where id = $1`,
    [order.id, invoiceId, transactionId, paymentUrl],
  );
  return paymentUrl;
}

async function contactFor(subject: string, email: string, fallbackMobile: string) {
  const profile = await readCustomerProfile({ id: subject, email }).catch(() => null);
  return { email: profile?.email || email, mobile: profile?.whatsapp || fallbackMobile };
}

export async function createShoppingOrderHandler({
  data,
}: {
  data: ReturnType<typeof createShoppingOrderInput>;
}) {
  const user = await getAuthenticatedUser();
  const config = await getShopperConfig();
  const country = data.country as ShopperCountryCode;
  if (!countryEnabled(config, country) || !paymentConfigured())
    throw new Error("Titip Belanja belum tersedia");
  const errors = validateShopperAddress(data.address);
  if (Object.keys(errors).length > 0) throw new Error(Object.values(errors)[0]);
  if (data.items.length > config.maxLinesPerOrder)
    throw new Error(`Maksimal ${config.maxLinesPerOrder} barang berbeda per pesanan`);

  const pending = await pool.query(
    "select count(*)::int as n from shopping_orders where customer_auth_subject = $1 and status = 'PAYMENT_PENDING' and payment_expires_at > now()",
    [user.id],
  );
  if (Number((pending.rows[0] as { n: number }).n) >= 3)
    throw new Error("Selesaikan atau tunggu pesanan yang belum dibayar dulu");

  const ids = [...new Set(data.items.map((i) => i.productId))];
  const found = await pool.query(
    "select * from shopping_catalog_items where id = any($1::uuid[]) and hidden = false and country = $2",
    [ids, country],
  );
  const byId = new Map(
    (found.rows as (CatalogRowDb & { country: string })[]).map((r) => [r.id, r]),
  );
  const currency = countryByCode(country)?.currency ?? "JPY";
  const rate = config.rates[currency];
  if (!rate) throw new Error("Kurs belum diatur");

  const lines = data.items.map((item) => {
    const row = byId.get(item.productId);
    if (!row) throw new Error("Ada produk yang sudah tidak tersedia");
    if (!brandEnabled(config, row.brand)) throw new Error("Brand belum tersedia");
    if (item.quantity > config.maxQtyPerItem)
      throw new Error(`Maksimal ${config.maxQtyPerItem} per barang`);
    const sizes = Array.isArray(row.sizes) ? row.sizes : [];
    if (sizes.length > 0 && !sizes.includes(item.size)) throw new Error("Ukuran tidak tersedia");
    const colors = Array.isArray(row.colors) ? row.colors : [];
    const color = item.color
      ? colors.find((c) => c.code === item.color || c.name === item.color)
      : undefined;
    if (item.color && !color) throw new Error("Warna tidak tersedia");
    return { row, item, colorName: color?.name ?? null, image: color?.image ?? row.image_url };
  });
  const quote = quoteShopperOrder(
    lines.map((l) => ({ unitMinor: l.row.price_minor, quantity: l.item.quantity })),
    rate,
    config,
  );
  if (quote.totalIdr <= 0) throw new Error("Pesanan kosong");

  const client = await pool.connect();
  let orderId = "";
  let code = "";
  try {
    await client.query("begin");
    for (let attempt = 0; attempt < 4 && !orderId; attempt += 1) {
      code = newOrderCode();
      const inserted = await client.query(
        `insert into shopping_orders
           (public_code, customer_auth_subject, country, currency, rate_idr, subtotal_idr, fee_idr, shipping_idr, total_idr,
            payment_expires_at, recipient_name, recipient_whatsapp, address_line, city, postal_code, customer_note)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() + ($10 || ' minutes')::interval, $11,$12,$13,$14,$15,$16)
         on conflict (public_code) do nothing returning id`,
        [
          code,
          user.id,
          country,
          currency,
          rate,
          quote.subtotalIdr,
          quote.feeIdr,
          quote.shippingIdr,
          quote.totalIdr,
          String(config.paymentWindowMinutes),
          data.address.recipientName,
          data.address.whatsapp.trim(),
          data.address.addressLine,
          data.address.city,
          data.address.postalCode,
          data.note || null,
        ],
      );
      orderId = (inserted.rows[0] as { id: string } | undefined)?.id ?? "";
    }
    if (!orderId) throw new Error("Gagal membuat kode pesanan, coba lagi");
    for (const l of lines) {
      await client.query(
        `insert into shopping_order_items
           (order_id, catalog_item_id, brand, product_code, name, size, color, quantity, unit_minor, unit_idr, image_url, product_url)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          orderId,
          l.row.id,
          l.row.brand,
          l.row.product_code,
          l.row.name_id || l.row.name,
          l.item.size,
          l.colorName,
          l.item.quantity,
          l.row.price_minor,
          toIdr(l.row.price_minor, rate),
          l.image,
          l.row.product_url,
        ],
      );
    }
    await logEvent(client, orderId, "PAYMENT_PENDING", "customer");
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const order = (await pool.query("select * from shopping_orders where id = $1", [orderId]))
    .rows[0] as OrderRow;
  const contact = await contactFor(user.id, user.email, data.address.whatsapp.trim());
  try {
    const paymentUrl = await ensureInvoice(order, contact.email, contact.mobile);
    return { orderId, code, paymentUrl, paymentError: null as string | null };
  } catch (error) {
    // The order exists and can be paid from its page; the customer is not asked to rebuild the cart.
    return {
      orderId,
      code,
      paymentUrl: null as string | null,
      paymentError: error instanceof Error ? error.message : "Pembayaran belum bisa dibuat",
    };
  }
}

const orderIdSchema = z.object({ orderId: z.string().uuid() });
export const shoppingOrderIdInput = (data: unknown) => orderIdSchema.parse(data);

async function ownedOrder(orderId: string, subject: string) {
  const result = await pool.query(
    "select * from shopping_orders where id = $1 and customer_auth_subject = $2",
    [orderId, subject],
  );
  const order = result.rows[0] as OrderRow | undefined;
  if (!order) throw new Error("Pesanan tidak ditemukan");
  return order;
}

export async function payShoppingOrderHandler({
  data,
}: {
  data: ReturnType<typeof shoppingOrderIdInput>;
}) {
  const user = await getAuthenticatedUser();
  const order = await ownedOrder(data.orderId, user.id);
  if (order.status !== "PAYMENT_PENDING") throw new Error("Pesanan ini tidak menunggu pembayaran");
  if (new Date(order.payment_expires_at).getTime() < Date.now()) {
    const settled = await settleShoppingOrder(order.id);
    if (settled.status !== "PAYMENT_PENDING") throw new Error("Waktu pembayaran sudah habis");
  }
  const contact = await contactFor(user.id, user.email, order.recipient_whatsapp);
  const paymentUrl = await ensureInvoice(order, contact.email, contact.mobile);
  return { paymentUrl };
}

async function postFinance(order: OrderRow, paidAtMs: number) {
  try {
    await postTravelFinanceSettlement(
      buildTravelFinanceGatewayPayload({
        orderId: order.id,
        orderNumber: order.public_code,
        amount: order.total_idr,
        paidAt: paidAtMs,
        ...(order.invoice_id ? { invoiceId: order.invoice_id } : {}),
        ...(order.transaction_id ? { transactionId: order.transaction_id } : {}),
        customerName: order.recipient_name,
      }),
    );
    await pool.query("update shopping_orders set finance_error = null where id = $1", [order.id]);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : "finance_failed";
    await pool.query("update shopping_orders set finance_error = $2 where id = $1", [
      order.id,
      message,
    ]);
  }
}

/**
 * Mayar is the proof of payment: the order is paid only when the transaction is `paid` for the exact
 * total. Unpaid orders past their window expire. Safe to call repeatedly (customer return, sweep).
 */
export async function settleShoppingOrder(orderId: string) {
  const row = (await pool.query("select * from shopping_orders where id = $1", [orderId]))
    .rows[0] as OrderRow | undefined;
  if (!row) throw new Error("Pesanan tidak ditemukan");
  if (row.status !== "PAYMENT_PENDING" && row.status !== "EXPIRED")
    return { status: row.status, settled: orderIsPaid(row.status) };

  let paid = false;
  let paidAtMs = Date.now();
  if (row.transaction_id) {
    const txn = await fetchMayarTransaction(row.transaction_id);
    if (String(txn.status ?? "").toLowerCase() === "paid") {
      if (Number(txn.amount) !== row.total_idr) {
        await pool.query(
          "update shopping_orders set admin_note = coalesce(admin_note || E'\\n', '') || $2 where id = $1",
          [row.id, "Nominal Mayar tidak sama dengan total pesanan, perlu dicek manual."],
        );
        return { status: row.status, settled: false, reason: "amount_mismatch" as const };
      }
      paid = true;
      const stamp = Date.parse(String(txn.updatedAt ?? txn.createdAt ?? ""));
      if (Number.isFinite(stamp)) paidAtMs = stamp;
    }
  }
  if (paid) {
    const client = await pool.connect();
    let changed = false;
    try {
      await client.query("begin");
      const updated = await client.query(
        `update shopping_orders set status = 'PAID', payment_state = 'CONFIRMED', paid_at = $2::timestamptz, updated_at = now()
          where id = $1 and status in ('PAYMENT_PENDING','EXPIRED') returning id`,
        [row.id, new Date(paidAtMs).toISOString()],
      );
      changed = updated.rows.length > 0;
      if (changed) await logEvent(client, row.id, "PAID", "mayar");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    if (changed) {
      await postFinance(row, paidAtMs);
      await notifyOrder(row, "PAID", "Pembayaran diterima. Kami akan membelikan barangmu di toko.");
    }
    return { status: "PAID" as ShopperOrderStatus, settled: true };
  }
  if (row.status === "PAYMENT_PENDING" && new Date(row.payment_expires_at).getTime() < Date.now()) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const updated = await client.query(
        "update shopping_orders set status = 'EXPIRED', updated_at = now() where id = $1 and status = 'PAYMENT_PENDING' returning id",
        [row.id],
      );
      if (updated.rows.length > 0) await logEvent(client, row.id, "EXPIRED", "system");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return { status: "EXPIRED" as ShopperOrderStatus, settled: false };
  }
  return { status: row.status, settled: false, reason: "payment_pending" as const };
}

export async function verifyShoppingPaymentHandler({
  data,
}: {
  data: ReturnType<typeof shoppingOrderIdInput>;
}) {
  const user = await getAuthenticatedUser();
  await ownedOrder(data.orderId, user.id);
  return settleShoppingOrder(data.orderId);
}

/** Scheduled safety net and the Tentram forward hint: settle or expire pending payments. */
export async function sweepShoppingPayments(
  options: { transactionId?: string; invoiceId?: string } = {},
) {
  const match = options.transactionId || options.invoiceId;
  const rows = await pool.query(
    `select id from shopping_orders
      where status = 'PAYMENT_PENDING' and created_at > now() - interval '3 days'
        and ($1::text is null or transaction_id = $1 or invoice_id = $2)
      order by created_at asc limit 25`,
    [
      match ? (options.transactionId ?? options.invoiceId ?? null) : null,
      options.invoiceId ?? options.transactionId ?? null,
    ],
  );
  const report = { checked: 0, settled: 0, expired: 0, failed: 0 };
  for (const { id } of rows.rows as { id: string }[]) {
    report.checked += 1;
    try {
      const result = await settleShoppingOrder(id);
      if (result.status === "PAID") report.settled += 1;
      if (result.status === "EXPIRED") report.expired += 1;
    } catch {
      report.failed += 1;
    }
  }
  return report;
}

/* ------------------------------------------------------------ order reading */

export type OrderItemView = {
  order_id: string;
  brand: string;
  product_code: string;
  name: string;
  size: string;
  color: string | null;
  quantity: number;
  unit_minor: number;
  unit_idr: number;
  image_url: string | null;
  product_url: string;
};
export type OrderEventView = { status: string; at: string; actor?: string; note?: string | null };

async function itemsFor(orderIds: string[]) {
  if (orderIds.length === 0) return new Map<string, OrderItemView[]>();
  const rows = await pool.query(
    `select order_id, brand, product_code, name, size, color, quantity, unit_minor, unit_idr, image_url, product_url
       from shopping_order_items where order_id = any($1::uuid[]) order by id`,
    [orderIds],
  );
  const map = new Map<string, OrderItemView[]>();
  for (const r of rows.rows as OrderItemView[]) {
    const list = map.get(r.order_id) ?? [];
    list.push(r);
    map.set(r.order_id, list);
  }
  return map;
}

const view = (o: OrderRow, items: OrderItemView[], events: OrderEventView[] = []) => ({
  id: o.id,
  code: o.public_code,
  status: o.status,
  statusLabel: ORDER_STATUS_LABEL[o.status],
  country: o.country,
  currency: o.currency,
  rate: Number(o.rate_idr),
  subtotalIdr: o.subtotal_idr,
  feeIdr: o.fee_idr,
  shippingIdr: o.shipping_idr,
  totalIdr: o.total_idr,
  paymentUrl:
    o.status === "PAYMENT_PENDING" && new Date(o.payment_expires_at).getTime() > Date.now()
      ? o.payment_url
      : null,
  paymentExpiresAt: new Date(o.payment_expires_at).toISOString(),
  paidAt: o.paid_at ? new Date(o.paid_at).toISOString() : null,
  recipientName: o.recipient_name,
  whatsapp: o.recipient_whatsapp,
  addressLine: o.address_line,
  city: o.city,
  postalCode: o.postal_code,
  note: o.customer_note,
  courier: o.courier,
  trackingNumber: o.tracking_number,
  createdAt: new Date(o.created_at).toISOString(),
  items,
  events,
});

export async function listMyShoppingOrdersHandler() {
  const user = await getAuthenticatedUser();
  const orders = (
    await pool.query(
      "select * from shopping_orders where customer_auth_subject = $1 order by created_at desc limit 50",
      [user.id],
    )
  ).rows as OrderRow[];
  const items = await itemsFor(orders.map((o) => o.id));
  return orders.map((o) => view(o, items.get(o.id) ?? []));
}

export async function getMyShoppingOrderHandler({
  data,
}: {
  data: ReturnType<typeof shoppingOrderIdInput>;
}) {
  const user = await getAuthenticatedUser();
  const order = await ownedOrder(data.orderId, user.id);
  const items = await itemsFor([order.id]);
  const events = (
    await pool.query(
      "select status, created_at from shopping_order_events where order_id = $1 order by created_at",
      [order.id],
    )
  ).rows.map((e: { status: string; created_at: Date }) => ({
    status: e.status,
    at: new Date(e.created_at).toISOString(),
  }));
  return view(order, items.get(order.id) ?? [], events);
}

/** Last used delivery address, to prefill the checkout. */
export async function getLastShoppingAddressHandler() {
  const user = await getAuthenticatedUser();
  const row = (
    await pool.query(
      "select recipient_name, recipient_whatsapp, address_line, city, postal_code from shopping_orders where customer_auth_subject = $1 order by created_at desc limit 1",
      [user.id],
    )
  ).rows[0] as Record<string, string> | undefined;
  const profile = await readCustomerProfile(user).catch(() => null);
  return {
    recipientName: row?.["recipient_name"] ?? profile?.displayName ?? "",
    whatsapp: row?.["recipient_whatsapp"] ?? profile?.whatsapp ?? "62",
    addressLine: row?.["address_line"] ?? "",
    city: row?.["city"] ?? "",
    postalCode: row?.["postal_code"] ?? "",
  };
}

/* -------------------------------------------------------------------- admin */

export async function getAdminShoppingHandler() {
  await requireAdmin();
  const { config, version } = await readConfigRecord();
  const counts = await pool.query(
    "select status, count(*)::int as n from shopping_orders group by status",
  );
  const orders = (
    await pool.query(
      "select * from shopping_orders order by (status = 'PAID') desc, created_at desc limit 100",
    )
  ).rows as OrderRow[];
  const items = await itemsFor(orders.map((o) => o.id));
  const events = await pool.query(
    "select order_id, status, actor, note, created_at from shopping_order_events where order_id = any($1::uuid[]) order by created_at",
    [orders.map((o) => o.id)],
  );
  const eventMap = new Map<string, OrderEventView[]>();
  for (const e of events.rows as {
    order_id: string;
    status: string;
    actor: string;
    note: string | null;
    created_at: Date;
  }[]) {
    const list = eventMap.get(e.order_id) ?? [];
    list.push({
      status: e.status,
      actor: e.actor,
      note: e.note,
      at: new Date(e.created_at).toISOString(),
    });
    eventMap.set(e.order_id, list);
  }
  const brands = await pool.query(
    `select brand, count(*)::int as items, count(*) filter (where hidden)::int as hidden, max(fetched_at) as last_fetch
       from shopping_catalog_items group by brand`,
  );
  const runs = await pool.query(
    "select brand, started_at, items_seen, items_saved, error, trigger from shopping_catalog_runs order by started_at desc limit 8",
  );
  return {
    config,
    version,
    paymentReady: paymentConfigured(),
    aiReady: aiConfigured(),
    counts: Object.fromEntries(
      (counts.rows as { status: string; n: number }[]).map((r) => [r.status, r.n]),
    ),
    orders: orders.map((o) => ({
      ...view(o, items.get(o.id) ?? [], eventMap.get(o.id) ?? []),
      financeError: o.finance_error,
      adminNote: o.admin_note,
      refundNeeded: o.refund_needed,
      customerSubject: o.customer_auth_subject,
    })),
    catalog: (
      brands.rows as { brand: string; items: number; hidden: number; last_fetch: Date | null }[]
    ).map((b) => ({
      brand: b.brand,
      items: b.items,
      hidden: b.hidden,
      lastFetch: b.last_fetch ? new Date(b.last_fetch).toISOString() : null,
    })),
    runs: (
      runs.rows as {
        brand: string;
        started_at: Date;
        items_seen: number;
        items_saved: number;
        error: string | null;
        trigger: string;
      }[]
    ).map((r) => ({
      brand: r.brand,
      at: new Date(r.started_at).toISOString(),
      seen: r.items_seen,
      saved: r.items_saved,
      error: r.error,
      trigger: r.trigger,
    })),
  };
}

const saveSchema = z.object({
  config: z.unknown(),
  expectedVersion: z.number().int().min(0),
  reason: z.string().trim().min(3).max(300),
});
export const saveShopperConfigInput = (data: unknown) => saveSchema.parse(data);

export async function saveShopperConfigHandler({
  data,
}: {
  data: ReturnType<typeof saveShopperConfigInput>;
}) {
  await requireAdmin();
  const config = parseShopperConfig(data.config);
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      "select value_json, version from public.admin_settings where setting_key = $1 for update",
      [SHOPPER_SETTING_KEY],
    );
    const row = current.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    const version = row ? Number(row.version) : 0;
    if (version !== data.expectedVersion) {
      await client.query("rollback");
      return { ok: false as const, conflict: true as const, version };
    }
    const audit = buildSettingAudit(
      SHOPPER_SETTING_KEY,
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
      [SHOPPER_SETTING_KEY, JSON.stringify(config)],
    );
    await client.query(
      `insert into public.admin_audit_logs (id, action, entity_type, entity_id, reason, before_json, after_json)
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
    cachedConfig = null;
    catalogCache.clear();
    return { ok: true as const, conflict: false as const, version: version + 1, config };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const actionSchema = z.object({
  orderId: z.string().uuid(),
  action: z.enum(["advance", "cancel", "note", "check_payment", "resend_finance"]),
  note: z.string().trim().max(800).optional(),
  courier: z.string().trim().max(60).optional(),
  trackingNumber: z.string().trim().max(80).optional(),
});
export const adminShoppingActionInput = (data: unknown) => actionSchema.parse(data);

export async function adminShoppingActionHandler({
  data,
}: {
  data: ReturnType<typeof adminShoppingActionInput>;
}) {
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const order = (await pool.query("select * from shopping_orders where id = $1", [data.orderId]))
    .rows[0] as OrderRow | undefined;
  if (!order) throw new Error("Pesanan tidak ditemukan");

  if (data.action === "check_payment")
    return { ok: true, result: await settleShoppingOrder(order.id) };
  if (data.action === "resend_finance") {
    if (!orderIsPaid(order.status) || !order.paid_at) throw new Error("Pesanan belum dibayar");
    await postFinance(order, new Date(order.paid_at).getTime());
    return { ok: true };
  }
  if (data.action === "note") {
    await pool.query(
      "update shopping_orders set admin_note = $2, updated_at = now() where id = $1",
      [order.id, data.note || null],
    );
    return { ok: true };
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    if (data.action === "advance") {
      const next = ADMIN_NEXT[order.status];
      if (!next) throw new Error("Status ini tidak bisa dimajukan");
      if (next === "SHIPPED" && !data.trackingNumber) throw new Error("Nomor resi wajib diisi");
      const updated = await client.query(
        `update shopping_orders set status = $2, courier = coalesce($3, courier), tracking_number = coalesce($4, tracking_number), updated_at = now()
          where id = $1 and status = $5 returning id`,
        [order.id, next, data.courier || null, data.trackingNumber || null, order.status],
      );
      if (updated.rows.length === 0) throw new Error("Status pesanan sudah berubah, muat ulang");
      await logEvent(client, order.id, next, actor, data.note);
      await client.query("commit");
      const text: Record<string, string> = {
        PURCHASED: "Barangmu sudah dibeli di toko.",
        SHIPPED: `Barangmu dikirim dari Jepang${data.trackingNumber ? `, resi ${data.trackingNumber}` : ""}.`,
        ARRIVED: "Barangmu tiba di Indonesia dan segera diantar.",
        DELIVERED: "Pesanan selesai diantar. Terima kasih sudah titip belanja.",
      };
      await notifyOrder(order, next, text[next] ?? ORDER_STATUS_LABEL[next]);
      return { ok: true, status: next };
    }
    // cancel
    if (!canAdminCancel(order.status)) throw new Error("Pesanan ini tidak bisa dibatalkan lagi");
    if (!data.note || data.note.length < 3) throw new Error("Alasan pembatalan wajib diisi");
    const needsRefund = order.status !== "PAYMENT_PENDING";
    const updated = await client.query(
      "update shopping_orders set status = 'CANCELLED', refund_needed = $2, updated_at = now() where id = $1 and status = $3 returning id",
      [order.id, needsRefund, order.status],
    );
    if (updated.rows.length === 0) throw new Error("Status pesanan sudah berubah, muat ulang");
    await logEvent(client, order.id, "CANCELLED", actor, data.note);
    await client.query("commit");
    await notifyOrder(
      order,
      "CANCELLED",
      needsRefund
        ? `Pesanan dibatalkan: ${data.note}. Refund akan diproses tim kami.`
        : `Pesanan dibatalkan: ${data.note}.`,
    );
    return { ok: true, status: "CANCELLED" as const };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function refreshShopperCatalogAdminHandler() {
  await requireAdmin();
  return refreshShopperCatalog("admin");
}

const hideSchema = z.object({
  query: z.string().trim().max(80).optional(),
  id: z.string().uuid().optional(),
  hidden: z.boolean().optional(),
});
export const adminShopperCatalogInput = (data: unknown) => hideSchema.parse(data);

export async function adminShopperCatalogHandler({
  data,
}: {
  data: ReturnType<typeof adminShopperCatalogInput>;
}) {
  await requireAdmin();
  if (data.id !== undefined && data.hidden !== undefined) {
    await pool.query("update shopping_catalog_items set hidden = $2 where id = $1", [
      data.id,
      data.hidden,
    ]);
    catalogCache.clear();
  }
  const q = `%${(data.query ?? "").replace(/[%_]/g, "")}%`;
  const rows = await pool.query(
    `select id, brand, product_code, name, name_id, price_minor, hidden from shopping_catalog_items
      where ($1 = '%%' or name ilike $1 or name_id ilike $1 or product_code ilike $1)
      order by hidden desc, trend_score desc limit 20`,
    [q],
  );
  return (
    rows.rows as {
      id: string;
      brand: string;
      product_code: string;
      name: string;
      name_id: string | null;
      price_minor: number;
      hidden: boolean;
    }[]
  ).map((r) => ({
    id: r.id,
    brand: r.brand,
    code: r.product_code,
    name: r.name_id || r.name,
    price: r.price_minor,
    hidden: r.hidden,
  }));
}
