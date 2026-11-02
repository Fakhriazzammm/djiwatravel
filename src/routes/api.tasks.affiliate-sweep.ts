import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled affiliate sweep: accrues commissions for settled referred orders, reverses refunded
 * ones and approves matured ones. Idempotent; called by a host timer, never from a browser.
 */

const TASK_SECRET_HEADER = "x-djiwa-task-secret";

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function secretMatches(supplied: string, configured: string) {
  if (!configured) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(request: Request) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (request.headers.get("origin") || request.headers.get("referer"))
    return json({ error: "server_only" }, 403);
  const configured = (process.env["AFFILIATE_TASK_SECRET"] ?? "").trim();
  if (!configured) return json({ error: "task_not_configured" }, 503);
  if (!secretMatches((request.headers.get(TASK_SECRET_HEADER) ?? "").trim(), configured))
    return json({ error: "unauthorized" }, 401);
  try {
    const { runAffiliateSweep } = await import("@/lib/affiliate.server");
    return json({ ok: true, ...(await runAffiliateSweep()) });
  } catch (error) {
    console.error("[travel] affiliate sweep task failed", {
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return json({ error: "sweep_unavailable" }, 502);
  }
}

export const Route = createFileRoute("/api/tasks/affiliate-sweep")({
  server: { handlers: { POST: ({ request }) => run(request) } },
});
