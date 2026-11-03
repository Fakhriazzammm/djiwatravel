import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import {
  siteEventInput,
  type SiteEventInput,
  type SiteTraffic,
  type TrafficPeriod,
} from "./site-events";

/** Records one anonymous event. Invalid input is rejected; storage failures never surface to users. */
export async function recordSiteEvent(raw: unknown): Promise<{ ok: true }> {
  const input: SiteEventInput = siteEventInput.parse(raw);
  try {
    await pool.query(
      `insert into site_events (event_name, path, target, session_id, referrer_host, utm_source, device)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.name,
        input.path,
        input.target ?? null,
        input.sessionId,
        input.referrerHost ?? null,
        input.utmSource ?? null,
        input.device,
      ],
    );
  } catch (error) {
    console.warn("[travel] site event not stored", error instanceof Error ? error.message : "");
  }
  return { ok: true };
}

const DAY_START = `(date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta')`;

function windowSql(period: TrafficPeriod) {
  const start =
    period === "daily"
      ? DAY_START
      : period === "weekly"
        ? `((date_trunc('week', now() at time zone 'Asia/Jakarta')) at time zone 'Asia/Jakarta')`
        : `((date_trunc('month', now() at time zone 'Asia/Jakarta')) at time zone 'Asia/Jakarta')`;
  const length =
    period === "daily"
      ? "interval '1 day'"
      : period === "weekly"
        ? "interval '7 days'"
        : "interval '1 month'";
  return { start, end: `(${start} + ${length})`, length };
}

/** Traffic for the Jakarta-calendar period; null when the table is not migrated yet. */
export async function getSiteTrafficHandler(period: TrafficPeriod): Promise<SiteTraffic | null> {
  await requireAdmin();
  const w = windowSql(period);
  const inWindow = `created_at >= ${w.start} and created_at < ${w.end}`;
  const trunc = period === "daily" ? "hour" : "day";
  const step = period === "daily" ? "interval '1 hour'" : "interval '1 day'";
  const fmt = period === "daily" ? "HH24:00" : "MM-DD";
  try {
    const [totals, previous, series, pages, sources, devices, clicks, bounce] = await Promise.all([
      pool.query(
        `select count(distinct session_id)::int as visitors,
                count(*) filter (where event_name = 'page_view')::int as page_views,
                count(*) filter (where event_name = 'click')::int as clicks,
                count(*) filter (where event_name = 'checkout_start')::int as checkout_starts,
                count(*) filter (where event_name = 'finder_submit')::int as finder_submits
         from site_events where ${inWindow}`,
      ),
      pool.query(
        `select count(distinct session_id)::int as visitors,
                count(*) filter (where event_name = 'page_view')::int as page_views,
                count(*) filter (where event_name = 'click')::int as clicks
         from site_events
         where created_at >= ${w.start} - ${w.length} and created_at < ${w.start}`,
      ),
      pool.query(
        `with b as (
           select s as bucket from generate_series(
             date_trunc('${trunc}', ${w.start} at time zone 'Asia/Jakarta'),
             least(${w.end} at time zone 'Asia/Jakarta' - ${step}, date_trunc('${trunc}', now() at time zone 'Asia/Jakarta')),
             ${step}) s)
         select to_char(b.bucket, '${fmt}') as bucket,
                count(distinct e.session_id)::int as visitors,
                count(*) filter (where e.event_name = 'page_view')::int as page_views,
                count(*) filter (where e.event_name = 'click')::int as clicks
         from b left join site_events e
           on date_trunc('${trunc}', e.created_at at time zone 'Asia/Jakarta') = b.bucket
          and e.created_at >= ${w.start} and e.created_at < ${w.end}
         group by b.bucket order by b.bucket`,
      ),
      pool.query(
        `select path, count(*)::int as views, count(distinct session_id)::int as visitors
         from site_events where event_name = 'page_view' and ${inWindow}
         group by path order by views desc, path limit 6`,
      ),
      pool.query(
        `select coalesce(nullif(utm_source, ''), nullif(referrer_host, ''), 'Langsung') as label,
                count(distinct session_id)::int as visitors
         from site_events where ${inWindow}
         group by 1 order by visitors desc, label limit 5`,
      ),
      pool.query(
        `select device, count(distinct session_id)::int as visitors
         from site_events where ${inWindow} group by device order by visitors desc`,
      ),
      pool.query(
        `select target, count(*)::int as clicks from site_events
         where event_name = 'click' and target is not null and ${inWindow}
         group by target order by clicks desc, target limit 6`,
      ),
      pool.query(
        `select count(*)::int as n from (
           select session_id from site_events
           where event_name = 'page_view' and ${inWindow}
           group by session_id having count(*) = 1) s`,
      ),
    ]);
    const t = totals.rows[0] ?? {};
    const p = previous.rows[0] ?? {};
    return {
      period,
      visitors: Number(t.visitors ?? 0),
      pageViews: Number(t.page_views ?? 0),
      clicks: Number(t.clicks ?? 0),
      checkoutStarts: Number(t.checkout_starts ?? 0),
      finderSubmits: Number(t.finder_submits ?? 0),
      bounceSessions: Number(bounce.rows[0]?.n ?? 0),
      previous: {
        visitors: Number(p.visitors ?? 0),
        pageViews: Number(p.page_views ?? 0),
        clicks: Number(p.clicks ?? 0),
      },
      series: series.rows.map((r) => ({
        bucket: String(r.bucket),
        visitors: Number(r.visitors),
        pageViews: Number(r.page_views),
        clicks: Number(r.clicks),
      })),
      topPages: pages.rows.map((r) => ({
        path: String(r.path),
        views: Number(r.views),
        visitors: Number(r.visitors),
      })),
      sources: sources.rows.map((r) => ({ label: String(r.label), visitors: Number(r.visitors) })),
      devices: devices.rows.map((r) => ({
        device: String(r.device),
        visitors: Number(r.visitors),
      })),
      topClicks: clicks.rows.map((r) => ({ target: String(r.target), clicks: Number(r.clicks) })),
    };
  } catch {
    // The table may not be migrated yet: say "unavailable", never an invented zero.
    return null;
  }
}
