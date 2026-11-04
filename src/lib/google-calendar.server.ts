import { pool } from "@/db/client.server";
import {
  accessToken,
  connectionFor,
  disconnectGoogle,
  finishGoogleConnect,
  googleAccountStatus,
  googleConfigured,
  hasFeature,
  refreshAccessToken,
  startGoogleConnect,
} from "./google-account.server";
import { googleMapsPointUrl } from "./itinerary-map";

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

type User = { id: string };
type TripItem = {
  id: string;
  trip_id: string;
  activity_date: string | Date;
  start_time: string | null;
  end_time: string | null;
  timezone: string | null;
  title: string;
  location: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notes: string | null;
  booking_reference: string | null;
};
function baseUrl() {
  return process.env["PUBLIC_APP_URL"] ?? "https://djiwatravel.com";
}
export function calendarDate(value: string | Date) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("Tanggal agenda tidak valid");
    return value.toISOString().slice(0, 10);
  }
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (!match) throw new Error("Tanggal agenda tidak valid");
  return match[0];
}
function dateOnly(value: string | Date, days = 0) {
  const date = new Date(`${calendarDate(value)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function timeValue(value: string) {
  return value.length === 5 ? `${value}:00` : value;
}
/**
 * Two explicit popup reminders on every event, so travelers get notified even when their calendar
 * has no default reminders (`useDefault: true` then notifies nobody).
 * - With a start time: 2 hours and 30 minutes before.
 * - All-day (no start time): 09:00 two days before and 09:00 the day before. Google counts these
 *   from 00:00 of the event day.
 * Bump CALENDAR_REMINDER_VERSION when this changes so existing events are re-sent.
 */
export const CALENDAR_REMINDER_VERSION = 1;
export const TIMED_REMINDER_MINUTES = [120, 30] as const;
export const ALL_DAY_REMINDER_MINUTES = [2340, 900] as const;
export function reminderOverrides(timed: boolean) {
  return (timed ? TIMED_REMINDER_MINUTES : ALL_DAY_REMINDER_MINUTES).map((minutes) => ({
    method: "popup" as const,
    minutes,
  }));
}
export function eventBody(item: TripItem, trip: { name: string; destination_name: string }) {
  const timezone = item.timezone || "UTC";
  const activityDate = calendarDate(item.activity_date);
  const description = [
    `Trip: ${trip.name}`,
    `Destinasi: ${trip.destination_name}`,
    item.booking_reference ? `Booking: ${item.booking_reference}` : "",
    item.latitude != null && item.longitude != null
      ? `Peta: ${googleMapsPointUrl({ lat: Number(item.latitude), lng: Number(item.longitude) })}`
      : "",
    item.notes ?? "",
    `Dibuat oleh Djiwa Travel: ${baseUrl()}/my-trips/${item.trip_id}`,
  ]
    .filter(Boolean)
    .join("\n");
  const body: Record<string, unknown> = {
    summary: `Djiwa Trip — ${item.title}`,
    description,
    location: item.location ?? undefined,
    reminders: { useDefault: false, overrides: reminderOverrides(Boolean(item.start_time)) },
    extendedProperties: { private: { djiwaTripId: item.trip_id, djiwaItineraryItemId: item.id } },
  };
  if (!item.start_time) {
    body["start"] = { date: activityDate };
    body["end"] = { date: dateOnly(activityDate, 1) };
  } else {
    const start = `${activityDate}T${timeValue(item.start_time)}`;
    const endDate =
      item.end_time && item.end_time < item.start_time ? dateOnly(activityDate, 1) : activityDate;
    const end = item.end_time
      ? `${endDate}T${timeValue(item.end_time)}`
      : `${activityDate}T${timeValue(item.start_time)}`;
    const endDateTime =
      end === start
        ? `${activityDate}T${timeValue(item.start_time).replace(/(\d{2}):(\d{2}):\d{2}/, (_, hour, minute) => `${String((Number(hour) + 1) % 24).padStart(2, "0")}:${minute}:00`)}`
        : end;
    body["start"] = { dateTime: start, timeZone: timezone };
    body["end"] = { dateTime: endDateTime, timeZone: timezone };
  }
  return body;
}
async function googleRequest(path: string, init: RequestInit, token: string) {
  const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Google Calendar API ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}`,
    );
  }
  return response.status === 204 ? null : response.json();
}
export function googleCalendarConfigured() {
  return googleConfigured();
}
export async function startGoogleCalendarConnect(user: User) {
  return startGoogleConnect(user, ["calendar"]);
}
/**
 * Completes any Google connect (Calendar, Drive or Sheets). Calendar items sync only when the
 * Calendar scope is granted; waiting Drive/Sheets work is then drained by the caller.
 */
