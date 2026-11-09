import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import { AI_REFERRER_HOSTS, channelFor } from "./traffic-census";
import type { Named, Point, TrafficDashboard, TrafficRange } from "./traffic-dashboard";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0) || 0;
const TZ = "Asia/Jakarta";
const PAID_ESIM = `(o.paid_at is not null or o.status in ('PAYMENT_CONFIRMED','PROVISIONING','READY','INSTALLED'))`;
const AI_HOSTS_SQL = `(${AI_REFERRER_HOSTS.map((h) => `'${h}'`).join(",")})`;

/** Window start and bucket size for a range. Values are fixed strings, never user input. */
function windowFor(range: TrafficRange) {
  if (range === "24j")
    return { since: `now() - interval '24 hours'`, unit: "hour", step: "1 hour", fmt: "HH24:00" };
  const days = range === "7h" ? 6 : range === "30h" ? 29 : 364;
  const base = `(date_trunc('day', now() at time zone '${TZ}') - interval '${days} days') at time zone '${TZ}'`;
  const since =
    range === "all"
      ? `greatest((select coalesce(min(created_at), now()) from site_events), ${base})`
      : base;
  return { since, unit: "day", step: "1 day", fmt: "DD Mon" };
}

function named(rows: Row[], label = "label", value = "value", tag?: string): Named[] {
  return rows.map((r) => ({
    label: String(r[label] ?? ""),
    value: n(r[value]),
    ...(tag && r[tag] ? { tag: String(r[tag]) } : {}),
  }));
}

