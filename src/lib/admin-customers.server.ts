import { createHash, randomUUID } from "node:crypto";
import { requireAdmin } from "./admin-guard";
import { pool } from "../db/client.server";
import { getAdminEmailHandler } from "./admin-guard.server";
import { sqlTs, type ResolvedRange } from "./date-range";

export type AdminCustomerKind = "all" | "member" | "guest" | "noprofile";
export type AdminCustomerCriteria = "all" | "ordered" | "never" | "trip" | "feed" | "shopping";
export type AdminCustomerSort = "active" | "joined" | "orders" | "spend";

export const CUSTOMER_PAGE_SIZE = 25;
const EXPORT_LIMIT = 5000;

export type AdminCustomerRow = {
  /** The account id (or `guest:<hash>`): opens the customer's detail page. */
  id: string;
  /** A short hashed reference shown next to the name. */
  ref: string;
  kind: "member" | "guest";
  /** A member who has filled in the profile (email and WhatsApp on file). */
  profileComplete: boolean;
  email: string | null;
  whatsapp: string | null;
  displayName: string | null;
  orderCount: number;
  /** Paid purchases across eSIM orders and Titip Belanja. */
  paidCount: number;
  /** Paid amount in IDR across eSIM orders and Titip Belanja. */
  spendIdr: number;
  latestOrderAt: string | null;
  tripCount: number;
  shoppingCount: number;
  feedPostCount: number;
  lastActivityAt: string | null;
  firstSeenAt: string | null;
};

export type AdminCustomersResult = {
  rows: AdminCustomerRow[];
  /** Rows that match the search, filter and criteria (rows may be fewer: the list is paged). */
  total: number;
  page: number;
  pageCount: number;
  counts: {
    all: number;
    member: number;
    guest: number;
    noProfile: number;
    /** People with at least one paid purchase. */
    buyers: number;
    /** First seen in the last 30 days. */
    newMonth: number;
  };
};

const KINDS = ["member", "guest", "noprofile"];
const CRITERIA = ["ordered", "never", "trip", "feed", "shopping"];
const SORTS = ["joined", "orders", "spend"];

export const adminCustomersInput = (
  data: { q?: string; kind?: string; criteria?: string; sort?: string; page?: number } = {},
) => ({
  q: (data.q ?? "").trim().slice(0, 80),
  kind: (KINDS.includes(data.kind ?? "") ? data.kind : "all") as AdminCustomerKind,
  criteria: (CRITERIA.includes(data.criteria ?? "")
    ? data.criteria
    : "all") as AdminCustomerCriteria,
  sort: (SORTS.includes(data.sort ?? "") ? data.sort : "active") as AdminCustomerSort,
  page: Number.isInteger(data.page) ? Math.min(Math.max(data.page as number, 1), 400) : 1,
});

/** Paid purchase on an eSIM order (same rule as Admin analytics). */
const PAID_ESIM = `(o.paid_at is not null or o.status in ('PAYMENT_CONFIRMED','PROVISIONING','READY','INSTALLED'))`;

/**
 * Everyone the system knows: members (anyone with an account who has a profile or any activity, so
 * a member who never filled the profile still shows) and guests (orders placed without an account,
 * grouped by e-mail). Seed and system authors of Feeds are not customers.
 */
