import { createServerFn } from "@tanstack/react-start";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.server";
import { customerOrders, guestOrderAccess } from "../../drizzle/schema";
import { hashGuestAccessToken } from "./guest-order-access.server";
import { fetchMayarTransaction, type MayarTransaction } from "./mayar-gateway";
import { provisionSettledTravelOrder } from "./mayar-provisioning.server";
import { readMayarSnapshot, toIsoTimestamp } from "./payment-snapshot";
import { assertPaymentNotExpired } from "./payment-expiry";
import { enqueueFinancePosting } from "./finance-outbox.server";

const verifySchema = z.object({
  orderId: z.string().uuid(),
  accessToken: z.string().min(32).max(256),
});

const SETTLED_STATUSES = new Set([
  "PAYMENT_CONFIRMED",
  "PROVISIONING",
  // A failed eSIM provisioning still means the payment settled; it stays retryable.
  "PROVISIONING_FAILED",
  "READY",
  "INSTALLED",
]);

export type TravelFinanceGatewayPayload = {
  orderId: string;
  orderNumber: string;
  amount: number;
  /** Always present: the finance gateway rejects a payload that omits the field entirely. */
  customerName: string | null;
  paidAt: number;
  paymentGateway: {
    provider: "mayar";
    status: "paid";
    invoiceId?: string;
    transactionId?: string;
    paymentId?: string;
    referenceId?: string;
  };
};

type TravelFinanceGatewayResponse = {
  ok: true;
  dedup: boolean;
  sourceId?: string;
};

function configuredFinanceGateway() {
  const rawUrl = process.env["DJIWA_TRAVEL_FINANCE_SETTLEMENT_URL"]?.trim();
  const secret = process.env["DJIWA_TRAVEL_SETTLEMENT_SECRET"];
  if (!rawUrl || !secret) throw new Error("Travel finance settlement is not configured");
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Travel finance settlement URL is invalid");
  }
  if (url.protocol !== "https:") throw new Error("Travel finance settlement URL must use HTTPS");
  return { url: url.toString(), secret };
}

/** Build the allowlisted, non-sensitive contract sent to Djiwa Finance. */
export function buildTravelFinanceGatewayPayload(input: {
  orderId: string;
  orderNumber: string;
  amount: number;
  paidAt: number;
  invoiceId?: string;
  transactionId?: string;
  paymentId?: string;
  referenceId?: string;
  customerName?: string | null;
}): TravelFinanceGatewayPayload {
  const gateway: TravelFinanceGatewayPayload["paymentGateway"] = {
    provider: "mayar",
    status: "paid",
  };
  for (const [key, value] of [
    ["invoiceId", input.invoiceId],
    ["transactionId", input.transactionId],
    ["paymentId", input.paymentId],
    ["referenceId", input.referenceId],
  ] as const) {
    if (typeof value === "string" && value.trim()) gateway[key] = value.trim();
  }
  const payload: TravelFinanceGatewayPayload = {
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    amount: input.amount,
    paidAt: input.paidAt,
    paymentGateway: gateway,
    customerName: input.customerName?.trim() ? input.customerName.trim().slice(0, 120) : null,
  };
  return payload;
}

export function parseTravelFinanceGatewayResponse(value: unknown): TravelFinanceGatewayResponse {
  if (!value || typeof value !== "object")
    throw new Error("Travel finance settlement response is invalid");
  const body = value as Record<string, unknown>;
  if (body["ok"] !== true || typeof body["dedup"] !== "boolean") {
    throw new Error("Travel finance settlement response is invalid");
  }
  if (body["sourceId"] !== undefined && typeof body["sourceId"] !== "string") {
    throw new Error("Travel finance settlement response is invalid");
  }
  return {
    ok: true,
    dedup: body["dedup"],
    ...(typeof body["sourceId"] === "string" ? { sourceId: body["sourceId"] } : {}),
  };
}

