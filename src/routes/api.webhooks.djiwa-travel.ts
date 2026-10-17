import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "@/db/client.server";
import { customerOrders } from "../../drizzle/schema";
import { settleVerifiedTravelPayment } from "@/lib/mayar-settlement.server";
import { provisionSettledTravelOrder } from "@/lib/mayar-provisioning.server";
import { refreshTravelOrderProvisioning } from "@/lib/esim-provisioning-refresh.server";
import { validateTravelSettlementPreflight } from "@/lib/travel-settlement-preflight";
import { fetchMayarTransaction } from "@/lib/mayar-gateway";
import { decidePaymentAuthority, verificationFromTransaction } from "@/lib/payment-verification";
import { recordWebhookReceipt } from "@/lib/webhook-inbox.server";

const MAX_BODY_BYTES = 64 * 1024;
const REPLAY_WINDOW_SECONDS = 300;

type TravelPaymentPayload = {
  eventId: string;
  app: "djiwa-travel";
  orderId: string;
  invoiceId: string;
  transactionId: string;
  amountIdr: number;
  currency: "IDR";
  status: "PAID";
  paidAt: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifySignature(rawBody: string, request: Request) {
  const secret = process.env["DJIWA_TRAVEL_CALLBACK_SECRET"] || "";
  const timestamp = request.headers.get("x-djiwa-timestamp") || "";
  const signature = request.headers.get("x-djiwa-signature") || "";
  const timestampSeconds = Number(timestamp);
  if (!secret || !/^\d+$/.test(timestamp) || !Number.isSafeInteger(timestampSeconds)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > REPLAY_WINDOW_SECONDS)
    return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return safeEqual(signature, expected);
}

function parsePayload(rawBody: string): TravelPaymentPayload | null {
  const value = JSON.parse(rawBody) as Partial<TravelPaymentPayload>;
  if (value.app !== "djiwa-travel" || value.status !== "PAID" || value.currency !== "IDR")
    return null;
  if (
    typeof value.eventId !== "string" ||
    !value.eventId ||
    typeof value.orderId !== "string" ||
    !value.orderId
  )
    return null;
  if (
    typeof value.invoiceId !== "string" ||
    !value.invoiceId ||
    typeof value.transactionId !== "string" ||
    !value.transactionId
  )
    return null;
  if (
    typeof value.amountIdr !== "number" ||
    !Number.isSafeInteger(value.amountIdr) ||
    value.amountIdr <= 0 ||
    typeof value.paidAt !== "string"
  )
    return null;
  return value as TravelPaymentPayload;
}

async function receive(request: Request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json"))
    return json({ error: "Unsupported media type" }, 415);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: "Payload too large" }, 413);
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES)
    return json({ error: "Payload too large" }, 413);
  if ((request.headers.get("x-djiwa-source") || "") !== "djiwa-tentram")
    return json({ error: "Unauthorized" }, 401);
  if (!verifySignature(rawBody, request)) return json({ error: "Unauthorized" }, 401);
  let payload: TravelPaymentPayload | null;
  try {
    payload = parsePayload(rawBody);
  } catch {
    payload = null;
  }
  if (!payload) return json({ error: "Invalid payment payload" }, 400);

  // Record the receipt before doing any work: a restart between here and the writes below would
  // otherwise lose the event entirely. A redelivery of the same event is a no-op, and answering 200
  // to it is correct — a non-2xx would only make the sender retry harder.
  const firstReceipt = await recordWebhookReceipt({
    provider: "djiwa-tentram",
    eventId: payload.eventId,
    eventType: "payment.paid",
    payload,
    rawBody,
  }).catch(() => true);
  if (!firstReceipt) return json({ ok: true, duplicate: true, reason: "already_received" });

  const orderRows = await db
    .select({
      publicOrderCode: customerOrders.publicOrderCode,
      status: customerOrders.status,
      totalAmount: customerOrders.totalAmount,
      paymentReference: customerOrders.paymentReference,
      priceSnapshot: customerOrders.priceSnapshot,
    })
    .from(customerOrders)
    .where(eq(customerOrders.id, payload.orderId))
    .limit(1);
  const order = orderRows[0];
  if (!order) return json({ error: "Order not found" }, 404);
  const preflightError = validateTravelSettlementPreflight({
    status: order.status,
    totalAmount: order.totalAmount,
    paymentReference: order.paymentReference,
    payloadAmount: payload.amountIdr,
    payloadInvoiceId: payload.invoiceId,
    paidAt: payload.paidAt,
  });
  if (preflightError) return json({ error: preflightError }, 400);

  // The signed callback is evidence, not proof: ask Mayar directly and let its own transaction
  // record decide. When Mayar cannot be read the callback is still honoured (it already passed the
  // HMAC + source checks and the scheduled reconciliation stays active), and the authority used is
  // reported so an audit can tell the two paths apart.
  let authorityWarning: string | undefined;
  const mayarTransactionId = readMayarTransactionId(order.priceSnapshot);
  if (mayarTransactionId) {
    const verification = await fetchMayarTransaction(mayarTransactionId)
      .then((transaction) => verificationFromTransaction(transaction))
      .catch((error: unknown) => ({
        state: "unavailable" as const,
        reason: error instanceof Error ? error.message : "provider_unavailable",
      }));
    const decision = decidePaymentAuthority({ amount: payload.amountIdr }, verification);
    if (!decision.settle) {
      console.error("[travel] payment callback refused by direct provider verification", {
        orderId: payload.orderId,
        reason: decision.reason,
      });
      return json({ error: "Payment not verified by provider", reason: decision.reason }, 409);
    }
    if (decision.authority === "signed_callback") authorityWarning = decision.warning;
  }

  const settlement = await settleVerifiedTravelPayment({
    orderId: payload.orderId,
    orderNumber: order.publicOrderCode,
    amount: payload.amountIdr,
    paidAt: Date.parse(payload.paidAt),
    invoiceId: payload.invoiceId,
    transactionId: payload.transactionId,
  });
  // The provider only pushes profiles over its own webhook, which is not registered here, so also
  // pull the profile for an order the provider already fulfilled.
  await refreshTravelOrderProvisioning(payload.orderId).catch(() => undefined);
  try {
    const provisioning = await provisionSettledTravelOrder(payload.orderId);
    return json({
      ok: true,
      duplicate: settlement.local.duplicate,
      provisioning,
      ...(authorityWarning ? { authority: "signed_callback", authorityWarning } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "provisioning_failed";
    return json(
      {
        ok: true,
        duplicate: settlement.local.duplicate,
        provisioning: { started: false, status: "PROVISIONING_FAILED" },
        warning: message.slice(0, 200),
        ...(authorityWarning ? { authority: "signed_callback", authorityWarning } : {}),
      },
      202,
    );
  }
}

/** The stored Mayar transaction id, if this order ever got an invoice. */
function readMayarTransactionId(priceSnapshot: unknown): string | null {
  if (!priceSnapshot || typeof priceSnapshot !== "object") return null;
  const mayar = (priceSnapshot as Record<string, unknown>)["mayar"];
  if (!mayar || typeof mayar !== "object") return null;
  const value = (mayar as Record<string, unknown>)["transactionId"];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export const Route = createFileRoute("/api/webhooks/djiwa-travel")({
  server: { handlers: { POST: ({ request }) => receive(request) } },
});