const PEOPLE_CTE = `
  with subjects as (
    select auth_user_id as s from public.customer_profiles
    union select customer_auth_subject from public.customer_orders where customer_auth_subject is not null
    union select customer_auth_subject from public.travel_trips
    union select customer_auth_subject from public.shopping_orders
    union select customer_auth_subject from public.feed_posts where source = 'member'
    union select customer_auth_subject from public.feed_comments where source = 'member'
    union select customer_auth_subject from public.customer_data_consents
  ), members as (
    select sub.s as subject, 'member'::text as kind,
           coalesce(cp.email, ca.email) as email, coalesce(cp.whatsapp, ca.whatsapp) as whatsapp,
           cp.display_name,
           (cp.auth_user_id is not null) as profile_complete,
           (coalesce(oc.n, 0) + coalesce(sc.n, 0))::int as order_count,
           greatest(oc.latest, sc.latest) as latest_order_at,
           (coalesce(oc.paid, 0) + coalesce(sc.paid, 0))::int as paid_count,
           (coalesce(oc.spend, 0) + coalesce(sc.spend, 0))::numeric as spend_idr,
           coalesce(tc.n, 0)::int as trip_count, coalesce(sc.n, 0)::int as shopping_count,
           coalesce(fc.n, 0)::int as feed_post_count,
           greatest(cp.updated_at, oc.latest, sc.latest, tc.latest, fc.latest) as last_activity_at,
           least(cp.created_at, oc.first, sc.first, tc.first, fc.first) as first_seen_at
      from subjects sub
      left join public.customer_profiles cp on cp.auth_user_id = sub.s
      left join lateral (select a.email, a.whatsapp from public.guest_order_access a
                           join public.customer_orders o on o.id = a.order_id
                          where o.customer_auth_subject = sub.s order by a.created_at desc limit 1) ca on true
      left join lateral (select count(*) n, max(o.created_at) latest, min(o.created_at) first,
                                count(*) filter (where ${PAID_ESIM}) paid,
                                coalesce(sum(o.total_amount) filter (where ${PAID_ESIM} and o.currency_code = 'IDR'), 0) spend
                           from public.customer_orders o where o.customer_auth_subject = sub.s) oc on true
      left join lateral (select count(*) n, max(created_at) latest, min(created_at) first,
                                count(*) filter (where paid_at is not null) paid,
                                coalesce(sum(total_idr) filter (where paid_at is not null), 0) spend
                           from public.shopping_orders where customer_auth_subject = sub.s) sc on true
      left join lateral (select count(*) n, max(created_at) latest, min(created_at) first
                           from public.travel_trips where customer_auth_subject = sub.s) tc on true
      left join lateral (select count(*) n, max(created_at) latest, min(created_at) first
                           from public.feed_posts where customer_auth_subject = sub.s and source = 'member') fc on true
     where sub.s not like 'seed:%' and sub.s not like 'system:%'
  ), guests as (
    select 'guest:' || md5(lower(a.email)) as subject, 'guest'::text as kind, lower(a.email) as email,
           max(a.whatsapp) as whatsapp, null::text as display_name, false as profile_complete,
           count(distinct o.id)::int as order_count, max(o.created_at) as latest_order_at,
           (count(distinct o.id) filter (where ${PAID_ESIM}))::int as paid_count,
           coalesce(sum(o.total_amount) filter (where ${PAID_ESIM} and o.currency_code = 'IDR'), 0)::numeric as spend_idr,
           0 as trip_count, 0 as shopping_count, 0 as feed_post_count,
           max(o.created_at) as last_activity_at, min(o.created_at) as first_seen_at
      from public.customer_orders o
      join public.guest_order_access a on a.order_id = o.id
     where o.customer_auth_subject is null and a.email is not null
     group by lower(a.email)
  ), people as (select * from members union all select * from guests)`;

const KIND_FILTER = `(
  $2 = 'all'
  or ($2 = 'member' and kind = 'member')
  or ($2 = 'guest' and kind = 'guest')
  or ($2 = 'noprofile' and kind = 'member' and not profile_complete)
)`;

const CRITERIA_FILTER = `(
  $3 = 'all'
  or ($3 = 'ordered' and order_count > 0)
  or ($3 = 'never' and order_count = 0)
  or ($3 = 'trip' and trip_count > 0)
  or ($3 = 'feed' and feed_post_count > 0)
  or ($3 = 'shopping' and shopping_count > 0)
)`;

const MATCH = `(
  $1 = ''
  or strpos(lower(coalesce(email, '')), lower($1)) > 0
  or strpos(lower(coalesce(display_name, '')), lower($1)) > 0
  or strpos(coalesce(whatsapp, ''), $1) > 0
)`;

/** Fixed ORDER BY clauses: the sort key from the browser only selects one, it is never interpolated. */
const ORDER_BY: Record<AdminCustomerSort, string> = {
  active: "last_activity_at desc nulls last, first_seen_at desc nulls last",
  joined: "first_seen_at desc nulls last, last_activity_at desc nulls last",
  orders: "order_count desc, last_activity_at desc nulls last",
  spend: "spend_idr desc, last_activity_at desc nulls last",
};

const ref = (subject: string) =>
  createHash("sha256").update(`customer:${subject}`).digest("hex").slice(0, 10);

