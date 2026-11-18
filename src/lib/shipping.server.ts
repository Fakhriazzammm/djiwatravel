import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { buildSettingAudit } from "./admin-settings";
import { getAuthenticatedUser } from "./customer-session.fn";
import { readCustomerProfile } from "./customer-profile.server";
import { feedPhotoMime } from "./feeds";
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
import { createCustomerNotification } from "./push.server";
import {
  AUTO_COMPLETE_DAYS,
  DEFAULT_SHIPPING_CONFIG,
  JAPAN_PREFECTURES,
  NOTIFY_TEXT,
  REMINDER_AFTER_DAYS,
  SHIPPING_ADMIN_NEXT,
  SHIPPING_SETTING_KEY,
  SHIPPING_STATUS_LABEL,
  adminCanBill,
  adminCanCancel,
  adminCanReject,
  customerCanCancel,
  dropDeadline,
  estimateShippingIdr,
  formatIdr,
  formatKg,
  normalizeJapanPhone,
  normalizeJapanPostal,
  normalizeShippingConfig,
  parseShippingConfig,
  quoteShipping,
  shippingCodeFrom,
  shippingCountryEnabled,
  shippingIsPaid,
  validateShippingGoods,
  validateShippingInbound,
  validateShippingRecipient,
  type ShippingConfig,
  type ShippingStatus,
} from "./shipping";

/* ------------------------------------------------------------------ config */

const CACHE_MS = 60_000;
let cachedConfig: { at: number; config: ShippingConfig } | null = null;

async function readConfigRecord() {
  try {
    const result = await pool.query(
      "select value_json, version from public.admin_settings where setting_key = $1",
      [SHIPPING_SETTING_KEY],
    );
    const row = result.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    if (!row) return { config: DEFAULT_SHIPPING_CONFIG, version: 0 };
    return { config: normalizeShippingConfig(row.value_json), version: Number(row.version) || 0 };
  } catch {
    return { config: DEFAULT_SHIPPING_CONFIG, version: 0 };
  }
}

export async function getShippingConfig(): Promise<ShippingConfig> {
  if (cachedConfig && Date.now() - cachedConfig.at < CACHE_MS) return cachedConfig.config;
  const { config } = await readConfigRecord();
  cachedConfig = { at: Date.now(), config };
  return config;
}

const paymentConfigured = () => Boolean(process.env["MAYAR_API_KEY"]);

/** Customer-safe status: what the screens and the Home tile read. */
export async function getShippingStatusHandler() {
  const config = await getShippingConfig();
  return {
    config,
    available: shippingCountryEnabled(config, "JP") && paymentConfigured(),
  };
}

/* --------------------------------------------------------------- order rows */

type OrderRow = {
  id: string;
  public_code: string;
  customer_auth_subject: string;
  country: string;
  rate_idr_per_kg: number;
  partner_idr_per_kg: number;
  min_kg: string;
  round_kg: string;
  recipient_name: string;
  recipient_phone: string;
  postal_code: string;
  prefecture: string;
  city: string;
  address_line: string;
  category: string;
  contents: string;
  declared_value_idr: number;
  estimated_kg: string;
  inbound_mode: "SELF" | "COURIER";
  inbound_courier: string | null;
  inbound_tracking: string | null;
  drop_deadline_at: Date;
  status: ShippingStatus;
  weighed_kg: string | null;
  billed_kg: string | null;
  freight_idr: number | null;
  packing_idr: number;
  total_idr: number | null;
  partner_cost_idr: number | null;
  weigh_note: string | null;
  weighed_at: Date | null;
  payment_state: string;
  invoice_id: string | null;
  transaction_id: string | null;
  payment_url: string | null;
  payment_expires_at: Date | null;
  paid_at: Date | null;
  finance_error: string | null;
  courier: string | null;
  tracking_number: string | null;
  shipped_at: Date | null;
  arrived_at: Date | null;
  completed_at: Date | null;
  status_reason: string | null;
  admin_note: string | null;
  refund_needed: boolean;
  created_at: Date;
  updated_at: Date;
};

type Db = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

async function logEvent(
  client: Db,
  orderId: string,
  status: string,
  actor: string,
  note?: string | null,
) {
  await client.query(
    "insert into shipping_order_events (order_id, status, actor, note) values ($1, $2, $3, $4)",
    [orderId, status, actor, note ?? null],
  );
}

async function notifyOrder(
  order: Pick<OrderRow, "id" | "public_code" | "customer_auth_subject">,
  key: string,
  body: string,
) {
  await createCustomerNotification({
    subject: order.customer_auth_subject,
    type: "shipping_order",
    title: `Kirim Barang ${order.public_code}`,
    body,
    href: `/kirim-barang/${order.id}`,
    eventKey: `shipping:${order.id}:${key}`,
    source: "shipping",
  }).catch(() => undefined);
}

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

/* --------------------------------------------------------------- booking */