export async function getTrafficDashboardHandler(
  range: TrafficRange,
): Promise<TrafficDashboard | null> {
  await requireAdmin();
  const w = windowFor(range);
  const SINCE = `(select ${w.since})`;
  const bucketSeries = `generate_series(
      date_trunc('${w.unit}', ${SINCE} at time zone '${TZ}'),
      date_trunc('${w.unit}', now() at time zone '${TZ}'), interval '${w.step}')`;
  const q = (text: string, params: unknown[] = []) =>
    pool.query(text, params).then((r) => r.rows as Row[]);
  const series = (table: "e" | "b", where: string, extra = "") =>
    q(
      `with b as (select s as bucket from ${bucketSeries} s)
       select to_char(b.bucket, '${w.fmt}') as label, count(x.*)::int as value
       from b left join ${table === "e" ? "site_events" : "traffic_bot_hits"} x
         on date_trunc('${w.unit}', x.created_at at time zone '${TZ}') = b.bucket
        and x.created_at >= ${SINCE} ${extra} and ${where}
       group by b.bucket order by b.bucket`,
    );

  try {
    const sales = `
      with sales as (
        select o.id::text as id,
               case when o.fulfillment_mode = 'preorder' then 'Preorder eSIM' else 'eSIM' end as product,
               coalesce((select i.package_name_snapshot from customer_order_items i where i.order_id = o.id limit 1), 'eSIM') as label,
               o.total_amount::numeric as amount, coalesce(o.paid_at, o.created_at) as at, o.status as status
          from customer_orders o
         where o.currency_code = 'IDR' and ${PAID_ESIM}
        union all
        select s.id::text, 'Titip Belanja', 'Titip Belanja ' || s.public_code,
               s.total_idr::numeric, s.paid_at, s.status
          from shopping_orders s
         where s.paid_at is not null and s.status not in ('PAYMENT_PENDING','CANCELLED','EXPIRED')
      )`;
    const [
      live,
      livePaths,
      totals24,
      totalsAll,
      people24,
      peopleAll,
      ai24,
      aiAll,
      sPeople,
      sAnswers,
      sAiClicks,
      sRevenue,
      pages,
      refs,
      devices,
      assistants,
      aiPages,
      crawlers,
      kinds,
      aiClicks,
      notCounted,
      salesKpi,
      salesPrev,
      funnel,
      byProduct,
      bySource,
      byPage,
      recent,
      actPre,
      actShop,
      actRefund,
      actFail,
      since,
    ] = await Promise.all([
      q(
        `select count(distinct session_id)::int as v from site_events where event_name='page_view' and created_at > now() - interval '5 minutes'`,
      ),
      q(
        `select path as label, count(distinct session_id)::int as value from site_events where event_name='page_view' and created_at > now() - interval '5 minutes' group by path order by value desc, path limit 5`,
      ),
      q(`select
           (select count(*) from site_events where event_name='page_view' and created_at > now() - interval '24 hours')::int as people,
           count(*) filter (where kind='ai_answer')::int as ai_answers,
           count(*) filter (where kind in ('ai_crawl','ai_train'))::int as ai_crawl,
           count(*) filter (where kind='search_engine')::int as search_engine
         from traffic_bot_hits where created_at > now() - interval '24 hours'`),
      q(`select
           (select count(*) from site_events where event_name='page_view')::int as people,
           count(*) filter (where kind='ai_answer')::int as ai_answers,
           count(*) filter (where kind in ('ai_crawl','ai_train'))::int as ai_crawl,
           count(*) filter (where kind='search_engine')::int as search_engine
         from traffic_bot_hits`),
      q(
        `select count(*)::int as views, count(distinct session_id)::int as visitors from site_events where event_name='page_view' and created_at > now() - interval '24 hours'`,
      ),
      q(`select count(*)::int as views from site_events where event_name='page_view'`),
      q(
        `select count(*) filter (where kind='ai_answer')::int as answers, count(*) filter (where kind in ('ai_crawl','ai_train'))::int as crawls from traffic_bot_hits where created_at > now() - interval '24 hours'`,
      ),
      q(`select count(*)::int as answers from traffic_bot_hits where kind='ai_answer'`),
      series("e", `x.event_name='page_view'`),
      series("b", `x.kind='ai_answer'`),
      series("e", `x.event_name='page_view' and x.referrer_host in ${AI_HOSTS_SQL}`),
      q(`${sales}
         select to_char(b.bucket, '${w.fmt}') as label, coalesce(sum(s.amount),0)::numeric as value
         from (select s as bucket from ${bucketSeries} s) b
         left join sales s on date_trunc('${w.unit}', s.at at time zone '${TZ}') = b.bucket and s.at >= ${SINCE}
         group by b.bucket order by b.bucket`),
      q(
        `select path as label, count(*)::int as value from site_events where event_name='page_view' and created_at >= ${SINCE} group by path order by value desc, path limit 8`,
      ),
      q(
        `select coalesce(nullif(referrer_host,''), nullif(utm_source,''), '(langsung)') as label, count(*)::int as value from site_events where event_name='page_view' and created_at >= ${SINCE} group by 1 order by value desc, label limit 7`,
      ),
      q(
        `select device as label, count(distinct session_id)::int as value from site_events where event_name='page_view' and created_at >= ${SINCE} group by device order by value desc`,
      ),
      q(
        `select bot as label, count(*)::int as value from traffic_bot_hits where kind='ai_answer' and created_at >= ${SINCE} group by bot order by value desc limit 6`,
      ),
      q(
        `select path as label, count(*)::int as value from traffic_bot_hits where kind='ai_answer' and created_at >= ${SINCE} group by path order by value desc, path limit 8`,
      ),
      q(
        `select bot as label, count(*)::int as value, kind as tag from traffic_bot_hits where kind in ('ai_crawl','ai_train','search_engine') and created_at >= ${SINCE} group by bot, kind order by value desc limit 10`,
      ),
      q(
        `select count(*) filter (where kind='ai_answer')::int as ai_answers, count(*) filter (where kind='ai_crawl')::int as ai_crawl, count(*) filter (where kind='ai_train')::int as ai_train, count(*) filter (where kind='search_engine')::int as search_engine from traffic_bot_hits where created_at >= ${SINCE}`,
      ),
      q(
        `select count(distinct session_id)::int as v from site_events where event_name='page_view' and referrer_host in ${AI_HOSTS_SQL} and created_at >= ${SINCE}`,
      ),
      q(
        `select count(*)::int as v from traffic_bot_hits where kind='unknown_bot' and created_at >= ${SINCE}`,
      ),
      q(
        `${sales} select coalesce(sum(amount),0)::numeric as revenue, count(*)::int as orders from sales where at >= ${SINCE}`,
      ),
      q(
        `${sales} select coalesce(sum(amount),0)::numeric as revenue, count(*)::int as orders from sales where at >= ${SINCE} - (now() - ${SINCE}) and at < ${SINCE}`,
      ),
      q(`select
           (select count(distinct session_id) from site_events where event_name='page_view' and created_at >= ${SINCE})::int as visitors,
           (select count(distinct session_id) from site_events where created_at >= ${SINCE} and (event_name in ('destination_view','finder_submit') or (event_name='page_view' and (path like '/plan/%' or path like '/destination/%' or path like '/titip-belanja%'))))::int as browsed,
           (select count(distinct session_id) from site_events where event_name='checkout_start' and created_at >= ${SINCE})::int as checkout`),
      q(
        `${sales} select product as label, coalesce(sum(amount),0)::numeric as value, count(*)::int as orders from sales where at >= ${SINCE} group by product order by value desc`,
      ),
      q(`${sales} select coalesce(nullif(e.utm_source,''), nullif(e.referrer_host,''), case when e.id is null then 'Tidak terlacak' else '(langsung)' end) as label,
                sum(s.amount)::numeric as value, count(*)::int as orders
           from sales s left join site_events e on e.event_name='order_start' and e.target = s.id
          where s.at >= ${SINCE} group by 1 order by value desc limit 7`),
      q(`${sales} select coalesce(e.path, 'Tidak terlacak') as label, sum(s.amount)::numeric as value, count(*)::int as orders
           from sales s left join site_events e on e.event_name='order_start' and e.target = s.id
          where s.at >= ${SINCE} group by 1 order by value desc limit 6`),
      q(`${sales} select s.at::text as at, s.label, s.status, s.amount::numeric as amount,
                coalesce(nullif(e.utm_source,''), nullif(e.referrer_host,''), case when e.id is null then 'Tidak terlacak' else '(langsung)' end) as source
           from sales s left join site_events e on e.event_name='order_start' and e.target = s.id
          order by s.at desc limit 8`),
      q(
        `select count(*)::int as v from customer_orders where preorder_status in ('pending','processing') and preorder_deadline_at < now() + interval '1 day'`,
      ),
      q(`select count(*)::int as v from shopping_orders where status = 'PAID'`),
      q(`select count(*)::int as v from shopping_orders where refund_needed`),
      q(`select count(*)::int as v from customer_orders where status = 'PROVISIONING_FAILED'`),
      q(`select ${SINCE}::text as v`),
    ]);

    const channelTotals = new Map<string, number>();
    for (const r of await q(
      `select referrer_host, utm_source, count(distinct session_id)::int as v from site_events where event_name='page_view' and created_at >= ${SINCE} group by 1, 2`,
    )) {
      const c = channelFor(r["referrer_host"] as string | null, r["utm_source"] as string | null);
      channelTotals.set(c, (channelTotals.get(c) ?? 0) + n(r["v"]));
    }
    const channels: Named[] = [...channelTotals]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    const kind = (r?: Row) => ({
      people: n(r?.["people"]),
      aiAnswers: n(r?.["ai_answers"]),
      aiCrawl: n(r?.["ai_crawl"]),
      searchEngine: n(r?.["search_engine"]),
    });
    const k = kinds[0];
    const sk = salesKpi[0];
    const visitors = n(funnel[0]?.["visitors"]);
    const orders = n(sk?.["orders"]);
    const revenue = n(sk?.["revenue"]);
    const pts = (rows: Row[]): Point[] =>
      rows.map((r) => ({ label: String(r["label"]), value: n(r["value"]) }));
    const withOrders = (rows: Row[]) =>
      rows.map((r) => ({
        label: String(r["label"]),
        value: n(r["value"]),
        orders: n(r["orders"]),
      }));
    return {
      range,
      updatedAt: new Date().toISOString(),
      since: since[0] ? String(since[0]["v"]) : null,
      live: { online: n(live[0]?.["v"]), paths: named(livePaths) },
      total24h: kind(totals24[0]),
      totalAll: kind(totalsAll[0]),
      people: {
        views24h: n(people24[0]?.["views"]),
        visitors24h: n(people24[0]?.["visitors"]),
        viewsAll: n(peopleAll[0]?.["views"]),
      },
      ai: {
        answers24h: n(ai24[0]?.["answers"]),
        crawls24h: n(ai24[0]?.["crawls"]),
        answersAll: n(aiAll[0]?.["answers"]),
      },
      series: {
        people: pts(sPeople),
        aiAnswers: pts(sAnswers),
        aiClicks: pts(sAiClicks),
        revenue: pts(sRevenue),
      },
      pages: named(pages),
      referrers: named(refs),
      channels,
      devices: named(devices),
      assistants: named(assistants),
      aiPages: named(aiPages),
      crawlers: named(crawlers, "label", "value", "tag"),
      kinds: {
        aiAnswers: n(k?.["ai_answers"]),
        aiClicks: n(aiClicks[0]?.["v"]),
        aiCrawl: n(k?.["ai_crawl"]),
        aiTrain: n(k?.["ai_train"]),
        searchEngine: n(k?.["search_engine"]),
      },
      notCounted: n(notCounted[0]?.["v"]),
      sales: {
        revenue,
        previousRevenue: n(salesPrev[0]?.["revenue"]),
        orders,
        previousOrders: n(salesPrev[0]?.["orders"]),
        aov: orders > 0 ? Math.round(revenue / orders) : 0,
        visitors,
        conversionPct: visitors > 0 ? Math.round((orders / visitors) * 1000) / 10 : null,
        funnel: [
          { label: "Pengunjung", value: visitors },
          { label: "Lihat paket / produk", value: n(funnel[0]?.["browsed"]) },
          { label: "Mulai checkout", value: n(funnel[0]?.["checkout"]) },
          { label: "Bayar berhasil", value: orders },
        ],
        byProduct: withOrders(byProduct),
        bySource: withOrders(bySource),
        byPage: withOrders(byPage),
        recent: recent.map((r) => ({
          at: String(r["at"]),
          label: String(r["label"]),
          source: String(r["source"]),
          status: String(r["status"]),
          amount: n(r["amount"]),
        })),
        actions: [
          {
            label: "Preorder eSIM mendekati batas 3 hari",
            value: n(actPre[0]?.["v"]),
            href: "/admin/preorders",
          },
          {
            label: "Titip Belanja dibayar, menunggu dibeli",
            value: n(actShop[0]?.["v"]),
            href: "/admin/shopping",
          },
          {
            label: "Refund Titip Belanja menunggu",
            value: n(actRefund[0]?.["v"]),
            href: "/admin/shopping",
          },
          {
            label: "Provisioning eSIM gagal",
            value: n(actFail[0]?.["v"]),
            href: "/admin/provisioning",
          },
        ],
      },
    };
  } catch (error) {
    // Not migrated yet (057): say unavailable, never an invented zero.
    console.warn(
      "[travel] traffic dashboard unavailable",
      error instanceof Error ? error.message : "",
    );
    return null;
  }
}
