import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import {
  buildCohorts,
  healthScore,
  MIN_GROUP_SIZE,
  pctOf,
  RFM_HINT,
  RFM_LABEL,
  RFM_ORDER,
  rfmSegment,
  type AnalyticsInsights,
  type AlertInput,
  type DestinationInsight,
  type FeaturesInsight,
  type OperationsInsight,
  evaluateAlerts,
  type FunnelInsight,
  type FunnelStep,
  type InsightResult,
  type InsightTab,
  type Named,
  type Point,
  type RevenueInsight,
  type RfmSegment,
  type UsersInsight,
} from "./analytics-insights";
import { sqlTs, type ResolvedRange } from "./date-range";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0) || 0;
const TZ = "Asia/Jakarta";
const COHORT_WEEKS = 12;
const PAID_ESIM = `(o.paid_at is not null or o.status in ('PAYMENT_CONFIRMED','PROVISIONING','READY','INSTALLED'))`;

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

type W = {
  from: string;
  to: string;
  pfrom: string;
  pto: string;
  unit: "hour" | "day";
  fmt: string;
  days: number;
};

/** SQL window for a resolved range. Only validated Dates are turned into literals. */
const winOf = (r: ResolvedRange): W => ({
  from: sqlTs(r.from),
  to: sqlTs(r.to),
  pfrom: sqlTs(r.prevFrom),
  pto: sqlTs(r.prevTo),
  unit: r.granularity,
  fmt: r.granularity === "hour" ? "HH24:00" : "DD Mon",
  days: r.days,
});

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

