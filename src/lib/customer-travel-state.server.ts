import { z } from "zod";
import { pool } from "../db/client.server";
import { getAuthenticatedUser } from "./customer-session.fn";
import { CHECKLIST_KEYS, parseDepartureDate } from "./travel-journey";

/**
 * Account-scoped travel state (trip plan + notification choice).
 *
 * The owner always comes from the verified session. The order id is accepted from the browser only
 * as a lookup key and is checked against `customer_orders.customer_auth_subject`, so one customer
 * can never write a plan onto somebody else's order.
 */
export type RemoteTripPlan = {
  orderId: string;
  departureDate: string | null;
  completed: Record<string, number>;
  updatedAt: number;
};
export type TravelState = { tripPlans: RemoteTripPlan[]; esimNotify: boolean };

const planSchema = z.object({
  orderId: z.string().uuid(),
  departureDate: z
    .string()
    .nullable()
    .refine((value) => value === null || parseDepartureDate(value) !== null),
  completed: z.record(z.string(), z.number().finite()),
  updatedAt: z.number().finite().nonnegative(),
});
const notifySchema = z.object({ enabled: z.boolean() });

export const saveTripPlanInput = (data: unknown) => planSchema.parse(data);
export const saveNotifyPreferenceInput = (data: unknown) => notifySchema.parse(data);

export function sanitizeCompleted(value: Record<string, number>): Record<string, number> {
  const completed: Record<string, number> = {};
  for (const key of CHECKLIST_KEYS) {
    const stamp = value[key];
    if (typeof stamp === "number" && Number.isFinite(stamp)) completed[key] = stamp;
  }
  return completed;
}

export async function getTravelStateHandler(): Promise<TravelState> {
  const user = await getAuthenticatedUser();
  const [plans, prefs] = await Promise.all([
    pool.query(
      `select order_id, departure_date, completed, client_updated_at
         from customer_trip_plans where customer_auth_subject = $1 limit 200`,
      [user.id],
    ),
    pool.query(`select esim_notify from customer_preferences where customer_auth_subject = $1`, [
      user.id,
    ]),
  ]);
  return {
    tripPlans: plans.rows.map((row) => ({
      orderId: String(row.order_id),
      departureDate: typeof row.departure_date === "string" ? row.departure_date : null,
      completed: sanitizeCompleted((row.completed ?? {}) as Record<string, number>),
      updatedAt: Number(row.client_updated_at),
    })),
    esimNotify: prefs.rows[0]?.esim_notify === true,
  };
}

export async function saveTripPlanHandler({
  data,
}: {
  data: ReturnType<typeof saveTripPlanInput>;
}): Promise<{ saved: boolean }> {
  const user = await getAuthenticatedUser();
  // Last write wins by the client edit time; an older device replaying stale state is ignored.
  const result = await pool.query(
    `insert into customer_trip_plans
       (customer_auth_subject, order_id, departure_date, completed, client_updated_at)
     select $1, o.id, $3, $4::jsonb, $5
       from customer_orders o where o.id = $2 and o.customer_auth_subject = $1
     on conflict (customer_auth_subject, order_id) do update
       set departure_date = excluded.departure_date,
           completed = excluded.completed,
           client_updated_at = excluded.client_updated_at,
           updated_at = now()
       where customer_trip_plans.client_updated_at <= excluded.client_updated_at
     returning order_id`,
    [
      user.id,
      data.orderId,
      data.departureDate,
      JSON.stringify(sanitizeCompleted(data.completed)),
      Math.round(data.updatedAt),
    ],
  );
  return { saved: (result.rowCount ?? 0) > 0 };
}

export async function saveNotifyPreferenceHandler({
  data,
}: {
  data: ReturnType<typeof saveNotifyPreferenceInput>;
}): Promise<{ enabled: boolean }> {
  const user = await getAuthenticatedUser();
  await pool.query(
    `insert into customer_preferences (customer_auth_subject, esim_notify)
     values ($1, $2)
     on conflict (customer_auth_subject) do update
       set esim_notify = excluded.esim_notify, updated_at = now()`,
    [user.id, data.enabled],
  );
  return { enabled: data.enabled };
}
