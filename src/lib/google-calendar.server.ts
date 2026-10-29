import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { pool } from "@/db/client.server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events";

type User = { id: string };
type TripItem = {
  id: string;
  trip_id: string;
  activity_date: string;
  start_time: string | null;
  end_time: string | null;
  timezone: string | null;
  title: string;
  location: string | null;
  notes: string | null;
  booking_reference: string | null;
};
type Connection = {
  customer_auth_subject: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string | null;
};

function config() {
  const clientId = process.env["GOOGLE_CALENDAR_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CALENDAR_CLIENT_SECRET"];
  const redirectUri = process.env["GOOGLE_CALENDAR_REDIRECT_URI"] ?? "https://djiwatravel.com/api/google-calendar/callback";
  const keyText = process.env["GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY"];
  if (!clientId || !clientSecret || !keyText) throw new Error("Google Calendar belum dikonfigurasi");
  const key = /^[0-9a-f]{64}$/i.test(keyText) ? Buffer.from(keyText, "hex") : Buffer.from(keyText, "base64");
  if (key.length !== 32) throw new Error("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY harus 32 byte (hex/base64)");
  return { clientId, clientSecret, redirectUri, key };
}

function encrypt(value: string) {
  const { key } = config();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}
function decrypt(value: string) {
  const { key } = config();
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !encrypted) throw new Error("Token Google Calendar rusak");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
function stateHash(state: string) {
  return createHash("sha256").update(state).digest("hex");
}
function baseUrl() {
  return process.env["PUBLIC_APP_URL"] ?? "https://djiwatravel.com";
}
function dateOnly(value: string, days = 0) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function timeValue(value: string) {
  return value.length === 5 ? `${value}:00` : value;
}
function eventBody(item: TripItem, trip: { name: string; destination_name: string }) {
  const timezone = item.timezone || "UTC";
  const description = [
    `Trip: ${trip.name}`,
    `Destinasi: ${trip.destination_name}`,
    item.booking_reference ? `Booking: ${item.booking_reference}` : "",
    item.notes ?? "",
    `Dibuat oleh Djiwa Travel: ${baseUrl()}/my-trips/${item.trip_id}`,
  ].filter(Boolean).join("\n");
  const body: Record<string, unknown> = {
    summary: `Djiwa Trip — ${item.title}`,
    description,
    location: item.location ?? undefined,
    reminders: { useDefault: true },
    extendedProperties: { private: { djiwaTripId: item.trip_id, djiwaItineraryItemId: item.id } },
  };
  if (!item.start_time) {
    body.start = { date: item.activity_date };
    body.end = { date: dateOnly(item.activity_date, 1) };
  } else {
    const start = `${item.activity_date}T${timeValue(item.start_time)}`;
    const endDate = item.end_time && item.end_time < item.start_time
      ? dateOnly(item.activity_date, 1)
      : item.activity_date;
    const end = item.end_time
      ? `${endDate}T${timeValue(item.end_time)}`
      : `${item.activity_date}T${timeValue(item.start_time)}`;
  const endDateTime = end === start
    ? `${item.activity_date}T${timeValue(item.start_time).replace(/(\d{2}):(\d{2}):\d{2}/, (_, hour, minute) => `${String((Number(hour) + 1) % 24).padStart(2, "0")}:${minute}:00`)}`
    : end;
    body.start = { dateTime: start, timeZone: timezone };
    body.end = { dateTime: endDateTime, timeZone: timezone };
  }
  return body;
}
async function googleRequest(path: string, init: RequestInit, token: string) {
  const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`Google Calendar API ${response.status}`);
  return response.status === 204 ? null : response.json();
}
async function refreshAccessToken(connection: Connection) {
  const { clientId, clientSecret } = config();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: decrypt(connection.refresh_token_encrypted), grant_type: "refresh_token" }),
  });
  if (!response.ok) throw new Error("Token Google Calendar tidak dapat diperbarui");
  const payload = (await response.json()) as { access_token: string; expires_in?: number };
  await pool.query("update customer_google_calendar_connections set access_token_encrypted=$1, token_expires_at=now()+($2 * interval '1 second'), updated_at=now() where customer_auth_subject=$3", [encrypt(payload.access_token), payload.expires_in ?? 3600, connection.customer_auth_subject]);
  return payload.access_token;
}
async function accessToken(connection: Connection) {
  if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() > Date.now() + 60_000) return decrypt(connection.access_token_encrypted);
  return refreshAccessToken(connection);
}
async function connectionFor(subject: string) {
  const result = await pool.query("select * from customer_google_calendar_connections where customer_auth_subject=$1 limit 1", [subject]);
  return (result.rows[0] as Connection | undefined) ?? null;
}
export function googleCalendarConfigured() {
  return Boolean(process.env["GOOGLE_CALENDAR_CLIENT_ID"] && process.env["GOOGLE_CALENDAR_CLIENT_SECRET"] && process.env["GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY"]);
}
export async function startGoogleCalendarConnect(user: User) {
  const { clientId, redirectUri } = config();
  const state = randomBytes(32).toString("base64url");
  await pool.query(`insert into customer_google_calendar_connections (customer_auth_subject,state_hash,state_expires_at) values ($1,$2,now()+interval '10 minutes') on conflict (customer_auth_subject) do update set state_hash=excluded.state_hash,state_expires_at=excluded.state_expires_at,updated_at=now()`, [user.id, stateHash(state)]);
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", access_type: "offline", prompt: "consent", scope: GOOGLE_SCOPE, state });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}
export async function finishGoogleCalendarConnect(code: string, state: string) {
  const result = await pool.query("select * from customer_google_calendar_connections where state_hash=$1 and state_expires_at > now() limit 1", [stateHash(state)]);
  const pending = result.rows[0] as { customer_auth_subject: string } | undefined;
  if (!pending) throw new Error("Sesi koneksi Google Calendar kedaluwarsa");
  const { clientId, clientSecret, redirectUri } = config();
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
  if (!tokenResponse.ok) throw new Error("Google menolak koneksi Calendar");
  const token = (await tokenResponse.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  if (!token.refresh_token) throw new Error("Refresh token Google tidak diterima");
  await pool.query("update customer_google_calendar_connections set access_token_encrypted=$1,refresh_token_encrypted=$2,token_expires_at=now()+($3 * interval '1 second'),state_hash=null,state_expires_at=null,connected_at=coalesce(connected_at,now()),updated_at=now() where customer_auth_subject=$4", [encrypt(token.access_token), encrypt(token.refresh_token), token.expires_in ?? 3600, pending.customer_auth_subject]);
  return syncAllForUser(pending.customer_auth_subject);
}
export async function googleCalendarStatus(user: User) {
  const result = await pool.query("select google_account_email,connected_at from customer_google_calendar_connections where customer_auth_subject=$1 and refresh_token_encrypted is not null limit 1", [user.id]);
  if (!result.rows[0]) return { connected: false, accountEmail: null, connectedAt: null, pendingCount: 0 };
  const pending = await pool.query(
    `select count(*)::int as count
     from travel_itinerary_items i
     join travel_trips t on t.id=i.trip_id
     left join travel_google_calendar_events e on e.itinerary_item_id=i.id
     where t.customer_auth_subject=$1 and e.itinerary_item_id is null`,
    [user.id],
  );
  return {
    connected: true,
    accountEmail: result.rows[0]?.google_account_email ?? null,
    connectedAt: result.rows[0]?.connected_at ?? null,
    pendingCount: Number(pending.rows[0]?.count ?? 0),
  };
}
export async function disconnectGoogleCalendar(user: User) {
  await pool.query("delete from customer_google_calendar_connections where customer_auth_subject=$1", [user.id]);
}
export async function syncItineraryItem(itemId: string, subject: string) {
  const connection = await connectionFor(subject);
  if (!connection?.refresh_token_encrypted) return;
  const result = await pool.query("select i.*,t.name,t.destination_name from travel_itinerary_items i join travel_trips t on t.id=i.trip_id where i.id=$1 and t.customer_auth_subject=$2 limit 1", [itemId, subject]);
  const row = result.rows[0] as (TripItem & { name: string; destination_name: string }) | undefined;
  if (!row) return;
  let token = await accessToken(connection);
  const mapping = await pool.query("select event_id,calendar_id from travel_google_calendar_events where itinerary_item_id=$1 limit 1", [itemId]);
  const existing = mapping.rows[0] as { event_id: string; calendar_id: string } | undefined;
  const body = eventBody(row, row);
  try {
    if (existing) await googleRequest(`/calendars/${encodeURIComponent(existing.calendar_id)}/events/${encodeURIComponent(existing.event_id)}`, { method: "PATCH", body: JSON.stringify(body) }, token);
    else {
      const created = await googleRequest("/calendars/primary/events", { method: "POST", body: JSON.stringify(body) }, token) as { id: string };
      await pool.query("insert into travel_google_calendar_events (itinerary_item_id,trip_id,customer_auth_subject,calendar_id,event_id) values ($1,$2,$3,'primary',$4) on conflict (itinerary_item_id) do update set event_id=excluded.event_id,updated_at=now()", [itemId, row.trip_id, subject, created.id]);
    }
  } catch (error) {
    if ((error as Error).message.includes("Google Calendar API 401")) {
      token = await refreshAccessToken(connection);
      const refreshed = await googleRequest(existing ? `/calendars/${encodeURIComponent(existing.calendar_id)}/events/${encodeURIComponent(existing.event_id)}` : "/calendars/primary/events", { method: existing ? "PATCH" : "POST", body: JSON.stringify(body) }, token) as { id?: string } | null;
      if (!existing && refreshed?.id) await pool.query("insert into travel_google_calendar_events (itinerary_item_id,trip_id,customer_auth_subject,calendar_id,event_id) values ($1,$2,$3,'primary',$4) on conflict (itinerary_item_id) do update set event_id=excluded.event_id,updated_at=now()", [itemId, row.trip_id, subject, refreshed.id]);
    } else throw error;
  }
}
export async function syncAllForUser(subject: string) {
  const result = await pool.query("select i.id from travel_itinerary_items i join travel_trips t on t.id=i.trip_id where t.customer_auth_subject=$1", [subject]);
  let synced = 0;
  let failed = 0;
  for (const row of result.rows as Array<{ id: string }>) {
    try {
      await syncItineraryItem(row.id, subject);
      synced += 1;
    } catch (error) {
      failed += 1;
      console.error("[google-calendar] itinerary sync failed", { itemId: row.id, error });
    }
  }
  return { total: result.rows.length, synced, failed };
}
