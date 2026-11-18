import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import {
  buildCohorts,
  healthScore,
  INSIGHT_RANGE_DAYS,
  MIN_GROUP_SIZE,
  RFM_HINT,
  RFM_LABEL,
  RFM_ORDER,
  rfmSegment,
  type AnalyticsInsights,
  type DestinationInsight,
  type FunnelInsight,
  type FunnelStep,
  type InsightRange,
  type InsightResult,
  type InsightTab,
  type Named,
  type Point,
  type RevenueInsight,
  type RfmSegment,
  type UsersInsight,
} from "./analytics-insights";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0) || 0;
const TZ = "Asia/Jakarta";
const COHORT_WEEKS = 12;
const PAID_ESIM = `(o.paid_at is not null or o.status in ('PAYMENT_CONFIRMED','PROVISIONING','READY','INSTALLED'))`;
const BUCKET = `date_trunc('day', %s at time zone '${TZ}')`;

const q = (text: string, params: unknown[] = []) =>
  pool.query(text, params).then((r) => r.rows as Row[]);

/** One failing query must not blank the whole tab: report it and keep the rest of the page alive. */
async function guarded<T>(label: string, run: () => Promise<T>): Promise<InsightResult<T>> {
  try {
    return { data: await run(), error: null };
  } catch (error) {
    console.error(
      `analytics_insights_${label}_failed`,
      error instanceof Error ? error.message : error,
    );
    return { data: null, error: "Data belum bisa dimuat. Coba muat ulang beberapa saat lagi." };
  }
}

const since = (days: number) => `now() - (${days}::int * interval '1 day')`;
const priorSince = (days: number) => `now() - (${days * 2}::int * interval '1 day')`;

/** Paid eSIM orders and paid Titip Belanja orders as one list of sales. */
const SALES_CTE = `
  sales as (
    select o.id::text as id,
           case when o.fulfillment_mode = 'preorder' then 'Preorder eSIM' else 'eSIM' end as product,
           o.total_amount::numeric as amount, coalesce(o.paid_at, o.created_at) as at,
           o.customer_auth_subject as subject, o.payment_provider as provider
      from customer_orders o
     where o.currency_code = 'IDR' and ${PAID_ESIM}
    union all
    select s.id::text, 'Titip Belanja', s.total_idr::numeric, s.paid_at,
           s.customer_auth_subject, null
      from shopping_orders s
     where s.paid_at is not null
  )`;

/** Every paid order attributed to a person: member subject, or a stable guest key from the e-mail. */
const BUYER_CTE = `
  paid as (
    select coalesce(o.customer_auth_subject, 'guest:' || md5(lower(a.email))) as subject,
           o.total_amount::numeric as amount, coalesce(o.paid_at, o.created_at) as at
      from customer_orders o
      left join lateral (select g.email from guest_order_access g where g.order_id = o.id
                          order by g.created_at desc limit 1) a on true
     where o.currency_code = 'IDR' and ${PAID_ESIM}
       and (o.customer_auth_subject is not null or a.email is not null)
    union all
    select s.customer_auth_subject, s.total_idr::numeric, s.paid_at
      from shopping_orders s
     where s.paid_at is not null and s.customer_auth_subject is not null
  ),
  buyer as (
    select subject, count(*)::int as orders, sum(amount)::numeric as revenue,
           max(at) as last_at, min(at) as first_at
      from paid where subject not like 'seed:%' and subject not like 'system:%' group by subject
  )`;

// ------------------------------------------------------------------ Pengguna

