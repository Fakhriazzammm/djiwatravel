/**
 * Freemium My Trips for guests (no login). A guest may create a small number of trips, held in
 * the browser by an HttpOnly guest cookie. Pure rules shared by the server, the Admin settings and
 * the tests. Ownership itself stays server-side: a guest trip is owned by `guestSubjectFor(token)`
 * in the same `customer_auth_subject` column, and it moves to the member account on login.
 */

export const GUEST_TRIPS_SETTING_KEY = "guestTrips";
export const GUEST_TRIP_COOKIE = "djiwa_guest_trips";
export const GUEST_SUBJECT_PREFIX = "guest:";
/** Guest cookie lifetime. Long enough to keep a sample trip, short enough to expire on shared devices. */
export const GUEST_TRIP_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export const GUEST_TRIP_LIMIT_MIN = 1;
export const GUEST_TRIP_LIMIT_MAX = 5;

export type GuestTripsConfig = {
  /** Kill switch: false turns guest access off; guests then see the login gate again. */
  enabled: boolean;
  /** Trips a single guest browser may create before it must log in. */
  limit: number;
};

export const DEFAULT_GUEST_TRIPS_CONFIG: GuestTripsConfig = { enabled: true, limit: 1 };

export function parseGuestTripsConfig(value: unknown): GuestTripsConfig {
  if (!value || typeof value !== "object") throw new Error("guestTrips harus berupa objek");
  const record = value as Record<string, unknown>;
  if (typeof record["enabled"] !== "boolean") throw new Error("guestTrips.enabled harus boolean");
  const limit = record["limit"];
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < GUEST_TRIP_LIMIT_MIN ||
    limit > GUEST_TRIP_LIMIT_MAX
  ) {
    throw new Error(
      `guestTrips.limit harus ${GUEST_TRIP_LIMIT_MIN}-${GUEST_TRIP_LIMIT_MAX} perjalanan`,
    );
  }
  return { enabled: record["enabled"], limit };
}

/** Customer-safe read: a missing or malformed setting falls back to the default. */
export function normalizeGuestTripsConfig(value: unknown): GuestTripsConfig {
  try {
    return parseGuestTripsConfig(value);
  } catch {
    return DEFAULT_GUEST_TRIPS_CONFIG;
  }
}

export const isGuestSubject = (subject: string) => subject.startsWith(GUEST_SUBJECT_PREFIX);

export const canCreateGuestTrip = (used: number, limit: number) => used < limit;

export const remainingGuestTrips = (used: number, limit: number) => Math.max(0, limit - used);

export const guestLimitMessage = (limit: number) =>
  limit === 1
    ? "Perjalanan gratis tanpa login sudah terpakai. Masuk atau daftar untuk membuat perjalanan lagi."
    : `Perjalanan gratis tanpa login (${limit}) sudah terpakai. Masuk atau daftar untuk membuat perjalanan lagi.`;

export const GUEST_DISABLED_MESSAGE = "Masuk atau daftar untuk membuat perjalanan.";