const recipientSchema = z.object({
  recipientName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(24),
  postalCode: z.string().trim().min(7).max(8),
  prefecture: z.string().trim().max(40),
  city: z.string().trim().min(2).max(100),
  addressLine: z.string().trim().min(5).max(300),
});

const bookingSchema = z.object({
  country: z.literal("JP"),
  recipient: recipientSchema,
  goods: z.object({
    category: z.string().trim().max(40),
    contents: z.string().trim().min(3).max(300),
    declaredValueIdr: z.number().int().min(0).max(100_000_000),
    estimatedKg: z.number().min(0.1).max(100),
  }),
  acceptedRules: z.literal(true),
  inbound: z.object({
    mode: z.enum(["SELF", "COURIER"]),
    courier: z.string().trim().max(60).optional(),
    tracking: z.string().trim().max(80).optional(),
  }),
});
export const createShippingOrderInput = (data: unknown) => bookingSchema.parse(data);

export async function createShippingOrderHandler({
  data,
}: {
  data: ReturnType<typeof createShippingOrderInput>;
}) {
  const user = await getAuthenticatedUser();
  const config = await getShippingConfig();
  if (!shippingCountryEnabled(config, "JP") || !paymentConfigured())
    throw new Error("Kirim Barang belum tersedia");

  const recipientErrors = validateShippingRecipient(data.recipient);
  if (Object.keys(recipientErrors).length > 0) throw new Error(Object.values(recipientErrors)[0]);
  const goodsErrors = validateShippingGoods(
    { ...data.goods, acceptedRules: data.acceptedRules },
    config,
  );
  if (Object.keys(goodsErrors).length > 0) throw new Error(Object.values(goodsErrors)[0]);
  const inboundErrors = validateShippingInbound({
    mode: data.inbound.mode,
    courier: data.inbound.courier ?? "",
    tracking: data.inbound.tracking ?? "",
  });
  if (Object.keys(inboundErrors).length > 0) throw new Error(Object.values(inboundErrors)[0]);

  const phone = normalizeJapanPhone(data.recipient.phone)!;
  const postal = normalizeJapanPostal(data.recipient.postalCode)!;
  const tariff = config.countries.JP;

  const open = await pool.query(
    "select count(*)::int as n from shipping_orders where customer_auth_subject = $1 and status = 'AWAITING_DROP'",
    [user.id],
  );
  if (Number((open.rows[0] as { n: number }).n) >= config.maxOpenBookings)
    throw new Error("Antar dulu paket yang sudah kamu booking, atau batalkan yang tidak jadi");

  const client = await pool.connect();
  try {
    await client.query("begin");
    const seq = await client.query("select nextval('shipping_code_seq') as n");
    const code = shippingCodeFrom(Number((seq.rows[0] as { n: string }).n));
    const deadline = dropDeadline(new Date(), config.dropDeadlineDays);
    const inserted = await client.query(
      `insert into shipping_orders (
         public_code, customer_auth_subject, country, rate_idr_per_kg, partner_idr_per_kg, min_kg, round_kg,
         recipient_name, recipient_phone, postal_code, prefecture, city, address_line,
         category, contents, declared_value_idr, estimated_kg,
         inbound_mode, inbound_courier, inbound_tracking, drop_deadline_at)
       values ($1,$2,'JP',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       returning id`,
      [
        code,
        user.id,
        tariff.rateIdrPerKg,
        tariff.partnerCostIdrPerKg,
        config.minKg,
        config.roundKg,
        data.recipient.recipientName,
        phone,
        postal,
        data.recipient.prefecture,
        data.recipient.city,
        data.recipient.addressLine,
        data.goods.category,
        data.goods.contents,
        data.goods.declaredValueIdr,
        data.goods.estimatedKg,
        data.inbound.mode,
        data.inbound.mode === "COURIER" ? (data.inbound.courier ?? null) : null,
        data.inbound.mode === "COURIER" ? (data.inbound.tracking ?? null) : null,
        deadline.toISOString(),
      ],
    );
    const id = (inserted.rows[0] as { id: string }).id;
    await logEvent(client, id, "AWAITING_DROP", "customer");
    await client.query("commit");
    await notifyOrder(
      { id, public_code: code, customer_auth_subject: user.id },
      "AWAITING_DROP",
      `Booking dibuat. Tulis kode ${code} di paket dan antar ke drop point sebelum ${deadline.toLocaleDateString("id-ID", { day: "numeric", month: "long", timeZone: "Asia/Jakarta" })}.`,
    );
    return { id, code };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/* --------------------------------------------------------------- payment */

const orderIdSchema = z.object({ orderId: z.string().uuid() });
export const shippingOrderIdInput = (data: unknown) => orderIdSchema.parse(data);

async function ownedOrder(orderId: string, subject: string) {
  const result = await pool.query(
    "select * from shipping_orders where id = $1 and customer_auth_subject = $2",
    [orderId, subject],
  );
  const order = result.rows[0] as OrderRow | undefined;
  if (!order) throw new Error("Pengiriman tidak ditemukan");
  return order;
}

/** Creates (or recovers) the Mayar invoice for a billed parcel. Never creates a second one. */
async function ensureInvoice(order: OrderRow, email: string, mobile: string) {
  if (order.payment_url && order.payment_state === "CONFIRMED") return order.payment_url;
  if (!order.total_idr) throw new Error("Tagihan belum dibuat");
  const { apiKey, baseUrl } = mayarConfig();
  const description = `Djiwa Kirim Barang ${order.public_code}`;
  const claim = await pool.query(
    `update shipping_orders set payment_state = 'REQUESTING', updated_at = now()
      where id = $1 and status = 'PAYMENT_PENDING' and payment_state in ('NONE','FAILED','UNKNOWN') returning id`,
    [order.id],
  );
  if (claim.rows.length === 0) {
    const fresh = await pool.query("select payment_url from shipping_orders where id = $1", [
      order.id,
    ]);
    const url = (fresh.rows[0] as { payment_url: string | null } | undefined)?.payment_url;
    if (url) return url;
    throw new Error("Tagihan sedang diproses, coba lagi sebentar");
  }
  const store = (invoiceId: string, transactionId: string, paymentUrl: string) =>
    pool.query(
      `update shipping_orders set payment_state = 'CONFIRMED', invoice_id = $2, transaction_id = $3, payment_url = $4, updated_at = now() where id = $1`,
      [order.id, invoiceId, transactionId, paymentUrl],
    );
  const mark = (state: "FAILED" | "UNKNOWN") =>
    pool.query("update shipping_orders set payment_state = $2, updated_at = now() where id = $1", [
      order.id,
      state,
    ]);
  // After an unknown outcome the provider may already hold the invoice: adopt it, never duplicate.
  if (order.payment_state === "UNKNOWN") {
    const existing = await findExistingMayarInvoice(baseUrl, apiKey, description);
    if (existing) {
      await store(existing.invoiceId, existing.transactionId, existing.paymentUrl);
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
          redirectUrl: `${configuredAppOrigin()}/kirim-barang/${order.id}`,
        }),
      ),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    await mark("UNKNOWN");
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
    await mark("FAILED");
    throw new Error(body.messages || body.message || "Pembayaran belum bisa dibuat, coba lagi");
  }
  const invoiceId = String(body.data?.["id"] ?? "");
  const transactionId = String(body.data?.["transactionId"] ?? "");
  const paymentUrl = String(body.data?.["link"] ?? body.data?.["paymentUrl"] ?? "");
  if (!invoiceId || !transactionId || !paymentUrl) {
    await mark("UNKNOWN");
    throw new Error("Respons tagihan tidak lengkap. Coba bayar lagi.");
  }
  await store(invoiceId, transactionId, paymentUrl);
  return paymentUrl;
}

