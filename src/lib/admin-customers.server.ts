import { createHash } from "node:crypto";
import { requireAdmin } from "./admin-guard";
import { pool } from "../db/client.server";
import { maskEmail, maskWhatsapp } from "./admin-display";

export type AdminCustomerKind = "all" | "member" | "guest" | "noprofile";

export type AdminCustomerRow = {
  /** A hashed reference: the auth subject itself never reaches the browser. */
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
    select sub.s as subject, 'member'::text as kind, cp.email, cp.whatsapp, cp.display_name,
           (cp.auth_user_id is not null) as profile_complete,
           coalesce(oc.n, 0)::int as order_count, oc.latest as latest_order_at,
           coalesce(tc.n, 0)::int as trip_count, coalesce(fc.n, 0)::int as feed_post_count,
           greatest(cp.updated_at, oc.latest, tc.latest, fc.latest) as last_activity_at,
           least(cp.created_at, oc.first, tc.first, fc.first) as first_seen_at
      from subjects sub
      left join public.customer_profiles cp on cp.auth_user_id = sub.s
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
      ref: ref(String(row.subject)),
      kind: row.kind === "guest" ? "guest" : "member",
      profileComplete: Boolean(row.profile_complete),
      email: maskEmail(row.email ? String(row.email) : null),
      whatsapp: maskWhatsapp(row.whatsapp ? String(row.whatsapp) : null),
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
