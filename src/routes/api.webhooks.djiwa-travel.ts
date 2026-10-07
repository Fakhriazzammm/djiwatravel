import { createHmac, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { db } from "@/db/client.server";
import { provisionSettledTravelOrder } from "@/lib/mayar-provisioning.server";

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
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > REPLAY_WINDOW_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return safeEqual(signature, expected);
}

function parsePayload(rawBody: string): TravelPaymentPayload | null {
  const value = JSON.parse(rawBody) as Partial<TravelPaymentPayload>;
  if (value.app !== "djiwa-travel" || value.status !== "PAID" || value.currency !== "IDR") return null;
  if (typeof value.eventId !== "string" || !value.eventId || typeof value.orderId !== "string" || !value.orderId) return null;
  if (typeof value.invoiceId !== "string" || !value.invoiceId || typeof value.transactionId !== "string" || !value.transactionId) return null;
  if (typeof value.amountIdr !== "number" || !Number.isSafeInteger(value.amountIdr) || value.amountIdr <= 0 || typeof value.paidAt !== "string") return null;
  return value as TravelPaymentPayload;
}

async function receive(request: Request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) return json({ error: "Unsupported media type" }, 415);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: "Payload too large" }, 413);
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) return json({ error: "Payload too large" }, 413);
  if ((request.headers.get("x-djiwa-source") || "") !== "djiwa-tentram") return json({ error: "Unauthorized" }, 401);
  if (!verifySignature(rawBody, request)) return json({ error: "Unauthorized" }, 401);
  let payload: TravelPaymentPayload | null;
  try { payload = parsePayload(rawBody); } catch { payload = null; }
  if (!payload) return json({ error: "Invalid payment payload" }, 400);

  const result = await db.execute(sql`select public.settle_mayar_travel_payment(${payload.eventId}, ${payload.orderId}::uuid, ${payload.invoiceId}, ${payload.transactionId}, ${payload.amountIdr}, ${payload.paidAt}::timestamptz, ${JSON.stringify(payload)}::jsonb) as result`);
  const settlement = (result.rows[0] as { result?: { duplicate?: boolean } } | undefined)?.result;
  try {
    const provisioning = await provisionSettledTravelOrder(payload.orderId);
    return json({ ok: true, duplicate: settlement?.duplicate === true, provisioning });
  } catch (error) {
    const message = error instanceof Error ? error.message : "provisioning_failed";
    return json({ ok: true, duplicate: settlement?.duplicate === true, provisioning: { started: false, status: "PROVISIONING_FAILED" }, warning: message.slice(0, 200) }, 202);
  }
}

export const Route = createFileRoute("/api/webhooks/djiwa-travel")({ server: { handlers: { POST: ({ request }) => receive(request) } } });
