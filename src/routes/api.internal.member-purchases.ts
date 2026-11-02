import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { customerOrderItems, customerOrders, guestOrderAccess } from "../../drizzle/schema";
import { db } from "@/db/client.server";
import { verifyTentramSignedRequest } from "@/lib/tentram-signed-request.server";

/**
 * Lets Djiwa Pay (Tentram VPS) list a member's Travel purchases for its unified history.
 *
 * Travel keeps ownership of its orders: Pay reads at view time and stores nothing. The caller proves
 * itself with the shared HMAC, and the response is limited to paid orders with display fields only —
 * no eSIM secrets, payment URLs or provider references.
 */
const MAX_BODY_BYTES = 4 * 1024;
const PAID_STATUSES = new Set([
  "PAID",
  "PROVISIONING",
  "READY",
  "INSTALLED",
  "PROVISIONING_FAILED",
]);

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function receive(request: Request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (request.headers.get("origin") || request.headers.get("referer"))
    return json({ error: "server_only" }, 403);
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES)
    return json({ error: "Payload too large" }, 413);
  if (!verifyTentramSignedRequest(rawBody, request)) return json({ error: "Unauthorized" }, 401);

  let sourceId = "";
  try {
    const body = JSON.parse(rawBody) as { sourceId?: unknown };
    sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
  } catch {
    return json({ error: "Invalid payload" }, 400);
  }
  if (!sourceId) return json({ error: "Invalid payload" }, 400);

  const rows = await db
    .select({
      id: customerOrders.id,
      code: customerOrders.publicOrderCode,
      status: customerOrders.status,
      amount: customerOrders.totalAmount,
      paidAt: customerOrders.paidAt,
      createdAt: customerOrders.createdAt,
      provider: customerOrders.paymentProvider,
      method: guestOrderAccess.paymentMethod,
      snapshot: customerOrderItems.packageSnapshot,
    })
    .from(customerOrders)
    .innerJoin(customerOrderItems, eq(customerOrderItems.orderId, customerOrders.id))
    .leftJoin(guestOrderAccess, eq(guestOrderAccess.orderId, customerOrders.id))
    .where(eq(customerOrders.customerAuthSubject, sourceId))
    .orderBy(customerOrders.createdAt);

  const purchases = rows
    .filter((row) => PAID_STATUSES.has(row.status))
    .map((row) => {
      const snapshot = (row.snapshot ?? {}) as Record<string, unknown>;
      const name = typeof snapshot["name"] === "string" ? snapshot["name"] : "eSIM";
      return {
        orderId: row.id,
        orderCode: row.code,
        title: `eSIM ${name}`,
        amount: Math.round(Number(row.amount)),
        paidAt: new Date(row.paidAt ?? row.createdAt).getTime(),
        // Direct Mayar payments are QRIS/VA; a Djiwa Pay balance payment already has a ledger row.
        method: row.method ?? (row.provider === "mayar" ? "qris" : "unknown"),
        provider: row.provider ?? null,
      };
    });
  return json({ ok: true, purchases });
}

export const Route = createFileRoute("/api/internal/member-purchases")({
  server: { handlers: { POST: ({ request }) => receive(request) } },
});