async function usersInsight(range: InsightRange): Promise<UsersInsight> {
  const days = INSIGHT_RANGE_DAYS[range];
  const [
    totals,
    signups,
    buyers,
    devices,
    hours,
    weekdays,
    sources,
    activation,
    cohortRows,
    openSupport,
    refunds,
    failed,
    gaps,
  ] = await Promise.all([
    q(`select
         (select count(*) from customer_profiles)::int as members,
         (select count(distinct lower(a.email)) from guest_order_access a
            join customer_orders o on o.id = a.order_id
           where o.customer_auth_subject is null and a.email is not null)::int as guests,
         (select count(*) from customer_profiles where created_at >= ${since(days)})::int as new_members,
         (select count(*) from customer_profiles where created_at >= ${priorSince(days)}
             and created_at < ${since(days)})::int as prev_new`),
    q(
      `with d as (select generate_series(
           date_trunc('day', (${since(days - 1)}) at time zone '${TZ}'),
           date_trunc('day', now() at time zone '${TZ}'), interval '1 day') as day)
       select to_char(d.day, 'DD Mon') as label, count(p.auth_user_id)::int as value
         from d left join customer_profiles p
           on date_trunc('day', p.created_at at time zone '${TZ}') = d.day
        group by d.day order by d.day`,
    ),
    q(`with ${BUYER_CTE}
       select b.subject, b.orders, b.revenue::text as revenue, b.last_at::text as last_at,
              floor(extract(epoch from (now() - b.last_at)) / 86400)::int as days_since,
              coalesce(cp.display_name, cp.email,
                       (select lower(g.email) from guest_order_access g
                          join customer_orders o on o.id = g.order_id
                         where b.subject = 'guest:' || md5(lower(g.email)) limit 1),
                       'Pelanggan') as name,
              (cp.auth_user_id is not null) as is_member
         from buyer b left join customer_profiles cp on cp.auth_user_id = b.subject
        order by b.revenue desc limit 5000`),
    q(`select coalesce(device,'other') as label, count(distinct session_id)::int as value
         from site_events where event_name='page_view' and created_at >= ${since(days)}
        group by 1 order by value desc`),
    q(`select lpad(extract(hour from created_at at time zone '${TZ}')::int::text, 2, '0') || ':00' as label,
              count(distinct session_id)::int as value
         from site_events where event_name='page_view' and created_at >= ${since(days)}
        group by 1 order by 1`),
    q(`select extract(isodow from created_at at time zone '${TZ}')::int as dow,
              count(distinct session_id)::int as value
         from site_events where event_name='page_view' and created_at >= ${since(days)}
        group by 1 order by 1`),
    q(`select coalesce(nullif(utm_source,''), nullif(referrer_host,''), '(langsung)') as label,
              count(distinct session_id)::int as value
         from site_events where event_name='page_view' and created_at >= ${since(days)}
        group by 1 order by value desc limit 8`),
    q(`with m as (select auth_user_id as s from customer_profiles where created_at >= ${since(days)})
       select (select count(*) from m)::int as signed,
              (select count(*) from m where exists (select 1 from customer_orders o where o.customer_auth_subject = m.s))::int as ordered,
              (select count(*) from m where exists (select 1 from customer_orders o where o.customer_auth_subject = m.s and ${PAID_ESIM}))::int as paid,
              (select count(*) from m where exists (select 1 from travel_trips t where t.customer_auth_subject = m.s))::int as trip,
              (select count(*) from m where exists (select 1 from customer_orders o where o.customer_auth_subject = m.s and ${PAID_ESIM})
                  and (exists (select 1 from travel_trips t where t.customer_auth_subject = m.s)
                    or exists (select 1 from shopping_orders s2 where s2.customer_auth_subject = m.s)))::int as second_feature`),
    q(`with ${BUYER_CTE},
       base as (select subject, min(at) as first_at, array_agg(at) as ats from paid
                 where subject not like 'seed:%' and subject not like 'system:%' group by subject)
       select to_char(date_trunc('week', first_at at time zone '${TZ}'), 'YYYY-MM-DD') as cohort,
              (select array_agg(distinct floor(extract(epoch from (x - base.first_at)) / 604800)::int) from unnest(base.ats) x) as weeks
         from base where first_at >= now() - interval '${COHORT_WEEKS + 1} weeks'`),
    q(`select customer_id as subject, count(*)::int as n from support_cases
        where status not in ('resolved','closed') and customer_id is not null group by 1`),
    q(
      `select recipient_customer_auth_subject as subject, count(*)::int as n from refund_requests group by 1`,
    ),
    q(`select customer_auth_subject as subject, count(*)::int as n from customer_orders
        where status = 'PROVISIONING_FAILED' and customer_auth_subject is not null group by 1`),
    q(`with ${BUYER_CTE},
       ordered as (select subject, at, lag(at) over (partition by subject order by at) as prev from paid)
       select percentile_cont(0.5) within group (order by extract(epoch from (at - prev)) / 86400)::float as median_days
         from ordered where prev is not null`),
  ]);

  const t = totals[0] ?? {};
  const supportBy = new Map(openSupport.map((r) => [String(r["subject"]), n(r["n"])]));
  const refundBy = new Map(refunds.map((r) => [String(r["subject"]), n(r["n"])]));
  const failedBy = new Map(failed.map((r) => [String(r["subject"]), n(r["n"])]));

  const people = buyers.map((r) => {
    const orders = n(r["orders"]);
    const daysSince = r["days_since"] === null ? null : n(r["days_since"]);
    const subject = String(r["subject"]);
    return {
      subject,
      name: String(r["name"] ?? "Pelanggan"),
      orders,
      revenue: n(r["revenue"]),
      lastOrderAt: r["last_at"] ? String(r["last_at"]) : null,
      daysSince,
      segment: rfmSegment(orders, daysSince),
      health: healthScore({
        paidOrders: orders,
        daysSinceLast: daysSince,
        openSupport: supportBy.get(subject) ?? 0,
        refunds: refundBy.get(subject) ?? 0,
        failedOrders: failedBy.get(subject) ?? 0,
      }),
      customerId: subject.startsWith("guest:") ? null : subject,
    };
  });

  const segCount = new Map<RfmSegment, { count: number; revenue: number }>();
  for (const p of people) {
    const cur = segCount.get(p.segment) ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += p.revenue;
    segCount.set(p.segment, cur);
  }
  const memberBuyers = people.filter((p) => !p.subject.startsWith("guest:")).length;
  segCount.set("prospect", {
    count: Math.max(0, n(t["members"]) - memberBuyers),
    revenue: 0,
  });

  const buyersCount = people.length;
  const repeat = people.filter((p) => p.orders >= 2).length;
  const totalRevenue = people.reduce((s, p) => s + p.revenue, 0);
  const totalOrders = people.reduce((s, p) => s + p.orders, 0);

  const cohorts = buildCohorts(
    cohortRows.map((r) => ({
      firstWeek: String(r["cohort"]),
      weeksActive: Array.isArray(r["weeks"]) ? (r["weeks"] as unknown[]).map(Number) : [],
    })),
    COHORT_WEEKS,
    (cohort) =>
      Math.floor((Date.now() - new Date(`${cohort}T00:00:00+07:00`).getTime()) / (7 * 86_400_000)),
  );

  const a = activation[0] ?? {};
  const weekdayNames = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
  const weekdayMap = new Map(weekdays.map((r) => [n(r["dow"]), n(r["value"])]));

  return {
    totals: {
      members: n(t["members"]),
      guests: n(t["guests"]),
      newMembers: n(t["new_members"]),
      previousNewMembers: n(t["prev_new"]),
      buyers: buyersCount,
      repeatBuyers: repeat,
      repeatRatePct: buyersCount > 0 ? Math.round((repeat / buyersCount) * 1000) / 10 : null,
      avgOrdersPerBuyer: buyersCount > 0 ? Math.round((totalOrders / buyersCount) * 10) / 10 : null,
      avgLtvIdr: buyersCount > 0 ? Math.round(totalRevenue / buyersCount) : null,
      medianDaysBetweenOrders:
        gaps[0]?.["median_days"] == null ? null : Math.round(n(gaps[0]["median_days"]) * 10) / 10,
    },
    signups: signups.map((r) => ({ label: String(r["label"]), value: n(r["value"]) })),
    segments: RFM_ORDER.map((segment) => ({
      segment,
      label: RFM_LABEL[segment],
      hint: RFM_HINT[segment],
      count: segCount.get(segment)?.count ?? 0,
      revenue: segCount.get(segment)?.revenue ?? 0,
    })),
    cohorts,
    activation: [
      { key: "signed", label: "Daftar", value: n(a["signed"]) },
      { key: "ordered", label: "Membuat pesanan", value: n(a["ordered"]) },
      { key: "paid", label: "Membayar", value: n(a["paid"]) },
      { key: "second", label: "Memakai fitur kedua", value: n(a["second_feature"]) },
    ],
    devices: hideSmall(devices),
    hours: hours.map((r) => ({ label: String(r["label"]), value: n(r["value"]) })),
    weekdays: weekdayNames.map((label, i) => ({ label, value: weekdayMap.get(i + 1) ?? 0 })),
    sources: hideSmall(sources),
    topCustomers: people.slice(0, 15).map((p) => ({
      subject: p.subject,
      name: p.name,
      orders: p.orders,
      revenue: p.revenue,
      lastOrderAt: p.lastOrderAt,
      segment: p.segment,
      health: p.health,
      customerId: p.customerId,
    })),
    atRisk: people
      .filter((p) => (p.segment === "at_risk" || p.segment === "sleeping") && p.orders >= 2)
      .sort((x, y) => y.revenue - x.revenue)
      .slice(0, 15)
      .map((p) => ({
        subject: p.subject,
        name: p.name,
        orders: p.orders,
        revenue: p.revenue,
        daysSinceLast: p.daysSince ?? 0,
        customerId: p.customerId,
      })),
  };
}

