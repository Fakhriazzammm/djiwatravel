import { createFileRoute } from "@tanstack/react-router";
import { sweepPendingProviderPayments } from "@/lib/mayar-settlement-sweep.server";
import { verifyTentramSignedRequest } from "@/lib/tentram-signed-request.server";

/**
 * Wake-up signal from Djiwa Tentram, which owns the single Mayar webhook slot for the shared account.
 *
 * The signal carries only identifiers. It is never trusted as proof of payment: the sweep re-reads the
 * transaction from Mayar and settles only when Mayar reports it paid for the exact order amount, so
 * a forged or replayed signal can at most trigger a harmless re-check. The scheduled sweep stays the
 * safety net when this signal is lost.
 */
const MAX_BODY_BYTES = 16 * 1024;
function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function receive(request: Request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (request.headers.get("origin") || request.headers.get("referer"))
    return json({ error: "server_only" }, 403);
  if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json"))
    return json({ error: "Unsupported media type" }, 415);
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES)
    return json({ error: "Payload too large" }, 413);
  if (!verifyTentramSignedRequest(rawBody, request)) return json({ error: "Unauthorized" }, 401);

  let body: { transactionId?: unknown; invoiceId?: unknown };
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    return json({ error: "Invalid payload" }, 400);
  }
  const transactionId = typeof body.transactionId === "string" ? body.transactionId.trim() : "";
  const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId.trim() : "";
  if (!transactionId && !invoiceId) return json({ error: "Invalid payload" }, 400);

  const report = await sweepPendingProviderPayments({
    graceMinutes: 0,
    limit: 5,
    match: { transactionId, invoiceId },
  }).catch((error: unknown) => {
    console.error("[travel] mayar forward sweep failed", {
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return null;
  });
  // 200 with checked=0 means the event belongs to another app sharing the Mayar account.
  return json({ ok: true, ...(report ?? { checked: 0, settled: 0, skipped: 0, failed: 1 }) });
}

export const Route = createFileRoute("/api/webhooks/mayar-forward")({
  server: { handlers: { POST: ({ request }) => receive(request) } },
});
