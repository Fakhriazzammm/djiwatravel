import { and, eq, gt, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "../db/client.server";
import { customerOrders, guestOrderAccess } from "../../drizzle/schema";
import { hashGuestAccessToken } from "./guest-order-access.server";
import { assertPaymentNotExpired } from "./payment-expiry";

const invoicePayloadSchema = z.object({
  orderId: z.string().uuid(),
  amountIdr: z.number().int().positive(),
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().email(),
  customerMobile: z.string().trim().min(8).max(24),
  description: z.string().trim().min(1).max(240),
  redirectUrl: z.string().url(),
});
const invoiceSchema = invoicePayloadSchema.extend({
  accessToken: z.string().min(32).max(256),
  amountIdr: z.number().int().positive(),
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().email(),
  customerMobile: z.string().trim().min(8).max(24),
  description: z.string().trim().min(1).max(240),
  redirectUrl: z.string().url(),
});

function mayarConfig() {
  const apiKey = process.env["MAYAR_API_KEY"];
  if (!apiKey) throw new Error("Payment provider belum dikonfigurasi");
  return { apiKey, baseUrl: (process.env["MAYAR_API_BASE"] || "https://api.mayar.id/hl/v2").replace(/\/$/, "") };
}

/**
 * Mayar v2 invoice payload.
 *
 * No `extraData` here on purpose: Mayar answers 400 "extraData Validation Error" for the object,
 * array and string forms (verified against the live API), which made every checkout fail at the
 * last step. The order stays traceable through the description plus the invoiceId we store as
 * `paymentReference`, and `redirectUrl` is what brings the customer back to our own order page
 * after they pay.
 */
export function buildMayarInvoicePayload(input: z.input<typeof invoicePayloadSchema>) {
  return {
    name: input.customerName,
    email: input.customerEmail,
    mobile: input.customerMobile,
    description: input.description,
    redirectUrl: input.redirectUrl,
    items: [{ quantity: 1, rate: input.amountIdr, description: input.description }],
  };
}

type MayarPaymentIntent = {
  status?: string;
  provider_invoice_id?: string | null;
  provider_transaction_id?: string | null;
  payment_url?: string | null;
  attempt_count?: number | null;
  next_reconcile_at?: string | Date | null;
};

export type MayarInvoiceListItem = { id?: string | null; description?: string | null };

export type MayarInvoice = { invoiceId: string; transactionId: string; paymentUrl: string };

/** Only a provider-rejected attempt without any provider identifiers is retryable. */
export function canRetryMayarIntent(intent: MayarPaymentIntent) {
  return intent.status === "FAILED"
    && !intent.provider_invoice_id
    && !intent.provider_transaction_id
    && !intent.payment_url;
}

/** Matches the provider invoice that belongs to this order, by its exact description. */
export function findMayarInvoiceRecord(items: MayarInvoiceListItem[], description: string) {
  const wanted = description.trim();
  if (!wanted) return null;
  return items.find((item) => typeof item.description === "string" && item.description.trim() === wanted) ?? null;
}

/**
 * A dropped connection leaves the intent UNKNOWN with no provider identifier at all. Once the
 * reconcile window has passed and the attempt budget is not exhausted the order can be checked
 * against Mayar again — and, when Mayar really has no invoice for it, tried again.
 */
export function canReclaimStaleMayarIntent(intent: MayarPaymentIntent, nowMs: number, maxAttempts = 5) {
  if (intent.status !== "UNKNOWN") return false;
  if (intent.provider_invoice_id || intent.provider_transaction_id || intent.payment_url) return false;
  const attempts = Number(intent.attempt_count ?? 0);
  if (!Number.isFinite(attempts) || attempts >= maxAttempts) return false;
  const next = intent.next_reconcile_at;
  if (next === null || next === undefined) return true;
  const nextMs = next instanceof Date ? next.getTime() : Date.parse(String(next));
  if (!Number.isFinite(nextMs)) return true;
  return nextMs <= nowMs;
}

/** Persists an invoice that already exists on Mayar's side (created earlier, or reconciled). */
async function persistConfirmedMayarInvoice(orderId: string, invoice: MayarInvoice, currentSnapshot: Record<string, unknown>) {
  await db.execute(sql`update public.payment_intents set status = 'PROVIDER_CONFIRMED', provider_invoice_id = ${invoice.invoiceId}, provider_transaction_id = ${invoice.transactionId}, payment_url = ${invoice.paymentUrl}, last_error = null, next_reconcile_at = null, updated_at = now() where order_id = ${orderId}::uuid and provider = 'mayar'`);
  await db.update(customerOrders).set({ status: "PAYMENT_PENDING", paymentProvider: "mayar", paymentReference: invoice.invoiceId, priceSnapshot: { ...currentSnapshot, mayar: { invoiceId: invoice.invoiceId, transactionId: invoice.transactionId, paymentUrl: invoice.paymentUrl } } }).where(eq(customerOrders.id, orderId));
}

/**
 * Mayar's create call is not idempotent, so before any retry we ask the provider whether an invoice
 * already exists for this order. Invoices stay traceable through their exact description
 * (`Djiwa Travel <publicOrderCode>`) and the detail endpoint returns the full payment URL.
 * Every failure returns null on purpose: reconciliation must never break a checkout that could
 * still succeed.
 */
async function findExistingMayarInvoice(baseUrl: string, apiKey: string, description: string): Promise<MayarInvoice | null> {
  const headers = { authorization: "Bearer " + apiKey, accept: "application/json" };
  try {
    const listResponse = await fetch(`${baseUrl}/invoices?page=1&pageSize=100`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!listResponse.ok) {
      console.warn("[mayar] reconcile list failed", { status: listResponse.status });
      return null;
    }
    const listBody = (await listResponse.json().catch(() => ({}))) as { data?: MayarInvoiceListItem[] };
    const match = findMayarInvoiceRecord(Array.isArray(listBody.data) ? listBody.data : [], description);
    const invoiceId = String(match?.id ?? "");
    if (!invoiceId) return null;
    const detailResponse = await fetch(`${baseUrl}/invoices/${encodeURIComponent(invoiceId)}`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!detailResponse.ok) {
      console.warn("[mayar] reconcile detail failed", { status: detailResponse.status, invoiceId });
      return null;
    }
    const detailBody = (await detailResponse.json().catch(() => ({}))) as Record<string, unknown> & { data?: Record<string, unknown> };
    const detail = (detailBody.data && typeof detailBody.data === "object" ? detailBody.data : detailBody) as Record<string, unknown>;
    const paymentUrl = String(detail["paymentUrl"] ?? "");
    if (!paymentUrl) {
      console.warn("[mayar] reconcile without payment url", { invoiceId });
      return null;
    }
    return { invoiceId, transactionId: String(detail["transactionId"] ?? ""), paymentUrl };
  } catch (error) {
    console.warn("[mayar] reconcile skipped", { message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

function configuredAppOrigin() {
  const raw = process.env["PUBLIC_APP_ORIGIN"] || process.env["APP_ORIGIN"];
  if (!raw) throw new Error("Canonical app origin belum dikonfigurasi");
  const origin = new URL(raw);
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Canonical app origin tidak valid");
  return origin.origin;
}

async function createMayarInvoiceForOrder(
  orderId: string,
  expectedAmount: number,
  payload: z.input<typeof invoicePayloadSchema>,
  currentSnapshot: Record<string, unknown>,
) {
  const { apiKey, baseUrl } = mayarConfig();
  const intentRows = await db.execute(sql`select status, provider_invoice_id, provider_transaction_id, payment_url, attempt_count, next_reconcile_at from public.payment_intents where order_id = ${orderId}::uuid and provider = 'mayar' limit 1`);
  const intent = intentRows.rows[0] as MayarPaymentIntent | undefined;
  if (intent) {
    if (intent.payment_url && intent.provider_invoice_id) return { invoiceId: intent.provider_invoice_id, transactionId: intent.provider_transaction_id ?? "", paymentUrl: intent.payment_url };
    // Mayar's create call is not idempotent, so adopt an invoice that already exists for this order
    // (a response we never received, or Mayar's own "Duplicate request detected" guard) instead of
    // creating a second one.
    const existing = await findExistingMayarInvoice(baseUrl, apiKey, payload.description);
    if (existing) {
      await persistConfirmedMayarInvoice(orderId, existing, currentSnapshot);
      console.info("[mayar] reconciled existing invoice", { orderId, invoiceId: existing.invoiceId });
      return existing;
    }
    if (canRetryMayarIntent(intent)) {
      const retryClaim = await db.execute(sql`update public.payment_intents
      set status = 'REQUESTING', attempt_count = attempt_count + 1, last_error = null, next_reconcile_at = null, updated_at = now()
      where order_id = ${orderId}::uuid and provider = 'mayar' and status = 'FAILED'
        and provider_invoice_id is null and provider_transaction_id is null and payment_url is null
      returning id`);
      if (retryClaim.rows.length === 0) throw new Error("Tagihan pembayaran sedang diproses atau perlu direkonsiliasi");
    } else if (canReclaimStaleMayarIntent(intent, Date.now())) {
      // Mayar has no invoice for this order and the reconcile window has passed, so the earlier
      // attempt never reached the provider and a fresh one is safe.
      const staleClaim = await db.execute(sql`update public.payment_intents
      set status = 'REQUESTING', attempt_count = attempt_count + 1, last_error = null, next_reconcile_at = null, updated_at = now()
      where order_id = ${orderId}::uuid and provider = 'mayar' and status = 'UNKNOWN'
        and provider_invoice_id is null and provider_transaction_id is null and payment_url is null
      returning id`);
      if (staleClaim.rows.length === 0) throw new Error("Tagihan pembayaran sedang diproses atau perlu direkonsiliasi");
    } else {
      throw new Error("Tagihan pembayaran sedang diproses atau perlu direkonsiliasi");
    }
  } else {
    const claim = await db.execute(sql`insert into public.payment_intents(order_id, provider, idempotency_key, status, amount, currency_code, attempt_count, updated_at)
      values (${orderId}::uuid, 'mayar', ${orderId}, 'REQUESTING', ${expectedAmount}, 'IDR', 1, now())
      on conflict (order_id, provider) do nothing returning id`);
    if (claim.rows.length === 0) throw new Error("Tagihan pembayaran sedang diproses atau perlu direkonsiliasi");
  }
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/invoices/create`, { method: "POST", headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" }, body: JSON.stringify(buildMayarInvoicePayload(payload)), signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    console.error("[mayar] create invoice failed", {
      orderId,
      message: error instanceof Error ? error.message : String(error),
      causeCode: (error as { cause?: { code?: string } })?.cause?.code ?? null,
    });
    await db.execute(sql`update public.payment_intents set status = 'UNKNOWN', last_error = ${error instanceof Error ? error.message.slice(0, 240) : "provider_timeout"}, next_reconcile_at = now() + interval '1 minute', updated_at = now() where order_id = ${orderId}::uuid and provider = 'mayar'`);
    throw new Error("Tagihan pembayaran belum terkonfirmasi; coba rekonsiliasi, bukan membuat tagihan baru");
  }
  const body = await response.json().catch(() => ({})) as { data?: Record<string, unknown>; messages?: string; message?: string };
  if (!response.ok) {
    await db.execute(sql`update public.payment_intents set status = 'FAILED', last_error = ${body.messages || body.message || `provider_${response.status}`}, updated_at = now() where order_id = ${orderId}::uuid and provider = 'mayar'`);
    throw new Error(body.messages || body.message || `Payment provider error ${response.status}`);
  }
  const invoiceId = String(body.data?.["id"] ?? "");
  const transactionId = String(body.data?.["transactionId"] ?? "");
  const paymentUrl = String(body.data?.["link"] ?? body.data?.["paymentUrl"] ?? "");
  if (!invoiceId || !transactionId || !paymentUrl) {
    await db.execute(sql`update public.payment_intents set status = 'UNKNOWN', last_error = 'provider_response_incomplete', next_reconcile_at = now(), updated_at = now() where order_id = ${orderId}::uuid and provider = 'mayar'`);
    throw new Error("Respons invoice Mayar tidak lengkap");
  }
  await persistConfirmedMayarInvoice(orderId, { invoiceId, transactionId, paymentUrl }, currentSnapshot);
  return { invoiceId, transactionId, paymentUrl };
}

export const createMayarInvoice = createServerFn({ method: "POST" })
  .validator(invoiceSchema)
  .handler(async ({ data }) => {
    const accessHash = hashGuestAccessToken(data.accessToken);
    const rows = await db
      .select({ order: customerOrders, access: guestOrderAccess })
      .from(customerOrders)
      .innerJoin(guestOrderAccess, eq(guestOrderAccess.orderId, customerOrders.id))
      .where(and(eq(customerOrders.id, data.orderId), eq(guestOrderAccess.accessTokenHash, accessHash), gt(guestOrderAccess.expiresAt, new Date().toISOString())))
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error("Pesanan tidak ditemukan");
    const expectedAmount = Number(row.order.totalAmount);
    if (!Number.isSafeInteger(expectedAmount) || expectedAmount !== data.amountIdr) throw new Error("Nominal pesanan berubah");
    assertPaymentNotExpired(row.order.status, row.order.paymentExpiresAt);
    if (row.order.paymentProvider === "mayar" && row.order.paymentReference) {
      const snapshot = row.order.priceSnapshot && typeof row.order.priceSnapshot === "object" ? row.order.priceSnapshot as Record<string, unknown> : {};
      const mayar = snapshot["mayar"] && typeof snapshot["mayar"] === "object" ? snapshot["mayar"] as Record<string, unknown> : {};
      if (typeof mayar["paymentUrl"] === "string" && mayar["paymentUrl"]) return { invoiceId: String(mayar["invoiceId"] || row.order.paymentReference), transactionId: String(mayar["transactionId"] || ""), paymentUrl: mayar["paymentUrl"] };
      throw new Error("Tagihan pesanan sudah dibuat tetapi link pembayaran tidak tersedia");
    }
    const currentSnapshot = row.order.priceSnapshot && typeof row.order.priceSnapshot === "object" ? row.order.priceSnapshot as Record<string, unknown> : {};
    return createMayarInvoiceForOrder(data.orderId, expectedAmount, data, currentSnapshot);
  });

/**
 * Rebuilds the invoice for an order that exists but never got a payment link (checkout died at
 * the invoice step). Contacts are read from `guest_order_access`, so nothing depends on the
 * customer's browser cache and they never have to retype anything — this is what recovers the
 * orders that were stranded while Mayar was rejecting our payload.
 */
export const rebuildMayarInvoice = createServerFn({ method: "POST" })
  .validator(z.object({ orderId: z.string().uuid(), accessToken: z.string().min(32).max(256) }))
  .handler(async ({ data }) => {
    const accessHash = hashGuestAccessToken(data.accessToken);
    const rows = await db
      .select({ order: customerOrders, access: guestOrderAccess })
      .from(customerOrders)
      .innerJoin(guestOrderAccess, eq(guestOrderAccess.orderId, customerOrders.id))
      .where(and(eq(customerOrders.id, data.orderId), eq(guestOrderAccess.accessTokenHash, accessHash), gt(guestOrderAccess.expiresAt, new Date().toISOString())))
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error("Pesanan tidak ditemukan");
    assertPaymentNotExpired(row.order.status, row.order.paymentExpiresAt);
    const orderSnapshot = row.order.priceSnapshot && typeof row.order.priceSnapshot === "object"
      ? (row.order.priceSnapshot as Record<string, unknown>)
      : {};
    const stored = orderSnapshot["mayar"] && typeof orderSnapshot["mayar"] === "object"
      ? (orderSnapshot["mayar"] as Record<string, unknown>)
      : {};
    if (typeof stored["paymentUrl"] === "string" && stored["paymentUrl"]) {
      return {
        invoiceId: String(stored["invoiceId"] || row.order.paymentReference || ""),
        transactionId: String(stored["transactionId"] || ""),
        paymentUrl: stored["paymentUrl"],
      };
    }
    const email = (row.access.email ?? "").trim();
    const whatsapp = (row.access.whatsapp ?? "").trim();
    if (!email || !whatsapp) throw new Error("Kontak pesanan tidak lengkap");
    assertPaymentNotExpired(row.order.status, row.order.paymentExpiresAt);
    const amountIdr = Number(row.order.totalAmount);
    if (!Number.isSafeInteger(amountIdr) || amountIdr <= 0) throw new Error("Nominal pesanan tidak valid");
    const description = `Djiwa Travel ${row.order.publicOrderCode}`;
    const snapshot = row.order.priceSnapshot && typeof row.order.priceSnapshot === "object" ? row.order.priceSnapshot as Record<string, unknown> : {};
    const result = await createMayarInvoiceForOrder(data.orderId, amountIdr, {
      orderId: data.orderId,
      amountIdr,
      customerName: email.split("@")[0] || "Customer",
      customerEmail: email,
      customerMobile: whatsapp,
      description,
      redirectUrl: `${configuredAppOrigin()}/receipt/${data.orderId}`,
    }, snapshot);
    return result;
  });

export type MayarTransaction = {
  id?: string;
  status?: string;
  amount?: number;
  createdAt?: string;
  updatedAt?: string;
};

/** Authoritative payment lookup: Mayar's transaction detail is the payment proof. */
export async function fetchMayarTransaction(transactionId: string): Promise<MayarTransaction> {
  const { apiKey, baseUrl } = mayarConfig();
  const response = await fetch(`${baseUrl}/transactions/${encodeURIComponent(transactionId)}`, { headers: { authorization: "Bearer " + apiKey, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => ({})) as { data?: MayarTransaction; messages?: string; message?: string };
  if (!response.ok) throw new Error(body.messages || body.message || `Payment verification error ${response.status}`);
  return body.data ?? {};
}

export const getMayarTransaction = createServerFn({ method: "POST" })
  .validator(z.object({ transactionId: z.string().min(1).max(160) }))
  .handler(async ({ data }) => {
    const transaction = await fetchMayarTransaction(data.transactionId);
    if (String(transaction.status).toLowerCase() !== "paid") throw new Error("Pembayaran belum terverifikasi");
    return transaction;
  });