function hideSmall(rows: Row[]): Named[] {
  return rows
    .map((r) => ({ label: String(r["label"] ?? ""), value: n(r["value"]) }))
    .filter((r) => r.value >= MIN_GROUP_SIZE);
}

// ------------------------------------------------------------------ Funnel

const SESSION_CTE = (from: string, to: string) => `
  s as (
    select e.session_id,
           (array_agg(coalesce(e.device,'other') order by e.created_at))[1] as device,
           (array_agg(coalesce(nullif(e.utm_source,''), nullif(e.referrer_host,''), '(langsung)')
                      order by e.created_at))[1] as src,
           bool_or(e.event_name = 'page_view') as visited,
           bool_or(e.event_name in ('destination_view','finder_submit')
                   or (e.event_name = 'page_view' and (e.path like '/plan/%' or e.path like '/destination/%'
                                                       or e.path like '/titip-belanja%'))) as browsed,
           bool_or(e.event_name = 'checkout_start') as checkout,
           bool_or(e.event_name = 'order_start') as ordered,
           bool_or(e.event_name = 'order_start' and (
             exists (select 1 from customer_orders o where o.id::text = e.target and ${PAID_ESIM})
             or exists (select 1 from shopping_orders so where so.id::text = e.target and so.paid_at is not null)
           )) as paid,
           min(e.created_at) as at
      from site_events e where e.created_at >= ${from} and e.created_at < ${to}
     group by e.session_id)`;

