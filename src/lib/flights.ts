/**
 * Flight tickets for a trip. Djiwa does not sell or price flights: it opens Google Flights for the
 * trip's destination and dates (free, no API key) and loads the Travelpayouts partner script so
 * outbound flight links to supported partners can earn a commission. Pure rules shared by the
 * server, the Admin panel, the customer card and the tests.
 */

export const FLIGHTS_SETTING_KEY = "flights";

export type FlightsConfig = {
  /** Kill switch: false hides the ticket card and the partner script. */
  enabled: boolean;
  /** Show the "Cari di Google Flights" link on the trip. */
  googleFlights: boolean;
  /** Load the Travelpayouts partner script on customer pages. */
  travelpayouts: boolean;
  /** Public script id from the Travelpayouts dashboard, the `<id>` in `emrldtp.cc/<id>.js`. */
  scriptId: string;
  /** Public Travelpayouts marker (partner id), the `t` in `?t=<marker>`. */
  partnerId: string;
  /** Load the partner script only after the visitor presses "Setuju" on the cookie notice. */
  waitForConsent: boolean;
};

export const DEFAULT_FLIGHTS_CONFIG: FlightsConfig = {
  enabled: true,
  googleFlights: true,
  travelpayouts: true,
  scriptId: "NTk3MDMw",
  partnerId: "597030",
  waitForConsent: true,
};

const SCRIPT_ID_PATTERN = /^[A-Za-z0-9]{4,40}$/;
const PARTNER_ID_PATTERN = /^[0-9]{3,12}$/;

export function parseFlightsConfig(value: unknown): FlightsConfig {
  if (!value || typeof value !== "object") throw new Error("flights harus berupa objek");
  const record = value as Record<string, unknown>;
  for (const key of ["enabled", "googleFlights", "travelpayouts", "waitForConsent"] as const) {
    if (typeof record[key] !== "boolean") throw new Error(`flights.${key} harus boolean`);
  }
  const scriptId = typeof record["scriptId"] === "string" ? record["scriptId"].trim() : "";
  const partnerId = typeof record["partnerId"] === "string" ? record["partnerId"].trim() : "";
  if (!SCRIPT_ID_PATTERN.test(scriptId)) {
    throw new Error("flights.scriptId harus 4-40 huruf atau angka (contoh: NTk3MDMw)");
  }
  if (!PARTNER_ID_PATTERN.test(partnerId)) {
    throw new Error("flights.partnerId harus 3-12 angka (contoh: 597030)");
  }
  return {
    enabled: record["enabled"] as boolean,
    googleFlights: record["googleFlights"] as boolean,
    travelpayouts: record["travelpayouts"] as boolean,
    scriptId,
    partnerId,
    waitForConsent: record["waitForConsent"] as boolean,
  };
}

/** Customer-safe read: a missing or malformed setting falls back to the default. */
export function normalizeFlightsConfig(value: unknown): FlightsConfig {
  try {
    return parseFlightsConfig(value);
  } catch {
    return DEFAULT_FLIGHTS_CONFIG;
  }
}

/** The partner script URL, or null when the script is off. Only the two validated ids reach it. */
export function travelpayoutsScriptSrc(config: FlightsConfig): string | null {
  if (!config.enabled || !config.travelpayouts) return null;
  return `https://emrldtp.cc/${config.scriptId}.js?t=${config.partnerId}`;
}

export const showGoogleFlights = (config: FlightsConfig) => config.enabled && config.googleFlights;

/**
 * Google Flights search for the trip. It uses the natural-language `q` form, so no airport code is
 * needed, and no departure city: Google fills that from the visitor's own location.
 */
export function googleFlightsUrl(trip: {
  destination: string;
  departureDate?: string | null | undefined;
  returnDate?: string | null | undefined;
}): string | null {
  const destination = trip.destination.trim().slice(0, 80);
  if (!destination) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/;
  const departure = trip.departureDate && date.test(trip.departureDate) ? trip.departureDate : null;
  const back = trip.returnDate && date.test(trip.returnDate) ? trip.returnDate : null;
  let query = `Flights to ${destination}`;
  if (departure) query += ` on ${departure}`;
  if (departure && back && back >= departure) query += ` through ${back}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}&hl=id&curr=IDR`;
}
