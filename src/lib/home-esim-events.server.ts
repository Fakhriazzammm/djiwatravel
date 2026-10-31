import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import {
  homeEsimEventInput,
  type HomeEsimEventInput,
  type HomeEsimFunnel,
} from "./home-esim-events";

/** Records one anonymous event. Invalid input is rejected; storage failures never surface to users. */
export async function recordHomeEsimEvent(raw: unknown): Promise<{ ok: true }> {
  const input: HomeEsimEventInput = homeEsimEventInput.parse(raw);
  try {
    await pool.query(
      "insert into home_esim_events (event_name, destination_code, source) values ($1, $2, $3)",
      [input.name, input.destination ?? null, input.source ?? null],
    );
  } catch (error) {
    console.warn(
      "[travel] home eSIM event not stored",
      error instanceof Error ? error.message : "",
    );
  }
  return { ok: true };
}

export async function getHomeEsimFunnelHandler(): Promise<HomeEsimFunnel | null> {
  await requireAdmin();
  const days = 7;
  try {
    const totals = await pool.query(
      `select event_name, count(*)::int as n from home_esim_events
       where created_at >= now() - ($1::int * interval '1 day') group by event_name`,
      [days],
    );
    const count = (name: string) =>
      Number(totals.rows.find((row) => row.event_name === name)?.n ?? 0);
    const top = await pool.query(
      `select destination_code, count(*)::int as n from home_esim_events
       where event_name = 'home_esim_sheet_open' and destination_code is not null
         and created_at >= now() - ($1::int * interval '1 day')
       group by destination_code order by n desc, destination_code limit 5`,
      [days],
    );
    const orders = await pool
      .query(
        "select count(*)::int as n from customer_orders where created_at >= now() - ($1::int * interval '1 day')",
        [days],
      )
      .then((result) => Number(result.rows[0]?.n ?? 0))
      .catch(() => null);
    return {
      days,
      chipTaps: count("home_esim_chip_tap"),
      sheetOpens: count("home_esim_sheet_open"),
      promoTaps: count("home_esim_promo_tap"),
      topDestinations: top.rows.map((row) => ({
        code: String(row.destination_code),
        sheetOpens: Number(row.n),
      })),
      ordersInWindow: orders,
    };
  } catch {
    // The table may not be migrated yet: say "unavailable", never an invented zero.
    return null;
  }
}