async function usersInsight(r: ResolvedRange): Promise<UsersInsight> {
  const w = winOf(r);
  const days = w.days;
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
         (select count(*) from customer_profiles where created_at >= ${w.from} and created_at < ${w.to})::int as new_members,
         (select count(*) from customer_profiles where created_at >= ${w.pfrom}
             and created_at < ${w.pto})::int as prev_new`),
    q(
      `with d as (select generate_series(
           date_trunc('${w.unit}', (${w.from}) at time zone '${TZ}'),
           date_trunc('${w.unit}', (${w.to} - interval '1 second') at time zone '${TZ}'), interval '1 ${w.unit}') as day)
       select to_char(d.day, '${w.fmt}') as label, count(p.auth_user_id)::int as value
         from d left join customer_profiles p
           on date_trunc('${w.unit}', p.created_at at time zone '${TZ}') = d.day
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
         from site_events where event_name='page_view' and created_at >= ${w.from} and created_at < ${w.to}
        group by 1 order by value desc`),
    q(`select lpad(extract(hour from created_at at time zone '${TZ}')::int::text, 2, '0') || ':00' as label,
              count(distinct session_id)::int as value
         from site_events where event_name='page_view' and created_at >= ${w.from} and created_at < ${w.to}
        group by 1 order by 1`),
    q(`select extract(isodow from created_at at time zone '${TZ}')::int as dow,
              count(distinct session_id)::int as value
         from site_events where event_name='page_view' and created_at >= ${w.from} and created_at < ${w.to}
        group by 1 order by 1`),
    q(`select coalesce(nullif(utm_source,''), nullif(referrer_host,''), '(langsung)') as label,
              count(distinct session_id)::int as value
         from site_events where event_name='page_view' and created_at >= ${w.from} and created_at < ${w.to}
        group by 1 order by value desc limit 8`),
    q(`with m as (select auth_user_id as s from customer_profiles where created_at >= ${w.from} and created_at < ${w.to})
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

async function funnelInsight(r: ResolvedRange): Promise<FunnelInsight> {
  const w = winOf(r);
  const days = w.days;
  const cur = SESSION_CTE(w.from, w.to);
  const prev = SESSION_CTE(w.pfrom, w.pto);
  const [now, before, device, channel, daily, abandoned, payment, byProvider] = await Promise.all([
    q(`with ${cur} select ${STEP_SELECT} from s`),
    q(`with ${prev} select ${STEP_SELECT} from s`),
    q(`with ${cur} select device as label, ${STEP_SELECT} from s where visited group by device
       having count(*) >= ${MIN_GROUP_SIZE} order by visitors desc`),
    q(`with ${cur} select src as label, ${STEP_SELECT} from s where visited group by src
       having count(*) >= ${MIN_GROUP_SIZE} order by visitors desc limit 6`),
    q(`with ${cur}
       select to_char(date_trunc('${w.unit}', at at time zone '${TZ}'), '${w.fmt}') as label,
              count(*) filter (where visited)::int as visitors,
              count(*) filter (where visited and checkout)::int as checkout,
              count(*) filter (where visited and paid)::int as paid
         from s group by date_trunc('${w.unit}', at at time zone '${TZ}') order by date_trunc('${w.unit}', at at time zone '${TZ}')`),
    q(`select count(*)::int as c, coalesce(sum(total_amount), 0)::numeric as v from customer_orders
        where created_at >= ${w.from} and created_at < ${w.to} and paid_at is null
          and status in ('DRAFT','ORDER_CREATED','PAYMENT_PENDING')`),
    q(`select
         (select count(*) from customer_orders o where o.created_at >= ${w.from} and o.created_at < ${w.to} and ${PAID_ESIM})::int as paid,
         (select count(*) from customer_orders o where o.created_at >= ${w.from} and o.created_at < ${w.to} and o.paid_at is null
            and o.status in ('ORDER_CREATED','PAYMENT_PENDING'))::int as pending,
         (select count(*) from payment_intents p where p.created_at >= ${w.from} and p.created_at < ${w.to} and p.status = 'EXPIRED')::int as expired,
         (select count(*) from payment_intents p where p.created_at >= ${w.from} and p.created_at < ${w.to} and p.status = 'FAILED')::int as failed,
         (select avg(extract(epoch from (o.paid_at - o.created_at)) / 60)::float from customer_orders o
           where o.paid_at >= ${w.from} and o.paid_at < ${w.to} and o.paid_at >= o.created_at) as avg_minutes`),
    q(`select coalesce(o.payment_provider, 'lainnya') as label,
              count(*) filter (where ${PAID_ESIM})::int as paid, count(*)::int as total
         from customer_orders o where o.created_at >= ${w.from} and o.created_at < ${w.to} and o.status <> 'DRAFT'
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

async function revenueInsight(r: ResolvedRange): Promise<RevenueInsight> {
  const w = winOf(r);
  const days = w.days;
  const dayAt = `date_trunc('${w.unit}', at at time zone '${TZ}')`;
  const seriesSql = (from: string, to: string, startExpr: string) => `
    with ${SALES_CTE},
    d as (select generate_series(date_trunc('${w.unit}', (${startExpr}) at time zone '${TZ}'),
          date_trunc('${w.unit}', (${to} - interval '1 second') at time zone '${TZ}'), interval '1 ${w.unit}') as day)
    select to_char(d.day, '${w.fmt}') as label, coalesce(sum(s.amount), 0)::numeric as value
      from d left join sales s on ${dayAt} = d.day and s.at >= ${from} and s.at < ${to}
     group by d.day order by d.day`;
  const [kpi, prevKpi, series, prevSeries, product, channel, weekday, hour, split, refund, pre] =
    await Promise.all([
      q(`with ${SALES_CTE} select coalesce(sum(amount),0)::numeric as gross, count(*)::int as orders
           from sales where at >= ${w.from} and at < ${w.to}`),
      q(`with ${SALES_CTE} select coalesce(sum(amount),0)::numeric as gross, count(*)::int as orders
           from sales where at >= ${w.pfrom} and at < ${w.pto}`),
      q(seriesSql(w.from, w.to, w.from)),
      q(seriesSql(w.pfrom, w.pto, w.pfrom)),
      q(`with ${SALES_CTE} select product as label, sum(amount)::numeric as value, count(*)::int as orders
           from sales where at >= ${w.from} and at < ${w.to} group by product order by value desc`),
      q(`with ${SALES_CTE}
         select coalesce(nullif(e.utm_source,''), nullif(e.referrer_host,''),
                         case when e.id is null then 'Tidak terlacak' else '(langsung)' end) as label,
                sum(s.amount)::numeric as value, count(*)::int as orders
           from sales s left join site_events e on e.event_name = 'order_start' and e.target = s.id
          where s.at >= ${w.from} and s.at < ${w.to} group by 1 order by value desc limit 8`),
      q(`with ${SALES_CTE} select extract(isodow from at at time zone '${TZ}')::int as k,
                sum(amount)::numeric as value from sales where at >= ${w.from} and at < ${w.to} group by 1 order by 1`),
      q(`with ${SALES_CTE} select extract(hour from at at time zone '${TZ}')::int as k,
                sum(amount)::numeric as value from sales where at >= ${w.from} and at < ${w.to} group by 1 order by 1`),
      q(`with ${SALES_CTE},
         firsts as (select subject, min(at) as first_at from sales where subject is not null group by subject)
         select count(distinct f.subject) filter (where f.first_at >= ${w.from} and f.first_at < ${w.to})::int as new_customers,
                count(distinct f.subject) filter (where f.first_at < ${w.from})::int as returning_customers,
                coalesce(sum(s.amount) filter (where f.first_at >= ${w.from} and f.first_at < ${w.to}), 0)::numeric as new_revenue,
                coalesce(sum(s.amount) filter (where f.first_at < ${w.from}), 0)::numeric as returning_revenue
           from sales s join firsts f on f.subject = s.subject where s.at >= ${w.from} and s.at < ${w.to}`),
      q(
        `select count(*)::int as c from refund_requests where created_at >= ${w.from} and created_at < ${w.to}`,
      ),
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

async function destinationInsight(r: ResolvedRange): Promise<DestinationInsight> {
  const w = winOf(r);
  const days = w.days;
  const CODE = `lower(substring(e.path from '^/destination/([A-Za-z0-9-]+)'))`;
  const [views, orders, searches, packages, unlimited] = await Promise.all([
    q(`select ${CODE} as code, count(*)::int as views, count(distinct e.session_id)::int as visitors
         from site_events e
        where e.event_name in ('page_view','destination_view') and e.path like '/destination/%'
          and e.created_at >= ${w.from} and e.created_at < ${w.to} group by 1 having ${CODE} is not null`),
    q(`with ${SALES_CTE}
       select ${CODE} as code, count(*)::int as orders, coalesce(sum(s.amount), 0)::numeric as revenue
         from sales s join site_events e on e.event_name = 'order_start' and e.target = s.id
        where s.at >= ${w.from} and s.at < ${w.to} and s.product <> 'Titip Belanja' and e.path like '/destination/%'
        group by 1`),
    q(`select lower(e.target) as label, count(*)::int as value from site_events e
        where e.event_name = 'finder_submit' and e.target is not null and e.created_at >= ${w.from} and e.created_at < ${w.to}
        group by 1 having count(*) >= ${MIN_GROUP_SIZE} order by value desc limit 10`),
    q(`select coalesce(i.package_name_snapshot, 'Paket') as label, count(distinct o.id)::int as orders,
              coalesce(sum(i.line_total), 0)::numeric as revenue, coalesce(sum(i.quantity), 0)::int as quantity
         from customer_order_items i join customer_orders o on o.id = i.order_id
        where o.currency_code = 'IDR' and ${PAID_ESIM} and coalesce(o.paid_at, o.created_at) >= ${w.from} and coalesce(o.paid_at, o.created_at) < ${w.to}
        group by 1 order by revenue desc limit 12`),
    q(`select count(*) filter (where i.package_name_snapshot ~* 'unlimited|tanpa batas')::int as unlimited,
              count(*) filter (where i.package_name_snapshot !~* 'unlimited|tanpa batas')::int as limited
         from customer_order_items i join customer_orders o on o.id = i.order_id
        where o.currency_code = 'IDR' and ${PAID_ESIM} and coalesce(o.paid_at, o.created_at) >= ${w.from} and coalesce(o.paid_at, o.created_at) < ${w.to}`),
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

// ------------------------------------------------------------------ Fitur (fase 4)

const named = (rows: Row[]): Named[] =>
  rows.map((r) => ({ label: String(r["label"] ?? ""), value: n(r["value"]) }));
const median = (v: unknown, digits = 1) =>
  v === null || v === undefined ? null : Math.round(n(v) * 10 ** digits) / 10 ** digits;

const dailySeries = (w: W, table: string, extra = "") => `
  with d as (select generate_series(
      date_trunc('${w.unit}', (${w.from}) at time zone '${TZ}'),
      date_trunc('${w.unit}', (${w.to} - interval '1 second') at time zone '${TZ}'), interval '1 ${w.unit}') as day)
  select to_char(d.day, '${w.fmt}') as label, count(t.*)::int as value
    from d left join ${table} t
      on date_trunc('${w.unit}', t.created_at at time zone '${TZ}') = d.day ${extra}
   group by d.day order by d.day`;

async function featuresInsight(r: ResolvedRange): Promise<FeaturesInsight> {
  const w = winOf(r);
  const days = w.days;
  const [
    travo,
    travoMsgs,
    travoScope,
    travoDaily,
    trips,
    tripDaily,
    shopReq,
    shopFunnel,
    shopReply,
    shopNow,
    shopStatus,
    feedCounts,
    feedKind,
    feedStatus,
    feedReports,
    notif,
    notifType,
    delivery,
    pwa,
  ] = await Promise.all([
    q(`select count(*) filter (where created_at >= ${w.from} and created_at < ${w.to})::int as c,
              count(*) filter (where created_at >= ${w.pfrom} and created_at < ${w.pto})::int as p
         from travel_assistant_conversations`),
    q(`select count(*) filter (where role = 'user')::int as u, count(*) filter (where role = 'assistant')::int as a,
              count(distinct customer_auth_subject)::int as people
         from travel_assistant_messages where created_at >= ${w.from} and created_at < ${w.to}`),
    q(`select scope as label, count(*)::int as value from travel_assistant_conversations
        where created_at >= ${w.from} and created_at < ${w.to} group by 1 order by value desc`),
    q(
      dailySeries(
        w,
        "travel_assistant_messages",
        `and t.role = 'user' and t.created_at >= ${w.from} and t.created_at < ${w.to}`,
      ),
    ),
    q(`select (select count(*) from travel_trips where created_at >= ${w.from} and created_at < ${w.to})::int as c,
              (select count(*) from travel_trips where created_at >= ${w.pfrom} and created_at < ${w.pto})::int as p,
              (select count(distinct customer_auth_subject) from travel_trips where created_at >= ${w.from} and created_at < ${w.to})::int as people,
              (select count(*) from travel_expenses where created_at >= ${w.from} and created_at < ${w.to})::int as expenses,
              (select count(*) from travel_trip_shares where created_at >= ${w.from} and created_at < ${w.to})::int as shares,
              (select count(*) from travel_receipt_scans where created_at >= ${w.from} and created_at < ${w.to})::int as scans`),
    q(dailySeries(w, "travel_trips", `and t.created_at >= ${w.from} and t.created_at < ${w.to}`)),
    q(`select count(*) filter (where created_at >= ${w.from} and created_at < ${w.to} and status <> 'DRAFT')::int as c,
              count(*) filter (where created_at >= ${w.pfrom} and created_at < ${w.pto} and status <> 'DRAFT')::int as p
         from shopping_discovery_requests`),
    q(`select count(*) filter (where status <> 'DRAFT')::int as submitted,
              count(*) filter (where status in ('OFFERED','ORDERED'))::int as offered,
              count(*) filter (where status = 'ORDERED')::int as ordered,
              (select count(*) from shopping_orders where paid_at >= ${w.from} and paid_at < ${w.to})::int as paid
         from shopping_discovery_requests where created_at >= ${w.from} and created_at < ${w.to}`),
    q(`with first_reply as (
         select t.id, t.created_at, t.response_due_at,
                (select min(m.created_at) from shopping_chat_messages m
                  where m.thread_id = t.id and m.sender = 'ADMIN' and not m.internal) as replied_at
           from shopping_chat_threads t where t.kind = 'REQUEST' and t.created_at >= ${w.from} and t.created_at < ${w.to})
       select percentile_cont(0.5) within group (order by extract(epoch from (replied_at - created_at)) / 60)::float as med,
              count(*) filter (where replied_at is not null and response_due_at is not null)::int as answered,
              count(*) filter (where replied_at is not null and response_due_at is not null and replied_at <= response_due_at)::int as on_time
         from first_reply where replied_at is not null`),
    q(`select count(*) filter (where closed_at is null and last_sender = 'CUSTOMER')::int as waiting,
              count(*) filter (where closed_at is null and last_sender = 'CUSTOMER' and response_due_at < now())::int as overdue
         from shopping_chat_threads`),
    q(`select status as label, count(*)::int as value from shopping_discovery_requests
        where created_at >= ${w.from} and created_at < ${w.to} and status <> 'DRAFT' group by 1 order by value desc`),
    q(`select (select count(*) from feed_posts where created_at >= ${w.from} and created_at < ${w.to} and source = 'member')::int as posts,
              (select count(*) from feed_comments where created_at >= ${w.from} and created_at < ${w.to} and source = 'member')::int as comments,
              (select count(*) from feed_likes where created_at >= ${w.from} and created_at < ${w.to})::int as likes,
              (select floor(extract(epoch from (now() - min(created_at))) / 3600)::int from feed_posts where status = 'PENDING') as oldest`),
    q(`select kind as label, count(*)::int as value from feed_posts
        where created_at >= ${w.from} and created_at < ${w.to} and source = 'member' group by 1 order by value desc`),
    q(`select status as label, count(*)::int as value from feed_posts
        where created_at >= ${w.from} and created_at < ${w.to} and source = 'member' group by 1 order by value desc`),
    q(`select count(*) filter (where status = 'OPEN')::int as open,
              count(*) filter (where status = 'ACTIONED' and created_at >= ${w.from} and created_at < ${w.to})::int as actioned
         from feed_reports`),
    q(`select count(*)::int as c,
              count(*) filter (where exists (select 1 from customer_notification_states s
                                              where s.notification_id = n.id and s.read_at is not null))::int as read,
              (select count(*) from customer_push_subscriptions where active)::int as push
         from customer_notifications n where created_at >= ${w.from} and created_at < ${w.to}`),
    q(`select type as label, count(*)::int as value from customer_notifications
        where created_at >= ${w.from} and created_at < ${w.to} group by 1 order by value desc limit 8`),
    q(`select channel || ' · ' || status as label, count(*)::int as value from notification_delivery_attempts
        where created_at >= ${w.from} and created_at < ${w.to} group by 1 order by value desc limit 8`),
    q(`select event_name || ' · ' || platform as label, count(*)::int as value from pwa_events
        where created_at >= ${w.from} and created_at < ${w.to} group by 1 order by value desc limit 8`),
  ]);
  const tv = travo[0] ?? {};
  const tm = travoMsgs[0] ?? {};
  const tr = trips[0] ?? {};
  const sr = shopReq[0] ?? {};
  const sf = shopFunnel[0] ?? {};
  const rp = shopReply[0] ?? {};
  const sn = shopNow[0] ?? {};
  const fc = feedCounts[0] ?? {};
  const fr = feedReports[0] ?? {};
  const nt = notif[0] ?? {};
  const conv = n(tv["c"]);
  const pts = (rows: Row[]): Point[] =>
    rows.map((r) => ({ label: String(r["label"]), value: n(r["value"]) }));
  return {
    travo: {
      conversations: conv,
      previousConversations: n(tv["p"]),
      activeUsers: n(tm["people"]),
      userMessages: n(tm["u"]),
      assistantMessages: n(tm["a"]),
      messagesPerConversation: conv > 0 ? Math.round((n(tm["u"]) / conv) * 10) / 10 : null,
      byScope: named(travoScope),
      daily: pts(travoDaily),
    },
    trips: {
      created: n(tr["c"]),
      previousCreated: n(tr["p"]),
      users: n(tr["people"]),
      expenses: n(tr["expenses"]),
      shares: n(tr["shares"]),
      receiptScans: n(tr["scans"]),
      daily: pts(tripDaily),
    },
    shopping: {
      requests: n(sr["c"]),
      previousRequests: n(sr["p"]),
      funnel: [
        { key: "submitted", label: "Permintaan masuk", value: n(sf["submitted"]) },
        { key: "offered", label: "Ditawari tim", value: n(sf["offered"]) },
        { key: "ordered", label: "Jadi pesanan", value: n(sf["ordered"]) },
        { key: "paid", label: "Pesanan dibayar (semua)", value: n(sf["paid"]) },
      ],
      medianFirstReplyMinutes: median(rp["med"]),
      answeredWithinDuePct: pctOf(n(rp["on_time"]), n(rp["answered"])),
      waitingNow: n(sn["waiting"]),
      overdueNow: n(sn["overdue"]),
      byStatus: named(shopStatus),
    },
    feeds: {
      posts: n(fc["posts"]),
      comments: n(fc["comments"]),
      likes: n(fc["likes"]),
      byKind: named(feedKind),
      byStatus: named(feedStatus),
      reportsOpen: n(fr["open"]),
      reportsActioned: n(fr["actioned"]),
      oldestPendingHours: fc["oldest"] == null ? null : n(fc["oldest"]),
    },
    notifications: {
      created: n(nt["c"]),
      readRatePct: pctOf(n(nt["read"]), n(nt["c"])),
      byType: named(notifType),
      pushActive: n(nt["push"]),
      delivery: named(delivery),
      pwa: named(pwa),
    },
  };
}

// ------------------------------------------------------------------ Operasional (fase 5)

const WORKER_STALE_MINUTES = 15;

async function operationsInsight(r: ResolvedRange): Promise<OperationsInsight> {
  const w = winOf(r);
  const days = w.days;
  const [
    sup,
    supReply,
    supCat,
    supStatus,
    supAging,
    prov,
    provTime,
    workers,
    webhooks,
    outbox,
    unknown,
    team,
  ] = await Promise.all([
    q(`select count(*) filter (where created_at >= ${w.from} and created_at < ${w.to})::int as opened,
              count(*) filter (where created_at >= ${w.pfrom} and created_at < ${w.pto})::int as prev,
              count(*) filter (where status not in ('resolved','closed'))::int as open_now,
              (select floor(extract(epoch from (now() - min(created_at))) / 86400)::int
                 from support_cases where status not in ('resolved','closed')) as oldest,
              percentile_cont(0.5) within group (order by extract(epoch from (updated_at - created_at)) / 3600)
                filter (where status in ('resolved','closed') and created_at >= ${w.from} and created_at < ${w.to})::float as res_hours
         from support_cases`),
    q(`with c as (
         select sc.id, sc.created_at,
                (select min(m.created_at) from support_case_messages m
                  where m.case_id = sc.id and m.author_type = 'admin') as replied
           from support_cases sc where sc.created_at >= ${w.from} and sc.created_at < ${w.to})
       select percentile_cont(0.5) within group (order by extract(epoch from (replied - created_at)) / 60)::float as med
         from c where replied is not null`),
    q(`select category as label, count(*)::int as value from support_cases
        where created_at >= ${w.from} and created_at < ${w.to} group by 1 order by value desc limit 8`),
    q(`select status as label, count(*)::int as value from support_cases
        where created_at >= ${w.from} and created_at < ${w.to} group by 1 order by value desc`),
    q(`select case when age < interval '1 day' then '< 1 hari'
                   when age < interval '3 days' then '1–3 hari'
                   when age < interval '7 days' then '3–7 hari' else '> 7 hari' end as label,
              count(*)::int as value
         from (select now() - created_at as age from support_cases where status not in ('resolved','closed')) x
        group by 1 order by min(age)`),
    q(`select count(*) filter (where ${PAID_ESIM})::int as paid,
              count(*) filter (where o.status in ('READY','INSTALLED'))::int as ready,
              count(*) filter (where o.status = 'PROVISIONING_FAILED')::int as failed,
              (select count(*) from customer_orders x where x.status = 'PROVISIONING'
                  and x.updated_at < now() - interval '30 minutes')::int as stuck,
              (select count(*) from refund_requests where status = 'REQUESTED')::int as refunds_open
         from customer_orders o where o.created_at >= ${w.from} and o.created_at < ${w.to} and o.fulfillment_mode <> 'preorder'`),
    q(`select percentile_cont(0.5) within group (order by extract(epoch from (p.created_at - o.paid_at)) / 60)::float as med
         from customer_orders o
         join esim_provisioning_orders po on po.order_id = o.id
         join lateral (select min(created_at) as created_at from esim_profiles e where e.provisioning_order_id = po.id) p on true
        where o.paid_at >= ${w.from} and o.paid_at < ${w.to} and p.created_at is not null and p.created_at >= o.paid_at`),
    q(`select worker_name as label, last_error_safe as err,
              floor(extract(epoch from (now() - last_heartbeat_at)) / 60)::int as age
         from worker_heartbeats order by worker_name`),
    q(`select status as label, count(*)::int as value from webhook_inbox
        where received_at >= ${Math.max(days, 7) > days ? "now() - interval '7 days'" : w.from} group by 1 order by value desc`),
    q(`select count(*) filter (where status = 'queued')::int as queued,
              count(*) filter (where status = 'failed')::int as failed,
              (select count(*) from webhook_inbox where status = 'DEAD_LETTER')::int as dead
         from travel_email_outbox`),
    q(`select count(*)::int as c from payment_intents where status = 'UNKNOWN'`),
    q(`select coalesce(u.display_name, 'Sistem') as label, count(*)::int as value
         from admin_audit_logs l left join admin_users u on u.id = l.actor_id
        where l.created_at >= ${w.from} and l.created_at < ${w.to} group by 1 order by value desc limit 8`),
  ]);
  const s = sup[0] ?? {};
  const p = prov[0] ?? {};
  const paid = n(p["paid"]);
  return {
    support: {
      opened: n(s["opened"]),
      previousOpened: n(s["prev"]),
      openNow: n(s["open_now"]),
      medianFirstReplyMinutes: median(supReply[0]?.["med"]),
      medianResolutionHours: median(s["res_hours"]),
      oldestOpenDays: s["oldest"] == null ? null : n(s["oldest"]),
      byCategory: named(supCat),
      byStatus: named(supStatus),
      aging: named(supAging),
    },
    provisioning: {
      paid,
      ready: n(p["ready"]),
      failed: n(p["failed"]),
      failureRatePct: pctOf(n(p["failed"]), paid),
      stuck: n(p["stuck"]),
      medianMinutesToReady: median(provTime[0]?.["med"]),
      refundsOpen: n(p["refunds_open"]),
    },
    system: {
      workers: workers.map((r) => ({
        name: String(r["label"]),
        ageMinutes: r["age"] == null ? null : n(r["age"]),
        lastError: r["err"] ? String(r["err"]).slice(0, 120) : null,
        stale: r["age"] == null || n(r["age"]) > WORKER_STALE_MINUTES,
      })),
      webhooks: named(webhooks),
      deadLetters: n(outbox[0]?.["dead"]),
      emailQueued: n(outbox[0]?.["queued"]),
      emailFailed: n(outbox[0]?.["failed"]),
      paymentsUnknown: n(unknown[0]?.["c"]),
    },
    team: named(team),
  };
}

// ------------------------------------------------------------------ Peringatan (fase 5)

/** Reads the last 7 days against the 7 before; also used by the scheduled weekly report. */
export async function getAlertInput(): Promise<AlertInput> {
  const [sales, ops, queues] = await Promise.all([
    q(`with ${SALES_CTE}
       select coalesce(sum(amount) filter (where at >= ${since(7)}), 0)::numeric as rev,
              coalesce(sum(amount) filter (where at >= ${priorSince(7)} and at < ${since(7)}), 0)::numeric as prev_rev,
              count(*) filter (where at >= ${since(7)})::int as orders,
              count(*) filter (where at >= ${priorSince(7)} and at < ${since(7)})::int as prev_orders
         from sales where at >= ${priorSince(7)}`),
    q(`select (select count(*) from refund_requests where created_at >= ${since(7)})::int as refunds,
              (select count(*) from customer_orders o where o.created_at >= ${since(7)} and ${PAID_ESIM})::int as paid,
              (select count(*) from customer_orders where created_at >= ${since(7)} and status = 'PROVISIONING_FAILED')::int as failed,
              (select count(*) from customer_orders where status = 'PROVISIONING' and updated_at < now() - interval '30 minutes')::int as stuck,
              (select count(*) from customer_orders where fulfillment_mode = 'preorder' and preorder_status in ('pending','processing')
                  and preorder_deadline_at < now())::int as pre_over,
              (select count(*) from customer_orders where fulfillment_mode = 'preorder' and preorder_status in ('pending','processing')
                  and preorder_deadline_at >= now() and preorder_deadline_at < now() + interval '1 day')::int as pre_near,
              (select count(*) from support_cases where status not in ('resolved','closed') and created_at < now() - interval '3 days')::int as support_old,
              (select count(*) from feed_reports where status = 'OPEN')::int as reports`),
    q(`select (select count(*) from webhook_inbox where status = 'DEAD_LETTER')::int as dead,
              (select count(*) from travel_email_outbox where status = 'failed')::int as email_failed,
              (select count(*) from payment_intents where status = 'UNKNOWN')::int as unknown,
              (select count(*) from shopping_chat_threads where closed_at is null and last_sender = 'CUSTOMER'
                  and response_due_at < now())::int as shop_over,
              (select coalesce(array_agg(worker_name), '{}') from worker_heartbeats
                where last_heartbeat_at < now() - interval '${WORKER_STALE_MINUTES} minutes') as stale`),
  ]);
  const a = sales[0] ?? {};
  const o = ops[0] ?? {};
  const z = queues[0] ?? {};
  return {
    revenue: n(a["rev"]),
    previousRevenue: n(a["prev_rev"]),
    orders: n(a["orders"]),
    previousOrders: n(a["prev_orders"]),
    refundCount: n(o["refunds"]),
    paidOrders: n(o["paid"]),
    failedProvisioning: n(o["failed"]),
    stuckProvisioning: n(o["stuck"]),
    deadLetters: n(z["dead"]),
    staleWorkers: Array.isArray(z["stale"]) ? (z["stale"] as unknown[]).map(String) : [],
    emailFailed: n(z["email_failed"]),
    preorderOverdue: n(o["pre_over"]),
    preorderNear: n(o["pre_near"]),
    supportOpenOver3d: n(o["support_old"]),
    shoppingOverdue: n(z["shop_over"]),
    feedReportsOpen: n(o["reports"]),
    paymentsUnknown: n(z["unknown"]),
  };
}

// ------------------------------------------------------------------ entry

export async function getAnalyticsInsightsHandler(
  tab: InsightTab,
  r: ResolvedRange,
): Promise<AnalyticsInsights> {
  await requireAdmin();
  const base: AnalyticsInsights = {
    range: r.key,
    window: {
      label: r.label,
      from: r.from.toISOString(),
      to: r.to.toISOString(),
      granularity: r.granularity,
      fromDay: r.fromDay,
      toDay: r.toDay,
    },
    tab,
    updatedAt: new Date().toISOString(),
    since: r.from.toISOString(),
    alerts: [],
  };
  // Alerts never block a tab: a failing alert query just yields an empty list.
  const alerts = guarded("alerts", async () => evaluateAlerts(await getAlertInput()));
  if (tab === "pengguna") base.users = await guarded("users", () => usersInsight(r));
  if (tab === "funnel") base.funnel = await guarded("funnel", () => funnelInsight(r));
  if (tab === "pendapatan") base.revenue = await guarded("revenue", () => revenueInsight(r));
  if (tab === "destinasi")
    base.destinations = await guarded("destinations", () => destinationInsight(r));
  if (tab === "fitur") base.features = await guarded("features", () => featuresInsight(r));
  if (tab === "operasional")
    base.operations = await guarded("operations", () => operationsInsight(r));
  base.alerts = (await alerts).data ?? [];
  return base;
}
