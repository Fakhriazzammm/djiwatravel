import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { sendWeeklyReport } from "@/lib/analytics-report.server";

/**
 * Weekly analytics summary by e-mail. Called by a timer on the host, never from a browser.
 * Disabled (503) until ANALYTICS_REPORT_TASK_SECRET is set; recipients come from
 * ANALYTICS_REPORT_TO (comma separated).
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
  const configured = (process.env["ANALYTICS_REPORT_TASK_SECRET"] ?? "").trim();
  if (!configured) return json({ error: "task_not_configured" }, 503);
  if (!secretMatches((request.headers.get(TASK_SECRET_HEADER) ?? "").trim(), configured))
    return json({ error: "unauthorized" }, 401);
  try {
    const baseUrl = (process.env["PUBLIC_SITE_URL"] ?? "https://djiwatravel.com").replace(
      /\/$/,
      "",
    );
    const outcome = await sendWeeklyReport(baseUrl);
    return json({ ok: true, ...outcome });
  } catch (error) {
    console.error("[travel] analytics report task failed", {
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return json({ error: "report_unavailable" }, 502);
  }
}

export const Route = createFileRoute("/api/tasks/analytics-report")({
  server: { handlers: { POST: ({ request }) => run(request) } },
});
