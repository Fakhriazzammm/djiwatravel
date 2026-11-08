import { randomBytes } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/client.server";
import { getAuthenticatedUser } from "./customer-session.fn";
import { fetchMonthOffers, getFlightsConfigHandler } from "./flights.server";
import { createCustomerNotification } from "./push.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { randomUUID } from "node:crypto";
import {
  combineRoundTrip,
  daysBetween,
  formatFlightPrice,
  type FlightOffer,
  isIataCode,
  parseOfferSnapshot,
  tripItemsForOffer,
  type FlightOfferSnapshot,
} from "./flights";

/* Price alerts, "simpan ke perjalanan" and shared fare votes. Every action is a signed-in member's
   own: the owner always comes from the verified session, never from the request. */

async function member() {
  const user = await getAuthenticatedUser();
  return user.id as string;
}

async function enabled(feature: "priceAlerts" | "saveToTrip" | "share") {
  const config = await getFlightsConfigHandler();
  if (!config.enabled || !config[feature]) throw new Error("Fitur ini sedang dimatikan.");
  return config;
}

/* ----------------------------------------------------------------- alerts */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const alertSchema = z.object({
  origin: z.string().trim().length(3),
  destination: z.string().trim().length(3),
  originName: z.string().trim().min(1).max(80),
  destinationName: z.string().trim().min(1).max(80),
  departureDate: z.string().regex(ISO),
  returnDate: z.string().regex(ISO).optional(),
  flexible: z.boolean(),
  targetIdr: z.number().int().min(50_000).max(1_000_000_000),
});
export const createFlightAlertInput = (data: unknown) => alertSchema.parse(data);

export type FlightAlertRow = {
  id: string;
  origin: string;
  destination: string;
  origin_name: string;
  destination_name: string;
  departure_date: string;
  return_date: string | null;
  flexible: boolean;
  target_idr: number;
  last_price_idr: number | null;
  notified_at: string | null;
};

const ALERT_COLUMNS = `id, origin, destination, origin_name, destination_name,
  to_char(departure_date,'YYYY-MM-DD') as departure_date,
  to_char(return_date,'YYYY-MM-DD') as return_date, flexible, target_idr,
  last_price_idr, notified_at`;

export async function createFlightAlertHandler({
  data,
}: {
  data: ReturnType<typeof createFlightAlertInput>;
}) {
  const config = await enabled("priceAlerts");
  const owner = await member();
  const origin = data.origin.toUpperCase();
  const destination = data.destination.toUpperCase();
  if (!isIataCode(origin) || !isIataCode(destination) || origin === destination) {
    throw new Error("Rute tidak valid.");
  }
  if (data.departureDate < new Date().toISOString().slice(0, 10)) {
    throw new Error("Tanggal berangkat sudah lewat.");
  }
  if (data.returnDate && data.returnDate < data.departureDate) {
    throw new Error("Tanggal pulang harus sesudah berangkat.");
  }
  const count = await pool.query(
    "select count(*)::int as n from travel_flight_alerts where customer_auth_subject=$1 and active",
    [owner],
  );
  if (Number(count.rows[0]?.n) >= config.alertsPerMember) {
    throw new Error(`Maksimal ${config.alertsPerMember} pantauan aktif. Hapus salah satu dulu.`);
  }
  const row = await pool.query(
    `insert into travel_flight_alerts
       (customer_auth_subject, origin, destination, origin_name, destination_name,
        departure_date, return_date, flexible, target_idr)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning ${ALERT_COLUMNS}`,
    [
      owner,
      origin,
      destination,
      data.originName,
      data.destinationName,
      data.departureDate,
      data.returnDate ?? null,
      data.flexible,
      data.targetIdr,
    ],
  );
  return { alert: row.rows[0] as FlightAlertRow };
}

export async function listFlightAlertsHandler() {
  const owner = await member();
  const rows = await pool.query(
    `select ${ALERT_COLUMNS} from travel_flight_alerts
     where customer_auth_subject=$1 and active order by created_at desc limit 20`,
    [owner],
  );
  return { alerts: rows.rows as FlightAlertRow[] };
}