const iso = (value: unknown) => (value ? new Date(String(value)).toISOString() : null);

const toRow = (row: Record<string, unknown>): AdminCustomerRow => ({
  id: String(row["subject"]),
  ref: ref(String(row["subject"])),
  kind: row["kind"] === "guest" ? "guest" : "member",
  profileComplete: Boolean(row["profile_complete"]),
  email: row["email"] ? String(row["email"]) : null,
  whatsapp: row["whatsapp"] ? String(row["whatsapp"]) : null,
  displayName: row["display_name"] ? String(row["display_name"]) : null,
  orderCount: Number(row["order_count"] ?? 0),
  paidCount: Number(row["paid_count"] ?? 0),
  spendIdr: Math.round(Number(row["spend_idr"] ?? 0)),
  latestOrderAt: iso(row["latest_order_at"]),
  tripCount: Number(row["trip_count"] ?? 0),
  shoppingCount: Number(row["shopping_count"] ?? 0),
  feedPostCount: Number(row["feed_post_count"] ?? 0),
  lastActivityAt: iso(row["last_activity_at"]),
  firstSeenAt: iso(row["first_seen_at"]),
});

export async function getAdminCustomersHandler({
  data,
}: {
  data: ReturnType<typeof adminCustomersInput>;
}): Promise<AdminCustomersResult> {
  await requireAdmin();
  const [list, counts] = await Promise.all([
    pool.query(
      `${PEOPLE_CTE}
       select *, count(*) over()::int as total from people
        where ${MATCH} and ${KIND_FILTER} and ${CRITERIA_FILTER}
        order by ${ORDER_BY[data.sort]}
        limit $4 offset $5`,
      [data.q, data.kind, data.criteria, CUSTOMER_PAGE_SIZE, (data.page - 1) * CUSTOMER_PAGE_SIZE],
    ),
    pool.query(
      `${PEOPLE_CTE}
       select count(*)::int as total,
              count(*) filter (where kind = 'member')::int as member,
              count(*) filter (where kind = 'guest')::int as guest,
              count(*) filter (where kind = 'member' and not profile_complete)::int as no_profile,
              count(*) filter (where paid_count > 0)::int as buyers,
              count(*) filter (where first_seen_at >= now() - interval '30 days')::int as new_month
         from people where ${MATCH}`,
      [data.q],
    ),
  ]);
  const c = (counts.rows[0] ?? {}) as Record<string, number>;
  const total = Number(list.rows[0]?.["total"] ?? 0);
  return {
    rows: list.rows.map(toRow),
    total,
    page: data.page,
    pageCount: Math.max(1, Math.ceil(total / CUSTOMER_PAGE_SIZE)),
    counts: {
      all: Number(c["total"] ?? 0),
      member: Number(c["member"] ?? 0),
      guest: Number(c["guest"] ?? 0),
      noProfile: Number(c["no_profile"] ?? 0),
      buyers: Number(c["buyers"] ?? 0),
      newMonth: Number(c["new_month"] ?? 0),
    },
  };
}

/**
 * Whole filtered list for the CSV export (contact details in full, like the list). Capped, and the
 * export itself is written to the Admin audit log.
 */
export async function exportAdminCustomersHandler({
  data,
}: {
  data: ReturnType<typeof adminCustomersInput>;
}): Promise<{ rows: AdminCustomerRow[]; truncated: boolean }> {
  await requireAdmin();
  const result = await pool.query(
    `${PEOPLE_CTE}
     select * from people
      where ${MATCH} and ${KIND_FILTER} and ${CRITERIA_FILTER}
      order by ${ORDER_BY[data.sort]}
      limit $4`,
    [data.q, data.kind, data.criteria, EXPORT_LIMIT + 1],
  );
  const rows = result.rows.slice(0, EXPORT_LIMIT).map(toRow);
  try {
    const actor = (await getAdminEmailHandler()) ?? "admin";
    await pool.query(
      `insert into public.admin_audit_logs (id, action, entity_type, entity_id, reason, before_json, after_json)
       values ($1, 'customer.export', 'customer', 'list', $2, null, null)`,
      [randomUUID(), `${actor}: ekspor ${rows.length} pelanggan (${data.kind}/${data.criteria})`],
    );
  } catch {
    // The export still works if the audit table is unreachable.
  }
  return { rows, truncated: result.rows.length > EXPORT_LIMIT };
}

