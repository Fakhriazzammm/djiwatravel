import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { refreshTravelOrderProvisioning, activeProvisioningOrderIds } from "@/lib/esim-provisioning-refresh.server";

/**
 * Scheduled provider sync: eSIM Access only reports status, activation expiry and data usage through
 * its webhook, and that webhook is not registered on this deployment, so this task pulls the
 * provider state for active orders. It is called by a timer on the host, never from a browser.
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
  if (request.headers.get("origin") || request.headers.get("referer")) return json({ error: "server_only" }, 403);
  const configured = (process.env["ESIM_SYNC_TASK_SECRET"] ?? "").trim();
  if (!configured) return json({ error: "task_not_configured" }, 503);
  if (!secretMatches((request.headers.get(TASK_SECRET_HEADER) ?? "").trim(), configured)) return json({ error: "unauthorized" }, 401);

  const orderIds = await activeProvisioningOrderIds(50);
  let ready = 0;
  let pending = 0;
  const failed: string[] = [];
  for (const orderId of orderIds) {
    try {
      const result = await refreshTravelOrderProvisioning(orderId, { force: true });
      if (result.installable) ready += 1;
      else pending += 1;
    } catch (error) {
      failed.push(orderId);
      console.error("[esim] scheduled sync failed", { orderId, reason: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
    }
  }
  return json({ ok: true, checked: orderIds.length, ready, pending, failed: failed.length });
}

export const Route = createFileRoute("/api/tasks/esim-sync")({
  server: { handlers: { POST: ({ request }) => run(request) } },
});