const STEP_SELECT = `
  count(*) filter (where visited)::int as visitors,
  count(*) filter (where visited and browsed)::int as browsed,
  count(*) filter (where visited and checkout)::int as checkout,
  count(*) filter (where visited and ordered)::int as ordered,
  count(*) filter (where visited and paid)::int as paid`;

const stepsFrom = (r: Row | undefined): FunnelStep[] => [
  { key: "visitors", label: "Pengunjung", value: n(r?.["visitors"]) },
  { key: "browsed", label: "Lihat destinasi / paket", value: n(r?.["browsed"]) },
  { key: "checkout", label: "Mulai checkout", value: n(r?.["checkout"]) },
  { key: "ordered", label: "Pesanan dibuat", value: n(r?.["ordered"]) },
  { key: "paid", label: "Bayar berhasil", value: n(r?.["paid"]) },
];

async function funnelInsight(range: InsightRange): Promise<FunnelInsight> {
  const days = INSIGHT_RANGE_DAYS[range];
  const cur = SESSION_CTE(since(days), "now() + interval '1 minute'");
  const prev = SESSION_CTE(priorSince(days), since(days));
  const [now, before, device, channel, daily, abandoned, payment, byProvider] = await Promise.all([
    q(`with ${cur} select ${STEP_SELECT} from s`),
    q(`with ${prev} select ${STEP_SELECT} from s`),
    q(`with ${cur} select device as label, ${STEP_SELECT} from s where visited group by device
       having count(*) >= ${MIN_GROUP_SIZE} order by visitors desc`),
    q(`with ${cur} select src as label, ${STEP_SELECT} from s where visited group by src
       having count(*) >= ${MIN_GROUP_SIZE} order by visitors desc limit 6`),
    q(`with ${cur}
       select to_char(date_trunc('day', at at time zone '${TZ}'), 'DD Mon') as label,
              count(*) filter (where visited)::int as visitors,
              count(*) filter (where visited and checkout)::int as checkout,
              count(*) filter (where visited and paid)::int as paid
         from s group by date_trunc('day', at at time zone '${TZ}') order by date_trunc('day', at at time zone '${TZ}')`),
    q(`select count(*)::int as c, coalesce(sum(total_amount), 0)::numeric as v from customer_orders
        where created_at >= ${since(days)} and paid_at is null
          and status in ('DRAFT','ORDER_CREATED','PAYMENT_PENDING')`),
    q(`select
         (select count(*) from customer_orders o where o.created_at >= ${since(days)} and ${PAID_ESIM})::int as paid,
         (select count(*) from customer_orders o where o.created_at >= ${since(days)} and o.paid_at is null
            and o.status in ('ORDER_CREATED','PAYMENT_PENDING'))::int as pending,
         (select count(*) from payment_intents p where p.created_at >= ${since(days)} and p.status = 'EXPIRED')::int as expired,
         (select count(*) from payment_intents p where p.created_at >= ${since(days)} and p.status = 'FAILED')::int as failed,
         (select avg(extract(epoch from (o.paid_at - o.created_at)) / 60)::float from customer_orders o
           where o.paid_at >= ${since(days)} and o.paid_at >= o.created_at) as avg_minutes`),
    q(`select coalesce(o.payment_provider, 'lainnya') as label,
              count(*) filter (where ${PAID_ESIM})::int as paid, count(*)::int as total
         from customer_orders o where o.created_at >= ${since(days)} and o.status <> 'DRAFT'
        group by 1 having count(*) >= ${MIN_GROUP_SIZE} order by total desc`),
  ]);
  const p = payment[0] ?? {};
  const grouped = (rows: Row[]) =>
    rows.map((r) => ({ label: String(r["label"]), steps: stepsFrom(r) }));
  return {
    steps: stepsFrom(now[0]),
    previous: stepsFrom(before[0]),
    byDevice: grouped(device),
    byChannel: grouped(channel),
    abandoned: { count: n(abandoned[0]?.["c"]), valueIdr: n(abandoned[0]?.["v"]) },
    payment: {
      paid: n(p["paid"]),
      pending: n(p["pending"]),
      expired: n(p["expired"]),
      failed: n(p["failed"]),
      avgMinutesToPay: p["avg_minutes"] == null ? null : Math.round(n(p["avg_minutes"]) * 10) / 10,
      byProvider: byProvider.map((r) => ({
        label: String(r["label"]),
        paid: n(r["paid"]),
        total: n(r["total"]),
      })),
    },
    daily: daily.map((r) => ({
      label: String(r["label"]),
      visitors: n(r["visitors"]),
      checkout: n(r["checkout"]),
      paid: n(r["paid"]),
    })),
  };
}