/* ------------------------------------------------------------------ growth */

export type AdminCustomerGrowth = {
  window: { label: string; granularity: "hour" | "day"; fromDay: string; toDay: string };
  /** New people per bucket in the range, split by whether they already paid. */
  daily: { label: string; bought: number; rest: number }[];
  monthly: { month: string; total: number; bought: number }[];
  kpi: {
    newPeople: number;
    previousNewPeople: number;
    newBuyers: number;
    /** People whose latest activity falls inside the range. */
    activeInRange: number;
    everyone: number;
    members: number;
  };
  /** Funnel and features describe the people who first appeared in the range. */
  funnel: { label: string; count: number }[];
  features: { label: string; count: number }[];
  cohortMembers: number;
  topSpenders: GrowthPerson[];
  neverOrdered: GrowthPerson[];
  slipping: GrowthPerson[];
};

export type GrowthPerson = {
  id: string;
  name: string;
  email: string | null;
  note: string;
  lastActivityAt: string | null;
};

const growthPerson = (row: Record<string, unknown>, note: string): GrowthPerson => ({
  id: String(row["subject"]),
  name: row["display_name"]
    ? String(row["display_name"])
    : row["email"]
      ? String(row["email"])
      : "Belum mengisi nama",
  email: row["email"] ? String(row["email"]) : null,
  note,
  lastActivityAt: iso(row["last_activity_at"]),
});

