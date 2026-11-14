import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { buildSettingAudit } from "./admin-settings";
import { getAuthenticatedUser } from "./customer-session.fn";
import { readCustomerProfile } from "./customer-profile.server";
import {
  FEEDS_SETTING_KEY,
  FEED_BODY_MAX,
  type FeedActivityItem,
  GUIDE_AUTHOR_NAME,
  GUIDE_AUTHOR_SUBJECT,
  FEED_COMMENT_MAX,
  FEED_KINDS,
  FEED_PLACE_MAX,
  FEED_REPORT_REASONS,
  DEFAULT_FEEDS_CONFIG,
  feedAuthorName,
  feedPhotoMime,
  findBannedWord,
  normalizeFeedsConfig,
  parseFeedsConfig,
  type FeedCommentView,
  type FeedPostView,
  type FeedStatus,
  type FeedsConfig,
  type FeedsStatus,
} from "./feeds";
import { addItineraryItem } from "./my-trips.server";
import { assertConsent, hasConsent } from "./consent.server";
import { createCustomerNotification } from "./push.server";
import { travelGuides } from "./travel-guides";

/* ------------------------------------------------------------------ config */

const CACHE_MS = 30_000;
let cachedConfig: { at: number; config: FeedsConfig } | null = null;

async function readConfigRecord() {
  try {
    const result = await pool.query(
      "select value_json, version from public.admin_settings where setting_key = $1",
      [FEEDS_SETTING_KEY],
    );
    const row = result.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    if (!row) return { config: DEFAULT_FEEDS_CONFIG, version: 0 };
    return { config: normalizeFeedsConfig(row.value_json), version: Number(row.version) || 0 };
  } catch {
    return { config: DEFAULT_FEEDS_CONFIG, version: 0 };
  }
}

export async function getFeedsConfig(): Promise<FeedsConfig> {
  if (cachedConfig && Date.now() - cachedConfig.at < CACHE_MS) return cachedConfig.config;
  const { config } = await readConfigRecord();
  cachedConfig = { at: Date.now(), config };
  return config;
}

/* ------------------------------------------------------------------ viewer */

type Viewer = { id: string; email: string };

async function optionalViewer(): Promise<Viewer | null> {
  try {
    const user = await getAuthenticatedUser();
    return user?.id ? { id: user.id, email: user.email } : null;
  } catch {
    return null;
  }
}

async function requireViewer(): Promise<Viewer> {
  const user = await optionalViewer();
  if (!user) throw new Error("Masuk dulu untuk melanjutkan.");
  return user;
}

async function isBanned(subject: string) {
  const result = await pool.query("select 1 from feed_bans where customer_auth_subject = $1", [
    subject,
  ]);
  return (result.rowCount ?? 0) > 0;
}

async function requireOn() {
  const config = await getFeedsConfig();
  if (!config.enabled) throw new Error("Feeds belum tersedia.");
  return config;
}

/** Customer-safe status for the Explore section, the composer and the reaction buttons. */
export async function getFeedsStatusHandler(): Promise<FeedsStatus> {
  const config = await getFeedsConfig();
  const user = await optionalViewer();
  return {
    enabled: config.enabled,
    allowPhotos: config.allowPhotos,
    allowComments: config.allowComments,
    reviewsNewPosts: config.reviewFirstPosts > 0,
    signedIn: Boolean(user),
    banned: user ? await isBanned(user.id) : false,
    communityConsent: user ? await hasConsent(user.id, "community") : false,
  };
}

/** Seed and Travo Guide posts have no real account behind them: never notify them. */
const isSyntheticSubject = (subject: string) =>
  subject.startsWith("seed:") || subject.startsWith("system:");

let guideSyncedAt = 0;

/** Tests only: pin (Date.now()) or clear (0) the throttle so guide sync runs when expected. */
export function setGuideSyncClock(value: number) {
  guideSyncedAt = value;
}