async function contactFor(subject: string, email: string) {
  const profile = await readCustomerProfile({ id: subject, email }).catch(() => null);
  return { email: profile?.email || email, mobile: profile?.whatsapp || "6200000000000" };
}

export async function payShippingOrderHandler({
  data,
}: {
  data: ReturnType<typeof shippingOrderIdInput>;
}) {
  const user = await getAuthenticatedUser();
  const order = await ownedOrder(data.orderId, user.id);
  if (order.status !== "PAYMENT_PENDING")
    throw new Error("Pengiriman ini tidak menunggu pembayaran");
  if (order.payment_expires_at && new Date(order.payment_expires_at).getTime() < Date.now()) {
    const settled = await settleShippingOrder(order.id);
    if (settled.status !== "PAYMENT_PENDING") throw new Error("Waktu pembayaran sudah habis");
  }
  const contact = await contactFor(user.id, user.email);
  const paymentUrl = await ensureInvoice(order, contact.email, contact.mobile);
  return { paymentUrl };
}

async function postFinance(order: OrderRow, paidAtMs: number) {
  try {
    await postTravelFinanceSettlement(
      buildTravelFinanceGatewayPayload({
        orderId: order.id,
        orderNumber: order.public_code,
        amount: order.total_idr ?? 0,
        paidAt: paidAtMs,
        ...(order.invoice_id ? { invoiceId: order.invoice_id } : {}),
        ...(order.transaction_id ? { transactionId: order.transaction_id } : {}),
        customerName: order.recipient_name,
      }),
    );
    await pool.query("update shipping_orders set finance_error = null where id = $1", [order.id]);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : "finance_failed";
    await pool.query("update shipping_orders set finance_error = $2 where id = $1", [
      order.id,
      message,
    ]);
  }
}

/**
 * Mayar is the proof of payment: the parcel is paid only when the transaction is `paid` for the exact
 * total. An unpaid bill past its window expires. Safe to call repeatedly (customer return, sweep).
 */