const idSchema = z.object({ id: z.string().uuid() });
export const deleteFlightAlertInput = (data: unknown) => idSchema.parse(data);
export async function deleteFlightAlertHandler({
  data,
}: {
  data: ReturnType<typeof deleteFlightAlertInput>;
}) {
  const owner = await member();
  await pool.query(
    "update travel_flight_alerts set active=false where id=$1 and customer_auth_subject=$2",
    [data.id, owner],
  );
  return { ok: true as const };
}

/* ------------------------------------------------------------ save to trip */

const saveSchema = z.object({ tripId: z.string().uuid(), offer: z.unknown() });
export const saveFlightToTripInput = (data: unknown) => saveSchema.parse(data);

export async function saveFlightToTripHandler({
  data,
}: {
  data: ReturnType<typeof saveFlightToTripInput>;
}) {
  await enabled("saveToTrip");
  const owner = await member();
  const offer = parseOfferSnapshot(data.offer);
  if (!offer) throw new Error("Data penerbangan tidak valid.");
  const owned = await pool.query(
    "select 1 from travel_trips where id=$1 and customer_auth_subject=$2",
    [data.tripId, owner],
  );
  if (!owned.rows.length) throw new Error("Perjalanan tidak ditemukan.");
  const { addItineraryItem } = await import("./my-trips.server");
  const items = tripItemsForOffer(offer);
  const created: string[] = [];
  for (const item of items) {
    const row = (await addItineraryItem({ tripId: data.tripId, ...item })) as { id: string };
    created.push(row.id);
  }
  return { ok: true as const, itemIds: created, dates: items.map((item) => item.activityDate) };
}

/* ------------------------------------------------------------------ shares */

const shareSchema = z.object({ offers: z.array(z.unknown()).min(1).max(3) });
export const createFlightShareInput = (data: unknown) => shareSchema.parse(data);

export async function createFlightShareHandler({
  data,
}: {
  data: ReturnType<typeof createFlightShareInput>;
}) {
  const config = await enabled("share");
  const owner = await member();
  const offers = data.offers
    .map(parseOfferSnapshot)
    .filter((offer): offer is FlightOfferSnapshot => offer !== null);
  if (!offers.length) throw new Error("Data penerbangan tidak valid.");
  const active = await pool.query(
    `select count(*)::int as n from travel_flight_shares
     where owner_auth_subject=$1 and revoked_at is null and expires_at > now()`,
    [owner],
  );
  if (Number(active.rows[0]?.n) >= 20) throw new Error("Terlalu banyak tautan aktif.");
  const token = randomBytes(18).toString("base64url");
  await pool.query(
    `insert into travel_flight_shares (token, owner_auth_subject, offers, expires_at)
     values ($1,$2,$3::jsonb, now() + ($4 || ' days')::interval)`,
    [token, owner, JSON.stringify(offers), String(config.shareDays)],
  );
  return { token, days: config.shareDays };
}

const tokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/) });
export const flightShareInput = (data: unknown) => tokenSchema.parse(data);

export async function getFlightShareHandler({
  data,
}: {
  data: ReturnType<typeof flightShareInput>;
}) {
  const config = await getFlightsConfigHandler();
  if (!config.enabled || !config.share) return null;
  const row = await pool.query(
    `update travel_flight_shares set opens = opens + 1
     where token=$1 and revoked_at is null and expires_at > now()
     returning offers, expires_at`,
    [data.token],
  );
  const share = row.rows[0] as { offers: unknown; expires_at: string } | undefined;
  if (!share) return null;
  const offers = (Array.isArray(share.offers) ? share.offers : [])
    .map(parseOfferSnapshot)
    .filter((offer): offer is FlightOfferSnapshot => offer !== null);
  const votes = await pool.query(
    "select offer_id, count(*)::int as n from travel_flight_votes where token=$1 group by offer_id",
    [data.token],
  );
  const counts: Record<string, number> = {};
  for (const v of votes.rows as { offer_id: string; n: number }[]) counts[v.offer_id] = v.n;
  let mine: string | null = null;
  let signedIn = false;
  try {
    const subject = await member();
    signedIn = true;
    const own = await pool.query(
      "select offer_id from travel_flight_votes where token=$1 and voter_auth_subject=$2",
      [data.token, subject],
    );
    mine = (own.rows[0]?.offer_id as string | undefined) ?? null;
  } catch {
    // Guests may look; only members vote.
  }
  return { offers, counts, mine, signedIn, expiresAt: share.expires_at };
}

const voteSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  offerId: z.string().min(1).max(80),
});
export const voteFlightShareInput = (data: unknown) => voteSchema.parse(data);

export async function voteFlightShareHandler({
  data,
}: {
  data: ReturnType<typeof voteFlightShareInput>;
}) {
  const voter = await member();
  const row = await pool.query(
    "select offers from travel_flight_shares where token=$1 and revoked_at is null and expires_at > now()",
    [data.token],
  );
  const offers = (row.rows[0]?.offers ?? []) as { id?: string }[];
  if (!offers.some((offer) => offer.id === data.offerId)) throw new Error("Pilihan tidak ada.");
  await pool.query(
    `insert into travel_flight_votes (token, voter_auth_subject, offer_id) values ($1,$2,$3)
     on conflict (token, voter_auth_subject) do update set offer_id = excluded.offer_id, created_at = now()`,
    [data.token, voter, data.offerId],
  );
  return { ok: true as const };
}

/* ------------------------------------------------------------------- admin */

export async function flightFeatureStats() {
  const stats = { alertsActive: 0, alertsNotified: 0, sharesActive: 0, shareOpens: 0, votes: 0 };
  try {
    const a = await pool.query(
      `select count(*) filter (where active)::int as active,
              count(*) filter (where notified_at is not null)::int as notified
       from travel_flight_alerts`,
    );
    stats.alertsActive = Number(a.rows[0]?.active) || 0;
    stats.alertsNotified = Number(a.rows[0]?.notified) || 0;
    const s = await pool.query(
      `select count(*) filter (where revoked_at is null and expires_at > now())::int as active,
              coalesce(sum(opens),0)::int as opens from travel_flight_shares`,
    );
    stats.sharesActive = Number(s.rows[0]?.active) || 0;
    stats.shareOpens = Number(s.rows[0]?.opens) || 0;
    const v = await pool.query("select count(*)::int as n from travel_flight_votes");
    stats.votes = Number(v.rows[0]?.n) || 0;
  } catch {
    // Monitoring only; the settings still load.
  }
  return stats;
}

const revokeSchema = z.object({ reason: z.string().trim().min(4).max(300) });
export const revokeFlightSharesInput = (data: unknown) => revokeSchema.parse(data);

/** Moderation: closes every open shared link at once, with an audit record. */
export async function revokeFlightSharesHandler({
  data,
}: {
  data: ReturnType<typeof revokeFlightSharesInput>;
}) {
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const result = await pool.query(
    "update travel_flight_shares set revoked_at = now() where revoked_at is null and expires_at > now()",
  );
  await pool.query(
    `insert into public.admin_audit_logs
       (id, action, entity_type, entity_id, reason, before_json, after_json)
     values ($1,'flights.shares.revoke','flights','shares',$2,'{}'::jsonb,$3::jsonb)`,
    [randomUUID(), `${actor}: ${data.reason}`, JSON.stringify({ revoked: result.rowCount ?? 0 })],
  );
  return { ok: true as const, revoked: result.rowCount ?? 0 };
}

/* ------------------------------------------------------------- alert sweep */

const SWEEP_BATCH = 20;
const RECHECK_HOURS = 6;
const shiftDay = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

type DueAlert = {
  id: string;
  customer_auth_subject: string;
  origin: string;
  destination: string;
  origin_name: string;
  destination_name: string;
  departure_date: string;
  return_date: string | null;
  flexible: boolean;
  target_idr: number;
  notified_price_idr: number | null;
};