/** Turns every published guide into a "Travo Guide" post once (idempotent, at most every 10 minutes). */
export async function syncGuidePosts() {
  if (Date.now() - guideSyncedAt < 10 * 60_000) return;
  guideSyncedAt = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  for (const guide of travelGuides) {
    if (guide.publishedAt > today) continue;
    await pool
      .query(
        `insert into feed_posts (customer_auth_subject, author_name, source, kind, body, link_path, link_label,
                               image_url, status, created_at, published_at)
       values ($1, $2, 'guide', 'tips', $3, $4, $5, $6, 'PUBLISHED', $7::timestamptz, $7::timestamptz)
       on conflict (link_path) where source = 'guide' do nothing`,
        [
          GUIDE_AUTHOR_SUBJECT,
          GUIDE_AUTHOR_NAME,
          guide.description.slice(0, FEED_BODY_MAX),
          `/panduan/${guide.slug}`,
          guide.title.slice(0, 160),
          guide.image ?? null,
          `${guide.publishedAt}T09:00:00+07:00`,
        ],
      )
      .catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ mapping */

type PostRow = {
  id: string;
  customer_auth_subject: string;
  author_name: string;
  kind: FeedPostView["kind"];
  body: string;
  destination_code: string | null;
  place_name: string | null;
  photo_mime: string | null;
  source: FeedPostView["source"];
  link_path: string | null;
  link_label: string | null;
  image_url: string | null;
  tc_author?: string | null;
  tc_body?: string | null;
  tc_likes?: number | null;
  status: FeedStatus;
  like_count: number;
  comment_count: number;
  created_at: Date;
  published_at: Date | null;
  liked?: boolean | null;
  bookmarked?: boolean | null;
};

const photoUrl = (row: Pick<PostRow, "id" | "photo_mime" | "image_url">) =>
  row.image_url ?? (row.photo_mime ? `/api/feed-photo/${row.id}` : null);

function toPostView(row: PostRow, viewerId: string | null): FeedPostView {
  return {
    id: row.id,
    authorName: row.author_name,
    mine: viewerId !== null && row.customer_auth_subject === viewerId,
    kind: row.kind,
    body: row.body,
    destinationCode: row.destination_code?.toUpperCase() ?? null,
    placeName: row.place_name,
    photoUrl: photoUrl(row),
    source: row.source,
    linkPath: row.link_path,
    linkLabel: row.link_label,
    topComment: row.tc_body
      ? {
          authorName: row.tc_author ?? "Traveler",
          body: row.tc_body,
          likeCount: Number(row.tc_likes ?? 0),
        }
      : null,
    status: row.status,
    likeCount: Number(row.like_count),
    commentCount: Number(row.comment_count),
    liked: Boolean(row.liked),
    bookmarked: Boolean(row.bookmarked),
    createdAt: new Date(row.created_at).toISOString(),
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
  };
}

const POST_COLUMNS = `p.id, p.customer_auth_subject, p.author_name, p.kind, p.body, p.destination_code,
  p.place_name, p.photo_mime, p.source, p.link_path, p.link_label, p.image_url, p.status, p.like_count, p.comment_count, p.created_at, p.published_at`;

/* ------------------------------------------------------------------ list */

const listSchema = z.object({
  kind: z.enum(FEED_KINDS).optional(),
  destination: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .optional(),
  /** new = newest first; foryou = ranked (boosted by the viewer's trips); mine = posts about the viewer's trips. */
  sort: z.enum(["new", "foryou", "mine"]).default("new"),
  /** Text search over the post, its place and the author's first name. */
  q: z.string().trim().min(2).max(60).optional(),
  /** Questions nobody answered yet. */
  unanswered: z.boolean().optional(),
  cursor: z.string().max(120).optional(),
  limit: z.number().int().min(1).max(30).default(10),
});
export const feedListInput = (data: unknown) => listSchema.parse(data ?? {});

export type FeedListBlocked = "signin" | "consent" | "notrips";

/** Destination codes (upper-case, 2 letters) of the viewer's active trips. */
async function viewerTripDestinations(subject: string): Promise<string[]> {
  const result = await pool.query(
    `select distinct upper(destination_code) as code from travel_trips
      where customer_auth_subject = $1 and archived_at is null and char_length(destination_code) = 2`,
    [subject],
  );
  return (result.rows as { code: string }[]).map((row) => row.code);
}

const FORYOU_SCORE = `(
  (p.like_count + 2 * p.comment_count + 3)
  / power(greatest(extract(epoch from (now() - p.published_at)) / 3600, 0) + 2, 1.4)
  * (case when p.destination_code = any($7::text[]) then 2.0 else 1.0 end)
)`;

export async function listFeedHandler({ data: input }: { data: z.input<typeof listSchema> }) {
  const data = listSchema.parse(input);
  const config = await getFeedsConfig();
  if (!config.enabled) {
    return {
      enabled: false as const,
      posts: [] as FeedPostView[],
      pending: [] as FeedPostView[],
      nextCursor: null as string | null,
      facets: [] as { code: string; count: number }[],
      serverTime: new Date().toISOString(),
      blocked: null as FeedListBlocked | null,
      tripDestinations: [] as string[],
    };
  }
  await syncGuidePosts();
  const user = await optionalViewer();
  const viewerId = user?.id ?? "";
  const first = !data.cursor;

  // The viewer's trip destinations personalise the ranking and drive the "Tujuanku" tab,
  // and only with the "Personalisasi" consent.
  let tripDestinations: string[] = [];
  let blocked: FeedListBlocked | null = null;
  if (user && data.sort !== "new") {
    if (await hasConsent(user.id, "personalization"))
      tripDestinations = await viewerTripDestinations(user.id);
    else if (data.sort === "mine") blocked = "consent";
  }
  if (data.sort === "mine") {
    if (!user) blocked = "signin";
    else if (!blocked && tripDestinations.length === 0) blocked = "notrips";
  }
  const serverTime = new Date().toISOString();
  if (blocked) {
    return {
      enabled: true as const,
      posts: [] as FeedPostView[],
      pending: [] as FeedPostView[],
      nextCursor: null as string | null,
      facets: [] as { code: string; count: number }[],
      serverTime,
      blocked,
      tripDestinations,
    };
  }

  const ranked = data.sort === "foryou";
  const offset = ranked && data.cursor ? Number(data.cursor) : 0;
  if (ranked && (!Number.isInteger(offset) || offset < 0)) throw new Error("Kursor tidak valid.");
  const [cursorAt, cursorId] = !ranked && data.cursor ? data.cursor.split("|") : [null, null];
  if (!ranked && data.cursor && (!cursorAt || !cursorId || !/^[0-9a-f-]{36}$/i.test(cursorId)))
    throw new Error("Kursor tidak valid.");
  const rows = await pool.query(
    `select ${POST_COLUMNS}, p.published_at::text as published_text,
            (l.customer_auth_subject is not null) as liked,
            (bm.post_id is not null) as bookmarked,
            tc.author_name as tc_author, tc.body as tc_body, tc.like_count as tc_likes
       from feed_posts p
       left join feed_likes l on l.post_id = p.id and l.customer_auth_subject = $1
       left join feed_bookmarks bm on bm.post_id = p.id and bm.customer_auth_subject = $1
       left join lateral (
         select c.author_name, c.body, c.like_count from feed_comments c
          where c.post_id = p.id and c.status = 'PUBLISHED'
          order by c.like_count desc, c.created_at desc limit 1
       ) tc on true
      where p.status = 'PUBLISHED'
        and ($2::text is null or p.kind = $2)
        and ($3::text is null or p.destination_code = upper($3))
        and ($4::timestamptz is null or (p.published_at, p.id) < ($4::timestamptz, $5::uuid))
        and ($9::boolean is false or p.destination_code = any($7::text[]))
        and ($10::text is null or strpos(lower(p.body), lower($10)) > 0
             or strpos(lower(coalesce(p.place_name, '')), lower($10)) > 0
             or strpos(lower(p.author_name), lower($10)) > 0)
        and ($11::boolean is false or (p.kind = 'tanya' and p.comment_count = 0))
        and not exists (select 1 from feed_reports r where r.post_id = p.id and r.reporter_subject = $1)
      order by ${ranked ? `${FORYOU_SCORE} desc, p.id desc` : "p.published_at desc, p.id desc"}
      offset $8 limit $6`,
    [
      viewerId,
      data.kind ?? null,
      data.destination ?? null,
      cursorAt,
      cursorId,
      data.limit + 1,
      tripDestinations,
      offset,
      data.sort === "mine",
      data.q ?? null,
      data.unanswered === true,
    ],
  );
  const page = rows.rows.slice(0, data.limit) as (PostRow & { published_text: string })[];
  const hasMore = rows.rows.length > data.limit;
  const last = page[page.length - 1];
  let pending: FeedPostView[] = [];
  let facets: { code: string; count: number }[] = [];
  if (first && user) {
    const own = await pool.query(
      `select ${POST_COLUMNS}, false as liked from feed_posts p
        where p.customer_auth_subject = $1 and p.status = 'PENDING'
        order by p.created_at desc limit 3`,
      [user.id],
    );
    pending = (own.rows as PostRow[]).map((row) => toPostView(row, user.id));
  }
  if (first) {
    const f = await pool.query(
      `select destination_code as code, count(*)::int as count from feed_posts
        where status = 'PUBLISHED' and destination_code is not null
        group by destination_code order by count(*) desc, destination_code limit 6`,
    );
    facets = (f.rows as { code: string; count: number }[]).map((r) => ({
      code: r.code.toUpperCase(),
      count: Number(r.count),
    }));
  }
  const nextCursor = !hasMore
    ? null
    : ranked
      ? String(offset + data.limit)
      : last
        ? `${last.published_text}|${last.id}`
        : null;
  return {
    enabled: true as const,
    posts: page.map((row) => toPostView(row, user?.id ?? null)),
    pending,
    nextCursor,
    facets,
    serverTime,
    blocked,
    tripDestinations,
  };
}

const newCountSchema = z.object({
  since: z.string().datetime(),
  kind: z.enum(FEED_KINDS).optional(),
  destination: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .optional(),
});
export const feedNewCountInput = (data: unknown) => newCountSchema.parse(data);

/** How many posts by other members were published since the timeline was loaded ("N post baru"). */
export async function countNewFeedPostsHandler({
  data,
}: {
  data: ReturnType<typeof feedNewCountInput>;
}) {
  const config = await getFeedsConfig();
  if (!config.enabled) return { count: 0 };
  const user = await optionalViewer();
  const result = await pool.query(
    `select count(*)::int as n from feed_posts p
      where p.status = 'PUBLISHED' and p.published_at > $1::timestamptz
        and p.customer_auth_subject <> $2
        and ($3::text is null or p.kind = $3)
        and ($4::text is null or p.destination_code = upper($4))`,
    [data.since, user?.id ?? "", data.kind ?? null, data.destination ?? null],
  );
  return { count: Math.min(Number(result.rows[0]?.n ?? 0), 99) };
}

/* ------------------------------------------------------------------ dock: Aku, Aktivitas, Tersimpan */

/** Full post views (liked, bookmarked, top comment) for the given ids, in the given order. */
async function loadPostViews(ids: string[], viewerId: string): Promise<FeedPostView[]> {
  if (!ids.length) return [];
  const rows = await pool.query(
    `select ${POST_COLUMNS}, (l.customer_auth_subject is not null) as liked,
            (bm.post_id is not null) as bookmarked,
            tc.author_name as tc_author, tc.body as tc_body, tc.like_count as tc_likes
       from feed_posts p
       left join feed_likes l on l.post_id = p.id and l.customer_auth_subject = $2
       left join feed_bookmarks bm on bm.post_id = p.id and bm.customer_auth_subject = $2
       left join lateral (
         select c.author_name, c.body, c.like_count from feed_comments c
          where c.post_id = p.id and c.status = 'PUBLISHED'
          order by c.like_count desc, c.created_at desc limit 1
       ) tc on true
      where p.id = any($1::uuid[])`,
    [ids, viewerId],
  );
  const byId = new Map((rows.rows as PostRow[]).map((row) => [row.id, row]));
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is PostRow => Boolean(row))
    .map((row) => toPostView(row, viewerId));
}

export async function toggleFeedBookmarkHandler({
  data,
}: {
  data: ReturnType<typeof feedIdInput>;
}) {
  await requireOn();
  const user = await requireViewer();
  const post = await pool.query("select status from feed_posts where id = $1", [data.id]);
  if (post.rows[0]?.status !== "PUBLISHED") throw new Error("Postingan tidak ditemukan.");
  const inserted = await pool.query(
    `insert into feed_bookmarks (post_id, customer_auth_subject) values ($1, $2)
     on conflict do nothing returning 1`,
    [data.id, user.id],
  );
  const bookmarked = (inserted.rowCount ?? 0) > 0;
  if (!bookmarked)
    await pool.query(
      "delete from feed_bookmarks where post_id = $1 and customer_auth_subject = $2",
      [data.id, user.id],
    );
  return { bookmarked };
}

/** "Aku": the member's counts, posts (with the ones waiting for review) and bookmarks. */
export async function getMyFeedProfileHandler() {
  const config = await getFeedsConfig();
  const user = await optionalViewer();
  if (!config.enabled || !user) {
    return {
      enabled: config.enabled,
      signedIn: Boolean(user),
      counts: { posts: 0, comments: 0, bookmarks: 0 },
      posts: [] as FeedPostView[],
      pending: [] as FeedPostView[],
      bookmarks: [] as FeedPostView[],
    };
  }
  const [counts, own, saved] = await Promise.all([
    pool.query(
      `select (select count(*) from feed_posts where customer_auth_subject = $1
                  and status in ('PENDING','PUBLISHED'))::int as posts,
              (select count(*) from feed_comments where customer_auth_subject = $1
                  and status = 'PUBLISHED')::int as comments,
              (select count(*) from feed_bookmarks b join feed_posts p on p.id = b.post_id
                where b.customer_auth_subject = $1 and p.status = 'PUBLISHED')::int as bookmarks`,
      [user.id],
    ),
    pool.query(
      `select id, status from feed_posts where customer_auth_subject = $1
          and status in ('PENDING','PUBLISHED') order by created_at desc limit 50`,
      [user.id],
    ),
    pool.query(
      `select b.post_id as id from feed_bookmarks b join feed_posts p on p.id = b.post_id
        where b.customer_auth_subject = $1 and p.status = 'PUBLISHED'
        order by b.created_at desc limit 50`,
      [user.id],
    ),
  ]);
  const ownRows = own.rows as { id: string; status: string }[];
  const [ownViews, savedViews] = await Promise.all([
    loadPostViews(
      ownRows.map((row) => row.id),
      user.id,
    ),
    loadPostViews(
      (saved.rows as { id: string }[]).map((row) => row.id),
      user.id,
    ),
  ]);
  const c = counts.rows[0] as { posts: number; comments: number; bookmarks: number };
  return {
    enabled: true,
    signedIn: true,
    counts: {
      posts: Number(c.posts),
      comments: Number(c.comments),
      bookmarks: Number(c.bookmarks),
    },
    posts: ownViews.filter((post) => post.status === "PUBLISHED"),
    pending: ownViews.filter((post) => post.status === "PENDING"),
    bookmarks: savedViews,
  };
}

const FEED_NOTIFICATION_TYPES = ["feed_comment", "feed_post"];

/** "Aktivitas": comments on the member's posts and the team's decisions, newest first. */
export async function getFeedActivityHandler() {
  const config = await getFeedsConfig();
  const user = await optionalViewer();
  if (!config.enabled || !user)
    return { signedIn: Boolean(user), items: [] as FeedActivityItem[], unread: 0 };
  const rows = await pool.query(
    `select n.id, n.type, n.title, n.body, n.action_href, n.created_at,
            (s.read_at is null) as unread
       from customer_notifications n
       left join customer_notification_states s
         on s.notification_id = n.id and s.recipient_customer_auth_subject = n.recipient_customer_auth_subject
      where n.recipient_customer_auth_subject = $1 and n.type = any($2::text[])
        and (n.expires_at is null or n.expires_at > now())
      order by n.created_at desc limit 60`,
    [user.id, FEED_NOTIFICATION_TYPES],
  );
  const items = (
    rows.rows as {
      id: string;
      type: FeedActivityItem["type"];
      title: string;
      body: string;
      action_href: string | null;
      created_at: Date;
      unread: boolean;
    }[]
  ).map((row): FeedActivityItem => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.action_href,
    at: new Date(row.created_at).toISOString(),
    unread: row.unread,
  }));
  return { signedIn: true, items, unread: items.filter((item) => item.unread).length };
}