export async function postTravelFinanceSettlement(
  payload: TravelFinanceGatewayPayload,
): Promise<TravelFinanceGatewayResponse> {
  const { url, secret } = configuredFinanceGateway();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-djiwa-travel-settlement-secret": secret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Travel finance settlement request failed");
  }
  if (!response.ok) throw new Error("Travel finance settlement rejected");
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Travel finance settlement response is invalid");
  }
  return parseTravelFinanceGatewayResponse(body);
}

async function settleLocalPayment(input: {
  eventId: string;
  orderId: string;
  invoiceId?: string;
  transactionId: string;
  amount: number;
  paidAt: string;
  gatewayPayload: TravelFinanceGatewayPayload;
  financeError?: string;
}) {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(
      sql`select status, total_amount, payment_reference from public.customer_orders where id = ${input.orderId}::uuid for update`,
    );
    const order = rows.rows[0] as
      | { status: string; total_amount: string | number; payment_reference: string | null }
      | undefined;
    if (!order) throw new Error("order_not_found");
    if (order.payment_reference && input.invoiceId && order.payment_reference !== input.invoiceId)
      throw new Error("invoice_mismatch");
    if (Number(order.total_amount) !== input.amount) throw new Error("amount_mismatch");
    if (!["ORDER_CREATED", "PAYMENT_PENDING", ...SETTLED_STATUSES].includes(order.status))
      throw new Error("invalid_order_status");

    const existing = await tx.execute(
      sql`select id from public.payment_webhook_events where provider = 'mayar' and provider_event_id = ${input.eventId} limit 1`,
    );
    if (existing.rows.length > 0) return { duplicate: true, status: order.status };

    await tx.execute(sql`insert into public.payment_webhook_events(provider, provider_event_id, event_type, order_id, status, amount, currency_code, payload, processed_at, processing_error)
      values ('mayar', ${input.eventId}, 'payment.received', ${input.orderId}::uuid, 'PAID', ${input.amount}, 'IDR', ${JSON.stringify(input.gatewayPayload)}::jsonb, now(), ${input.financeError ?? null})`);
    if (SETTLED_STATUSES.has(order.status)) return { duplicate: true, status: order.status };

    await tx.execute(
      sql`update public.customer_orders set status = 'PAYMENT_CONFIRMED', payment_provider = 'mayar', payment_reference = coalesce(${input.invoiceId ?? ""}, payment_reference), paid_at = ${input.paidAt}::timestamptz, updated_at = now() where id = ${input.orderId}::uuid`,
    );
    return { duplicate: false, status: "PAYMENT_CONFIRMED" };
  });
}

async function startProvisioning(orderId: string) {
  try {
    return await provisionSettledTravelOrder(orderId);
  } catch (error) {
    const warning = error instanceof Error ? error.message.slice(0, 200) : "provisioning_failed";
    return { started: false, status: "PROVISIONING_FAILED", warning };
  }
}

