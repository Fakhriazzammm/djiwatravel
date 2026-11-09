import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { pool } from "@/db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { getAuthenticatedUser } from "./customer-session.fn";
import { createCustomerNotification } from "./push.server";
import type { ShopperOrderStatus } from "./personal-shopper";
import {
  chatStage,
  cleanMessage,
  messagePreview,
  messageProblem,
  nameFromEmail,
  offerState,
  replyPromise,
  responseDueAt,
  threadTitle,
  type ChatCard,
  type ChatKind,
  type ChatMessageView,
  type ChatSender,
  type ChatStage,
} from "./shopper-chat";
import {
  discoveryEventNote,
  parseProductReference,
  productPhotoMime,
  type DiscoveryOffer,
} from "./shopper-discovery";

type Q = Pool | PoolClient;

type ThreadRow = {
  id: string;
  customer_auth_subject: string;
  customer_name: string;
  kind: ChatKind;
  title: string;
  request_id: string | null;
  order_id: string | null;
  assignee: string | null;
  closed_at: Date | null;
  customer_unread: number;
  admin_unread: number;
  last_message_at: Date;
  last_preview: string;
  last_sender: ChatSender | null;
  response_due_at: Date | null;
  created_at: Date;
  request_status: string | null;
  request_version: number | null;
  request_offer_expires_at: Date | null;
  request_order_id: string | null;
  order_status: ShopperOrderStatus | null;
  order_code: string | null;
  order_ref: string | null;
  has_link: boolean | null;
  has_photo: boolean | null;
};

type MessageRow = {
  id: string;
  thread_id: string;
  sender: ChatSender;
  sender_name: string;
  body: string;
  internal: boolean;
  card: ChatCard | null;
  attachment_id: string | null;
  created_at: Date;
};

export type ChatThreadSummary = {
  id: string;
  kind: ChatKind;
  title: string;
  stage: ChatStage;
  lastPreview: string;
  lastAt: string;
  lastSender: ChatSender | null;
  /** Unread for the viewer: the customer's own count, or the team's. */
  unread: number;
  closed: boolean;
  requestId: string | null;
  orderId: string | null;
  orderCode: string | null;
  customerName: string;
  assignee: string | null;
  dueAt: string | null;
  /** What started the thread, for the list icon. */
  icon: "link" | "photo" | "order" | "chat";
};

const THREAD_SELECT = `
  select t.*, r.status as request_status, r.version as request_version,
         r.offer_expires_at as request_offer_expires_at, r.order_id as request_order_id,
         o.status as order_status, o.public_code as order_code, o.id as order_ref,
         (r.source_url is not null) as has_link, (r.photo_mime is not null) as has_photo
    from shopping_chat_threads t
    left join shopping_discovery_requests r on r.id = t.request_id
    left join shopping_orders o on o.id = coalesce(t.order_id, r.order_id)`;

async function chatConfig() {
  const { discoveryConfig } = await import("./shopper-discovery.server");
  return (await discoveryConfig()).config;
}

async function requireChat() {
  const config = await chatConfig();
  if (!config.chatEnabled) throw new Error("Chat belum tersedia.");
  const { getShopperConfig } = await import("./personal-shopper.server");
  const shop = await getShopperConfig();
  if (!shop.enabled || !shop.countries.JP) throw new Error("Titip Belanja belum tersedia.");
  return config;
}

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

function summary(row: ThreadRow, viewer: "customer" | "admin"): ChatThreadSummary {
  const stage = chatStage({
    kind: row.kind,
    requestStatus: row.request_status,
    orderStatus: row.order_status,
  });
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    stage,
    lastPreview: row.last_preview,
    lastAt: new Date(row.last_message_at).toISOString(),
    lastSender: row.last_sender,
    unread: viewer === "customer" ? row.customer_unread : row.admin_unread,
    closed: row.closed_at !== null,
    requestId: row.request_id,
    orderId: row.order_ref,
    orderCode: row.order_code,
    customerName: row.customer_name,
    assignee: row.assignee,
    dueAt: iso(row.response_due_at),
    icon: row.kind === "ORDER" ? "order" : row.has_photo ? "photo" : row.has_link ? "link" : "chat",
  };
}

/* ------------------------------------------------------------ posting core */

type PostArgs = {
  threadId: string;
  sender: ChatSender;
  senderName?: string;
  body?: string;
  internal?: boolean;
  card?: ChatCard | null;
  attachmentId?: string | null;
  clientKey?: string | null;
  /** Who should see this as new: the team, the customer, or nobody. */
  bump: "admin" | "customer" | "none";
  adminAdd?: number;
  due?: Date | null;
  at?: Date;
};