export async function markFeedActivityReadHandler() {
  const user = await optionalViewer();
  if (!user) return { marked: 0 };
  const result = await pool.query(
    `insert into customer_notification_states (notification_id, recipient_customer_auth_subject, read_at)
     select n.id, n.recipient_customer_auth_subject, now() from customer_notifications n
      where n.recipient_customer_auth_subject = $1 and n.type = any($2::text[])
     on conflict (notification_id, recipient_customer_auth_subject)
     do update set read_at = coalesce(customer_notification_states.read_at, now())
        where customer_notification_states.read_at is null`,
    [user.id, FEED_NOTIFICATION_TYPES],
  );
  return { marked: result.rowCount ?? 0 };
}

/** The red number on the dock's Aktivitas item. */
export async function getFeedsUnreadCountHandler() {
  const config = await getFeedsConfig();
  const user = await optionalViewer();
  if (!config.enabled || !user) return { unread: 0 };
  const result = await pool.query(
    `select count(*)::int as n from customer_notifications n
       left join customer_notification_states s
         on s.notification_id = n.id and s.recipient_customer_auth_subject = n.recipient_customer_auth_subject
      where n.recipient_customer_auth_subject = $1 and n.type = any($2::text[])
        and s.read_at is null and (n.expires_at is null or n.expires_at > now())`,
    [user.id, FEED_NOTIFICATION_TYPES],
  );
  return { unread: Math.min(Number(result.rows[0]?.n ?? 0), 99) };
}