/**
 * Checks the alerts that have not been looked at for a few hours against the provider's cached
 * fares and notifies a member once per new low. Called from the scheduled task; one failing alert
 * never stops the rest, and a re-run never notifies the same price twice (idempotent event key).
 */
export async function sweepFlightAlerts() {
  const config = await getFlightsConfigHandler();
  const result = { checked: 0, notified: 0, closed: 0, failed: 0 };
  if (!config.enabled || !config.priceAlerts) return result;
  await pool.query(
    "update travel_flight_alerts set active=false where active and departure_date < current_date",
  );
  const due = await pool.query(
    `select id, customer_auth_subject, origin, destination, origin_name, destination_name,
            to_char(departure_date,'YYYY-MM-DD') as departure_date,
            to_char(return_date,'YYYY-MM-DD') as return_date, flexible, target_idr,
            notified_price_idr
     from travel_flight_alerts
     where active and (last_checked_at is null or last_checked_at < now() - ($1 || ' hours')::interval)
     order by last_checked_at nulls first limit $2`,
    [String(RECHECK_HOURS), SWEEP_BATCH],
  );
  for (const alert of due.rows as DueAlert[]) {
    try {
      const from = alert.flexible ? shiftDay(alert.departure_date, -3) : alert.departure_date;
      const to = alert.flexible ? shiftDay(alert.departure_date, 3) : alert.departure_date;
      const stay = alert.return_date ? daysBetween(alert.departure_date, alert.return_date) : 0;
      const months = [...new Set([from.slice(0, 7), to.slice(0, 7)])];
      let offers: FlightOffer[] = [];
      for (const month of months) {
        offers = offers.concat(await fetchMonthOffers(alert.origin, alert.destination, month));
      }
      if (alert.return_date) {
        // Priced like the calendar: a one-way fare out plus a one-way fare back after the same stay.
        const backMonths = [
          ...new Set([shiftDay(from, stay).slice(0, 7), shiftDay(to, stay).slice(0, 7)]),
        ];
        let inbound: FlightOffer[] = [];
        for (const month of backMonths) {
          inbound = inbound.concat(await fetchMonthOffers(alert.destination, alert.origin, month));
        }
        offers = combineRoundTrip(offers, inbound, stay);
      }
      let best: { price: number; day: string } | null = null;
      for (const offer of offers) {
        const day = offer.departureAt.slice(0, 10);
        if (day < from || day > to) continue;
        if (!best || offer.priceIdr < best.price) best = { price: offer.priceIdr, day };
      }
      result.checked += 1;
      await pool.query(
        "update travel_flight_alerts set last_checked_at=now(), last_price_idr=$2 where id=$1",
        [alert.id, best?.price ?? null],
      );
      if (
        best &&
        best.price <= alert.target_idr &&
        (alert.notified_price_idr === null || best.price < alert.notified_price_idr)
      ) {
        const href = `/tiket?dari=${alert.origin}&ke=${alert.destination}&berangkat=${best.day}`;
        const note = await createCustomerNotification({
          subject: alert.customer_auth_subject,
          type: "trip_flight_price",
          title: `Harga turun: ${alert.origin_name} ke ${alert.destination_name}`,
          body: `Tiket mulai ${formatFlightPrice(best.price)} untuk ${best.day}. Target kamu ${formatFlightPrice(alert.target_idr)}.`,
          href,
          eventKey: `flight-alert:${alert.id}:${best.price}`,
          source: "flight-alerts",
        });
        await pool.query(
          "update travel_flight_alerts set notified_price_idr=$2, notified_at=now() where id=$1",
          [alert.id, best.price],
        );
        if (note.created) result.notified += 1;
      }
    } catch (error) {
      result.failed += 1;
      console.error("[flights] alert check failed", {
        reason: error instanceof Error ? error.message.slice(0, 160) : "unknown",
      });
    }
  }
  return result;
}