async function post(q: Q, a: PostArgs): Promise<string> {
  const body = a.body ?? "";
  const id = randomUUID();
  const hasPhoto = !!a.attachmentId;
  await q.query(
    `insert into shopping_chat_messages(id,thread_id,sender,sender_name,body,internal,card,attachment_id,client_key,created_at)
     values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,coalesce($10::timestamptz, now()))`,
    [
      id,
      a.threadId,
      a.sender,
      a.senderName ?? "",
      body,
      a.internal ?? false,
      a.card ? JSON.stringify(a.card) : null,
      a.attachmentId ?? null,
      a.clientKey ?? null,
      a.at ?? null,
    ],
  );
  const internal = a.internal ?? false;
  const preview = messagePreview({ body, hasPhoto, card: a.card ?? null });
  await q.query(
    `update shopping_chat_threads set
       last_message_at = case when $2 then last_message_at else coalesce($8::timestamptz, now()) end,
       last_preview = case when $2 then last_preview else $3 end,
       last_sender = case when $2 then last_sender else $4 end,
       admin_unread = case $5 when 'admin' then admin_unread + $6 when 'customer' then 0 else admin_unread end,
       customer_unread = case when $5 = 'customer' then customer_unread + 1 else customer_unread end,
       response_due_at = case $5 when 'admin' then coalesce(response_due_at, $7::timestamptz)
                                 when 'customer' then null else response_due_at end,
       closed_at = case when $5 = 'none' then closed_at else null end,
       updated_at = now()
     where id = $1`,
    [a.threadId, internal, preview, a.sender, a.bump, a.adminAdd ?? 1, a.due ?? null, a.at ?? null],
  );
  return id;
}

async function dueFor(now = new Date()) {
  const c = await chatConfig();
  return responseDueAt(now, c.replyTargetMinutes, c.openHour, c.closeHour);
}

async function notifyCustomer(thread: { id: string; customer_auth_subject: string }, text: string) {
  await createCustomerNotification({
    subject: thread.customer_auth_subject,
    type: "shopping_order",
    title: "Pesan dari tim Djiwa",
    body: text.slice(0, 140),
    href: `/titip-belanja/pesan/${thread.id}`,
    // At most one alert per thread every five minutes, so a quick back-and-forth is not noisy.
    eventKey: `chat:${thread.id}:${Math.floor(Date.now() / 300_000)}`,
    source: "personal-shopper",
  }).catch(() => undefined);
}

/* -------------------------------------------------------- thread creation */

type RequestRow = {
  id: string;
  customer_auth_subject: string;
  source_url: string | null;
  note: string;
  analysis: string | null;
  status: string;
  version: number;
  photo_mime: string | null;
  photo_expires_at: Date | null;
  offer: DiscoveryOffer | null;
  offer_expires_at: Date | null;
  order_id: string | null;
  created_at: Date;
};

const photoLive = (r: Pick<RequestRow, "photo_mime" | "photo_expires_at">) =>
  !!r.photo_mime && !!r.photo_expires_at && new Date(r.photo_expires_at).getTime() > Date.now();

function requestCard(r: RequestRow): ChatCard {
  return {
    type: "request",
    requestId: r.id,
    title: threadTitle({ analysis: r.analysis, note: r.note, sourceUrl: r.source_url }),
    note: r.note,
    sourceUrl: r.source_url,
    analysis: r.analysis,
    hasPhoto: photoLive(r),
  };
}

/** The thread of a request, created on first need (also for requests made before chat existed). */
async function ensureRequestThread(
  q: Q,
  requestId: string,
  name?: string,
  fresh = false,
): Promise<string | null> {
  const found = await q.query(
    "select id from shopping_chat_threads where request_id = $1 and kind = 'REQUEST'",
    [requestId],
  );
  if (found.rows[0]) return (found.rows[0] as { id: string }).id;
  const r = (await q.query("select * from shopping_discovery_requests where id = $1", [requestId]))
    .rows[0] as RequestRow | undefined;
  if (!r || r.status === "DRAFT") return null;
  const id = randomUUID();
  const events = (
    await q.query(
      "select actor,status,note,offer,created_at from shopping_discovery_events where request_id = $1 order by created_at",
      [requestId],
    )
  ).rows as {
    actor: string;
    status: string;
    note: string;
    offer: DiscoveryOffer | null;
    created_at: Date;
  }[];
  await q.query(
    `insert into shopping_chat_threads(id,customer_auth_subject,customer_name,kind,title,request_id,created_at,last_message_at)
     values($1,$2,$3,'REQUEST',$4,$5,$6,$6) on conflict do nothing`,
    [
      id,
      r.customer_auth_subject,
      name ?? "Pelanggan",
      threadTitle({
        offerName: r.offer?.name ?? null,
        analysis: r.analysis,
        note: r.note,
        sourceUrl: r.source_url,
      }),
      requestId,
      r.created_at,
    ],
  );
  const again = await q.query(
    "select id from shopping_chat_threads where request_id = $1 and kind = 'REQUEST'",
    [requestId],
  );
  const threadId = (again.rows[0] as { id: string }).id;
  if (threadId !== id) return threadId;
  // Rebuild the talk from the request's history, so nothing the customer already saw is lost.
  await post(q, {
    threadId,
    sender: "CUSTOMER",
    card: requestCard(r),
    bump: "none",
    at: r.created_at,
  });
  let offers = 0;
  // A brand-new request has only its own submit event, which the caller writes as a message.
  for (const e of fresh ? [] : events) {
    const at = new Date(e.created_at);
    if (e.actor === "customer") {
      if (e.status === "SUBMITTED" && /dikirim untuk diperiksa/i.test(e.note)) continue;
      await post(q, {
        threadId,
        sender: "CUSTOMER",
        body: e.note,
        bump: "none",
        at,
      });
    } else {
      offers += e.offer ? 1 : 0;
      await post(q, {
        threadId,
        sender: "ADMIN",
        senderName: nameFromEmail(e.actor),
        body: e.note,
        card: e.offer
          ? {
              type: "offer",
              requestId,
              number: offers,
              requestVersion: 0,
              expiresAt: iso(r.offer_expires_at) ?? at.toISOString(),
              offer: e.offer,
            }
          : null,
        bump: "none",
        at,
      });
    }
  }
  return threadId;
}