/* ------------------------------------------------------------------ detail */

const idSchema = z.object({ id: z.string().uuid() });
export const feedIdInput = (data: unknown) => idSchema.parse(data);

export async function getFeedPostHandler({ data }: { data: ReturnType<typeof feedIdInput> }) {
  const config = await getFeedsConfig();
  if (!config.enabled) return { enabled: false as const };
  const user = await optionalViewer();
  const viewerId = user?.id ?? "";
  const result = await pool.query(
    `select ${POST_COLUMNS}, (l.customer_auth_subject is not null) as liked,
            (bm.post_id is not null) as bookmarked,
            exists (select 1 from feed_reports r where r.post_id = p.id and r.reporter_subject = $2) as reported
       from feed_posts p
       left join feed_likes l on l.post_id = p.id and l.customer_auth_subject = $2
       left join feed_bookmarks bm on bm.post_id = p.id and bm.customer_auth_subject = $2
      where p.id = $1`,
    [data.id, viewerId],
  );
  const row = result.rows[0] as (PostRow & { reported: boolean }) | undefined;
  const visible =
    row &&
    (row.status === "PUBLISHED" ||
      (row.status === "PENDING" && row.customer_auth_subject === viewerId));
  if (!row || !visible)
    return { enabled: true as const, post: null, comments: [], reported: false };
  const comments = await pool.query(
    `select c.id, c.customer_auth_subject, c.author_name, c.body, c.created_at, c.like_count,
            (cl.customer_auth_subject is not null) as liked
       from feed_comments c
       left join feed_comment_likes cl on cl.comment_id = c.id and cl.customer_auth_subject = $2
      where c.post_id = $1 and c.status = 'PUBLISHED' order by c.created_at asc limit 200`,
    [data.id, viewerId],
  );
  return {
    enabled: true as const,
    post: toPostView(row, user?.id ?? null),
    reported: row.reported,
    comments: (
      comments.rows as {
        id: string;
        customer_auth_subject: string;
        author_name: string;
        body: string;
        created_at: Date;
        like_count: number;
        liked: boolean;
      }[]
    ).map((c): FeedCommentView => ({
      id: c.id,
      authorName: c.author_name,
      mine: Boolean(user) && c.customer_auth_subject === user!.id,
      body: c.body,
      likeCount: Number(c.like_count),
      liked: Boolean(c.liked),
      createdAt: new Date(c.created_at).toISOString(),
    })),
  };
}

/* ------------------------------------------------------------------ photo */

/** A post photo: anyone for a published post, the owner for a pending one, the team with `admin`. */
export async function feedPhoto(id: string, admin: boolean, viewerId: string | null) {
  const result = await pool.query(
    `select photo_mime, photo_bytes, status, customer_auth_subject from feed_posts
      where id = $1 and photo_bytes is not null`,
    [id],
  );
  const row = result.rows[0] as
    | { photo_mime: string; photo_bytes: Buffer; status: FeedStatus; customer_auth_subject: string }
    | undefined;
  if (!row) return null;
  const owner = viewerId !== null && row.customer_auth_subject === viewerId;
  const allowed = admin || row.status === "PUBLISHED" || (owner && row.status === "PENDING");
  if (!allowed) return null;
  return {
    mime: row.photo_mime,
    bytes: row.photo_bytes,
    cacheable: row.status === "PUBLISHED" && !admin,
  };
}

/* ------------------------------------------------------------------ create */

export type CreateFeedPostInput = {
  subject: string;
  body: string;
  kind: string;
  destinationCode?: string | null;
  placeName?: string | null;
  photo?: Uint8Array | null;
};

const createSchema = z.object({
  body: z.string().trim().min(1, "Tulis sesuatu dulu.").max(FEED_BODY_MAX),
  kind: z.enum(FEED_KINDS),
  destinationCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .optional()
    .nullable(),
  placeName: z.string().trim().max(FEED_PLACE_MAX).optional().nullable(),
});