/** Growth and adoption numbers for the "Pertumbuhan & analisis" tab. Aggregates only, no new tables. */
export async function getAdminCustomerGrowthHandler(
  range: ResolvedRange,
): Promise<AdminCustomerGrowth> {
  await requireAdmin();
  const F = sqlTs(range.from);
  const T = sqlTs(range.to);
  const PF = sqlTs(range.prevFrom);
  const PT = sqlTs(range.prevTo);
  const unit = range.granularity;
  const fmt = unit === "hour" ? "HH24:00" : "DD Mon";
  const [daily, monthly, summary, spenders, never, slipping] = await Promise.all([
    pool.query(
      `${PEOPLE_CTE},
       d as (select generate_series(
               date_trunc('${unit}', ${F} at time zone 'Asia/Jakarta'),
               date_trunc('${unit}', (${T} - interval '1 second') at time zone 'Asia/Jakarta'),
               interval '1 ${unit}') as bucket)
       select to_char(d.bucket, '${fmt}') as label,
              count(p.subject) filter (where p.paid_count > 0)::int as bought,
              count(p.subject) filter (where p.paid_count = 0)::int as rest
         from d left join people p
           on date_trunc('${unit}', p.first_seen_at at time zone 'Asia/Jakarta') = d.bucket
          and p.first_seen_at >= ${F} and p.first_seen_at < ${T}
        group by d.bucket order by d.bucket`,
    ),
    pool.query(
      `${PEOPLE_CTE}
       select to_char(first_seen_at at time zone 'Asia/Jakarta', 'YYYY-MM') as month,
              count(*)::int as total, count(*) filter (where paid_count > 0)::int as bought
         from people where first_seen_at >= date_trunc('month', now()) - interval '11 months'
        group by 1 order by 1 desc`,
    ),
    pool.query(
      `${PEOPLE_CTE},
       w as (select * from people where first_seen_at >= ${F} and first_seen_at < ${T})
       select (select count(*) from w)::int as everyone,
              (select count(*) from w where kind = 'member')::int as members,
              (select count(*) from w where kind = 'member' and profile_complete)::int as profiled,
              (select count(*) from w where order_count > 0)::int as ordered,
              (select count(*) from w where paid_count > 0)::int as paid,
              (select count(*) from w where paid_count > 1)::int as repeat,
              (select count(*) from w where kind = 'member' and trip_count > 0)::int as trips,
              (select count(*) from w where kind = 'member' and shopping_count > 0)::int as shopping,
              (select count(*) from w where kind = 'member' and feed_post_count > 0)::int as feeds,
              (select count(*) from people where first_seen_at >= ${PF} and first_seen_at < ${PT})::int as prev_new,
              (select count(*) from people where last_activity_at >= ${F} and last_activity_at < ${T})::int as active_in,
              (select count(*) from people)::int as all_people,
              (select count(*) from people where kind = 'member')::int as all_members`,
    ),
    pool.query(
      `${PEOPLE_CTE}
       select subject, display_name, email, last_activity_at, spend_idr, paid_count
         from people where spend_idr > 0 order by spend_idr desc limit 5`,
    ),
    pool.query(
      `${PEOPLE_CTE}
       select subject, display_name, email, last_activity_at, first_seen_at
         from people
        where kind = 'member' and order_count = 0
          and first_seen_at >= ${F} and first_seen_at < ${T}
        order by first_seen_at desc limit 5`,
    ),
    pool.query(
      `${PEOPLE_CTE}
       select subject, display_name, email, last_activity_at
         from people
        where paid_count > 0 and last_activity_at < now() - interval '60 days'
        order by last_activity_at asc limit 5`,
    ),
  ]);
  const s = (summary.rows[0] ?? {}) as Record<string, number>;
  const n = (key: string) => Number(s[key] ?? 0);
  const idr = (value: unknown) => `Rp${Math.round(Number(value ?? 0)).toLocaleString("id-ID")}`;
  return {
    window: {
      label: range.label,
      granularity: range.granularity,
      fromDay: range.fromDay,
      toDay: range.toDay,
    },
    daily: daily.rows.map((r: Record<string, unknown>) => ({
      label: String(r["label"]),
      bought: Number(r["bought"] ?? 0),
      rest: Number(r["rest"] ?? 0),
    })),
    monthly: monthly.rows.map((r: Record<string, unknown>) => ({
      month: String(r["month"]),
      total: Number(r["total"] ?? 0),
      bought: Number(r["bought"] ?? 0),
    })),
    kpi: {
      newPeople: n("everyone"),
      previousNewPeople: n("prev_new"),
      newBuyers: n("paid"),
      activeInRange: n("active_in"),
      everyone: n("all_people"),
      members: n("all_members"),
    },
    funnel: [
      { label: "Pendaftar dalam rentang", count: n("everyone") },
      { label: "Member dengan profil lengkap", count: n("profiled") },
      { label: "Pernah memesan", count: n("ordered") },
      { label: "Pernah membayar", count: n("paid") },
      { label: "Beli ulang (2+ pembayaran)", count: n("repeat") },
    ],
    features: [
      { label: "Perjalanan (Trip)", count: n("trips") },
      { label: "Titip Belanja", count: n("shopping") },
      { label: "Posting di Feeds", count: n("feeds") },
    ],
    cohortMembers: n("members"),
    topSpenders: spenders.rows.map((r: Record<string, unknown>) =>
      growthPerson(r, `${idr(r["spend_idr"])} · ${Number(r["paid_count"] ?? 0)} pembayaran`),
    ),
    neverOrdered: never.rows.map((r: Record<string, unknown>) =>
      growthPerson(r, "Belum pernah memesan"),
    ),
    slipping: slipping.rows.map((r: Record<string, unknown>) =>
      growthPerson(r, "Pernah membayar, sepi 60+ hari"),
    ),
  };
}

/* ------------------------------------------------------------------ detail */