/* --------------------------------------------------------------- history */

/** Threads for requests created before chat existed. Cheap: a no-op once everything has one. */
async function backfill(subject?: string) {
  const rows = await pool.query(
    `select r.id from shopping_discovery_requests r
       left join shopping_chat_threads t on t.request_id = r.id and t.kind = 'REQUEST'
      where t.id is null and r.status <> 'DRAFT' ${subject ? "and r.customer_auth_subject = $1" : ""}
      order by r.created_at limit 50`,
    subject ? [subject] : [],
  );
  for (const row of rows.rows as { id: string }[])
    await ensureRequestThread(pool, row.id).catch(() => undefined);
}

/* ------------------------------------------------------------- viewing */

async function loadMessages(
  threadId: string,
  admin: boolean,
  after?: string | null,
): Promise<MessageRow[]> {
  const r = await pool.query(
    `select * from shopping_chat_messages
      where thread_id = $1 ${admin ? "" : "and internal = false"} ${after ? "and created_at > $2::timestamptz" : ""}
      order by created_at, id limit 400`,
    after ? [threadId, after] : [threadId],
  );
  return r.rows as MessageRow[];
}

async function viewMessages(
  thread: ThreadRow,
  rows: MessageRow[],
  admin: boolean,
): Promise<ChatMessageView[]> {
  // The newest offer card is the live one; earlier ones are superseded.
  const all = await pool.query(
    "select id from shopping_chat_messages where thread_id = $1 and card->>'type' = 'offer' order by created_at desc, id desc limit 1",
    [thread.id],
  );
  const latestOffer = (all.rows[0] as { id: string } | undefined)?.id;
  const requestRow = thread.request_id
    ? ((
        await pool.query(
          "select photo_mime, photo_expires_at from shopping_discovery_requests where id = $1",
          [thread.request_id],
        )
      ).rows[0] as Pick<RequestRow, "photo_mime" | "photo_expires_at"> | undefined)
    : undefined;
  return rows.map((m) => {
    let card: ChatMessageView["card"] = m.card;
    if (card?.type === "offer") {
      card = {
        ...card,
        state: offerState({
          cardRequestVersion: card.requestVersion,
          isLatest: m.id === latestOffer,
          requestStatus: thread.request_status ?? "",
          requestVersion: thread.request_version ?? 0,
          expiresAt: iso(thread.request_offer_expires_at) ?? card.expiresAt,
          orderStatus: thread.order_status,
          hasOrder: !!thread.request_order_id,
        }),
        // The live offer follows the request's expiry, which the team can renew.
        ...(m.id === latestOffer && thread.request_offer_expires_at
          ? { expiresAt: new Date(thread.request_offer_expires_at).toISOString() }
          : {}),
      };
    }
    if (card?.type === "request") {
      const live = requestRow ? photoLive(requestRow) : false;
      card = {
        ...card,
        hasPhoto: live,
        photoUrl: live ? `/api/shopper-photo/${card.requestId}${admin ? "?admin=1" : ""}` : null,
      };
    }
    return {
      id: m.id,
      sender: m.sender,
      senderName: m.sender_name,
      body: m.body,
      internal: m.internal,
      at: new Date(m.created_at).toISOString(),
      attachmentUrl: m.attachment_id
        ? `/api/shopper-chat-photo/${m.attachment_id}${admin ? "?admin=1" : ""}`
        : null,
      card,
    };
  });
}

