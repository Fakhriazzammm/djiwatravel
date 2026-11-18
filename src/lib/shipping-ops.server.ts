/**
 * Hub operations for Kirim Barang: the route Tasikmalaya -> Bandung -> Jakarta -> Japan. Parcels move
 * in batches (one trip between two points), are loaded and checked in by scan, and field staff
 * ("petugas") are registered per hub by Admin. Every function checks who is calling. Server only.
 */
import { z } from "zod";
import { pool } from "../db/client.server";
import { getAdminEmailHandler } from "./admin-guard.server";
import {
  NO_PHOTOS,
  getShippingConfig,
  iso,
  logEvent,
  notifyOrder,
  photosFor,
  view as orderView,
  type OrderRow,
} from "./shipping.server";
import { actorOf, assertHub, currentOps, requireOps } from "./shipping-access.server";
import {
  BATCH_DESTINATION,
  CHECKIN_STATUS,
  DEPART_STATUS,
  HUBS,
  HUB_LABEL,
  INBOUND_STATUS,
  LOADABLE_STATUS,
  NOTIFY_TEXT,
  SHIPPING_STATUS_LABEL,
  batchCodeFrom,
  isHub,
  parseAnyCode,
  shippingIsDead,
  type BatchDestination,
  type Hub,
  type ShippingStatus,
} from "./shipping";

async function requireAdmin2() {
  const ops = await requireOps();
  if (!ops.isAdmin) throw new Error("Hanya Admin yang bisa melakukan ini");
  return ops;
}

/* ------------------------------------------------------------------ who am I */

/** For the field app: is the visitor signed in, registered, and where may they work. */
export async function getOpsMeHandler() {
  const email = ((await getAdminEmailHandler()) ?? "").trim().toLowerCase();
  const ops = await currentOps();
  const config = await getShippingConfig();
  return {
    signedIn: email !== "",
    registered: ops !== null,
    email,
    name: ops?.name ?? "",
    isAdmin: ops?.isAdmin ?? false,
    hubs: ops?.hubs ?? ([] as Hub[]),
    config: {
      dropPoint: config.dropPoint,
      hubs: config.hubs,
      eta: config.eta,
      transport: config.transport,
      couriers: config.couriers,
    },
  };
}

/* ------------------------------------------------------------------- batches */

type BatchRow = {
  id: string;
  code: string;
  from_hub: Hub;
  to_hub: BatchDestination;
  status: "OPEN" | "DEPARTED" | "ARRIVED" | "CANCELLED";
  carrier: string;
  tracking: string | null;
  partner_kg: string | null;
  note: string | null;
  created_by: string;
  departed_at: Date | null;
  arrived_at: Date | null;
  created_at: Date;
};

async function batchView(batch: BatchRow) {
  const items = (
    await pool.query(
      `select id, public_code, recipient_name, prefecture, city, category, contents, estimated_kg, billed_kg,
              status, batch_checked_at
         from shipping_orders where batch_id = $1 order by public_code`,
      [batch.id],
    )
  ).rows as {
    id: string;
    public_code: string;
    recipient_name: string;
    prefecture: string;
    city: string;
    category: string;
    contents: string;
    estimated_kg: string;
    billed_kg: string | null;
    status: ShippingStatus;
    batch_checked_at: Date | null;
  }[];
  const kg = items.reduce((n, i) => n + Number(i.billed_kg ?? i.estimated_kg), 0);
  return {
    id: batch.id,
    code: batch.code,
    fromHub: batch.from_hub,
    toHub: batch.to_hub,
    status: batch.status,
    carrier: batch.carrier,
    tracking: batch.tracking,
    partnerKg: batch.partner_kg === null ? null : Number(batch.partner_kg),
    note: batch.note,
    createdBy: batch.created_by,
    departedAt: iso(batch.departed_at),
    arrivedAt: iso(batch.arrived_at),
    createdAt: iso(batch.created_at)!,
    total: items.length,
    checked: items.filter((i) => i.batch_checked_at !== null).length,
    kg: Math.round(kg * 100) / 100,
    items: items.map((i) => ({
      id: i.id,
      code: i.public_code,
      recipientName: i.recipient_name,
      city: `${i.city}, ${i.prefecture}`,
      contents: `${i.category}: ${i.contents}`,
      kg: Number(i.billed_kg ?? i.estimated_kg),
      status: i.status,
      checked: i.batch_checked_at !== null,
    })),
  };
}

