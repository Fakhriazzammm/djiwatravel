import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { reconcileTravelFinance } from "@/lib/travel-finance-reconcile.server";

/**
 * Scheduled finance reconciliation: the customer-facing settlement is best-effort, so this task
 * compares locally settled orders against the Travel finance book and re-posts the ones that never
 * arrived. Called by a timer on the host, never from a browser.
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
  const configured = (process.env["FINANCE_RECONCILE_TASK_SECRET"] ?? "").trim();
  if (!configured) return json({ error: "task_not_configured" }, 503);
  if (!secretMatches((request.headers.get(TASK_SECRET_HEADER) ?? "").trim(), configured))
    return json({ error: "unauthorized" }, 401);

  try {
    const report = await reconcileTravelFinance(14);
    return json({ ok: true, ...report });
  } catch (error) {
    console.error("[travel] finance reconcile task failed", {
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return json({ error: "reconcile_unavailable" }, 502);
  }
}

export const Route = createFileRoute("/api/tasks/finance-reconcile")({
  server: { handlers: { POST: ({ request }) => run(request) } },
});