async function promiseLine() {
  const c = await chatConfig();
  return replyPromise({
    now: new Date(),
    openHour: c.openHour,
    closeHour: c.closeHour,
    targetMinutes: c.replyTargetMinutes,
  });
}

/* ------------------------------------------------------------- customer */

export async function chatUnreadHandler() {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return { unread: 0 };
  const r = await pool.query(
    "select coalesce(sum(customer_unread),0)::int n from shopping_chat_threads where customer_auth_subject = $1",
    [user.id],
  );
  return { unread: Number((r.rows[0] as { n: number }).n) };
}

export async function listMyThreadsHandler() {
  const user = await getAuthenticatedUser();
  await backfill(user.id).catch(() => undefined);
  const r = await pool.query(
    `${THREAD_SELECT} where t.customer_auth_subject = $1 order by t.last_message_at desc limit 100`,
    [user.id],
  );
  return {
    threads: (r.rows as ThreadRow[]).map((t) => summary(t, "customer")),
    promise: await promiseLine(),
    enabled: (await chatConfig()).chatEnabled,
  };
}

const threadSchema = z.object({ id: z.string().uuid(), after: z.string().datetime().nullish() });
export const threadInput = (x: unknown) => threadSchema.parse(x);

export async function getMyThreadHandler({ data }: { data: z.infer<typeof threadSchema> }) {
  const user = await getAuthenticatedUser();
  const t = (
    await pool.query(`${THREAD_SELECT} where t.id = $1 and t.customer_auth_subject = $2`, [
      data.id,
      user.id,
    ])
  ).rows[0] as ThreadRow | undefined;
  if (!t) throw new Error("Percakapan tidak ditemukan.");
  const rows = await loadMessages(t.id, false, data.after ?? null);
  if (t.customer_unread > 0)
    await pool.query("update shopping_chat_threads set customer_unread = 0 where id = $1", [t.id]);
  return {
    thread: summary({ ...t, customer_unread: 0 }, "customer"),
    messages: await viewMessages(t, rows, false),
    request: t.request_id
      ? {
          id: t.request_id,
          status: t.request_status ?? "",
          version: t.request_version ?? 0,
          offerExpiresAt: iso(t.request_offer_expires_at),
          orderId: t.request_order_id,
        }
      : null,
    promise: await promiseLine(),
    now: new Date().toISOString(),
  };
}

const startSchema = z.object({
  requestId: z.string().uuid().nullish(),
  text: z.string().max(2000).default(""),
  url: z.string().max(2000).default(""),
  clientKey: z.string().uuid(),
});
export const startThreadInput = (x: unknown) => startSchema.parse(x);

/** Opens a conversation: from a search that found nothing, or from a fresh message. */
export async function startMyThreadHandler({ data }: { data: z.infer<typeof startSchema> }) {
  const user = await getAuthenticatedUser();
  const config = await requireChat();
  const text = cleanMessage(data.text);
  const problem = messageProblem(text);
  if (problem) throw new Error(problem);
  const reference = data.url.trim() ? parseProductReference(data.url) : null;
  if (!data.requestId && !text && !reference)
    throw new Error("Tulis barang yang kamu cari, atau tempel linknya.");
  const c = await pool.connect();
  let threadId = "";
  let requestId = data.requestId ?? "";
  let isFresh = false;
  try {
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(hashtext($1))", [`discovery:${user.id}`]);
    if (requestId) {
      const r = (
        await c.query(
          "select * from shopping_discovery_requests where id = $1 and customer_auth_subject = $2 for update",
          [requestId, user.id],
        )
      ).rows[0] as RequestRow | undefined;
      if (!r) throw new Error("Pencarian tidak ditemukan.");
      if (r.status === "DRAFT") {
        isFresh = true;
        await c.query(
          `update shopping_discovery_requests set status = 'SUBMITTED',
             note = case when $2 = '' then note else $2 end,
             photo_expires_at = case when photo_mime is null then null else now() + interval '90 days' end,
             version = version + 1, updated_at = now() where id = $1`,
          [r.id, text],
        );
        await c.query(
          "insert into shopping_discovery_events(request_id,actor,status,note,version) values($1,'customer','SUBMITTED',$2,$3)",
          [r.id, discoveryEventNote("submit", text), r.version + 1],
        );
      }
    } else {
      const usage = await c.query(
        "select count(*)::int n from shopping_discovery_requests where customer_auth_subject = $1 and created_at >= date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'",
        [user.id],
      );
      if (Number((usage.rows[0] as { n: number }).n) >= config.dailyLimit)
        throw new Error("Batas pencarian harian tercapai. Coba lagi besok.");
      requestId = randomUUID();
      isFresh = true;
      await c.query(
        `insert into shopping_discovery_requests(id,customer_auth_subject,client_key,source_url,note,status)
         values($1,$2,$3,$4,$5,'SUBMITTED')`,
        [requestId, user.id, data.clientKey, reference?.url ?? null, text],
      );
      await c.query(
        "insert into shopping_discovery_events(request_id,actor,status,note,version) values($1,'customer','SUBMITTED',$2,1)",
        [requestId, discoveryEventNote("submit", text)],
      );
    }
    const existing = await ensureRequestThread(c, requestId, nameFromEmail(user.email), isFresh);
    if (!existing) throw new Error("Percakapan belum bisa dibuka.");
    threadId = existing;
    await c.query(
      "update shopping_chat_threads set customer_name = $2 where id = $1 and customer_name in ('', 'Pelanggan')",
      [threadId, nameFromEmail(user.email)],
    );
    const has = await c.query(
      "select count(*)::int n from shopping_chat_messages where thread_id = $1 and sender = 'SYSTEM' and body like 'Tim sudah diberi tahu%'",
      [threadId],
    );
    if (Number((has.rows[0] as { n: number }).n) === 0) {
      const due = await dueFor();
      if (text)
        await post(c, {
          threadId,
          sender: "CUSTOMER",
          senderName: nameFromEmail(user.email),
          body: text,
          bump: "none",
        });
      await post(c, {
        threadId,
        sender: "SYSTEM",
        body: `Tim sudah diberi tahu. ${await promiseLine()}`,
        bump: "admin",
        adminAdd: text ? 2 : 1,
        due,
      });
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
  return { threadId, requestId };
}

const sendSchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().max(2000).default(""),
  clientKey: z.string().uuid().nullish(),
});
export const sendInput = (x: unknown) => sendSchema.parse(x);