export async function finishGoogleCalendarConnect(code: string, state: string) {
  const { subject, features } = await finishGoogleConnect(code, state);
  const sync = features.calendar
    ? await syncAllForUser(subject)
    : { total: 0, synced: 0, failed: 0 };
  return { ...sync, subject, features };
}
export async function googleCalendarStatus(user: User) {
  const account = await googleAccountStatus(user.id);
  if (!account.connected || !account.features.calendar)
    return {
      ...account,
      googleConnected: account.connected,
      connected: account.connected && account.features.calendar,
      pendingCount: 0,
    };
  const pending = await pool.query(
    `select count(*)::int as count
     from travel_itinerary_items i
     join travel_trips t on t.id=i.trip_id
     left join travel_google_calendar_events e on e.itinerary_item_id=i.id
     where t.customer_auth_subject=$1
       and (e.itinerary_item_id is null or e.reminder_version < $2)`,
    [user.id, CALENDAR_REMINDER_VERSION],
  );
  return {
    ...account,
    googleConnected: account.connected,
    pendingCount: Number(pending.rows[0]?.count ?? 0),
  };
}
export async function disconnectGoogleCalendar(user: User) {
  await disconnectGoogle(user.id);
}
export async function syncItineraryItem(itemId: string, subject: string) {
  const connection = await connectionFor(subject);
  if (!connection?.refresh_token_encrypted || !hasFeature(connection, "calendar")) return;
  const result = await pool.query(
    "select i.*,t.name,t.destination_name from travel_itinerary_items i join travel_trips t on t.id=i.trip_id where i.id=$1 and t.customer_auth_subject=$2 limit 1",
    [itemId, subject],
  );
  const row = result.rows[0] as (TripItem & { name: string; destination_name: string }) | undefined;
  if (!row) return;
  let token = await accessToken(connection);
  const mapping = await pool.query(
    "select event_id,calendar_id from travel_google_calendar_events where itinerary_item_id=$1 limit 1",
    [itemId],
  );
  const existing = mapping.rows[0] as { event_id: string; calendar_id: string } | undefined;
  const body = eventBody(row, row);
  try {
    if (existing)
      await googleRequest(
        `/calendars/${encodeURIComponent(existing.calendar_id)}/events/${encodeURIComponent(existing.event_id)}`,
        { method: "PATCH", body: JSON.stringify(body) },
        token,
      );
    else {
      const created = (await googleRequest(
        "/calendars/primary/events",
        { method: "POST", body: JSON.stringify(body) },
        token,
      )) as { id: string };
      await pool.query(
        "insert into travel_google_calendar_events (itinerary_item_id,trip_id,customer_auth_subject,calendar_id,event_id) values ($1,$2,$3,'primary',$4) on conflict (itinerary_item_id) do update set event_id=excluded.event_id,updated_at=now()",
        [itemId, row.trip_id, subject, created.id],
      );
    }
  } catch (error) {
    if ((error as Error).message.includes("Google Calendar API 401")) {
      token = await refreshAccessToken(connection);
      const refreshed = (await googleRequest(
        existing
          ? `/calendars/${encodeURIComponent(existing.calendar_id)}/events/${encodeURIComponent(existing.event_id)}`
          : "/calendars/primary/events",
        { method: existing ? "PATCH" : "POST", body: JSON.stringify(body) },
        token,
      )) as { id?: string } | null;
      if (!existing && refreshed?.id)
        await pool.query(
          "insert into travel_google_calendar_events (itinerary_item_id,trip_id,customer_auth_subject,calendar_id,event_id) values ($1,$2,$3,'primary',$4) on conflict (itinerary_item_id) do update set event_id=excluded.event_id,updated_at=now()",
          [itemId, row.trip_id, subject, refreshed.id],
        );
    } else throw error;
  }
  await pool.query(
    "update travel_google_calendar_events set reminder_version=$1, updated_at=now() where itinerary_item_id=$2",
    [CALENDAR_REMINDER_VERSION, itemId],
  );
}
export async function syncAllForUser(subject: string) {
  const result = await pool.query(
    "select i.id from travel_itinerary_items i join travel_trips t on t.id=i.trip_id where t.customer_auth_subject=$1",
    [subject],
  );
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