export async function createFeedPost(input: CreateFeedPostInput) {
  const config = await requireOn();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(parsed.error.issues[0]?.message || "Isi postingan belum valid.");
  const data = parsed.data;
  if (await isBanned(input.subject)) throw new Error("Akunmu tidak dapat memposting di Feeds.");
  await assertConsent(input.subject, "community");
  let mime: string | null = null;
  if (input.photo && input.photo.length) {
    if (!config.allowPhotos) throw new Error("Foto belum diizinkan di Feeds.");
    mime = feedPhotoMime(input.photo);
    if (!mime) throw new Error("Foto harus JPG, PNG atau WebP, maksimal 5 MB.");
  }
  const profile = await readCustomerProfile({ id: input.subject, email: "" }).catch(() => null);
  const author = feedAuthorName(profile?.displayName);

  const counts = await pool.query(
    `select
       count(*) filter (where created_at > now() - interval '24 hours')::int as today,
       count(*) filter (where status = 'PENDING')::int as pending,
       count(*) filter (where published_at is not null)::int as ever_published
     from feed_posts where customer_auth_subject = $1`,
    [input.subject],
  );
  const c = counts.rows[0] as { today: number; pending: number; ever_published: number };
  if (Number(c.today) >= config.postsPerDay)
    throw new Error("Batas posting hari ini tercapai. Coba lagi besok.");
  if (Number(c.pending) >= 3)
    throw new Error("Kamu punya 3 postingan yang masih ditinjau. Tunggu sebentar ya.");

  // A double tap must not post twice.
  const duplicate = await pool.query(
    `select ${POST_COLUMNS}, false as liked from feed_posts p
      where p.customer_auth_subject = $1 and p.body = $2 and p.status <> 'REMOVED'
        and p.created_at > now() - interval '2 minutes' limit 1`,
    [input.subject, data.body],
  );
  if (duplicate.rows[0]) {
    const row = duplicate.rows[0] as PostRow;
    return { post: toPostView(row, input.subject), pending: row.status === "PENDING" };
  }

  const banned = findBannedWord(`${data.body} ${data.placeName ?? ""}`, config.bannedWords);
  const needsReview = Number(c.ever_published) < config.reviewFirstPosts;
  const status: FeedStatus = banned || needsReview ? "PENDING" : "PUBLISHED";
  const flag = banned ? `kata: ${banned}` : needsReview ? "post_awal" : null;
  const result = await pool.query(
    `insert into feed_posts
       (customer_auth_subject, author_name, kind, body, destination_code, place_name,
        photo_mime, photo_bytes, status, flag, published_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, case when $9 = 'PUBLISHED' then now() else null end)
     returning id, customer_auth_subject, author_name, kind, body, destination_code, place_name,
       photo_mime, status, like_count, comment_count, created_at, published_at`,
    [
      input.subject,
      author,
      data.kind,
      data.body,
      data.destinationCode ? data.destinationCode.toUpperCase() : null,
      data.placeName || null,
      mime,
      mime && input.photo ? Buffer.from(input.photo) : null,
      status,
      flag,
    ],
  );
  const row = { ...(result.rows[0] as PostRow), liked: false };
  return { post: toPostView(row, input.subject), pending: status === "PENDING" };
}

/* ------------------------------------------------------------------ reactions */

export async function toggleFeedLikeHandler({ data }: { data: ReturnType<typeof feedIdInput> }) {
  await requireOn();
  const user = await requireViewer();
  const post = await pool.query("select status from feed_posts where id = $1", [data.id]);
  if (post.rows[0]?.status !== "PUBLISHED") throw new Error("Postingan tidak ditemukan.");
  const inserted = await pool.query(
    `insert into feed_likes (post_id, customer_auth_subject) values ($1, $2)
     on conflict do nothing returning 1`,
    [data.id, user.id],
  );
  const liked = (inserted.rowCount ?? 0) > 0;
  if (!liked)
    await pool.query("delete from feed_likes where post_id = $1 and customer_auth_subject = $2", [
      data.id,
      user.id,
    ]);
  // Step the stored counter (instead of recounting rows) so example posts keep their base count.
  const count = await pool.query(
    `update feed_posts set like_count = greatest(like_count + $2, 0) where id = $1 returning like_count`,
    [data.id, liked ? 1 : -1],
  );
  return { liked, likeCount: Number(count.rows[0]?.like_count ?? 0) };
}

export async function toggleFeedCommentLikeHandler({
  data,
}: {
  data: ReturnType<typeof feedIdInput>;
}) {
  await requireOn();
  const user = await requireViewer();
  const target = await pool.query(
    `select c.status, p.status as post_status from feed_comments c
       join feed_posts p on p.id = c.post_id where c.id = $1`,
    [data.id],
  );
  const row = target.rows[0] as { status: string; post_status: string } | undefined;
  if (!row || row.status !== "PUBLISHED" || row.post_status !== "PUBLISHED")
    throw new Error("Komentar tidak ditemukan.");
  const inserted = await pool.query(
    `insert into feed_comment_likes (comment_id, customer_auth_subject) values ($1, $2)
     on conflict do nothing returning 1`,
    [data.id, user.id],
  );
  const liked = (inserted.rowCount ?? 0) > 0;
  if (!liked)
    await pool.query(
      "delete from feed_comment_likes where comment_id = $1 and customer_auth_subject = $2",
      [data.id, user.id],
    );
  const count = await pool.query(
    `update feed_comments set like_count = greatest(like_count + $2, 0) where id = $1 returning like_count`,
    [data.id, liked ? 1 : -1],
  );
  return { liked, likeCount: Number(count.rows[0]?.like_count ?? 0) };
}

const commentSchema = z.object({
  postId: z.string().uuid(),
  body: z.string().trim().min(1, "Tulis komentar dulu.").max(FEED_COMMENT_MAX),
});
export const feedCommentInput = (data: unknown) => commentSchema.parse(data);

export async function addFeedCommentHandler({
  data,
}: {
  data: ReturnType<typeof feedCommentInput>;
}) {
  const config = await requireOn();
  if (!config.allowComments) throw new Error("Komentar sedang dimatikan.");
  const user = await requireViewer();
  if (await isBanned(user.id)) throw new Error("Akunmu tidak dapat berkomentar di Feeds.");
  await assertConsent(user.id, "community");
  const post = await pool.query(
    "select status, customer_auth_subject, author_name from feed_posts where id = $1",
    [data.postId],
  );
  const target = post.rows[0] as
    { status: FeedStatus; customer_auth_subject: string; author_name: string } | undefined;
  if (!target || target.status !== "PUBLISHED") throw new Error("Postingan tidak ditemukan.");
  if (findBannedWord(data.body, config.bannedWords))
    throw new Error("Komentar mengandung kata yang tidak diizinkan.");
  const today = await pool.query(
    `select count(*)::int as n from feed_comments
      where customer_auth_subject = $1 and created_at > now() - interval '24 hours'`,
    [user.id],
  );
  if (Number(today.rows[0]?.n) >= config.commentsPerDay)
    throw new Error("Batas komentar hari ini tercapai.");
  const profile = await readCustomerProfile({ id: user.id, email: user.email }).catch(() => null);
  const author = feedAuthorName(profile?.displayName);
  const inserted = await pool.query(
    `insert into feed_comments (post_id, customer_auth_subject, author_name, body)
     values ($1,$2,$3,$4) returning id, created_at`,
    [data.postId, user.id, author, data.body],
  );
  await pool.query(
    `update feed_posts set comment_count = (select count(*) from feed_comments where post_id = $1 and status = 'PUBLISHED')
      where id = $1`,
    [data.postId],
  );
  const row = inserted.rows[0] as { id: string; created_at: Date };
  if (
    target.customer_auth_subject !== user.id &&
    !isSyntheticSubject(target.customer_auth_subject)
  ) {
    await createCustomerNotification({
      subject: target.customer_auth_subject,
      type: "feed_comment",
      title: "Komentar baru di postinganmu",
      body: `${author}: ${data.body.slice(0, 90)}`,
      href: `/feeds/${data.postId}`,
      eventKey: `feed-comment:${row.id}`,
      source: "feeds",
    }).catch(() => undefined);
  }
  const comment: FeedCommentView = {
    id: row.id,
    authorName: author,
    mine: true,
    body: data.body,
    likeCount: 0,
    liked: false,
    createdAt: new Date(row.created_at).toISOString(),
  };
  return { comment };
}