export async function sendCustomerMessage(input: {
  subject: string;
  email: string;
  threadId: string;
  body: string;
  clientKey?: string | null;
  photo?: Uint8Array | null;
}) {
  const config = await requireChat();
  const body = cleanMessage(input.body);
  const problem = messageProblem(body);
  if (problem) throw new Error(problem);
  const mime = input.photo ? productPhotoMime(input.photo) : null;
  if (input.photo && !mime) throw new Error("Foto harus JPG, PNG atau WebP, maksimal 5 MB.");
  if (!body && !input.photo) throw new Error("Tulis pesan atau pilih foto.");
  const c = await pool.connect();
  let messageId = "";
  let threadIdOut = "";
  try {
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(hashtext($1))", [`chat:${input.subject}`]);
    const t = (
      await c.query(
        `${THREAD_SELECT} where t.id = $1 and t.customer_auth_subject = $2 for update of t`,
        [input.threadId, input.subject],
      )
    ).rows[0] as ThreadRow | undefined;
    if (!t) throw new Error("Percakapan tidak ditemukan.");
    threadIdOut = t.id;
    if (input.clientKey) {
      const dup = await c.query(
        "select id from shopping_chat_messages where thread_id = $1 and client_key = $2",
        [t.id, input.clientKey],
      );
      if (dup.rows[0]) {
        await c.query("commit");
        return { messageId: (dup.rows[0] as { id: string }).id, duplicate: true };
      }
    }
    const rate = await c.query(
      `select count(*) filter (where m.created_at > now() - interval '1 minute')::int as per_minute,
              count(*) filter (where m.created_at >= date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta')::int as per_day
         from shopping_chat_messages m join shopping_chat_threads x on x.id = m.thread_id
        where x.customer_auth_subject = $1 and m.sender = 'CUSTOMER'`,
      [input.subject],
    );
    const used = rate.rows[0] as { per_minute: number; per_day: number };
    if (used.per_minute >= 10) throw new Error("Terlalu cepat. Tunggu sebentar lalu kirim lagi.");
    if (used.per_day >= config.dailyMessages) throw new Error("Batas pesan harian tercapai.");
    let attachmentId: string | null = null;
    if (input.photo && mime) {
      const count = await c.query(
        "select count(*)::int n from shopping_chat_attachments where thread_id = $1",
        [t.id],
      );
      if (Number((count.rows[0] as { n: number }).n) >= 30)
        throw new Error("Foto di percakapan ini sudah banyak. Kirim lewat link saja.");
      attachmentId = randomUUID();
      await c.query(
        "insert into shopping_chat_attachments(id,thread_id,mime,bytes) values($1,$2,$3,$4)",
        [attachmentId, t.id, mime, Buffer.from(input.photo)],
      );
    }
    // A reply to the team's question moves the request on, exactly like the old "send info" action.
    if (t.request_id && t.request_status === "NEEDS_INFO") {
      await c.query(
        "update shopping_discovery_requests set status = 'SUBMITTED', version = version + 1, updated_at = now() where id = $1",
        [t.request_id],
      );
      await c.query(
        "insert into shopping_discovery_events(request_id,actor,status,note,version) values($1,'customer','SUBMITTED',$2,$3)",
        [
          t.request_id,
          body.length >= 3 ? body.slice(0, 1000) : discoveryEventNote("reply", ""),
          (t.request_version ?? 0) + 1,
        ],
      );
    }
    messageId = await post(c, {
      threadId: t.id,
      sender: "CUSTOMER",
      senderName: nameFromEmail(input.email),
      body,
      attachmentId,
      clientKey: input.clientKey ?? null,
      bump: "admin",
      due: await dueFor(),
    });
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
  return { messageId, duplicate: false, threadId: threadIdOut };
}

export async function sendMyMessageHandler({ data }: { data: z.infer<typeof sendSchema> }) {
  const user = await getAuthenticatedUser();
  return sendCustomerMessage({
    subject: user.id,
    email: user.email,
    threadId: data.threadId,
    body: data.body,
    clientKey: data.clientKey ?? null,
  });
}

const orderThreadSchema = z.object({ orderId: z.string().uuid() });
export const orderThreadInput = (x: unknown) => orderThreadSchema.parse(x);

/** "Tanya soal pesanan": the thread of an order (or of the request that became it). */
export async function openOrderThreadHandler({
  data,
}: {
  data: z.infer<typeof orderThreadSchema>;
}) {
  const user = await getAuthenticatedUser();
  await requireChat();
  const order = (
    await pool.query(
      "select id, public_code from shopping_orders where id = $1 and customer_auth_subject = $2",
      [data.orderId, user.id],
    )
  ).rows[0] as { id: string; public_code: string } | undefined;
  if (!order) throw new Error("Pesanan tidak ditemukan.");
  const viaRequest = await pool.query(
    "select id from shopping_discovery_requests where order_id = $1",
    [order.id],
  );
  if (viaRequest.rows[0]) {
    const id = await ensureRequestThread(
      pool,
      (viaRequest.rows[0] as { id: string }).id,
      nameFromEmail(user.email),
    );
    if (id) return { threadId: id };
  }
  const existing = await pool.query(
    "select id from shopping_chat_threads where order_id = $1 and kind = 'ORDER'",
    [order.id],
  );
  if (existing.rows[0]) return { threadId: (existing.rows[0] as { id: string }).id };
  const id = randomUUID();
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(
      `insert into shopping_chat_threads(id,customer_auth_subject,customer_name,kind,title,order_id)
       values($1,$2,$3,'ORDER',$4,$5)`,
      [id, user.id, nameFromEmail(user.email), `Pesanan ${order.public_code}`, order.id],
    );
    await post(c, {
      threadId: id,
      sender: "SYSTEM",
      body: `Percakapan untuk pesanan ${order.public_code}. ${await promiseLine()}`,
      card: { type: "order", orderId: order.id, code: order.public_code },
      bump: "none",
    });
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    const again = await pool.query(
      "select id from shopping_chat_threads where order_id = $1 and kind = 'ORDER'",
      [order.id],
    );
    if (again.rows[0]) return { threadId: (again.rows[0] as { id: string }).id };
    throw e;
  } finally {
    c.release();
  }
  return { threadId: id };
}

