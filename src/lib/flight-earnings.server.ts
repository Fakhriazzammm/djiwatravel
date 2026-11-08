import { requireAdmin } from "./admin-guard";

/**
 * Travelpayouts "Affiliate Performance" figures for Admin: balance, next payout and the last 30
 * days of booking actions (finance/v2). Read-only, server-side, token in a header only. The
 * provider rate-limits these methods, so the result is held for ten minutes and one request at a
 * time reads it. The figures cover every program on the partner account, not only flights.
 */

const BASE = "https://api.travelpayouts.com/finance/v2";
const CACHE_MS = 10 * 60_000;
const TIMEOUT_MS = 8_000;
const WINDOW_DAYS = 30;
const ACTION_LIMIT = 300;

export type EarningState = "paid" | "processing" | "cancelled";

export type FlightEarnings = {
  status: "ok" | "unconfigured" | "failed";
  currency: "usd";
  balance: number | null;
  nextPayout: number | null;
  windowDays: number;
  bookings: number;
  /** True when the provider holds more actions than the 300 that were read. */
  truncated: boolean;
  profit: Record<EarningState, number>;
  count: Record<EarningState, number>;
  recent: { state: EarningState | "other"; profit: number; description: string; bookedAt: string }[];
  fetchedAt: string | null;
};

const empty = (status: FlightEarnings["status"]): FlightEarnings => ({
  status,
  currency: "usd",
  balance: null,
  nextPayout: null,
  windowDays: WINDOW_DAYS,
  bookings: 0,
  truncated: false,
  profit: { paid: 0, processing: 0, cancelled: 0 },
  count: { paid: 0, processing: 0, cancelled: 0 },
  recent: [],
  fetchedAt: null,
});

const money = (value: unknown): number | null => {
  const n = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

const isState = (value: unknown): value is EarningState =>
  value === "paid" || value === "processing" || value === "cancelled";

/** Pure: provider answers to the Admin summary. Unknown shapes become zeros, never throw. */
export function summarizeEarnings(
  balanceBody: unknown,
  payoutBody: unknown,
  actionsBody: unknown,
  now = new Date(),
): FlightEarnings {
  const out = empty("ok");
  const balance = (balanceBody as { balance?: { usd?: unknown } } | null)?.balance;
  const payout = (payoutBody as { next_payout?: { usd?: unknown } } | null)?.next_payout;
  out.balance = money(balance?.usd);
  out.nextPayout = money(payout?.usd);
  const body = (actionsBody ?? {}) as { actions?: unknown; count?: unknown };
  const actions = Array.isArray(body.actions) ? body.actions : [];
  out.bookings = actions.length;
  out.truncated = Number(body.count) > actions.length;
  for (const raw of actions) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const profit = money(row["profit"]) ?? 0;
    if (isState(row["action_state"])) {
      out.profit[row["action_state"]] = Math.round((out.profit[row["action_state"]] + profit) * 100) / 100;
      out.count[row["action_state"]] += 1;
    }
  }
  out.recent = actions.slice(0, 5).map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return {
      state: isState(row["action_state"]) ? row["action_state"] : "other",
      profit: money(row["profit"]) ?? 0,
      description: String(row["description"] ?? "").slice(0, 120),
      bookedAt: String(row["booked_at"] ?? "").slice(0, 19),
    };
  });
  out.fetchedAt = now.toISOString();
  return out;
}

let cached: { at: number; value: FlightEarnings } | null = null;
let inflight: Promise<FlightEarnings> | null = null;

async function get(path: string, token: string): Promise<unknown> {
  const response = await fetch(`${BASE}/${path}`, {
    headers: { Accept: "application/json", "X-Access-Token": token },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`provider ${response.status}`);
  return response.json();
}

async function load(token: string): Promise<FlightEarnings> {
  const from = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const actionsPath = `get_user_actions_affecting_balance?currency=usd&limit=${ACTION_LIMIT}&from=${from}`;
  const [balance, payout, actions] = await Promise.all([
    get("get_user_balance", token),
    get("get_user_next_payout", token),
    get(actionsPath, token),
  ]);
  return summarizeEarnings(balance, payout, actions);
}

export async function getFlightEarningsHandler(
  options: { refresh?: boolean } = {},
): Promise<FlightEarnings> {
  await requireAdmin();
  const token = process.env["TRAVELPAYOUTS_TOKEN"]?.trim();
  if (!token) return empty("unconfigured");
  if (!options.refresh && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  // A manual refresh is still limited to one read a minute so the button cannot burn the quota.
  if (options.refresh && cached && Date.now() - cached.at < 60_000) return cached.value;
  inflight ??= load(token)
    .then((value) => {
      cached = { at: Date.now(), value };
      return value;
    })
    .catch((error) => {
      console.error("[flight-earnings] read failed", error instanceof Error ? error.message : error);
      return cached?.value ?? empty("failed");
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export const flightEarningsInput = (data: unknown) => ({
  refresh: Boolean((data as { refresh?: unknown } | null)?.refresh),
});
