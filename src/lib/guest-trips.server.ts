import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { buildSettingAudit } from "./admin-settings";
import { getAuthenticatedUser } from "./customer-session.fn";
import {
  DEFAULT_GUEST_TRIPS_CONFIG,
  GUEST_DISABLED_MESSAGE,
  GUEST_SUBJECT_PREFIX,
  GUEST_TRIP_COOKIE,
  GUEST_TRIP_COOKIE_MAX_AGE_SECONDS,
  GUEST_TRIPS_SETTING_KEY,
  normalizeGuestTripsConfig,
  parseGuestTripsConfig,
  remainingGuestTrips,
  type GuestTripsConfig,
} from "./guest-trips";

/**
 * Who owns the trips a request may touch. A signed-in member is the Better Auth user. Without a
 * session, a guest is the subject derived from the HttpOnly guest cookie, so the browser never
 * supplies an owner id. `limit` is only set when the caller may create a guest trip.
 */
export type TripOwner = { id: string; email: string | null; guest: boolean; limit?: number };

const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,96}$/;

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env["NODE_ENV"] === "production",
  path: "/",
  maxAge: GUEST_TRIP_COOKIE_MAX_AGE_SECONDS,
});

export function guestSubjectFor(token: string) {
  return `${GUEST_SUBJECT_PREFIX}${createHash("sha256").update(token).digest("hex")}`;
}

function readGuestToken(): string | null {
  try {
    const value = getCookie(GUEST_TRIP_COOKIE);
    return value && GUEST_TOKEN_PATTERN.test(value) ? value : null;
  } catch {
    // Outside a request (tests, scripts) there is no cookie to read.
    return null;
  }
}

/** Customer-safe read: an unreadable setting keeps the default (guest trips on, one trip). */
export async function readGuestTripsConfig(): Promise<GuestTripsConfig> {
  return (await readGuestTripsRecord()).config;
}

async function readGuestTripsRecord() {
  try {
    const result = await pool.query(
      "select value_json, version from public.admin_settings where setting_key = $1",
      [GUEST_TRIPS_SETTING_KEY],
    );
    const row = result.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    if (!row) return { config: DEFAULT_GUEST_TRIPS_CONFIG, version: 0 };
    return { config: normalizeGuestTripsConfig(row.value_json), version: Number(row.version) || 0 };
  } catch {
    return { config: DEFAULT_GUEST_TRIPS_CONFIG, version: 0 };
  }
}

async function memberOwner(): Promise<TripOwner | null> {
  try {
    const user = await getAuthenticatedUser();
    return { id: user.id, email: user.email, guest: false };
  } catch {
    return null;
  }
}

/** Owner for reading or changing an existing trip. Null means the caller must log in. */
export async function resolveTripOwner(): Promise<TripOwner | null> {
  const member = await memberOwner();
  if (member) return member;
  const token = readGuestToken();
  if (!token) return null;
  const config = await readGuestTripsConfig();
  if (!config.enabled) return null;
  return { id: guestSubjectFor(token), email: null, guest: true, limit: config.limit };
}

/** Same as `resolveTripOwner`, but throws the session error the customer UI already understands. */
export async function requireTripOwner(): Promise<TripOwner> {
  const owner = await resolveTripOwner();
  if (!owner) throw new Error("Autentikasi diperlukan");
  return owner;
}

/**
 * Owner for creating a trip. A guest without a cookie gets a new one here. The limit itself is
 * checked inside the create transaction (see `createTrip`), where it can be serialized.
 */
export async function resolveTripOwnerForCreate(): Promise<TripOwner> {
  const member = await memberOwner();
  if (member) return member;
  const config = await readGuestTripsConfig();
  if (!config.enabled) throw new Error(GUEST_DISABLED_MESSAGE);
  let token = readGuestToken();
  if (!token) {
    token = randomBytes(32).toString("base64url");
    setCookie(GUEST_TRIP_COOKIE, token, cookieOptions());
  }
  return { id: guestSubjectFor(token), email: null, guest: true, limit: config.limit };
}

export async function getGuestTripStatusHandler() {
  const config = await readGuestTripsConfig();
  const token = readGuestToken();
  let used = 0;
  if (token && config.enabled) {
    try {
      const result = await pool.query(
        "select count(*)::int as n from public.travel_trips where customer_auth_subject = $1",
        [guestSubjectFor(token)],
      );
      used = Number((result.rows[0] as { n?: unknown } | undefined)?.n) || 0;
    } catch {
      used = 0;
    }
  }
  return {
    enabled: config.enabled,
    limit: config.limit,
    used,
    remaining: config.enabled ? remainingGuestTrips(used, config.limit) : 0,
  };
}

/** After login, the trips made in this browser move to the member account. Only the cookie holder can claim them. */
export async function claimGuestTripsHandler() {
  const user = await getAuthenticatedUser();
  const token = readGuestToken();
  if (!token) return { claimed: 0 };
  const result = await pool.query(
    `update public.travel_trips set customer_auth_subject = $1, updated_at = now()
     where customer_auth_subject = $2`,
    [user.id, guestSubjectFor(token)],
  );
  setCookie(GUEST_TRIP_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  return { claimed: result.rowCount ?? 0 };
}

/* ------------------------------------------------------------------ admin */

const saveSchema = z.object({
  config: z.unknown(),
  reason: z.string().trim().min(4).max(300),
  expectedVersion: z.number().int().min(0),
});

export const saveGuestTripsConfigInput = (data: unknown) => saveSchema.parse(data);

export const getAdminGuestTripsHandler = async () => {
  await requireAdmin();
  const [record, guestTrips] = await Promise.all([readGuestTripsRecord(), countGuestTrips()]);
  return { ...record, stats: { guestTrips } };
};

async function countGuestTrips() {
  try {
    const result = await pool.query(
      "select count(*)::int as n from public.travel_trips where customer_auth_subject like $1",
      [`${GUEST_SUBJECT_PREFIX}%`],
    );
    return Number((result.rows[0] as { n?: unknown } | undefined)?.n) || 0;
  } catch {
    return 0;
  }
}

export async function saveGuestTripsConfigHandler({
  data,
}: {
  data: ReturnType<typeof saveGuestTripsConfigInput>;
}) {
  await requireAdmin();
  const config = parseGuestTripsConfig(data.config);
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      "select value_json, version from public.admin_settings where setting_key = $1 for update",
      [GUEST_TRIPS_SETTING_KEY],
    );
    const row = current.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    const version = row ? Number(row.version) : 0;
    if (version !== data.expectedVersion) {
      await client.query("rollback");
      return { ok: false as const, conflict: true as const, version };
    }
    const audit = buildSettingAudit(
      GUEST_TRIPS_SETTING_KEY,
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
      [GUEST_TRIPS_SETTING_KEY, JSON.stringify(config)],
    );
    await client.query(
      `insert into public.admin_audit_logs
         (id, action, entity_type, entity_id, reason, before_json, after_json)
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
    return { ok: true as const, conflict: false as const, version: version + 1, config };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