// ------------------------------------------------------------------ Pendapatan

async function revenueInsight(range: InsightRange): Promise<RevenueInsight> {
  const days = INSIGHT_RANGE_DAYS[range];
  const dayAt = BUCKET.replace("%s", "at");
  const seriesSql = (from: string, to: string, startExpr: string) => `
    with ${SALES_CTE},
    d as (select generate_series(date_trunc('day', (${startExpr}) at time zone '${TZ}'),
          date_trunc('day', (${to}) at time zone '${TZ}'), interval '1 day') as day)
    select to_char(d.day, 'DD Mon') as label, coalesce(sum(s.amount), 0)::numeric as value
      from d left join sales s on ${dayAt} = d.day and s.at >= ${from} and s.at < ${to}
     group by d.day order by d.day`;
  const [kpi, prevKpi, series, prevSeries, product, channel, weekday, hour, split, refund, pre] =
    await Promise.all([
      q(`with ${SALES_CTE} select coalesce(sum(amount),0)::numeric as gross, count(*)::int as orders
           from sales where at >= ${since(days)}`),
      q(`with ${SALES_CTE} select coalesce(sum(amount),0)::numeric as gross, count(*)::int as orders
           from sales where at >= ${priorSince(days)} and at < ${since(days)}`),
      q(seriesSql(since(days), "now() + interval '1 day'", since(days - 1))),
      q(seriesSql(priorSince(days), since(days), priorSince(days))),
      q(`with ${SALES_CTE} select product as label, sum(amount)::numeric as value, count(*)::int as orders
           from sales where at >= ${since(days)} group by product order by value desc`),
      q(`with ${SALES_CTE}
         select coalesce(nullif(e.utm_source,''), nullif(e.referrer_host,''),
                         case when e.id is null then 'Tidak terlacak' else '(langsung)' end) as label,
                sum(s.amount)::numeric as value, count(*)::int as orders
           from sales s left join site_events e on e.event_name = 'order_start' and e.target = s.id
          where s.at >= ${since(days)} group by 1 order by value desc limit 8`),
      q(`with ${SALES_CTE} select extract(isodow from at at time zone '${TZ}')::int as k,
                sum(amount)::numeric as value from sales where at >= ${since(days)} group by 1 order by 1`),
      q(`with ${SALES_CTE} select extract(hour from at at time zone '${TZ}')::int as k,
                sum(amount)::numeric as value from sales where at >= ${since(days)} group by 1 order by 1`),
      q(`with ${SALES_CTE},
         firsts as (select subject, min(at) as first_at from sales where subject is not null group by subject)
         select count(distinct f.subject) filter (where f.first_at >= ${since(days)})::int as new_customers,
                count(distinct f.subject) filter (where f.first_at < ${since(days)})::int as returning_customers,
                coalesce(sum(s.amount) filter (where f.first_at >= ${since(days)}), 0)::numeric as new_revenue,
                coalesce(sum(s.amount) filter (where f.first_at < ${since(days)}), 0)::numeric as returning_revenue
           from sales s join firsts f on f.subject = s.subject where s.at >= ${since(days)}`),
      q(`select count(*)::int as c from refund_requests where created_at >= ${since(days)}`),
      q(`select count(*) filter (where preorder_status in ('pending','processing'))::int as open,
                count(*) filter (where preorder_status in ('pending','processing')
                                   and preorder_deadline_at < now() + interval '1 day'
                                   and preorder_deadline_at >= now())::int as near,
                count(*) filter (where preorder_status in ('pending','processing')
                                   and preorder_deadline_at < now())::int as overdue
           from customer_orders where fulfillment_mode = 'preorder'`),
    ]);
  const gross = n(kpi[0]?.["gross"]);
  const orders = n(kpi[0]?.["orders"]);
  const dowNames = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
  const dowMap = new Map(weekday.map((r) => [n(r["k"]), n(r["value"])]));
  const hourMap = new Map(hour.map((r) => [n(r["k"]), n(r["value"])]));
  const sp = split[0] ?? {};
  const refundCount = n(refund[0]?.["c"]);
  const pts = (rows: Row[]): Point[] =>
    rows.map((r) => ({ label: String(r["label"]), value: n(r["value"]) }));
  return {
    gross,
    previousGross: n(prevKpi[0]?.["gross"]),
    orders,
    previousOrders: n(prevKpi[0]?.["orders"]),
    aov: orders > 0 ? Math.round(gross / orders) : 0,
    cost: null,
    margin: null,
    refundCount,
    refundRatePct: orders > 0 ? Math.round((refundCount / orders) * 1000) / 10 : null,
    series: pts(series),
    previousSeries: pts(prevSeries),
    byProduct: product.map((r) => ({
      label: String(r["label"]),
      value: n(r["value"]),
      orders: n(r["orders"]),
    })),
    byChannel: channel.map((r) => ({
      label: String(r["label"]),
      value: n(r["value"]),
      orders: n(r["orders"]),
    })),
    byWeekday: dowNames.map((label, i) => ({ label, value: dowMap.get(i + 1) ?? 0 })),
    byHour: Array.from({ length: 24 }, (_, h) => ({
      label: `${String(h).padStart(2, "0")}:00`,
      value: hourMap.get(h) ?? 0,
    })),
    newVsReturning: {
      newCustomers: n(sp["new_customers"]),
      returning: n(sp["returning_customers"]),
      newRevenue: n(sp["new_revenue"]),
      returningRevenue: n(sp["returning_revenue"]),
    },
    preorder: {
      open: n(pre[0]?.["open"]),
      nearDeadline: n(pre[0]?.["near"]),
      overdue: n(pre[0]?.["overdue"]),
    },
  };
}

