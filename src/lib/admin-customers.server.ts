import { createHash, randomUUID } from "node:crypto";
import { requireAdmin } from "./admin-guard";
import { pool } from "../db/client.server";
import { getAdminEmailHandler } from "./admin-guard.server";

export type AdminCustomerKind = "all" | "member" | "guest" | "noprofile";

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
  latestOrderAt: string | null;
  tripCount: number;
  feedPostCount: number;
  lastActivityAt: string | null;
  firstSeenAt: string | null;
};

export type AdminCustomersResult = {
  rows: AdminCustomerRow[];
  /** Rows that match the search and filter (rows may be fewer: the list is paged). */
  total: number;
  counts: { all: number; member: number; guest: number; noProfile: number };
};

export const adminCustomersInput = (data: { q?: string; kind?: string; limit?: number } = {}) => ({
  q: (data.q ?? "").trim().slice(0, 80),
  kind: (["member", "guest", "noprofile"].includes(data.kind ?? "")
    ? data.kind
    : "all") as AdminCustomerKind,
  limit: Math.min(Math.max(data.limit ?? 50, 1), 200),
});

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
           coalesce(oc.n, 0)::int as order_count, oc.latest as latest_order_at,
           coalesce(tc.n, 0)::int as trip_count, coalesce(fc.n, 0)::int as feed_post_count,
           greatest(cp.updated_at, oc.latest, tc.latest, fc.latest) as last_activity_at,
           least(cp.created_at, oc.first, tc.first, fc.first) as first_seen_at
      from subjects sub
      left join public.customer_profiles cp on cp.auth_user_id = sub.s
      left join lateral (select a.email, a.whatsapp from public.guest_order_access a
                           join public.customer_orders o on o.id = a.order_id
                          where o.customer_auth_subject = sub.s order by a.created_at desc limit 1) ca on true
      left join lateral (select count(*) n, max(created_at) latest, min(created_at) first
                           from public.customer_orders where customer_auth_subject = sub.s) oc on true
      left join lateral (select count(*) n, max(created_at) latest, min(created_at) first
                           from public.travel_trips where customer_auth_subject = sub.s) tc on true
      left join lateral (select count(*) n, max(created_at) latest, min(created_at) first
                           from public.feed_posts where customer_auth_subject = sub.s and source = 'member') fc on true
     where sub.s not like 'seed:%' and sub.s not like 'system:%'
  ), guests as (
    select 'guest:' || md5(lower(a.email)) as subject, 'guest'::text as kind, lower(a.email) as email,
           max(a.whatsapp) as whatsapp, null::text as display_name, false as profile_complete,
           count(distinct o.id)::int as order_count, max(o.created_at) as latest_order_at,
           0 as trip_count, 0 as feed_post_count,
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

const MATCH = `(
  $1 = ''
  or strpos(lower(coalesce(email, '')), lower($1)) > 0
  or strpos(lower(coalesce(display_name, '')), lower($1)) > 0
  or strpos(coalesce(whatsapp, ''), $1) > 0
)`;

const ref = (subject: string) =>
  createHash("sha256").update(`customer:${subject}`).digest("hex").slice(0, 10);

const iso = (value: unknown) => (value ? new Date(String(value)).toISOString() : null);

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
        where ${MATCH} and ${KIND_FILTER}
        order by last_activity_at desc nulls last, first_seen_at desc nulls last
        limit $3`,
      [data.q, data.kind, data.limit],
    ),
    pool.query(
      `${PEOPLE_CTE}
       select count(*)::int as total,
              count(*) filter (where kind = 'member')::int as member,
              count(*) filter (where kind = 'guest')::int as guest,
              count(*) filter (where kind = 'member' and not profile_complete)::int as no_profile
         from people where ${MATCH}`,
      [data.q],
    ),
  ]);
  const c = (counts.rows[0] ?? {}) as Record<string, number>;
  return {
    rows: list.rows.map((row): AdminCustomerRow => ({
      id: String(row.subject),
      ref: ref(String(row.subject)),
      kind: row.kind === "guest" ? "guest" : "member",
      profileComplete: Boolean(row.profile_complete),
      email: row.email ? String(row.email) : null,
      whatsapp: row.whatsapp ? String(row.whatsapp) : null,
      displayName: row.display_name ? String(row.display_name) : null,
      orderCount: Number(row.order_count ?? 0),
      latestOrderAt: iso(row.latest_order_at),
      tripCount: Number(row.trip_count ?? 0),
      feedPostCount: Number(row.feed_post_count ?? 0),
      lastActivityAt: iso(row.last_activity_at),
      firstSeenAt: iso(row.first_seen_at),
    })),
    total: Number(list.rows[0]?.total ?? 0),
    counts: {
      all: Number(c["total"] ?? 0),
      member: Number(c["member"] ?? 0),
      guest: Number(c["guest"] ?? 0),
      noProfile: Number(c["no_profile"] ?? 0),
    },
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
    const [prof, ord, trip, shop, feed, soc, cons, access] = await Promise.all([
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
        `select public_code, status, total_idr, recipient_name, recipient_whatsapp, city, created_at
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
    ]);
    orders = ord;
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
      recipientName: text(row["recipient_name"]),
      recipientWhatsapp: text(row["recipient_whatsapp"]),
      city: text(row["city"]),
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