export async function settleVerifiedTravelPayment(input: {
  orderId: string;
  orderNumber: string;
  amount: number;
  paidAt: number;
  invoiceId?: string;
  transactionId: string;
  paymentId?: string;
  referenceId?: string;
  customerName?: string | null;
}) {
  const gatewayPayload = buildTravelFinanceGatewayPayload(input);
  // Mayar is the source of truth that the money arrived, so the customer's order must settle even
  // when the finance hand-off is unavailable. The failure is recorded on the settlement event and
  // queued in the finance outbox instead of blocking the paid order (and its eSIM provisioning)
  // forever — an unposted ledger entry has to be retryable, not a silent gap.
  let finance: TravelFinanceGatewayResponse | undefined;
  let financeError: string | undefined;
  try {
    finance = await postTravelFinanceSettlement(gatewayPayload);
  } catch (error) {
    financeError =
      error instanceof Error ? error.message.slice(0, 200) : "finance_settlement_failed";
    console.error("[travel] finance settlement unavailable, settling locally", {
      orderId: input.orderId,
      financeError,
    });
  }
  const localInput = {
    eventId: `mayar:${input.transactionId}`,
    orderId: input.orderId,
    transactionId: input.transactionId,
    amount: input.amount,
    paidAt: new Date(input.paidAt).toISOString(),
    gatewayPayload,
    ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
    ...(financeError ? { financeError } : {}),
  };
  const local = await settleLocalPayment(localInput);
  // Queue the obligation whenever the direct posting did not succeed. Idempotent on (order,
  // purpose), so a redelivery or a second settlement cannot create a duplicate posting.
  let outboxQueued = false;
  if (!finance) {
    const queued = await enqueueFinancePosting({
      orderId: input.orderId,
      transactionId: input.transactionId,
      amount: input.amount,
      payload: gatewayPayload,
    }).catch(() => ({ created: false, status: undefined as string | undefined }));
    outboxQueued = queued.created;
  }
  return {
    ...(finance ? { finance } : {}),
    ...(financeError ? { financeError } : {}),
    ...(outboxQueued ? { financeOutboxQueued: true } : {}),
    local,
  };
}

function verifiedPaidAt(transaction: MayarTransaction) {
  const iso = toIsoTimestamp(transaction.updatedAt ?? transaction.createdAt);
  const paidAt = Date.parse(iso);
  if (!Number.isSafeInteger(paidAt)) throw new Error("Payment timestamp unavailable");
  return paidAt;
}

/** Verify Mayar first, then settle Finance, local Travel state, and provisioning. */
export const verifyMayarPayment = createServerFn({ method: "POST" })
  .validator(verifySchema)
  .handler(async ({ data }) => {
    const accessHash = hashGuestAccessToken(data.accessToken);
    const rows = await db
      .select({ order: customerOrders })
      .from(customerOrders)
      .innerJoin(guestOrderAccess, eq(guestOrderAccess.orderId, customerOrders.id))
      .where(
        and(
          eq(customerOrders.id, data.orderId),
          eq(guestOrderAccess.accessTokenHash, accessHash),
          gt(guestOrderAccess.expiresAt, new Date().toISOString()),
        ),
      )
      .limit(1);
    const order = rows[0]?.order;
    if (!order) throw new Error("Pesanan tidak ditemukan");

    const mayar = readMayarSnapshot(order.priceSnapshot);
    if (!mayar.transactionId) {
      assertPaymentNotExpired(order.status, order.paymentExpiresAt);
      return { status: order.status, settled: false, reason: "invoice_not_created" as const };
    }
    if (SETTLED_STATUSES.has(order.status))
      return {
        status: order.status,
        settled: true,
        provisioning: await startProvisioning(order.id),
      };

    const transaction = await fetchMayarTransaction(mayar.transactionId);
    if (String(transaction.status ?? "").toLowerCase() !== "paid") {
      // Only an unpaid order is bound by our own payment window: a payment Mayar already confirmed
      // must settle instead of being refused because our local window ran out.
      assertPaymentNotExpired(order.status, order.paymentExpiresAt);
      return { status: order.status, settled: false, reason: "payment_pending" as const };
    }
    const amount = Number(transaction.amount);
    const expectedAmount = Number(order.totalAmount);
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      !Number.isSafeInteger(expectedAmount) ||
      amount !== expectedAmount
    )
      return { status: order.status, settled: false, reason: "amount_mismatch" as const };

    const result = await settleVerifiedTravelPayment({
      orderId: order.id,
      orderNumber: order.publicOrderCode,
      amount: expectedAmount,
      paidAt: verifiedPaidAt(transaction),
      transactionId: mayar.transactionId,
      ...(mayar.invoiceId ? { invoiceId: mayar.invoiceId } : {}),
    });
    return {
      status: result.local.status,
      settled: true,
      duplicate: result.local.duplicate,
      provisioning: await startProvisioning(order.id),
    };
  });