const commentIdSchema = z.object({ id: z.string().uuid() });
export const feedCommentIdInput = (data: unknown) => commentIdSchema.parse(data);

export async function deleteOwnFeedCommentHandler({
  data,
}: {
  data: ReturnType<typeof feedCommentIdInput>;
}) {
  const user = await requireViewer();
  const result = await pool.query(
    `update feed_comments set status = 'HIDDEN'
      where id = $1 and customer_auth_subject = $2 and status = 'PUBLISHED' returning post_id`,
    [data.id, user.id],
  );
  const postId = result.rows[0]?.post_id as string | undefined;
  if (!postId) throw new Error("Komentar tidak ditemukan.");
  await pool.query(
    `update feed_posts set comment_count = (select count(*) from feed_comments where post_id = $1 and status = 'PUBLISHED')
      where id = $1`,
    [postId],
  );
  return { ok: true as const };
}

export async function deleteOwnFeedPostHandler({ data }: { data: ReturnType<typeof feedIdInput> }) {
  const user = await requireViewer();
  const result = await pool.query(
    `update feed_posts set status = 'REMOVED', status_reason = 'author', updated_at = now()
      where id = $1 and customer_auth_subject = $2 and status in ('PENDING','PUBLISHED','HIDDEN')
      returning id`,
    [data.id, user.id],
  );
  if (!result.rowCount) throw new Error("Postingan tidak ditemukan.");
  return { ok: true as const };
}

/* ------------------------------------------------------------------ reports */

const reportSchema = z.object({ postId: z.string().uuid(), reason: z.enum(FEED_REPORT_REASONS) });
export const feedReportInput = (data: unknown) => reportSchema.parse(data);

async function recountReports(postId: string, threshold: number) {
  const count = await pool.query(
    "select count(*)::int as n from feed_reports where post_id = $1 and status = 'OPEN'",
    [postId],
  );
  const n = Number(count.rows[0]?.n ?? 0);
  await pool.query("update feed_posts set report_count = $2 where id = $1", [postId, n]);
  if (n >= threshold) {
    await pool.query(
      `update feed_posts set status = 'HIDDEN', status_reason = 'auto_reports', updated_at = now()
        where id = $1 and status = 'PUBLISHED'`,
      [postId],
    );
  } else {
    await pool.query(
      `update feed_posts set status = 'PUBLISHED', status_reason = null, updated_at = now()
        where id = $1 and status = 'HIDDEN' and status_reason = 'auto_reports'`,
      [postId],
    );
  }
  return n;
}

export async function reportFeedPostHandler({
  data,
}: {
  data: ReturnType<typeof feedReportInput>;
}) {
  const config = await requireOn();
  const user = await requireViewer();
  const post = await pool.query(
    "select status, customer_auth_subject from feed_posts where id = $1",
    [data.postId],
  );
  const row = post.rows[0] as { status: FeedStatus; customer_auth_subject: string } | undefined;
  if (!row || row.status !== "PUBLISHED") throw new Error("Postingan tidak ditemukan.");
  if (row.customer_auth_subject === user.id)
    throw new Error("Kamu tidak bisa melaporkan postinganmu.");
  await pool.query(
    `insert into feed_reports (post_id, reporter_subject, reason) values ($1,$2,$3)
     on conflict (post_id, reporter_subject) do update set reason = excluded.reason`,
    [data.postId, user.id, data.reason],
  );
  await recountReports(data.postId, config.reportHideThreshold);
  return { ok: true as const };
}

export async function undoFeedReportHandler({ data }: { data: ReturnType<typeof feedIdInput> }) {
  const config = await requireOn();
  const user = await requireViewer();
  await pool.query(
    "delete from feed_reports where post_id = $1 and reporter_subject = $2 and status = 'OPEN'",
    [data.id, user.id],
  );
  await recountReports(data.id, config.reportHideThreshold);
  return { ok: true as const };
}

/* ------------------------------------------------------------------ save to Agenda */

const saveSchema = z.object({
  postId: z.string().uuid(),
  tripId: z.string().uuid(),
  activityDate: z.string().date(),
});
export const feedSaveInput = (data: unknown) => saveSchema.parse(data);

export async function saveFeedPostToAgendaHandler({
  data,
}: {
  data: ReturnType<typeof feedSaveInput>;
}) {
  await requireOn();
  await requireViewer();
  const result = await pool.query(
    "select place_name, body, author_name, status from feed_posts where id = $1",
    [data.postId],
  );
  const row = result.rows[0] as
    | { place_name: string | null; body: string; author_name: string; status: FeedStatus }
    | undefined;
  if (!row || row.status !== "PUBLISHED" || !row.place_name)
    throw new Error("Tempat ini tidak bisa disimpan ke Agenda.");
  // addItineraryItem checks that the trip belongs to the signed-in customer.
  const item = await addItineraryItem({
    tripId: data.tripId,
    activityDate: data.activityDate,
    title: row.place_name,
    location: row.place_name,
    notes: `Tips dari ${row.author_name} di Feeds Djiwa: ${row.body}`.slice(0, 2000),
  });
  return { ok: true as const, itemId: (item as { id?: string } | undefined)?.id ?? null };
}

/* ------------------------------------------------------------------ admin */

const authorRef = (subject: string) =>
  createHash("sha256").update(`feeds:${subject}`).digest("hex").slice(0, 8);

