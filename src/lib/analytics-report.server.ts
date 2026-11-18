import { pool } from "../db/client.server";
import { buildWeeklyReport, evaluateAlerts, type ReportInput } from "./analytics-insights";
import { getAlertInput } from "./analytics-insights.server";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0) || 0;

function recipients(): string[] {
  return (process.env["ANALYTICS_REPORT_TO"] ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v));
}

/** ISO week key, e.g. 2026-W47: one report per week even if the timer fires twice. */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function loadReportInput(baseUrl: string, now = new Date()): Promise<ReportInput> {
  const input = await getAlertInput();
  const alerts = evaluateAlerts(input);
  const members = (await pool.query(
    `select count(*)::int as c from customer_profiles where created_at >= now() - interval '7 days'`,
  )) as { rows: Row[] };
  const dest = (await pool.query(
    `with sales as (
       select o.id::text as id, o.total_amount::numeric as amount from customer_orders o
        where o.currency_code = 'IDR' and (o.paid_at is not null or o.status in ('PAYMENT_CONFIRMED','PROVISIONING','READY','INSTALLED'))
          and coalesce(o.paid_at, o.created_at) >= now() - interval '7 days')
     select lower(substring(e.path from '^/destination/([A-Za-z0-9-]+)')) as code,
            sum(s.amount)::numeric as revenue, count(*)::int as orders
       from sales s join site_events e on e.event_name = 'order_start' and e.target = s.id
      where e.path like '/destination/%' group by 1 order by revenue desc limit 3`,
  )) as { rows: Row[] };
  const end = now;
  const start = new Date(now.getTime() - 7 * 86_400_000);
  const fmt = (d: Date) =>
    d.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
  return {
    periodLabel: `${fmt(start)} – ${fmt(end)}`,
    revenue: input.revenue,
    previousRevenue: input.previousRevenue,
    orders: input.orders,
    previousOrders: input.previousOrders,
    newMembers: n(members.rows[0]?.["c"]),
    topDestinations: dest.rows.map((r) => ({
      code: String(r["code"]),
      revenue: n(r["revenue"]),
      orders: n(r["orders"]),
    })),
    alerts,
    baseUrl,
  };
}

export type ReportOutcome =
  | { sent: false; reason: "no_recipients" | "email_not_configured" }
  | { sent: true; recipients: number; week: string };

/** Sends the weekly summary through Helipod Email; the idempotency key makes a repeat harmless. */
export async function sendWeeklyReport(baseUrl: string, now = new Date()): Promise<ReportOutcome> {
  const to = recipients();
  if (to.length === 0) return { sent: false, reason: "no_recipients" };
  const apiKey =
    process.env["HELIPOD_EMAIL_API_KEY"]?.trim() || process.env["HELIPOD_API_KEY"]?.trim();
  const from = process.env["HELIPOD_EMAIL_FROM"]?.trim();
  if (!apiKey || !from) return { sent: false, reason: "email_not_configured" };
  const report = buildWeeklyReport(await loadReportInput(baseUrl, now));
  const week = isoWeekKey(now);
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    accept: "application/json",
  };
  const projectId = process.env["HELIPOD_EMAIL_PROJECT_ID"]?.trim();
  if (projectId) headers["X-Helipod-Project"] = projectId;
  const response = await fetch("https://mail.helipod.io/api/email/send", {
    method: "POST",
    headers,
    body: JSON.stringify({
      from,
      to,
      subject: report.subject,
      html: report.html,
      text: report.text,
      idempotencyKey: `analytics-weekly-${week}`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`helipod_email_http_${response.status}`);
  return { sent: true, recipients: to.length, week };
}