export async function settleShippingOrder(orderId: string) {
  const row = (await pool.query("select * from shipping_orders where id = $1", [orderId]))
    .rows[0] as OrderRow | undefined;
  if (!row) throw new Error("Pengiriman tidak ditemukan");
  if (row.status !== "PAYMENT_PENDING" && row.status !== "EXPIRED")
    return { status: row.status, settled: shippingIsPaid(row.status) };

  let paid = false;
  let paidAtMs = Date.now();
  if (row.transaction_id && row.total_idr) {
    const txn = await fetchMayarTransaction(row.transaction_id);
    if (String(txn.status ?? "").toLowerCase() === "paid") {
      if (Number(txn.amount) !== row.total_idr) {
        await pool.query(
          "update shipping_orders set admin_note = coalesce(admin_note || E'\\n', '') || $2 where id = $1",
          [row.id, "Nominal Mayar tidak sama dengan total tagihan, perlu dicek manual."],
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
        `update shipping_orders set status = 'PAID', payment_state = 'CONFIRMED', paid_at = $2::timestamptz, updated_at = now()
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
      await notifyOrder(row, "PAID", NOTIFY_TEXT["PAID"]!);
    }
    return { status: "PAID" as ShippingStatus, settled: true };
  }
  if (
    row.status === "PAYMENT_PENDING" &&
    row.payment_expires_at &&
    new Date(row.payment_expires_at).getTime() < Date.now()
  ) {
    const client = await pool.connect();
    let changed = false;
    try {
      await client.query("begin");
      const updated = await client.query(
        "update shipping_orders set status = 'EXPIRED', updated_at = now() where id = $1 and status = 'PAYMENT_PENDING' returning id",
        [row.id],
      );
      changed = updated.rows.length > 0;
      if (changed) await logEvent(client, row.id, "EXPIRED", "system", "Tagihan tidak dibayar");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    if (changed)
      await notifyOrder(
        row,
        "BILL_EXPIRED",
        "Waktu pembayaran habis. Hubungi kami bila paketmu masih ingin dikirim.",
      );
    return { status: "EXPIRED" as ShippingStatus, settled: false };
  }
  return { status: row.status, settled: false, reason: "payment_pending" as const };
}

export async function verifyShippingPaymentHandler({
  data,
}: {
  data: ReturnType<typeof shippingOrderIdInput>;
}) {
  const user = await getAuthenticatedUser();
  await ownedOrder(data.orderId, user.id);
  return settleShippingOrder(data.orderId);
}

/** Scheduled safety net and the Tentram forward hint: settle or expire pending payments. */
export async function sweepShippingPayments(
  options: { transactionId?: string; invoiceId?: string } = {},
) {
  const match = options.transactionId || options.invoiceId;
  const rows = await pool.query(
    `select id from shipping_orders
      where status = 'PAYMENT_PENDING' and updated_at > now() - interval '14 days'
        and ($1::text is null or transaction_id = $1 or invoice_id = $2)
      order by updated_at asc limit 25`,
    [
      match ? (options.transactionId ?? options.invoiceId ?? null) : null,
      options.invoiceId ?? options.transactionId ?? null,
    ],
  );
  const report = { checked: 0, settled: 0, expired: 0, failed: 0 };
  for (const { id } of rows.rows as { id: string }[]) {
    report.checked += 1;
    try {
      const result = await settleShippingOrder(id);
      if (result.status === "PAID") report.settled += 1;
      if (result.status === "EXPIRED") report.expired += 1;
    } catch {
      report.failed += 1;
    }
  }
  return report;
}

/**
 * Minute task: lapse bookings nobody brought in, remind before that, and complete parcels that arrived
 * in Japan long ago without the customer confirming. Idempotent: every step is a guarded update.
 */
export async function sweepShippingLifecycle() {
  const config = await getShippingConfig();
  const report = { expired: 0, reminded: 0, completed: 0 };

  const lapsed = await pool.query(
    `update shipping_orders set status = 'EXPIRED', status_reason = 'Tidak diantar sebelum batas waktu', updated_at = now()
      where status = 'AWAITING_DROP' and drop_deadline_at < now()
      returning id, public_code, customer_auth_subject`,
  );
  for (const o of lapsed.rows as Pick<OrderRow, "id" | "public_code" | "customer_auth_subject">[]) {
    report.expired += 1;
    await logEvent(pool, o.id, "EXPIRED", "system", "Tidak diantar sebelum batas waktu");
    await notifyOrder(
      o,
      "DROP_EXPIRED",
      "Booking dibatalkan otomatis karena paket belum diantar sampai batas waktu. Buat booking baru bila masih ingin mengirim.",
    );
  }

  const due = await pool.query(
    `update shipping_orders set reminded_at = now()
      where status = 'AWAITING_DROP' and reminded_at is null
        and created_at < now() - ($1 || ' days')::interval and drop_deadline_at > now()
      returning id, public_code, customer_auth_subject, drop_deadline_at`,
    [String(REMINDER_AFTER_DAYS)],
  );
  for (const o of due.rows as (Pick<OrderRow, "id" | "public_code" | "customer_auth_subject"> & {
    drop_deadline_at: Date;
  })[]) {
    report.reminded += 1;
    await notifyOrder(
      o,
      "REMINDER",
      `Paketmu belum diantar. Antar ke drop point ${config.dropPoint.name} sebelum ${new Date(o.drop_deadline_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", timeZone: "Asia/Jakarta" })}.`,
    );
  }

  const done = await pool.query(
    `update shipping_orders set status = 'DELIVERED', completed_at = now(), updated_at = now()
      where status = 'ARRIVED' and arrived_at < now() - ($1 || ' days')::interval
      returning id, public_code, customer_auth_subject`,
    [String(AUTO_COMPLETE_DAYS)],
  );
  for (const o of done.rows as Pick<OrderRow, "id" | "public_code" | "customer_auth_subject">[]) {
    report.completed += 1;
    await logEvent(pool, o.id, "DELIVERED", "system", "Selesai otomatis");
    await notifyOrder(o, "DELIVERED", NOTIFY_TEXT["DELIVERED"]!);
  }
  return report;
}

/** Everything the minute task does for Kirim Barang. */
export async function sweepShipping() {
  const payments = await sweepShippingPayments();
  const lifecycle = await sweepShippingLifecycle();
  return { payments, lifecycle };
}

/* -------------------------------------------------------------- reading */

export type ShippingEventView = {
  status: string;
  at: string;
  actor?: string;
  note?: string | null;
};

async function photosFor(orderIds: string[]) {
  const map = new Map<string, string[]>();
  if (orderIds.length === 0) return map;
  const rows = await pool.query(
    "select id, order_id from shipping_photos where order_id = any($1::uuid[]) order by created_at",
    [orderIds],
  );
  for (const r of rows.rows as { id: string; order_id: string }[]) {
    const list = map.get(r.order_id) ?? [];
    list.push(r.id);
    map.set(r.order_id, list);
  }
  return map;
}

const view = (o: OrderRow, photos: string[], events: ShippingEventView[] = []) => {
  const rule = { minKg: Number(o.min_kg), roundKg: Number(o.round_kg) };
  return {
    id: o.id,
    code: o.public_code,
    status: o.status,
    statusLabel: SHIPPING_STATUS_LABEL[o.status],
    country: o.country,
    rateIdrPerKg: o.rate_idr_per_kg,
    minKg: rule.minKg,
    roundKg: rule.roundKg,
    estimatedKg: Number(o.estimated_kg),
    estimateIdr: estimateShippingIdr(Number(o.estimated_kg), rule, o.rate_idr_per_kg),
    recipientName: o.recipient_name,
    phone: o.recipient_phone,
    postalCode: o.postal_code,
    prefecture: o.prefecture,
    city: o.city,
    addressLine: o.address_line,
    category: o.category,
    contents: o.contents,
    declaredValueIdr: o.declared_value_idr,
    inboundMode: o.inbound_mode,
    inboundCourier: o.inbound_courier,
    inboundTracking: o.inbound_tracking,
    dropDeadlineAt: iso(o.drop_deadline_at),
    weighedKg: o.weighed_kg === null ? null : Number(o.weighed_kg),
    billedKg: o.billed_kg === null ? null : Number(o.billed_kg),
    freightIdr: o.freight_idr,
    packingIdr: o.packing_idr,
    totalIdr: o.total_idr,
    weighNote: o.weigh_note,
    photoIds: photos,
    paymentUrl:
      o.status === "PAYMENT_PENDING" &&
      o.payment_expires_at &&
      new Date(o.payment_expires_at).getTime() > Date.now()
        ? o.payment_url
        : null,
    paymentExpiresAt: iso(o.payment_expires_at),
    paidAt: iso(o.paid_at),
    courier: o.courier,
    trackingNumber: o.tracking_number,
    statusReason: o.status_reason,
    createdAt: iso(o.created_at)!,
    events,
  };
};

export async function listMyShippingOrdersHandler() {
  const user = await getAuthenticatedUser();
  const orders = (
    await pool.query(
      "select * from shipping_orders where customer_auth_subject = $1 order by created_at desc limit 50",
      [user.id],
    )
  ).rows as OrderRow[];
  const photos = await photosFor(orders.map((o) => o.id));
  return orders.map((o) => view(o, photos.get(o.id) ?? []));
}

export async function getMyShippingOrderHandler({
  data,
}: {
  data: ReturnType<typeof shippingOrderIdInput>;
}) {
  const user = await getAuthenticatedUser();
  const order = await ownedOrder(data.orderId, user.id);
  const photos = await photosFor([order.id]);
  const events = (
    await pool.query(
      "select status, created_at from shipping_order_events where order_id = $1 order by created_at",
      [order.id],
    )
  ).rows.map((e: { status: string; created_at: Date }) => ({
    status: e.status,
    at: new Date(e.created_at).toISOString(),
  }));
  const config = await getShippingConfig();
  return {
    ...view(order, photos.get(order.id) ?? [], events),
    dropPoint: config.dropPoint,
  };
}

/** Last used recipient, to prefill the booking form. */
export async function getLastShippingRecipientHandler() {
  const user = await getAuthenticatedUser();
  const row = (
    await pool.query(
      `select recipient_name, recipient_phone, postal_code, prefecture, city, address_line
         from shipping_orders where customer_auth_subject = $1 order by created_at desc limit 1`,
      [user.id],
    )
  ).rows[0] as Record<string, string> | undefined;
  if (!row) return null;
  return {
    recipientName: row["recipient_name"] ?? "",
    phone: row["recipient_phone"] ?? "",
    postalCode: row["postal_code"] ?? "",
    prefecture: JAPAN_PREFECTURES.includes(row["prefecture"] ?? "") ? row["prefecture"]! : "",
    city: row["city"] ?? "",
    addressLine: row["address_line"] ?? "",
  };
}

/* ----------------------------------------------------- customer actions */

export async function cancelShippingBookingHandler({
  data,
}: {
  data: ReturnType<typeof shippingOrderIdInput>;
}) {
  const user = await getAuthenticatedUser();
  const order = await ownedOrder(data.orderId, user.id);
  if (!customerCanCancel(order.status))
    throw new Error("Booking ini tidak bisa dibatalkan lagi. Hubungi kami.");
  const updated = await pool.query(
    "update shipping_orders set status = 'CANCELLED', status_reason = 'Dibatalkan customer', updated_at = now() where id = $1 and status = 'AWAITING_DROP' returning id",
    [order.id],
  );
  if (updated.rows.length === 0) throw new Error("Status sudah berubah, muat ulang");
  await logEvent(pool, order.id, "CANCELLED", "customer");
  return { ok: true };
}

export async function confirmShippingDeliveredHandler({
  data,
}: {
  data: ReturnType<typeof shippingOrderIdInput>;
}) {
  const user = await getAuthenticatedUser();
  const order = await ownedOrder(data.orderId, user.id);
  if (order.status !== "ARRIVED") throw new Error("Paket belum tiba di Jepang");
  const updated = await pool.query(
    "update shipping_orders set status = 'DELIVERED', completed_at = now(), updated_at = now() where id = $1 and status = 'ARRIVED' returning id",
    [order.id],
  );
  if (updated.rows.length === 0) throw new Error("Status sudah berubah, muat ulang");
  await logEvent(pool, order.id, "DELIVERED", "customer", "Dikonfirmasi diterima");
  return { ok: true };
}

/* ------------------------------------------------------------------ photos */

export const SHIPPING_MAX_PHOTOS = 4;

export async function addShippingPhoto(orderId: string, bytes: Uint8Array) {
  await requireAdmin();
  const mime = feedPhotoMime(bytes);
  if (!mime) throw new Error("Foto harus JPEG, PNG, atau WebP maksimal 5 MB");
  const order = await pool.query("select id from shipping_orders where id = $1", [orderId]);
  if (order.rows.length === 0) throw new Error("Pengiriman tidak ditemukan");
  const count = await pool.query(
    "select count(*)::int as n from shipping_photos where order_id = $1",
    [orderId],
  );
  if (Number((count.rows[0] as { n: number }).n) >= SHIPPING_MAX_PHOTOS)
    throw new Error(`Maksimal ${SHIPPING_MAX_PHOTOS} foto per pengiriman`);
  const row = await pool.query(
    "insert into shipping_photos (order_id, mime, bytes) values ($1, $2, $3) returning id",
    [orderId, mime, Buffer.from(bytes)],
  );
  return { id: (row.rows[0] as { id: string }).id };
}

/** One weigh-in photo: its owner, or the team with `admin`. */
export async function shippingPhoto(id: string, admin: boolean, viewerId: string | null) {
  const row = (
    await pool.query(
      `select p.mime, p.bytes, o.customer_auth_subject
         from shipping_photos p join shipping_orders o on o.id = p.order_id where p.id = $1`,
      [id],
    )
  ).rows[0] as { mime: string; bytes: Buffer; customer_auth_subject: string } | undefined;
  if (!row) return null;
  if (!admin && row.customer_auth_subject !== viewerId) return null;
  return { mime: row.mime, bytes: row.bytes };
}

export async function deleteShippingPhoto(id: string) {
  await requireAdmin();
  await pool.query("delete from shipping_photos where id = $1", [id]);
}

/* -------------------------------------------------------------------- admin */

export async function getAdminShippingHandler() {
  await requireAdmin();
  const { config, version } = await readConfigRecord();
  const counts = await pool.query(
    "select status, count(*)::int as n from shipping_orders group by status",
  );
  const orders = (
    await pool.query(
      `select * from shipping_orders
        order by (case status when 'AWAITING_DROP' then 1 when 'RECEIVED' then 0 when 'PAID' then 0 else 2 end),
                 created_at desc limit 150`,
    )
  ).rows as OrderRow[];
  const ids = orders.map((o) => o.id);
  const photos = await photosFor(ids);
  const events = await pool.query(
    "select order_id, status, actor, note, created_at from shipping_order_events where order_id = any($1::uuid[]) order by created_at",
    [ids],
  );
  const eventMap = new Map<string, ShippingEventView[]>();
  for (const e of events.rows as {
    order_id: string;
    status: string;
    actor: string;
    note: string | null;
    created_at: Date;
  }[]) {
    const list = eventMap.get(e.order_id) ?? [];
    list.push({ status: e.status, actor: e.actor, note: e.note, at: iso(e.created_at)! });
    eventMap.set(e.order_id, list);
  }
  return {
    config,
    version,
    paymentReady: paymentConfigured(),
    counts: Object.fromEntries(
      (counts.rows as { status: string; n: number }[]).map((r) => [r.status, r.n]),
    ),
    orders: orders.map((o) => ({
      ...view(o, photos.get(o.id) ?? [], eventMap.get(o.id) ?? []),
      partnerIdrPerKg: o.partner_idr_per_kg,
      partnerCostIdr: o.partner_cost_idr,
      financeError: o.finance_error,
      adminNote: o.admin_note,
      refundNeeded: o.refund_needed,
    })),
  };
}

const saveSchema = z.object({
  config: z.unknown(),
  expectedVersion: z.number().int().min(0),
  reason: z.string().trim().min(3).max(300),
});
export const saveShippingConfigInput = (data: unknown) => saveSchema.parse(data);

export async function saveShippingConfigHandler({
  data,
}: {
  data: ReturnType<typeof saveShippingConfigInput>;
}) {
  await requireAdmin();
  const config = parseShippingConfig(data.config);
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      "select value_json, version from public.admin_settings where setting_key = $1 for update",
      [SHIPPING_SETTING_KEY],
    );
    const row = current.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    const version = row ? Number(row.version) : 0;
    if (version !== data.expectedVersion) {
      await client.query("rollback");
      return { ok: false as const, conflict: true as const, version };
    }
    const audit = buildSettingAudit(
      SHIPPING_SETTING_KEY,
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
      [SHIPPING_SETTING_KEY, JSON.stringify(config)],
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
  action: z.enum([
    "advance",
    "bill",
    "reject",
    "cancel",
    "note",
    "check_payment",
    "resend_finance",
    "delete_photo",
  ]),
  note: z.string().trim().max(800).optional(),
  courier: z.string().trim().max(60).optional(),
  trackingNumber: z.string().trim().max(80).optional(),
  weighedKg: z.number().min(0.05).max(100).optional(),
  packingIdr: z.number().int().min(0).max(5_000_000).optional(),
  photoId: z.string().uuid().optional(),
});
export const adminShippingActionInput = (data: unknown) => actionSchema.parse(data);

export async function adminShippingActionHandler({
  data,
}: {
  data: ReturnType<typeof adminShippingActionInput>;
}) {
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const order = (await pool.query("select * from shipping_orders where id = $1", [data.orderId]))
    .rows[0] as OrderRow | undefined;
  if (!order) throw new Error("Pengiriman tidak ditemukan");

  if (data.action === "check_payment")
    return { ok: true, result: await settleShippingOrder(order.id) };
  if (data.action === "resend_finance") {
    if (!shippingIsPaid(order.status) || !order.paid_at) throw new Error("Belum dibayar");
    await postFinance(order, new Date(order.paid_at).getTime());
    return { ok: true };
  }
  if (data.action === "note") {
    await pool.query(
      "update shipping_orders set admin_note = $2, updated_at = now() where id = $1",
      [order.id, data.note || null],
    );
    return { ok: true };
  }
  if (data.action === "delete_photo") {
    if (!data.photoId) throw new Error("Foto tidak dipilih");
    await pool.query("delete from shipping_photos where id = $1 and order_id = $2", [
      data.photoId,
      order.id,
    ]);
    return { ok: true };
  }

  const config = await getShippingConfig();
  const client = await pool.connect();
  try {
    await client.query("begin");

    if (data.action === "bill") {
      if (!adminCanBill(order.status)) throw new Error("Paket harus diterima di drop point dulu");
      if (data.weighedKg === undefined) throw new Error("Berat timbang wajib diisi");
      const quote = quoteShipping({
        weighedKg: data.weighedKg,
        rateIdrPerKg: order.rate_idr_per_kg,
        minKg: Number(order.min_kg),
        roundKg: Number(order.round_kg),
        packingIdr: data.packingIdr ?? 0,
      });
      const partnerCost = Math.round(quote.billedKg * order.partner_idr_per_kg);
      const updated = await client.query(
        `update shipping_orders set status = 'PAYMENT_PENDING', weighed_kg = $2, billed_kg = $3, freight_idr = $4,
                packing_idr = $5, total_idr = $6, partner_cost_idr = $7, weigh_note = $8, weighed_at = now(),
                payment_state = 'NONE', invoice_id = null, transaction_id = null, payment_url = null,
                payment_expires_at = now() + ($9 || ' hours')::interval, status_reason = null, updated_at = now()
          where id = $1 and status = $10 returning id, extract(epoch from weighed_at) * 1000 as stamp`,
        [
          order.id,
          data.weighedKg,
          quote.billedKg,
          quote.freightIdr,
          data.packingIdr ?? 0,
          quote.totalIdr,
          partnerCost,
          data.note || null,
          String(config.paymentWindowHours),
          order.status,
        ],
      );
      if (updated.rows.length === 0) throw new Error("Status sudah berubah, muat ulang");
      await logEvent(
        client,
        order.id,
        "PAYMENT_PENDING",
        actor,
        `${formatKg(data.weighedKg)} ditimbang, ${formatKg(quote.billedKg)} ditagih, ${formatIdr(quote.totalIdr)}`,
      );
      await client.query("commit");
      const stamp = String((updated.rows[0] as { stamp: string }).stamp);
      await notifyOrder(
        order,
        `BILLED:${stamp}`,
        `Paketmu ditimbang ${formatKg(data.weighedKg)}. Tagihan ${formatIdr(quote.totalIdr)}, bayar dalam ${config.paymentWindowHours} jam.`,
      );
      return { ok: true, status: "PAYMENT_PENDING" as const };
    }

    if (data.action === "advance") {
      const next = SHIPPING_ADMIN_NEXT[order.status];
      if (!next) throw new Error("Status ini tidak bisa dimajukan");
      if (next === "SHIPPED" && (!data.courier || !data.trackingNumber))
        throw new Error("Kurir dan nomor resi wajib diisi");
      if (next === "SHIPPED" && !config.couriers.includes(data.courier!))
        throw new Error("Pilih kurir dari daftar di Pengaturan");
      const updated = await client.query(
        `update shipping_orders set status = $2,
                courier = coalesce($3, courier), tracking_number = coalesce($4, tracking_number),
                shipped_at = case when $2 = 'SHIPPED' then now() else shipped_at end,
                arrived_at = case when $2 = 'ARRIVED' then now() else arrived_at end,
                completed_at = case when $2 = 'DELIVERED' then now() else completed_at end,
                updated_at = now()
          where id = $1 and status = $5 returning id`,
        [order.id, next, data.courier || null, data.trackingNumber || null, order.status],
      );
      if (updated.rows.length === 0) throw new Error("Status sudah berubah, muat ulang");
      await logEvent(client, order.id, next, actor, data.note);
      await client.query("commit");
      const text: Partial<Record<ShippingStatus, string>> = {
        ...NOTIFY_TEXT,
        SHIPPED: `Paketmu dikirim ke Jepang${data.courier ? ` lewat ${data.courier}` : ""}, resi ${data.trackingNumber}.`,
      };
      await notifyOrder(order, next, text[next] ?? SHIPPING_STATUS_LABEL[next]);
      return { ok: true, status: next };
    }

    if (data.action === "reject") {
      if (!adminCanReject(order.status)) throw new Error("Pengiriman ini tidak bisa ditolak lagi");
      if (!data.note || data.note.length < 3) throw new Error("Alasan penolakan wajib diisi");
      const updated = await client.query(
        "update shipping_orders set status = 'REJECTED', status_reason = $2, updated_at = now() where id = $1 and status = $3 returning id",
        [order.id, data.note, order.status],
      );
      if (updated.rows.length === 0) throw new Error("Status sudah berubah, muat ulang");
      await logEvent(client, order.id, "REJECTED", actor, data.note);
      await client.query("commit");
      await notifyOrder(order, "REJECTED", `Pengiriman ditolak: ${data.note}.`);
      return { ok: true, status: "REJECTED" as const };
    }

    // cancel (paid, before it ships)
    if (!adminCanCancel(order.status))
      throw new Error("Hanya pengiriman yang sudah dibayar dan belum dikirim");
    if (!data.note || data.note.length < 3) throw new Error("Alasan pembatalan wajib diisi");
    const updated = await client.query(
      "update shipping_orders set status = 'CANCELLED', status_reason = $2, refund_needed = true, updated_at = now() where id = $1 and status = 'PAID' returning id",
      [order.id, data.note],
    );
    if (updated.rows.length === 0) throw new Error("Status sudah berubah, muat ulang");
    await logEvent(client, order.id, "CANCELLED", actor, data.note);
    await client.query("commit");
    await notifyOrder(
      order,
      "CANCELLED",
      `Pengiriman dibatalkan: ${data.note}. Refund akan diproses tim kami.`,
    );
    return { ok: true, status: "CANCELLED" as const };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