async function auditLog(
  action: string,
  entityType: string,
  entityId: string,
  reason: string,
  before: unknown,
  after: unknown,
) {
  const actor = (await getAdminEmailHandler()) ?? "admin";
  await pool.query(
    `insert into public.admin_audit_logs (id, action, entity_type, entity_id, reason, before_json, after_json)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
    [
      randomUUID(),
      action,
      entityType,
      entityId,
      `${actor}: ${reason}`,
      JSON.stringify(before ?? null),
      JSON.stringify(after ?? null),
    ],
  );
}

type AdminPostRow = PostRow & {
  flag: string | null;
  status_reason: string | null;
  report_count: number;
  author_posts: number;
  banned: boolean;
};

const adminPostView = (row: AdminPostRow) => ({
  id: row.id,
  authorName: row.author_name,
  authorRef: authorRef(row.customer_auth_subject),
  authorPosts: Number(row.author_posts),
  banned: Boolean(row.banned),
  kind: row.kind,
  body: row.body,
  destinationCode: row.destination_code?.toUpperCase() ?? null,
  placeName: row.place_name,
  photoUrl: row.image_url ?? (row.photo_mime ? `/api/feed-photo/${row.id}?admin=1` : null),
  source: row.source,
  status: row.status,
  statusReason: row.status_reason,
  flag: row.flag,
  likeCount: Number(row.like_count),
  commentCount: Number(row.comment_count),
  reportCount: Number(row.report_count),
  createdAt: new Date(row.created_at).toISOString(),
});

const ADMIN_POST_SELECT = `select ${POST_COLUMNS}, p.flag, p.status_reason, p.report_count,
    (select count(*) from feed_posts q where q.customer_auth_subject = p.customer_auth_subject)::int as author_posts,
    exists (select 1 from feed_bans b where b.customer_auth_subject = p.customer_auth_subject) as banned
  from feed_posts p`;

export async function getAdminFeedsHandler() {
  await requireAdmin();
  const { config, version } = await readConfigRecord();
  const [pending, reported, recent, stats, bans] = await Promise.all([
    pool.query(
      `${ADMIN_POST_SELECT} where p.status = 'PENDING' order by p.created_at asc limit 50`,
    ),
    pool.query(
      `${ADMIN_POST_SELECT}
        where exists (select 1 from feed_reports r where r.post_id = p.id and r.status = 'OPEN')
        order by p.report_count desc, p.created_at desc limit 50`,
    ),
    pool.query(
      `${ADMIN_POST_SELECT} where p.status <> 'PENDING' order by p.created_at desc limit 60`,
    ),
    pool.query(
      `select
         (select count(*) from feed_posts where status = 'PENDING')::int as pending,
         (select count(distinct post_id) from feed_reports where status = 'OPEN')::int as open_reports,
         (select count(*) from feed_posts where status = 'PUBLISHED')::int as published,
         (select count(*) from feed_posts where created_at > now() - interval '7 days')::int as posts_7d,
         (select count(*) from feed_comments where created_at > now() - interval '7 days')::int as comments_7d,
         (select count(*) from feed_likes where created_at > now() - interval '7 days')::int as likes_7d,
         (select count(*) from feed_bans)::int as bans`,
    ),
    pool.query(
      "select customer_auth_subject, reason, created_at from feed_bans order by created_at desc limit 50",
    ),
  ]);
  const reasons = await pool.query(
    `select post_id, reason, count(*)::int as n from feed_reports where status = 'OPEN' group by post_id, reason`,
  );
  const byPost = new Map<string, { reason: string; n: number }[]>();
  for (const r of reasons.rows as { post_id: string; reason: string; n: number }[]) {
    const list = byPost.get(r.post_id) ?? [];
    list.push({ reason: r.reason, n: Number(r.n) });
    byPost.set(r.post_id, list);
  }
  const s = stats.rows[0] as Record<string, number>;
  return {
    config,
    version,
    stats: {
      pending: Number(s["pending"]),
      openReports: Number(s["open_reports"]),
      published: Number(s["published"]),
      posts7d: Number(s["posts_7d"]),
      comments7d: Number(s["comments_7d"]),
      likes7d: Number(s["likes_7d"]),
      bans: Number(s["bans"]),
    },
    pending: (pending.rows as AdminPostRow[]).map(adminPostView),
    reported: (reported.rows as AdminPostRow[]).map((row) => ({
      ...adminPostView(row),
      reasons: byPost.get(row.id) ?? [],
    })),
    recent: (recent.rows as AdminPostRow[]).map(adminPostView),
    bans: (
      bans.rows as { customer_auth_subject: string; reason: string | null; created_at: Date }[]
    ).map((b) => ({
      authorRef: authorRef(b.customer_auth_subject),
      reason: b.reason,
      createdAt: new Date(b.created_at).toISOString(),
    })),
  };
}

const adminActionSchema = z.object({
  postId: z.string().uuid(),
  action: z.enum(["approve", "hide", "restore", "remove", "dismiss", "ban", "unban"]),
  note: z.string().trim().max(300).optional(),
});
export const adminFeedActionInput = (data: unknown) => adminActionSchema.parse(data);

async function notifyAuthor(
  subject: string,
  eventKey: string,
  title: string,
  body: string,
  postId: string,
) {
  if (isSyntheticSubject(subject)) return;
  await createCustomerNotification({
    subject,
    type: "feed_post",
    title,
    body,
    href: `/feeds/${postId}`,
    eventKey,
    source: "feeds",
  }).catch(() => undefined);
}

export async function adminFeedActionHandler({
  data,
}: {
  data: ReturnType<typeof adminFeedActionInput>;
}) {
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const found = await pool.query(
    "select id, customer_auth_subject, status, status_reason, published_at, body from feed_posts where id = $1",
    [data.postId],
  );
  const post = found.rows[0] as
    | {
        id: string;
        customer_auth_subject: string;
        status: FeedStatus;
        status_reason: string | null;
        published_at: Date | null;
        body: string;
      }
    | undefined;
  if (!post) throw new Error("Postingan tidak ditemukan.");
  const note = data.note || data.action;
  const before = { status: post.status, reason: post.status_reason };

  if (data.action === "approve") {
    if (post.status !== "PENDING") throw new Error("Postingan ini tidak sedang menunggu tinjauan.");
    await pool.query(
      `update feed_posts set status = 'PUBLISHED', status_reason = null, published_at = now(),
              reviewed_by = $2, reviewed_at = now(), updated_at = now() where id = $1`,
      [post.id, actor],
    );
    await notifyAuthor(
      post.customer_auth_subject,
      `feed-approve:${post.id}`,
      "Postinganmu sudah tayang",
      "Traveler lain sekarang bisa melihat postinganmu di Feeds.",
      post.id,
    );
  } else if (data.action === "hide" || data.action === "remove") {
    const to: FeedStatus = data.action === "hide" ? "HIDDEN" : "REMOVED";
    await pool.query(
      `update feed_posts set status = $2, status_reason = $3, reviewed_by = $4, reviewed_at = now(),
              updated_at = now() where id = $1`,
      [post.id, to, `admin:${note}`.slice(0, 120), actor],
    );
    await pool.query(
      "update feed_reports set status = 'ACTIONED' where post_id = $1 and status = 'OPEN'",
      [post.id],
    );
    if (post.status === "PENDING" || post.status === "PUBLISHED") {
      await notifyAuthor(
        post.customer_auth_subject,
        `feed-${data.action}:${post.id}`,
        data.action === "remove" ? "Postinganmu dihapus" : "Postinganmu disembunyikan",
        "Postingan itu tidak sesuai aturan Feeds Djiwa. Hubungi Bantuan bila ada pertanyaan.",
        post.id,
      );
    }
  } else if (data.action === "restore") {
    if (post.status !== "HIDDEN")
      throw new Error("Hanya postingan tersembunyi yang bisa dipulihkan.");
    await pool.query(
      `update feed_posts set status = 'PUBLISHED', status_reason = null,
              published_at = coalesce(published_at, now()), reviewed_by = $2, reviewed_at = now(),
              updated_at = now() where id = $1`,
      [post.id, actor],
    );
    await pool.query(
      "update feed_reports set status = 'DISMISSED' where post_id = $1 and status = 'OPEN'",
      [post.id],
    );
    await pool.query("update feed_posts set report_count = 0 where id = $1", [post.id]);
  } else if (data.action === "dismiss") {
    await pool.query(
      "update feed_reports set status = 'DISMISSED' where post_id = $1 and status = 'OPEN'",
      [post.id],
    );
    await pool.query(
      `update feed_posts set report_count = 0,
              status = case when status = 'HIDDEN' and status_reason = 'auto_reports' then 'PUBLISHED' else status end,
              status_reason = case when status = 'HIDDEN' and status_reason = 'auto_reports' then null else status_reason end,
              updated_at = now() where id = $1`,
      [post.id],
    );
  } else if (data.action === "ban") {
    await pool.query(
      `insert into feed_bans (customer_auth_subject, reason, banned_by) values ($1,$2,$3)
       on conflict (customer_auth_subject) do update set reason = excluded.reason, banned_by = excluded.banned_by`,
      [post.customer_auth_subject, data.note || null, actor],
    );
    await pool.query(
      `update feed_posts set status = 'HIDDEN', status_reason = 'author_banned', updated_at = now()
        where customer_auth_subject = $1 and status in ('PENDING','PUBLISHED')`,
      [post.customer_auth_subject],
    );
  } else if (data.action === "unban") {
    await pool.query("delete from feed_bans where customer_auth_subject = $1", [
      post.customer_auth_subject,
    ]);
    await pool.query(
      `update feed_posts set status = case when published_at is null then 'PENDING' else 'PUBLISHED' end,
              status_reason = null, updated_at = now()
        where customer_auth_subject = $1 and status = 'HIDDEN' and status_reason = 'author_banned'`,
      [post.customer_auth_subject],
    );
  }
  await auditLog(`feeds.${data.action}`, "feed_post", post.id, note, before, {
    action: data.action,
  });
  return { ok: true as const };
}

export async function getAdminFeedCommentsHandler({
  data,
}: {
  data: ReturnType<typeof feedIdInput>;
}) {
  await requireAdmin();
  const result = await pool.query(
    `select id, author_name, body, status, created_at from feed_comments
      where post_id = $1 order by created_at asc limit 200`,
    [data.id],
  );
  return {
    comments: (
      result.rows as {
        id: string;
        author_name: string;
        body: string;
        status: "PUBLISHED" | "HIDDEN";
        created_at: Date;
      }[]
    ).map((c) => ({
      id: c.id,
      authorName: c.author_name,
      body: c.body,
      status: c.status,
      createdAt: new Date(c.created_at).toISOString(),
    })),
  };
}

const adminCommentSchema = z.object({
  commentId: z.string().uuid(),
  action: z.enum(["hide", "restore"]),
});
export const adminFeedCommentActionInput = (data: unknown) => adminCommentSchema.parse(data);

export async function adminFeedCommentActionHandler({
  data,
}: {
  data: ReturnType<typeof adminFeedCommentActionInput>;
}) {
  await requireAdmin();
  const next = data.action === "hide" ? "HIDDEN" : "PUBLISHED";
  const result = await pool.query(
    "update feed_comments set status = $2 where id = $1 returning post_id",
    [data.commentId, next],
  );
  const postId = result.rows[0]?.post_id as string | undefined;
  if (!postId) throw new Error("Komentar tidak ditemukan.");
  await pool.query(
    `update feed_posts set comment_count = (select count(*) from feed_comments where post_id = $1 and status = 'PUBLISHED')
      where id = $1`,
    [postId],
  );
  await auditLog(
    `feeds.comment_${data.action}`,
    "feed_comment",
    data.commentId,
    data.action,
    null,
    {
      status: next,
    },
  );
  return { ok: true as const };
}

const saveConfigSchema = z.object({
  config: z.unknown(),
  expectedVersion: z.number().int().min(0),
  reason: z.string().trim().min(3).max(200),
});
export const saveFeedsConfigInput = (data: unknown) => saveConfigSchema.parse(data);

export async function saveFeedsConfigHandler({
  data,
}: {
  data: ReturnType<typeof saveFeedsConfigInput>;
}) {
  await requireAdmin();
  const config = parseFeedsConfig(data.config);
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      "select value_json, version from public.admin_settings where setting_key = $1 for update",
      [FEEDS_SETTING_KEY],
    );
    const row = current.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    const version = row ? Number(row.version) : 0;
    if (version !== data.expectedVersion) {
      await client.query("rollback");
      return { ok: false as const, conflict: true as const, version };
    }
    const audit = buildSettingAudit(
      FEEDS_SETTING_KEY,
      row?.value_json ?? null,
      config,
      actor,
      data.reason,
    );
    await client.query(
      `insert into public.admin_settings (setting_key, value_json, version, updated_at)
       values ($1, $2::jsonb, 1, now())
       on conflict (setting_key) do update
       set value_json = excluded.value_json, version = admin_settings.version + 1, updated_at = now()`,
      [FEEDS_SETTING_KEY, JSON.stringify(config)],
    );
    await client.query(
      `insert into public.admin_audit_logs (id, action, entity_type, entity_id, reason, before_json, after_json)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [
        randomUUID(),
        audit.action,
        audit.entityType,
        audit.entityId,
        `${actor}: ${audit.reason}`,
        JSON.stringify(audit.beforeJson),
        JSON.stringify(audit.afterJson),
      ],
    );
    await client.query("commit");
    cachedConfig = null;
    return { ok: true as const, conflict: false as const, version: version + 1, config };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