/* ---------------------------------------------------- hooks from other flows */

type TeamEvent = {
  kind: "search" | "ask" | "unavailable" | "offer";
  actor: string;
  note: string;
  offer?: DiscoveryOffer;
  expiresAt?: Date | string | null;
  requestVersion: number;
};
type CustomerEvent = { kind: "decline" | "cancel" | "refresh_offer"; note: string };
type AcceptedEvent = { kind: "accepted"; orderId: string; orderCode: string };
export type RequestChatEvent = TeamEvent | CustomerEvent | AcceptedEvent;

/** The request flows (team actions, customer actions, order creation) write into the thread. */
export async function chatRequestEvent(requestId: string, ev: RequestChatEvent) {
  try {
    const threadId = await ensureRequestThread(pool, requestId);
    if (!threadId) return;
    const t = (await pool.query("select * from shopping_chat_threads where id = $1", [threadId]))
      .rows[0] as ThreadRow;
    if (ev.kind === "accepted") {
      await post(pool, {
        threadId,
        sender: "SYSTEM",
        body: `Penawaran disetujui. Pesanan ${ev.orderCode} dibuat, lanjut ke pembayaran.`,
        card: { type: "order", orderId: ev.orderId, code: ev.orderCode },
        bump: "admin",
      });
      return;
    }
    if (ev.kind === "decline" || ev.kind === "cancel" || ev.kind === "refresh_offer") {
      const text = {
        decline: "Penawaran ditolak pelanggan.",
        cancel: "Permintaan dibatalkan oleh pelanggan.",
        refresh_offer: "Pelanggan meminta penawaran baru karena penawaran kedaluwarsa.",
      }[ev.kind];
      await post(pool, {
        threadId,
        sender: "SYSTEM",
        body: ev.note.trim() ? `${text} ${ev.note.trim()}`.slice(0, 1000) : text,
        bump: "admin",
        ...(ev.kind === "refresh_offer" ? { due: await dueFor() } : {}),
      });
      return;
    }
    const team = ev as TeamEvent;
    const name = nameFromEmail(team.actor);
    let card: ChatCard | null = null;
    if (team.kind === "offer" && team.offer) {
      const n = await pool.query(
        "select count(*)::int n from shopping_chat_messages where thread_id = $1 and card->>'type' = 'offer'",
        [threadId],
      );
      card = {
        type: "offer",
        requestId,
        number: Number((n.rows[0] as { n: number }).n) + 1,
        requestVersion: team.requestVersion,
        expiresAt: iso(team.expiresAt ?? null) ?? new Date(Date.now() + 86_400_000).toISOString(),
        offer: team.offer,
      };
    }
    await post(pool, {
      threadId,
      sender: "ADMIN",
      senderName: name,
      body: team.note,
      card,
      bump: "customer",
    });
    if (team.kind === "unavailable")
      await post(pool, {
        threadId,
        sender: "SYSTEM",
        body: "Barang belum ditemukan. Kamu tetap bisa membalas di sini untuk mencoba lagi.",
        bump: "none",
      });
    await pool.query(
      "update shopping_chat_threads set assignee = coalesce(assignee, $2) where id = $1",
      [threadId, name],
    );
    await notifyCustomer(t, team.note);
  } catch (error) {
    console.error("[travel] shopper chat event failed", {
      reason: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
  }
}

/** Order status changes show up in the conversation that belongs to the order. */
export async function chatOrderEvent(orderId: string, text: string) {
  try {
    const t = await pool.query(
      `select t.id from shopping_chat_threads t
         left join shopping_discovery_requests r on r.id = t.request_id
        where t.order_id = $1 or r.order_id = $1 limit 1`,
      [orderId],
    );
    const id = (t.rows[0] as { id: string } | undefined)?.id;
    if (!id) return;
    await post(pool, {
      threadId: id,
      sender: "SYSTEM",
      body: text.slice(0, 1000),
      bump: "customer",
    });
  } catch {
    /* the order flow never waits on chat */
  }
}

/** Notification target for a request: its thread, so tapping opens the conversation. */
export async function chatHrefForRequest(requestId: string): Promise<string> {
  const id = await ensureRequestThread(pool, requestId).catch(() => null);
  return id ? `/titip-belanja/pesan/${id}` : "/titip-belanja/pesan";
}

/* ------------------------------------------------------------------- admin */

/** Light count for the Admin tab: threads waiting for a team reply, and how many are late. */
export async function adminChatUnreadHandler() {
  await requireAdmin();
  const r = await pool.query(
    `select count(*) filter (where admin_unread > 0 and closed_at is null)::int waiting,
            count(*) filter (where response_due_at < now() and closed_at is null)::int late
       from shopping_chat_threads`,
  );
  return r.rows[0] as { waiting: number; late: number };
}

export async function adminChatListHandler() {
  await requireAdmin();
  await backfill().catch(() => undefined);
  const [r, config, shop] = await Promise.all([
    pool.query(
      `${THREAD_SELECT}
        order by (t.closed_at is null) desc, (t.admin_unread > 0) desc,
                 t.response_due_at asc nulls last, t.last_message_at desc limit 200`,
    ),
    chatConfig(),
    import("./personal-shopper.server").then((m) => m.getShopperConfig()),
  ]);
  return {
    threads: (r.rows as ThreadRow[]).map((t) => summary(t, "admin")),
    config: {
      replyTargetMinutes: config.replyTargetMinutes,
      openHour: config.openHour,
      closeHour: config.closeHour,
      templates: config.templates,
    },
    shop: {
      rateIdr: shop.rates["JPY"] ?? 0,
      feePercent: shop.feePercent,
      shippingIdr: shop.shippingIdr,
      domesticIdr: shop.market.domesticIdr,
    },
    now: new Date().toISOString(),
  };
}

export async function adminChatThreadHandler({ data }: { data: z.infer<typeof threadSchema> }) {
  await requireAdmin();
  const t = (await pool.query(`${THREAD_SELECT} where t.id = $1`, [data.id])).rows[0] as
    ThreadRow | undefined;
  if (!t) throw new Error("Percakapan tidak ditemukan.");
  const rows = await loadMessages(t.id, true, data.after ?? null);
  if (t.admin_unread > 0)
    await pool.query("update shopping_chat_threads set admin_unread = 0 where id = $1", [t.id]);
  const request = t.request_id
    ? ((
        await pool.query(
          "select id,status,version,note,analysis,source_url,offer,offer_expires_at,order_id from shopping_discovery_requests where id = $1",
          [t.request_id],
        )
      ).rows[0] as
        | {
            id: string;
            status: string;
            version: number;
            note: string;
            analysis: string | null;
            source_url: string | null;
            offer: DiscoveryOffer | null;
            offer_expires_at: Date | null;
            order_id: string | null;
          }
        | undefined)
    : undefined;
  return {
    thread: summary({ ...t, admin_unread: 0 }, "admin"),
    messages: await viewMessages(t, rows, true),
    request: request
      ? {
          id: request.id,
          status: request.status,
          version: request.version,
          note: request.note,
          analysis: request.analysis,
          sourceUrl: request.source_url,
          offer: request.offer,
          offerExpiresAt: iso(request.offer_expires_at),
          orderId: request.order_id,
        }
      : null,
    now: new Date().toISOString(),
  };
}

const adminSendSchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().max(2000),
  internal: z.boolean().default(false),
});
export const adminSendInput = (x: unknown) => adminSendSchema.parse(x);