async function batchById(id: string) {
  const row = (await pool.query("select * from shipping_batches where id = $1", [id])).rows[0] as
    BatchRow | undefined;
  if (!row) throw new Error("Batch tidak ditemukan");
  return row;
}

const hubSchema = z.enum(["TASIK", "BANDUNG", "JAKARTA"]);

const createBatchSchema = z.object({
  fromHub: hubSchema,
  carrier: z.string().trim().min(2).max(60),
  tracking: z.string().trim().max(80).optional(),
  note: z.string().trim().max(400).optional(),
});
export const createBatchInput = (data: unknown) => createBatchSchema.parse(data);

/** Opens a batch at a hub; parcels are then loaded into it by scan. */
export async function createBatchHandler({ data }: { data: ReturnType<typeof createBatchInput> }) {
  const ops = await requireOps();
  assertHub(ops, data.fromHub);
  const config = await getShippingConfig();
  const toHub = BATCH_DESTINATION[data.fromHub];
  if (toHub === "JAPAN" && !config.couriers.includes(data.carrier))
    throw new Error("Pilih partner dari daftar di Pengaturan");
  const seq = await pool.query("select nextval('shipping_batch_seq') as n");
  const code = batchCodeFrom(Number((seq.rows[0] as { n: string }).n));
  const row = await pool.query(
    `insert into shipping_batches (code, from_hub, to_hub, carrier, tracking, note, created_by)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [
      code,
      data.fromHub,
      toHub,
      data.carrier,
      data.tracking || null,
      data.note || null,
      actorOf(ops),
    ],
  );
  return { id: (row.rows[0] as { id: string }).id, code };
}

const listBatchesSchema = z.object({ hub: hubSchema.optional() });
export const listBatchesInput = (data: unknown) => listBatchesSchema.parse(data);

/** Open batches leaving a hub, batches on their way to it, and the latest finished ones. */
export async function listBatchesHandler({ data }: { data: ReturnType<typeof listBatchesInput> }) {
  const ops = await requireOps();
  if (data.hub) assertHub(ops, data.hub);
  const hubs: Hub[] = data.hub ? [data.hub] : ops.isAdmin ? [...HUBS] : ops.hubs;
  const toKey = (hub: Hub) => (hub === "TASIK" ? "NONE" : hub);
  const rows = (
    await pool.query(
      `select * from shipping_batches
        where (from_hub = any($1::text[]) and status in ('OPEN','DEPARTED'))
           or (to_hub = any($2::text[]) and status = 'DEPARTED')
           or ((from_hub = any($1::text[]) or to_hub = any($2::text[])) and status = 'ARRIVED'
               and arrived_at > now() - interval '3 days')
        order by created_at desc limit 60`,
      [hubs, hubs.map(toKey)],
    )
  ).rows as BatchRow[];
  const views = await Promise.all(rows.map(batchView));
  const slim = views.map(({ items: _items, ...rest }) => rest);
  return {
    open: slim.filter((b) => b.status === "OPEN" && hubs.includes(b.fromHub)),
    incoming: slim.filter((b) => b.status === "DEPARTED" && hubs.some((h) => toKey(h) === b.toHub)),
    outgoing: slim.filter((b) => b.status === "DEPARTED" && hubs.includes(b.fromHub)),
    recent: slim.filter((b) => b.status === "ARRIVED"),
  };
}

const batchIdSchema = z.object({ batchId: z.string().uuid() });
export const batchIdInput = (data: unknown) => batchIdSchema.parse(data);

export async function getBatchHandler({ data }: { data: ReturnType<typeof batchIdInput> }) {
  const ops = await requireOps();
  const batch = await batchById(data.batchId);
  const involved = [batch.from_hub, batch.to_hub].filter(isHub);
  if (!ops.isAdmin && !involved.some((h) => ops.hubs.includes(h)))
    throw new Error("Batch ini bukan untuk lokasimu");
  return batchView(batch);
}

const unloadSchema = z.object({ batchId: z.string().uuid(), orderId: z.string().uuid() });
export const unloadInput = (data: unknown) => unloadSchema.parse(data);

/** Takes a parcel back out of a batch that has not left yet. */
export async function unloadHandler({ data }: { data: ReturnType<typeof unloadInput> }) {
  const ops = await requireOps();
  const batch = await batchById(data.batchId);
  assertHub(ops, batch.from_hub);
  if (batch.status !== "OPEN") throw new Error("Batch ini sudah berangkat");
  await pool.query("update shipping_orders set batch_id = null where id = $1 and batch_id = $2", [
    data.orderId,
    batch.id,
  ]);
  return { ok: true };
}

const departSchema = z.object({
  batchId: z.string().uuid(),
  carrier: z.string().trim().min(2).max(60).optional(),
  tracking: z.string().trim().max(80).optional(),
  partnerKg: z.number().positive().max(10_000).optional(),
});
export const departInput = (data: unknown) => departSchema.parse(data);

/** One tap: every parcel in the batch moves on, the batch leaves, customers are told. */
export async function departBatchHandler({ data }: { data: ReturnType<typeof departInput> }) {
  const ops = await requireOps();
  const actor = actorOf(ops);
  const config = await getShippingConfig();
  const batch = await batchById(data.batchId);
  assertHub(ops, batch.from_hub);
  if (batch.status !== "OPEN") throw new Error("Batch ini sudah berangkat");
  const carrier = data.carrier ?? batch.carrier;
  const tracking = data.tracking?.trim() || batch.tracking;
  if (batch.to_hub === "JAPAN") {
    if (!config.couriers.includes(carrier))
      throw new Error("Pilih partner dari daftar di Pengaturan");
    if (!tracking) throw new Error("Nomor resi master wajib diisi");
  }
  const next = DEPART_STATUS[batch.from_hub];
  const client = await pool.connect();
  let moved: OrderRow[] = [];
  try {
    await client.query("begin");
    const items = (
      await client.query("select * from shipping_orders where batch_id = $1 for update", [batch.id])
    ).rows as OrderRow[];
    if (items.length === 0) throw new Error("Batch masih kosong. Scan paket untuk dimuat dulu.");
    const wrong = items.find((o) => o.status !== LOADABLE_STATUS[batch.from_hub]);
    if (wrong)
      throw new Error(
        `${wrong.public_code} berstatus ${SHIPPING_STATUS_LABEL[wrong.status]}. Keluarkan dari batch dulu.`,
      );
    const closed = await client.query(
      `update shipping_batches set status = 'DEPARTED', departed_at = now(), carrier = $2, tracking = $3,
              partner_kg = coalesce($4, partner_kg) where id = $1 and status = 'OPEN' returning id`,
      [batch.id, carrier, tracking ?? null, data.partnerKg ?? null],
    );
    if (closed.rows.length === 0) throw new Error("Batch sudah berangkat, muat ulang");
    await client.query(
      `update shipping_orders set status = $2, batch_checked_at = null, updated_at = now(),
              courier = case when $2 = 'SHIPPED' then $3 else courier end,
              tracking_number = case when $2 = 'SHIPPED' then coalesce(tracking_number, $4) else tracking_number end,
              shipped_at = case when $2 = 'SHIPPED' then now() else shipped_at end
        where batch_id = $1`,
      [batch.id, next, carrier, tracking ?? null],
    );
    for (const o of items)
      await logEvent(client, o.id, next, actor, null, {
        hub: batch.from_hub,
        batchCode: batch.code,
      });
    await client.query("commit");
    moved = items;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  for (const o of moved) {
    const text =
      next === "SHIPPED"
        ? `Paketmu dikirim ke Jepang lewat ${carrier}, resi ${tracking}.`
        : (NOTIFY_TEXT[next] ?? SHIPPING_STATUS_LABEL[next]);
    await notifyOrder(o, next, text);
  }
  return { ok: true, count: moved.length, status: next };
}

const arriveSchema = z.object({
  batchId: z.string().uuid(),
  /** `all_ok` checks in every parcel not scanned yet; `finish` closes the batch and flags the missing ones. */
  mode: z.enum(["all_ok", "finish"]),
  note: z.string().trim().max(400).optional(),
});
export const arriveInput = (data: unknown) => arriveSchema.parse(data);

async function checkInRows(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  rows: OrderRow[],
  hub: "BANDUNG" | "JAKARTA",
  batchCode: string,
  actor: string,
) {
  const status = CHECKIN_STATUS[hub];
  for (const o of rows) {
    await client.query(
      "update shipping_orders set status = $2, current_hub = $3, batch_checked_at = now(), updated_at = now() where id = $1",
      [o.id, status, hub],
    );
    await logEvent(client, o.id, status, actor, null, { hub, batchCode });
  }
}

/** Closes the receiving end of a trip. Arrival in Japan is Admin's, by hand. */
export async function arriveBatchHandler({ data }: { data: ReturnType<typeof arriveInput> }) {
  const batch = await batchById(data.batchId);
  const ops = await requireOps();
  const actor = actorOf(ops);
  if (batch.status !== "DEPARTED") throw new Error("Batch ini tidak sedang di perjalanan");
  const client = await pool.connect();
  let touched: OrderRow[] = [];
  let status: ShippingStatus;
  try {
    await client.query("begin");
    const items = (
      await client.query("select * from shipping_orders where batch_id = $1 for update", [batch.id])
    ).rows as OrderRow[];
    if (batch.to_hub === "JAPAN") {
      if (!ops.isAdmin) throw new Error("Tiba di Jepang dicatat oleh Admin");
      status = "ARRIVED";
      await client.query(
        "update shipping_orders set status = 'ARRIVED', arrived_at = now(), updated_at = now() where batch_id = $1 and status = 'SHIPPED'",
        [batch.id],
      );
      touched = items.filter((o) => o.status === "SHIPPED");
      for (const o of touched)
        await logEvent(client, o.id, "ARRIVED", actor, null, { batchCode: batch.code });
    } else {
      const hub = batch.to_hub;
      assertHub(ops, hub);
      status = CHECKIN_STATUS[hub];
      const inbound = INBOUND_STATUS[hub];
      const waiting = items.filter((o) => o.status === inbound && o.batch_checked_at === null);
      if (data.mode === "all_ok") {
        await checkInRows(client, waiting, hub, batch.code, actor);
        touched = waiting;
      } else {
        if (waiting.length > 0 && (!data.note || data.note.length < 3))
          throw new Error("Tulis catatan untuk paket yang belum ter-scan");
        for (const o of waiting) {
          await client.query(
            "update shipping_orders set status = 'PROBLEM', problem_from = $2, problem_note = $3, updated_at = now() where id = $1",
            [o.id, o.status, `Tidak ter-scan di ${HUB_LABEL[hub]} (${batch.code}): ${data.note}`],
          );
          await logEvent(client, o.id, "PROBLEM", actor, data.note ?? null, {
            hub,
            batchCode: batch.code,
          });
        }
      }
    }
    await client.query(
      "update shipping_batches set status = 'ARRIVED', arrived_at = now() where id = $1 and status = 'DEPARTED'",
      [batch.id],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  for (const o of touched)
    await notifyOrder(o, status, NOTIFY_TEXT[status] ?? SHIPPING_STATUS_LABEL[status]);
  return { ok: true, count: touched.length };
}

/* ----------------------------------------------------------------------- scan */

const scanSchema = z.object({
  code: z.string().trim().min(4).max(400),
  hub: hubSchema,
  /** `lookup` only reads. `receive` is Tasikmalaya's door, `checkin` is Bandung and Jakarta, `load` fills a batch. */
  mode: z.enum(["lookup", "receive", "checkin", "load"]),
  batchId: z.string().uuid().optional(),
});
export const scanOpsInput = (data: unknown) => scanSchema.parse(data);

export type ScanOutcome =
  | "found"
  | "received"
  | "checked_in"
  | "loaded"
  | "already"
  | "wrong_place"
  | "not_ready"
  | "blocked"
  | "problem";

async function orderSummary(row: OrderRow, hub: Hub) {
  const config = await getShippingConfig();
  const photos = (await photosFor([row.id])).get(row.id) ?? NO_PHOTOS;
  const events = (
    await pool.query(
      "select created_at, hub, batch_code from shipping_order_events where order_id = $1 and status = $2 order by created_at desc limit 1",
      [row.id, row.status],
    )
  ).rows[0] as { created_at: Date; hub: string | null; batch_code: string | null } | undefined;
  const batch = row.batch_id
    ? ((await pool.query("select code from shipping_batches where id = $1", [row.batch_id]))
        .rows[0] as { code: string } | undefined)
    : undefined;
  return {
    id: row.id,
    code: row.public_code,
    status: row.status,
    statusLabel: SHIPPING_STATUS_LABEL[row.status],
    recipientName: row.recipient_name,
    prefecture: row.prefecture,
    contents: `${row.category}: ${row.contents}`,
    estimatedKg: Number(row.estimated_kg),
    billedKg: row.billed_kg === null ? null : Number(row.billed_kg),
    photoCount: photos.customer.length,
    photoShort: photos.customer.length < config.minPhotos,
    photoReview: row.photo_review,
    currentHub: row.current_hub,
    batchCode: batch?.code ?? null,
    problemNote: row.problem_note,
    sinceAt: events ? new Date(events.created_at).toISOString() : null,
    here: hub,
  };
}

export async function scanOpsHandler({ data }: { data: ReturnType<typeof scanOpsInput> }) {
  const ops = await requireOps();
  assertHub(ops, data.hub);
  const actor = actorOf(ops);
  const scanned = parseAnyCode(data.code);
  if (!scanned) return { found: false as const, reason: "invalid" as const };

  if (scanned.kind === "batch") {
    const batch = (
      await pool.query("select * from shipping_batches where code = $1", [scanned.code])
    ).rows[0] as BatchRow | undefined;
    if (!batch) return { found: false as const, reason: "unknown" as const, code: scanned.code };
    const { items: _items, ...view } = await batchView(batch);
    return { found: true as const, kind: "batch" as const, batch: view };
  }

  const row = (
    await pool.query("select * from shipping_orders where public_code = $1", [scanned.code])
  ).rows[0] as OrderRow | undefined;
  if (!row) return { found: false as const, reason: "unknown" as const, code: scanned.code };

  const reply = async (
    outcome: ScanOutcome,
    message?: string,
    extra: Record<string, unknown> = {},
  ) => {
    const fresh = (await pool.query("select * from shipping_orders where id = $1", [row.id]))
      .rows[0] as OrderRow;
    return {
      found: true as const,
      kind: "parcel" as const,
      outcome,
      message: message ?? null,
      order: await orderSummary(fresh, data.hub),
      ...extra,
    };
  };

  if (shippingIsDead(row.status)) return reply("blocked");
  if (row.status === "PROBLEM") return reply("problem");
  if (data.mode === "lookup") return reply("found");

  if (data.mode === "receive") {
    if (data.hub !== "TASIK") return reply("wrong_place", "Terima hanya di Tasikmalaya");
    if (row.status !== "AWAITING_DROP") return reply("already");
    const client = await pool.connect();
    try {
      await client.query("begin");
      const updated = await client.query(
        "update shipping_orders set status = 'RECEIVED', current_hub = 'TASIK', updated_at = now() where id = $1 and status = 'AWAITING_DROP' returning id",
        [row.id],
      );
      if (updated.rows.length === 0) {
        await client.query("rollback");
        return reply("already");
      }
      await logEvent(client, row.id, "RECEIVED", actor, "Scan QR di drop point", { hub: "TASIK" });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    await notifyOrder(row, "RECEIVED", NOTIFY_TEXT["RECEIVED"]!);
    return reply("received");
  }

  if (data.mode === "checkin") {
    if (data.hub === "TASIK") return reply("wrong_place", "Check-in untuk Bandung dan Jakarta");
    const hub = data.hub;
    if (row.status === CHECKIN_STATUS[hub]) return reply("already");
    if (row.status !== INBOUND_STATUS[hub])
      return reply(
        "wrong_place",
        `Paket ini ${SHIPPING_STATUS_LABEL[row.status].toLowerCase()}, belum dalam perjalanan ke ${HUB_LABEL[hub]}.`,
      );
    const client = await pool.connect();
    let batchCode: string | null = null;
    let progress: { checked: number; total: number } | null = null;
    try {
      await client.query("begin");
      const batch = row.batch_id
        ? ((await client.query("select * from shipping_batches where id = $1", [row.batch_id]))
            .rows[0] as BatchRow | undefined)
        : undefined;
      batchCode = batch?.code ?? null;
      const updated = await client.query(
        "update shipping_orders set status = $2, current_hub = $3, batch_checked_at = now(), updated_at = now() where id = $1 and status = $4 returning id",
        [row.id, CHECKIN_STATUS[hub], hub, INBOUND_STATUS[hub]],
      );
      if (updated.rows.length === 0) {
        await client.query("rollback");
        return reply("already");
      }
      await logEvent(client, row.id, CHECKIN_STATUS[hub], actor, "Scan QR", {
        hub,
        batchCode,
      });
      if (batch) {
        const counts = (
          await client.query(
            "select count(*)::int as total, count(batch_checked_at)::int as checked from shipping_orders where batch_id = $1",
            [batch.id],
          )
        ).rows[0] as { total: number; checked: number };
        progress = counts;
        if (counts.total === counts.checked)
          await client.query(
            "update shipping_batches set status = 'ARRIVED', arrived_at = now() where id = $1 and status = 'DEPARTED'",
            [batch.id],
          );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    await notifyOrder(row, CHECKIN_STATUS[hub], NOTIFY_TEXT[CHECKIN_STATUS[hub]]!);
    return reply("checked_in", undefined, { progress, batchCode });
  }

  // load into a batch
  if (!data.batchId) return reply("not_ready", "Pilih atau buat batch dulu");
  const batch = await batchById(data.batchId);
  if (batch.from_hub !== data.hub || batch.status !== "OPEN")
    return reply("not_ready", "Batch ini tidak terbuka di lokasimu");
  if (row.batch_id === batch.id) return reply("already", "Sudah ada di batch ini");
  // A parcel keeps the id of the trip that brought it here; only a batch still being loaded blocks it.
  if (row.batch_id) {
    const prev = (
      await pool.query("select status from shipping_batches where id = $1", [row.batch_id])
    ).rows[0] as { status: string } | undefined;
    if (prev?.status === "OPEN")
      return reply("not_ready", "Paket ini sudah ada di batch lain. Keluarkan dulu dari sana.");
  }
  if (
    row.status === "PAYMENT_PENDING" ||
    row.status === "RECEIVED" ||
    row.status === "AWAITING_DROP"
  )
    return reply(
      "not_ready",
      row.status === "AWAITING_DROP"
        ? "Belum diterima di drop point"
        : "Belum dibayar, belum boleh dimuat",
    );
  if (row.status !== LOADABLE_STATUS[data.hub])
    return reply(
      "not_ready",
      `Paket ini ${SHIPPING_STATUS_LABEL[row.status].toLowerCase()}, bukan siap muat di ${HUB_LABEL[data.hub]}.`,
    );
  const loaded = await pool.query(
    `update shipping_orders set batch_id = $2, batch_checked_at = null, updated_at = now()
      where id = $1 and status = $3
        and (batch_id is null or batch_id in (select id from shipping_batches where status <> 'OPEN'))
      returning id`,
    [row.id, batch.id, LOADABLE_STATUS[data.hub]],
  );
  if (loaded.rows.length === 0) return reply("not_ready", "Status paket berubah, scan ulang");
  const counts = (
    await pool.query(
      "select count(*)::int as total, coalesce(sum(coalesce(billed_kg, estimated_kg)), 0)::float as kg from shipping_orders where batch_id = $1",
      [batch.id],
    )
  ).rows[0] as { total: number; kg: number };
  return reply("loaded", undefined, { batchCode: batch.code, loaded: counts });
}

/* ---------------------------------------------------------------- problems */

const problemSchema = z.object({
  orderId: z.string().uuid(),
  note: z.string().trim().min(3).max(400),
  hub: hubSchema.optional(),
});
export const problemInput = (data: unknown) => problemSchema.parse(data);

/** Flags damage or loss. The customer is told someone will be in touch. */
export async function markProblemHandler({ data }: { data: ReturnType<typeof problemInput> }) {
  const ops = await requireOps();
  if (data.hub) assertHub(ops, data.hub);
  const row = (await pool.query("select * from shipping_orders where id = $1", [data.orderId]))
    .rows[0] as OrderRow | undefined;
  if (!row) throw new Error("Pengiriman tidak ditemukan");
  if (
    !["PAID", "TO_BANDUNG", "AT_BANDUNG", "TO_JAKARTA", "AT_JAKARTA", "SHIPPED"].includes(
      row.status,
    )
  )
    throw new Error(
      "Hanya paket yang sudah dibayar dan masih di jalur yang bisa ditandai bermasalah",
    );
  const updated = await pool.query(
    "update shipping_orders set status = 'PROBLEM', problem_from = $2, problem_note = $3, batch_id = null, updated_at = now() where id = $1 and status = $2 returning id",
    [row.id, row.status, data.note],
  );
  if (updated.rows.length === 0) throw new Error("Status sudah berubah, muat ulang");
  await logEvent(pool, row.id, "PROBLEM", actorOf(ops), data.note, { hub: data.hub ?? null });
  await notifyOrder(
    row,
    `PROBLEM:${Date.now()}`,
    "Ada kendala pada paketmu. Tim kami akan menghubungimu secepatnya.",
  );
  return { ok: true };
}

const orderIdSchema = z.object({ orderId: z.string().uuid() });
export const orderIdInput = (data: unknown) => orderIdSchema.parse(data);

/** Admin: the problem is settled, the parcel goes back to where it was. */
export async function resolveProblemHandler({ data }: { data: ReturnType<typeof orderIdInput> }) {
  const ops = await requireAdmin2();
  const row = (await pool.query("select * from shipping_orders where id = $1", [data.orderId]))
    .rows[0] as OrderRow | undefined;
  if (!row || row.status !== "PROBLEM" || !row.problem_from)
    throw new Error("Paket ini tidak sedang bermasalah");
  await pool.query(
    "update shipping_orders set status = $2, problem_from = null, problem_note = null, updated_at = now() where id = $1",
    [row.id, row.problem_from],
  );
  await logEvent(pool, row.id, row.problem_from, actorOf(ops), "Masalah selesai");
  await notifyOrder(row, `RESOLVED:${Date.now()}`, "Kendala pada paketmu sudah teratasi.");
  return { ok: true };
}

const correctSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(["PAID", "TO_BANDUNG", "AT_BANDUNG", "TO_JAKARTA", "AT_JAKARTA", "SHIPPED"]),
  note: z.string().trim().min(3).max(400),
});
export const correctInput = (data: unknown) => correctSchema.parse(data);

/** Admin: fix a status that was set wrongly. Written to the history with the reason. */
export async function correctStatusHandler({ data }: { data: ReturnType<typeof correctInput> }) {
  const ops = await requireAdmin2();
  const row = (await pool.query("select * from shipping_orders where id = $1", [data.orderId]))
    .rows[0] as OrderRow | undefined;
  if (!row) throw new Error("Pengiriman tidak ditemukan");
  if (
    ![
      "PAID",
      "TO_BANDUNG",
      "AT_BANDUNG",
      "TO_JAKARTA",
      "AT_JAKARTA",
      "SHIPPED",
      "PROBLEM",
    ].includes(row.status)
  )
    throw new Error("Status paket ini tidak bisa dikoreksi di sini");
  await pool.query(
    "update shipping_orders set status = $2, batch_id = null, batch_checked_at = null, updated_at = now() where id = $1",
    [row.id, data.status],
  );
  await logEvent(pool, row.id, data.status, actorOf(ops), `Koreksi manual: ${data.note}`);
  return { ok: true };
}

/* -------------------------------------------------------------------- staff */

export async function listStaffHandler() {
  await requireAdmin2();
  const rows = (
    await pool.query(
      "select id, email, name, hubs, active, created_by, created_at, last_seen_at from shipping_staff order by active desc, name",
    )
  ).rows as {
    id: string;
    email: string;
    name: string;
    hubs: string[];
    active: boolean;
    created_by: string;
    created_at: Date;
    last_seen_at: Date | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    hubs: r.hubs.filter(isHub),
    active: r.active,
    createdBy: r.created_by,
    createdAt: iso(r.created_at)!,
    lastSeenAt: iso(r.last_seen_at),
  }));
}

const staffSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(2).max(80),
  hubs: z.array(hubSchema).min(1).max(3),
  active: z.boolean(),
});
export const saveStaffInput = (data: unknown) => staffSchema.parse(data);

/** Registers (or updates) a field staff account by Google email; the person then signs in at /petugas. */
export async function saveStaffHandler({ data }: { data: ReturnType<typeof saveStaffInput> }) {
  await requireAdmin2();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const hubs = [...new Set(data.hubs)];
  await pool.query(
    `insert into shipping_staff (email, name, hubs, active, created_by)
     values ($1, $2, $3, $4, $5)
     on conflict (email) do update set name = excluded.name, hubs = excluded.hubs, active = excluded.active, updated_at = now()`,
    [data.email, data.name, hubs, data.active, actor],
  );
  return { ok: true };
}

/** One shipment for the weigh form in the field app (Tasikmalaya staff and Admin). */
export async function getOpsOrderHandler({ data }: { data: ReturnType<typeof orderIdInput> }) {
  const ops = await requireOps();
  assertHub(ops, "TASIK");
  const row = (await pool.query("select * from shipping_orders where id = $1", [data.orderId]))
    .rows[0] as OrderRow | undefined;
  if (!row) throw new Error("Pengiriman tidak ditemukan");
  const photos = (await photosFor([row.id])).get(row.id) ?? NO_PHOTOS;
  return { ...orderView(row, photos), minPhotos: (await getShippingConfig()).minPhotos };
}
