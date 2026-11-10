import { pool } from "../db/client.server";
import { createCustomerNotification } from "./push.server";
import { jakartaDayStart } from "./receipt-scan";
import { pickReminder } from "./trip-assistant";
import { readTripAssistantConfig } from "./trip-assistant.server";

/**
 * Proactive reminders for MEMBERS (guests have no inbox or push): an upcoming trip without a
 * budget, an empty agenda, open checklist items, or a day of the trip with nothing planned. At most
 * one reminder per traveler per day, only between 08:00 and 20:00 Jakarta time, each reminder at
 * most once (idempotent event key). It reuses the notification inbox and web push that already
 * exist; the Admin switch `reminders` turns it off.
 */

export const REMINDER_TYPE = "trip_assistant";
let lastSweep = 0;

/** Tests only: forget when the last sweep ran. */
export const resetReminderThrottle = () => {
  lastSweep = 0;
};

export type ReminderSweep = { skipped: string | null; checked: number; sent: number };

export async function sweepAssistantReminders(now = Date.now()): Promise<ReminderSweep> {
  const result: ReminderSweep = { skipped: null, checked: 0, sent: 0 };
  // The timer ticks every minute; trips are looked at every half hour.
  if (now - lastSweep < 30 * 60_000) return { ...result, skipped: "throttled" };
  lastSweep = now;
  const { config } = await readTripAssistantConfig();
  if (!config.enabled || !config.reminders) return { ...result, skipped: "off" };
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(now)),
  );
  if (hour < 8 || hour >= 20) return { ...result, skipped: "quiet_hours" };
  const trips = await pool.query(
    `with today as (select (now() at time zone 'Asia/Jakarta')::date as d)
     select t.id, t.name, t.customer_auth_subject as subject,
            (t.departure_date - today.d) as to_dep, (t.return_date - today.d) as to_ret,
            to_char(today.d, 'YYYY-MM-DD') as today,
            t.total_budget_minor > 0 as budget_set,
            (select count(*)::int from public.travel_itinerary_items i where i.trip_id = t.id) as items,
            (select count(*)::int from public.travel_itinerary_items i where i.trip_id = t.id and i.activity_date = today.d) as today_items,
            (select count(*)::int from public.travel_checklist_items c where c.trip_id = t.id and not c.is_completed) as open_check
     from public.travel_trips t, today
     where t.customer_auth_subject not like 'guest:%' and t.archived_at is null
       and t.return_date >= today.d and t.departure_date <= today.d + 14
     order by t.departure_date limit 500`,
  );
  const since = jakartaDayStart(new Date(now));
  const notified = new Set<string>();
  for (const row of trips.rows) {
    result.checked += 1;
    const subject = String(row.subject);
    if (notified.has(subject)) continue;
    const reminder = pickReminder({
      tripId: String(row.id),
      name: String(row.name),
      daysToDeparture: Number(row.to_dep),
      daysToReturn: Number(row.to_ret),
      budgetSet: Boolean(row.budget_set),
      itemCount: Number(row.items),
      todayItemCount: Number(row.today_items),
      openChecklist: Number(row.open_check),
      today: String(row.today),
    });
    if (!reminder) continue;
    const already = await pool.query(
      "select 1 from public.customer_notifications where recipient_customer_auth_subject=$1 and type=$2 and created_at >= $3 limit 1",
      [subject, REMINDER_TYPE, since],
    );
    if (already.rows[0]) {
      notified.add(subject);
      continue;
    }
    try {
      const note = await createCustomerNotification({
        subject,
        type: REMINDER_TYPE,
        title: reminder.title,
        body: reminder.body,
        href: `/my-trips/${String(row.id)}`,
        eventKey: reminder.eventKey,
        source: "trip-assistant",
      });
      if (note.created) {
        result.sent += 1;
        notified.add(subject);
      }
    } catch (error) {
      console.error("[trip-assistant] reminder failed", {
        reason: error instanceof Error ? error.message.slice(0, 160) : "unknown",
      });
    }
  }
  return result;
}

/** Last 30 days, for the Admin panel. */
export async function reminderStats() {
  const result = await pool.query(
    "select count(*)::int as n from public.customer_notifications where type=$1 and created_at > now() - interval '30 days'",
    [REMINDER_TYPE],
  );
  return { sent30d: Number(result.rows[0]?.n) || 0 };
}