export async function adminChatSendHandler({ data }: { data: z.infer<typeof adminSendSchema> }) {
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) || "admin";
  const body = cleanMessage(data.body);
  const problem = messageProblem(body);
  if (problem) throw new Error(problem);
  if (!body) throw new Error("Tulis pesan dulu.");
  const t = (await pool.query("select * from shopping_chat_threads where id = $1", [data.threadId]))
    .rows[0] as ThreadRow | undefined;
  if (!t) throw new Error("Percakapan tidak ditemukan.");
  const name = nameFromEmail(actor);
  const id = await post(pool, {
    threadId: t.id,
    sender: "ADMIN",
    senderName: name,
    body,
    internal: data.internal,
    bump: data.internal ? "none" : "customer",
  });
  if (!data.internal) {
    await pool.query(
      "update shopping_chat_threads set assignee = coalesce(assignee, $2) where id = $1",
      [t.id, name],
    );
    await notifyCustomer(t, body);
  }
  return { messageId: id };
}

const assignSchema = z.object({
  threadId: z.string().uuid(),
  assignee: z.string().trim().max(60).nullable(),
});
export const assignInput = (x: unknown) => assignSchema.parse(x);
export async function adminChatAssignHandler({ data }: { data: z.infer<typeof assignSchema> }) {
  await requireAdmin();
  await pool.query(
    "update shopping_chat_threads set assignee = $2, updated_at = now() where id = $1",
    [data.threadId, data.assignee || null],
  );
  return { ok: true };
}