// ------------------------------------------------------------------ Destinasi

async function destinationInsight(range: InsightRange): Promise<DestinationInsight> {
  const days = INSIGHT_RANGE_DAYS[range];
  const CODE = `lower(substring(e.path from '^/destination/([A-Za-z0-9-]+)'))`;
  const [views, orders, searches, packages, unlimited] = await Promise.all([
    q(`select ${CODE} as code, count(*)::int as views, count(distinct e.session_id)::int as visitors
         from site_events e
        where e.event_name in ('page_view','destination_view') and e.path like '/destination/%'
          and e.created_at >= ${since(days)} group by 1 having ${CODE} is not null`),
    q(`with ${SALES_CTE}
       select ${CODE} as code, count(*)::int as orders, coalesce(sum(s.amount), 0)::numeric as revenue
         from sales s join site_events e on e.event_name = 'order_start' and e.target = s.id
        where s.at >= ${since(days)} and s.product <> 'Titip Belanja' and e.path like '/destination/%'
        group by 1`),
    q(`select lower(e.target) as label, count(*)::int as value from site_events e
        where e.event_name = 'finder_submit' and e.target is not null and e.created_at >= ${since(days)}
        group by 1 having count(*) >= ${MIN_GROUP_SIZE} order by value desc limit 10`),
    q(`select coalesce(i.package_name_snapshot, 'Paket') as label, count(distinct o.id)::int as orders,
              coalesce(sum(i.line_total), 0)::numeric as revenue, coalesce(sum(i.quantity), 0)::int as quantity
         from customer_order_items i join customer_orders o on o.id = i.order_id
        where o.currency_code = 'IDR' and ${PAID_ESIM} and coalesce(o.paid_at, o.created_at) >= ${since(days)}
        group by 1 order by revenue desc limit 12`),
    q(`select count(*) filter (where i.package_name_snapshot ~* 'unlimited|tanpa batas')::int as unlimited,
              count(*) filter (where i.package_name_snapshot !~* 'unlimited|tanpa batas')::int as limited
         from customer_order_items i join customer_orders o on o.id = i.order_id
        where o.currency_code = 'IDR' and ${PAID_ESIM} and coalesce(o.paid_at, o.created_at) >= ${since(days)}`),
  ]);
  const orderBy = new Map(
    orders.map((r) => [String(r["code"]), { orders: n(r["orders"]), revenue: n(r["revenue"]) }]),
  );
  const rows = views
    .map((r) => {
      const code = String(r["code"]);
      const o = orderBy.get(code) ?? { orders: 0, revenue: 0 };
      const visitors = n(r["visitors"]);
      return {
        code,
        views: n(r["views"]),
        visitors,
        orders: o.orders,
        revenue: o.revenue,
        conversionPct: visitors > 0 ? Math.round((o.orders / visitors) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.views - a.views)
    .slice(0, 30);
  return {
    rows,
    opportunity: rows
      .filter((r) => r.visitors >= 10 && r.orders === 0)
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 8)
      .map((r) => ({ code: r.code, views: r.views, visitors: r.visitors })),
    searches: searches.map((r) => ({ label: String(r["label"]), value: n(r["value"]) })),
    packages: packages.map((r) => ({
      label: String(r["label"]),
      orders: n(r["orders"]),
      revenue: n(r["revenue"]),
      quantity: n(r["quantity"]),
    })),
    unlimitedShare: {
      unlimited: n(unlimited[0]?.["unlimited"]),
      limited: n(unlimited[0]?.["limited"]),
    },
  };
}

// ------------------------------------------------------------------ entry

export async function getAnalyticsInsightsHandler(
  tab: InsightTab,
  range: InsightRange,
): Promise<AnalyticsInsights> {
  await requireAdmin();
  const base: AnalyticsInsights = {
    range,
    tab,
    updatedAt: new Date().toISOString(),
    since: new Date(Date.now() - INSIGHT_RANGE_DAYS[range] * 86_400_000).toISOString(),
  };
  if (tab === "pengguna") base.users = await guarded("users", () => usersInsight(range));
  if (tab === "funnel") base.funnel = await guarded("funnel", () => funnelInsight(range));
  if (tab === "pendapatan") base.revenue = await guarded("revenue", () => revenueInsight(range));
  if (tab === "destinasi")
    base.destinations = await guarded("destinations", () => destinationInsight(range));
  return base;
}