export type AdminCustomerDetail = {
  id: string;
  kind: "member" | "guest";
  displayName: string | null;
  email: string | null;
  whatsapp: string | null;
  profile: {
    nationality: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  orders: {
    id: string;
    code: string | null;
    status: string;
    total: string;
    currency: string;
    paidAt: string | null;
    createdAt: string;
    items: string;
  }[];
  trips: {
    name: string;
    destination: string;
    departure: string | null;
    returnDate: string | null;
    archived: boolean;
    createdAt: string;
  }[];
  shopping: {
    code: string;
    status: string;
    totalIdr: number;
    paidAt: string | null;
    recipientName: string | null;
    recipientWhatsapp: string | null;
    city: string | null;
    createdAt: string;
  }[];
  feeds: {
    posts: { id: string; kind: string; status: string; excerpt: string; createdAt: string }[];
    comments: number;
    likes: number;
  };
  shipping: {
    code: string;
    status: string;
    country: string;
    estimatedKg: number;
    totalIdr: number | null;
    paidAt: string | null;
    createdAt: string;
  }[];
  consents: { purpose: string; granted: boolean; at: string; source: string }[];
} | null;

export const adminCustomerDetailInput = (data: { id?: string } = {}) => ({
  id: String(data.id ?? "").slice(0, 200),
});

const text = (value: unknown) => (value === null || value === undefined ? null : String(value));

/** Everything stored about one customer. Opening it is written to the Admin audit log. */
export async function getAdminCustomerDetailHandler({
  data,
}: {
  data: ReturnType<typeof adminCustomerDetailInput>;
}): Promise<AdminCustomerDetail> {
  await requireAdmin();
  const id = data.id;
  if (!id) return null;
  const guest = id.startsWith("guest:");

  let displayName: string | null = null;
  let email: string | null = null;
  let whatsapp: string | null = null;
  let profile: NonNullable<AdminCustomerDetail>["profile"] = null;
  let orders;
  let trips = { rows: [] as Record<string, unknown>[] };
  let shopping = { rows: [] as Record<string, unknown>[] };
  let shipping = { rows: [] as Record<string, unknown>[] };
  let posts = { rows: [] as Record<string, unknown>[] };
  let social = { rows: [{ comments: 0, likes: 0 }] as Record<string, unknown>[] };
  let consents = { rows: [] as Record<string, unknown>[] };

  const orderSelect = `select o.id, o.public_order_code, o.status, o.total_amount::text as total,
         o.currency_code, o.paid_at, o.created_at,
         (select string_agg(coalesce(i.package_name_snapshot, 'Paket belum tersedia') || ' × ' || i.quantity::text, ', ' order by i.id)
            from public.customer_order_items i where i.order_id = o.id) as items
    from public.customer_orders o`;

  if (guest) {
    const hash = id.slice("guest:".length);
    orders = await pool.query(
      `${orderSelect} where o.customer_auth_subject is null and o.id in (
         select a.order_id from public.guest_order_access a where md5(lower(a.email)) = $1)
       order by o.created_at desc limit 50`,
      [hash],
    );
    const contact = await pool.query(
      `select lower(a.email) as email, max(a.whatsapp) as whatsapp from public.guest_order_access a
        where md5(lower(a.email)) = $1 group by lower(a.email)`,
      [hash],
    );
    if (!contact.rows[0]) return null;
    email = text(contact.rows[0].email);
    whatsapp = text(contact.rows[0].whatsapp);
  } else {
    const [prof, ord, trip, shop, feed, soc, cons, access, ship] = await Promise.all([
      pool.query(
        `select display_name, email, whatsapp, nationality, date_of_birth::text as date_of_birth,
                gender, created_at, updated_at from public.customer_profiles where auth_user_id = $1`,
        [id],
      ),
      pool.query(
        `${orderSelect} where o.customer_auth_subject = $1 order by o.created_at desc limit 50`,
        [id],
      ),
      pool.query(
        `select name, destination_name, departure_date::text as departure, return_date::text as return_date,
                (archived_at is not null) as archived, created_at
           from public.travel_trips where customer_auth_subject = $1 order by created_at desc limit 20`,
        [id],
      ),
      pool.query(
        `select public_code, status, total_idr, paid_at, recipient_name, recipient_whatsapp, city, created_at
           from public.shopping_orders where customer_auth_subject = $1 order by created_at desc limit 20`,
        [id],
      ),
      pool.query(
        `select id, kind, status, left(body, 140) as excerpt, created_at from public.feed_posts
          where customer_auth_subject = $1 and source = 'member' order by created_at desc limit 20`,
        [id],
      ),
      pool.query(
        `select (select count(*) from public.feed_comments where customer_auth_subject = $1 and source = 'member')::int as comments,
                (select count(*) from public.feed_likes where customer_auth_subject = $1)::int as likes`,
        [id],
      ),
      pool.query(
        `select distinct on (purpose) purpose, granted, created_at, source from public.customer_data_consents
          where customer_auth_subject = $1 order by purpose, created_at desc, id desc`,
        [id],
      ),
      pool.query(
        `select a.email, a.whatsapp from public.guest_order_access a
           join public.customer_orders o on o.id = a.order_id
          where o.customer_auth_subject = $1 order by a.created_at desc limit 1`,
        [id],
      ),
      pool.query(
        `select public_code, status, country, estimated_kg::float as estimated_kg, total_idr, paid_at, created_at
           from public.shipping_orders where customer_auth_subject = $1 order by created_at desc limit 20`,
        [id],
      ),
    ]);
    orders = ord;
    shipping = { rows: ship?.rows ?? [] };
    trips = trip;
    shopping = shop;
    posts = feed;
    social = soc;
    consents = cons;
    const p = prof.rows[0] as Record<string, unknown> | undefined;
    if (p) {
      displayName = text(p["display_name"]);
      profile = {
        nationality: text(p["nationality"]),
        dateOfBirth: text(p["date_of_birth"]),
        gender: text(p["gender"]),
        createdAt: new Date(String(p["created_at"])).toISOString(),
        updatedAt: new Date(String(p["updated_at"])).toISOString(),
      };
    }
    email = text(p?.["email"]) ?? text(access.rows[0]?.["email"]);
    whatsapp = text(p?.["whatsapp"]) ?? text(access.rows[0]?.["whatsapp"]);
    const known =
      Boolean(p) ||
      orders.rows.length +
        trips.rows.length +
        shopping.rows.length +
        shipping.rows.length +
        posts.rows.length +
        consents.rows.length >
        0;
    if (!known) return null;
  }

  // Reading a customer's contact details is itself recorded.
  try {
    const actor = (await getAdminEmailHandler()) ?? "admin";
    await pool.query(
      `insert into public.admin_audit_logs (id, action, entity_type, entity_id, reason, before_json, after_json)
       values ($1, 'customer.view', 'customer', $2, $3, null, null)`,
      [randomUUID(), ref(id), `${actor}: membuka detail pelanggan`],
    );
  } catch {
    // The page still works if the audit table is unreachable.
  }

  const iso2 = (value: unknown) => (value ? new Date(String(value)).toISOString() : null);
  return {
    id,
    kind: guest ? "guest" : "member",
    displayName,
    email,
    whatsapp,
    profile,
    orders: orders.rows.map((row: Record<string, unknown>) => ({
      id: String(row["id"]),
      code: text(row["public_order_code"]),
      status: String(row["status"]),
      total: String(row["total"] ?? "0"),
      currency: String(row["currency_code"] ?? "IDR"),
      paidAt: iso2(row["paid_at"]),
      createdAt: iso2(row["created_at"]) ?? "",
      items: text(row["items"]) ?? "",
    })),
    trips: trips.rows.map((row) => ({
      name: String(row["name"]),
      destination: String(row["destination_name"]),
      departure: text(row["departure"]),
      returnDate: text(row["return_date"]),
      archived: Boolean(row["archived"]),
      createdAt: iso2(row["created_at"]) ?? "",
    })),
    shopping: shopping.rows.map((row) => ({
      code: String(row["public_code"]),
      status: String(row["status"]),
      totalIdr: Number(row["total_idr"] ?? 0),
      paidAt: iso2(row["paid_at"]),
      recipientName: text(row["recipient_name"]),
      recipientWhatsapp: text(row["recipient_whatsapp"]),
      city: text(row["city"]),
      createdAt: iso2(row["created_at"]) ?? "",
    })),
    shipping: shipping.rows.map((row) => ({
      code: String(row["public_code"]),
      status: String(row["status"]),
      country: String(row["country"] ?? "JP"),
      estimatedKg: Number(row["estimated_kg"] ?? 0),
      totalIdr:
        row["total_idr"] === null || row["total_idr"] === undefined
          ? null
          : Number(row["total_idr"]),
      paidAt: iso2(row["paid_at"]),
      createdAt: iso2(row["created_at"]) ?? "",
    })),
    feeds: {
      posts: posts.rows.map((row) => ({
        id: String(row["id"]),
        kind: String(row["kind"]),
        status: String(row["status"]),
        excerpt: String(row["excerpt"] ?? ""),
        createdAt: iso2(row["created_at"]) ?? "",
      })),
      comments: Number(social.rows[0]?.["comments"] ?? 0),
      likes: Number(social.rows[0]?.["likes"] ?? 0),
    },
    consents: consents.rows.map((row) => ({
      purpose: String(row["purpose"]),
      granted: Boolean(row["granted"]),
      at: iso2(row["created_at"]) ?? "",
      source: String(row["source"]),
    })),
  };
}