const closeSchema = z.object({ threadId: z.string().uuid(), closed: z.boolean() });
export const closeInput = (x: unknown) => closeSchema.parse(x);
export async function adminChatCloseHandler({ data }: { data: z.infer<typeof closeSchema> }) {
  await requireAdmin();
  await pool.query(
    "update shopping_chat_threads set closed_at = case when $2 then now() else null end, response_due_at = case when $2 then null else response_due_at end, updated_at = now() where id = $1",
    [data.threadId, data.closed],
  );
  return { ok: true };
}

/* ------------------------------------------------------------------- sweep */

/** Minute task: close idle threads and drop expired photos. */
export async function sweepChatThreads() {
  const config = await chatConfig();
  const idle = await pool.query(
    `update shopping_chat_threads set closed_at = now(), response_due_at = null
      where closed_at is null and last_message_at < now() - ($1 || ' days')::interval
        and coalesce(admin_unread, 0) = 0
      returning id`,
    [String(config.idleCloseDays)],
  );
  for (const row of idle.rows as { id: string }[]) {
    await pool.query(
      `insert into shopping_chat_messages(thread_id,sender,body)
       values($1,'SYSTEM','Percakapan ditutup otomatis karena tidak ada aktivitas. Kirim pesan untuk membukanya lagi.')`,
      [row.id],
    );
  }
  await pool.query("delete from shopping_chat_attachments where expires_at < now()");
  return { closed: idle.rows.length };
}

/** Photo bytes for the API route: the owner, or the team with `admin`. */
export async function chatAttachment(id: string, viewer: { subject: string } | "admin") {
  const r = await pool.query(
    `select a.mime, a.bytes from shopping_chat_attachments a
       join shopping_chat_threads t on t.id = a.thread_id
      where a.id = $1 and a.expires_at > now() ${viewer === "admin" ? "" : "and t.customer_auth_subject = $2"}`,
    viewer === "admin" ? [id] : [id, viewer.subject],
  );
  return r.rows[0] as { mime: string; bytes: Buffer } | undefined;
}
