/**
 * Flight tickets. Djiwa does not sell flights: the app searches cheap fares from the Travelpayouts
 * (Aviasales) data API and sends the traveler to Aviasales to book, carrying our partner marker
 * so the booking earns a commission. Pure rules shared by the server, the Admin panel, the
 * customer pages and the tests. The API token never lives here.
 */

export const FLIGHTS_SETTING_KEY = "flights";

export type FlightsConfig = {
  /** Kill switch: false hides every entry point and makes the search answer "unavailable". */
  enabled: boolean;
  /** "Tiket" tab next to eSIM in the Home hero. */
  heroTab: boolean;
  /** "Tiket" tile in Home's Kebutuhan perjalanan grid and the Explore services. */
  homeTile: boolean;
  /** Visitors without an account may search (rate limited by network address). */
  guestSearch: boolean;
  /** Searches one traveler (or one address) may run per hour. */
  searchesPerHour: number;
  /**
   * Id of the Travelpayouts White Label of type Widget (the number after `wl_id=` in the widget
   * code). When set, /tiket shows the White Label's real-time search and results inside the page;
   * empty keeps only the cached cheapest-per-day prices.
   */
  whiteLabelId: string;
  /** Load the Travelpayouts partner script on customer pages. */
  travelpayouts: boolean;
  /** Public script id from the Travelpayouts dashboard, the `<id>` in `emrldtp.cc/<id>.js`. */
  scriptId: string;
  /** Public Travelpayouts marker (partner id), the `t` in `?t=<marker>` and the booking marker. */
  partnerId: string;
  /** Load the partner script only after the visitor presses "Setuju" on the cookie notice. */
  waitForConsent: boolean;
};

/** Click targets the customer pages report (Admin counts them in the last 7 days). */
export const AVIASALES_CLICK_TARGET = "flights_aviasales";
export const EMBED_OPEN_TARGET = "flights_embed_open";

export const SEARCHES_PER_HOUR_MIN = 5;
export const SEARCHES_PER_HOUR_MAX = 200;

export const DEFAULT_FLIGHTS_CONFIG: FlightsConfig = {
  enabled: true,
  heroTab: true,
  homeTile: true,
  guestSearch: true,
  searchesPerHour: 20,
  whiteLabelId: "24328",
  travelpayouts: true,
  scriptId: "NTk3MDMw",
  partnerId: "597030",
  waitForConsent: true,
};

const SCRIPT_ID_PATTERN = /^[A-Za-z0-9]{4,40}$/;
const PARTNER_ID_PATTERN = /^[0-9]{3,12}$/;
const WHITE_LABEL_ID_PATTERN = /^[0-9]{1,9}$/;

const BOOLEAN_KEYS = [
  "enabled",
  "heroTab",
  "homeTile",
  "guestSearch",
  "travelpayouts",
  "waitForConsent",
] as const;

/**
 * Strict parse for Admin saves. A record saved before the search existed lacks the new keys, so a
 * missing key takes its default; a present key of the wrong type is an error.
 */
export function parseFlightsConfig(value: unknown): FlightsConfig {
  if (!value || typeof value !== "object") throw new Error("flights harus berupa objek");
  const record = value as Record<string, unknown>;
  const out: FlightsConfig = { ...DEFAULT_FLIGHTS_CONFIG };
  for (const key of BOOLEAN_KEYS) {
    const raw = record[key];
    if (raw === undefined) continue;
    if (typeof raw !== "boolean") throw new Error(`flights.${key} harus boolean`);
    out[key] = raw;
  }
  const perHour = record["searchesPerHour"];
  if (perHour !== undefined) {
    if (
      typeof perHour !== "number" ||
      !Number.isInteger(perHour) ||
      perHour < SEARCHES_PER_HOUR_MIN ||
      perHour > SEARCHES_PER_HOUR_MAX
    ) {
      throw new Error(
        `flights.searchesPerHour harus ${SEARCHES_PER_HOUR_MIN}-${SEARCHES_PER_HOUR_MAX}`,
      );
    }
    out.searchesPerHour = perHour;
  }
  const wl = record["whiteLabelId"];
  if (wl !== undefined && wl !== null) {
    const clean = typeof wl === "number" ? String(wl) : typeof wl === "string" ? wl.trim() : null;
    if (clean === null || (clean !== "" && !WHITE_LABEL_ID_PATTERN.test(clean))) {
      throw new Error("flights.whiteLabelId harus angka dari wl_id di kode widget (contoh: 12345)");
    }
    out.whiteLabelId = clean;
  }
  for (const key of ["scriptId", "partnerId"] as const) {
    const raw = record[key];
    if (raw === undefined) continue;
    if (typeof raw !== "string") throw new Error(`flights.${key} harus teks`);
    out[key] = raw.trim();
  }
  if (!SCRIPT_ID_PATTERN.test(out.scriptId)) {
    throw new Error("flights.scriptId harus 4-40 huruf atau angka (contoh: NTk3MDMw)");
  }
  if (!PARTNER_ID_PATTERN.test(out.partnerId)) {
    throw new Error("flights.partnerId harus 3-12 angka (contoh: 597030)");
  }
  return out;
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

/** The White Label widget (full real-time results) is on with the master switch and a wl_id. */
export const whiteLabelOn = (config: FlightsConfig) => config.enabled && config.whiteLabelId !== "";

export const showFlightsHeroTab = (config: FlightsConfig) => config.enabled && config.heroTab;
export const showFlightsTile = (config: FlightsConfig) => config.enabled && config.homeTile;

/* ------------------------------------------------------------------ search */

export type FlightPlace = {
  /** IATA city or airport code, always three capital letters. */
  code: string;
  name: string;
  countryName: string;
  type: "city" | "airport";
};

export type FlightSearchInput = {
  origin: string;
  destination: string;
  /** ISO date, or a year-month ("2026-12") to see the cheapest days of that month. */
  departureDate: string;
  returnDate?: string | undefined;
};

export type FlightOffer = {
  id: string;
  origin: string;
  destination: string;
  /** IATA airline code, e.g. "OD". */
  airline: string;
  /** Name shown to travelers, e.g. "Batik Air Malaysia"; the code when the name is unknown. */
  airlineName: string;
  flightNumber: string;
  departureAt: string;
  returnAt: string | null;
  transfers: number;
  durationMinutes: number | null;
  priceIdr: number;
  /** Absolute Aviasales URL carrying the partner marker, or null when the API gave no link. */
  bookingUrl: string | null;
};

export type FlightSearchStatus =
  "ok" | "empty" | "unavailable" | "login_required" | "rate_limited" | "invalid" | "failed";

export type FlightSearchResult = { status: FlightSearchStatus; offers: FlightOffer[] };

const IATA = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MONTH = /^\d{4}-\d{2}$/;

export const isIataCode = (value: unknown): value is string =>
  typeof value === "string" && IATA.test(value);

const validDate = (value: string) => {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/** Normalizes and validates a search; returns null for anything the API must not receive. */
export function parseFlightSearch(
  input: unknown,
  today: string = new Date().toISOString().slice(0, 10),
): FlightSearchInput | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const origin = typeof record["origin"] === "string" ? record["origin"].trim().toUpperCase() : "";
  const destination =
    typeof record["destination"] === "string" ? record["destination"].trim().toUpperCase() : "";
  if (!isIataCode(origin) || !isIataCode(destination) || origin === destination) return null;
  const departure =
    typeof record["departureDate"] === "string" ? record["departureDate"].trim() : "";
  const back = typeof record["returnDate"] === "string" ? record["returnDate"].trim() : "";
  const departureOk = validDate(departure) ? departure >= today : YEAR_MONTH.test(departure);
  if (!departureOk) return null;
  if (YEAR_MONTH.test(departure) && departure < today.slice(0, 7)) return null;
  if (back) {
    if (!validDate(back) || !validDate(departure) || back < departure) return null;
    return { origin, destination, departureDate: departure, returnDate: back };
  }
  return { origin, destination, departureDate: departure };
}

/** Cache key for a search; equal searches share one provider call. */
export const flightSearchKey = (search: FlightSearchInput) =>
  [search.origin, search.destination, search.departureDate, search.returnDate ?? ""].join("|");

const AVIASALES_ORIGIN = "https://www.aviasales.com";

/**
 * Turns the API's relative `link` (`/search/CGK0112DPS1?...`) into an Aviasales URL with our
 * marker. Anything that is not a plain `/search/` path is dropped, so a changed or hostile
 * response can never send a traveler elsewhere.
 */
export function aviasalesBookingUrl(link: unknown, marker: string): string | null {
  if (typeof link !== "string" || !link.startsWith("/search/") || link.length > 2000) return null;
  if (!PARTNER_ID_PATTERN.test(marker)) return null;
  try {
    const url = new URL(link, AVIASALES_ORIGIN);
    if (url.origin !== AVIASALES_ORIGIN) return null;
    url.searchParams.set("marker", marker);
    return url.toString();
  } catch {
    return null;
  }
}

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/** Airlines seen most on Indonesian routes; used when the provider's airline list is unreachable. */
export const KNOWN_AIRLINES: Readonly<Record<string, string>> = {
  GA: "Garuda Indonesia",
  JT: "Lion Air",
  ID: "Batik Air",
  OD: "Batik Air Malaysia",
  QZ: "Indonesia AirAsia",
  QG: "Citilink",
  IU: "Super Air Jet",
  IW: "Wings Air",
  SJ: "Sriwijaya Air",
  IN: "NAM Air",
  AK: "AirAsia",
  FD: "Thai AirAsia",
  D7: "AirAsia X",
  SQ: "Singapore Airlines",
  TR: "Scoot",
  MH: "Malaysia Airlines",
  TG: "Thai Airways",
  VN: "Vietnam Airlines",
  VJ: "VietJet Air",
  PR: "Philippine Airlines",
  CX: "Cathay Pacific",
  JL: "Japan Airlines",
  NH: "All Nippon Airways",
  KE: "Korean Air",
  OZ: "Asiana Airlines",
  EK: "Emirates",
  QR: "Qatar Airways",
  EY: "Etihad Airways",
  TK: "Turkish Airlines",
  QF: "Qantas",
  CZ: "China Southern",
  MU: "China Eastern",
  CA: "Air China",
  SV: "Saudia",
};

/** The provider's airline list (`[{ code, name }]`) as a code to name map. */
export function normalizeAirlineNames(rows: unknown): Record<string, string> {
  const names: Record<string, string> = {};
  if (!Array.isArray(rows)) return names;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const code = text(r["code"], 4).toUpperCase();
    const translations = r["name_translations"];
    const english =
      translations && typeof translations === "object"
        ? text((translations as Record<string, unknown>)["en"], 60)
        : "";
    const name = text(r["name"], 60) || english;
    if (/^[A-Z0-9]{2,3}$/.test(code) && name) names[code] = name;
  }
  return names;
}

export const airlineNameFor = (code: string, names?: Record<string, string>) =>
  names?.[code] ?? KNOWN_AIRLINES[code] ?? code;

/** One API row to an offer; rows without a usable price, route or time are skipped. */
export function normalizeFlightOffer(
  row: unknown,
  marker: string,
  names?: Record<string, string>,
): FlightOffer | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const origin = text(r["origin_airport"] ?? r["origin"], 12).toUpperCase();
  const destination = text(r["destination_airport"] ?? r["destination"], 12).toUpperCase();
  const price = Number(r["price"]);
  const departureAt = text(r["departure_at"], 40);
  if (!isIataCode(origin) || !isIataCode(destination)) return null;
  if (!Number.isFinite(price) || price <= 0 || price > 1e9) return null;
  if (Number.isNaN(Date.parse(departureAt))) return null;
  const returnAt = text(r["return_at"], 40);
  const duration = Number(r["duration_to"] ?? r["duration"]);
  const airline = text(r["airline"], 3).toUpperCase();
  const flightNumber = text(r["flight_number"], 8);
  return {
    id: [airline, flightNumber, departureAt, Math.round(price)].join("-"),
    origin,
    destination,
    airline,
    airlineName: airlineNameFor(airline, names),
    flightNumber,
    departureAt,
    returnAt: Number.isNaN(Date.parse(returnAt)) ? null : returnAt,
    transfers: Number.isInteger(Number(r["transfers"])) ? Math.max(0, Number(r["transfers"])) : 0,
    durationMinutes: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
    priceIdr: Math.round(price),
    bookingUrl: aviasalesBookingUrl(r["link"], marker),
  };
}

/** Cheapest first, one row per flight, at most `limit`. */
export function normalizeFlightOffers(
  rows: unknown,
  marker: string,
  limit = 12,
  names?: Record<string, string>,
): FlightOffer[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const offers: FlightOffer[] = [];
  for (const row of rows) {
    const offer = normalizeFlightOffer(row, marker, names);
    if (!offer || seen.has(offer.id)) continue;
    seen.add(offer.id);
    offers.push(offer);
  }
  return offers.sort((a, b) => a.priceIdr - b.priceIdr).slice(0, limit);
}

/** Autocomplete rows to places; only three-letter city and airport codes are kept. */
export function normalizeFlightPlaces(rows: unknown, limit = 6): FlightPlace[] {
  if (!Array.isArray(rows)) return [];
  const places: FlightPlace[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const code = text(r["code"], 12).toUpperCase();
    const type = r["type"];
    if (!isIataCode(code) || (type !== "city" && type !== "airport") || seen.has(code)) continue;
    const name = text(r["name"], 80);
    if (!name) continue;
    seen.add(code);
    places.push({ code, name, countryName: text(r["country_name"], 60), type });
    if (places.length >= limit) break;
  }
  return places;
}

export const placeLabel = (place: FlightPlace) => `${place.name} (${place.code})`;

const rupiah = new Intl.NumberFormat("id-ID");
export const formatFlightPrice = (idr: number) => `Rp ${rupiah.format(Math.round(idr))}`;

/** Short price for tight rows: Rp 3,4jt, Rp 850rb. */
export function compactFlightPrice(idr: number): string {
  if (idr >= 1_000_000) return `Rp ${(idr / 1_000_000).toFixed(1).replace(".", ",")}jt`;
  return `Rp ${Math.round(idr / 1000)}rb`;
}

export const transfersLabel = (transfers: number) =>
  transfers === 0 ? "Langsung" : `${transfers} transit`;

export function durationLabel(minutes: number | null): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}j${m ? ` ${m}m` : ""}` : `${m}m`;
}

/** Time of day as written in the API string (already in the departure airport's offset). */
export const flightClock = (iso: string) => iso.slice(11, 16).replace(":", ".");
export const flightDay = (iso: string) => iso.slice(0, 10);

/** Rate limit window helper: true while `count` is within the hourly allowance. */
export const withinSearchAllowance = (count: number, config: FlightsConfig) =>
  count < config.searchesPerHour;

export const FLIGHT_STATUS_MESSAGE: Record<Exclude<FlightSearchStatus, "ok">, string> = {
  empty: "Belum ada harga untuk tanggal ini. Coba tanggal lain atau bulan sekitarnya.",
  unavailable: "Pencarian tiket sedang tidak tersedia. Coba lagi nanti.",
  login_required: "Masuk atau daftar untuk mencari tiket pesawat.",
  rate_limited: "Terlalu banyak pencarian. Coba lagi sebentar lagi.",
  invalid: "Periksa kota dan tanggal, lalu coba lagi.",
  failed: "Harga tiket belum dapat dimuat. Coba lagi.",
};

/**
 * Search link for a trip: `/tiket` with the trip's destination name and dates. The page resolves
 * the name to a city code and runs the search; the traveler only has to confirm the origin.
 */
export function flightsPathFor(trip: {
  destination: string;
  departureDate?: string | null | undefined;
  returnDate?: string | null | undefined;
}): { to: "/tiket"; search: { tujuan?: string; berangkat?: string; pulang?: string } } | null {
  const destination = trip.destination.trim().slice(0, 60);
  if (!destination) return null;
  const search: { tujuan?: string; berangkat?: string; pulang?: string } = { tujuan: destination };
  if (trip.departureDate && ISO_DATE.test(trip.departureDate)) {
    search.berangkat = trip.departureDate;
    if (
      trip.returnDate &&
      ISO_DATE.test(trip.returnDate) &&
      trip.returnDate >= trip.departureDate
    ) {
      search.pulang = trip.returnDate;
    }
  }
  return { to: "/tiket", search };
}

/* ------------------------------------------------------------ White Label */

const ddmm = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}`;

/**
 * The White Label's own search code, which the widget reads from the page address as
 * `?flightSearch=`: origin, departure DDMM, destination, optional return DDMM, then the number of
 * adults (required). Verified against the live widget: `CGK0812TYO1` fills Jakarta to Tokyo on
 * 8 December for one adult. Needs an exact departure day, not a month.
 */
export function whiteLabelSearchCode(search: FlightSearchInput, adults = 1): string | null {
  if (!ISO_DATE.test(search.departureDate)) return null;
  if (!Number.isInteger(adults) || adults < 1 || adults > 9) return null;
  const back = search.returnDate && ISO_DATE.test(search.returnDate) ? ddmm(search.returnDate) : "";
  return `${search.origin}${ddmm(search.departureDate)}${search.destination}${back}${adults}`;
}

/**
 * Address of the frame page that runs the White Label widget (`public/tiket-widget.html`): the
 * search goes in `?flightSearch=`, the White Label id in the hash. Only the validated numeric id and
 * the code `whiteLabelSearchCode` builds reach the URL.
 */
export function whiteLabelFrameSrc(config: FlightsConfig, code: string | null): string | null {
  if (!whiteLabelOn(config) || !WHITE_LABEL_ID_PATTERN.test(config.whiteLabelId)) return null;
  if (code !== null && !/^[A-Z]{3}\d{4}[A-Z]{3}(\d{4})?\d$/.test(code)) return null;
  const query = code ? `?flightSearch=${code}` : "";
  return `/tiket-widget.html${query}#${config.whiteLabelId}`;
}

/* ----------------------------------------------------------- price calendar */

export type FlightDayPrice = { date: string; offer: FlightOffer | null };

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
export const shiftFlightDay = addDays;

/**
 * The days around the chosen day with the cheapest recorded fare of each (or none). The provider
 * keeps one cheapest fare per departure day, so offers from a month map onto its days.
 */
export function flightPriceStrip(
  offers: FlightOffer[],
  center: string,
  today: string,
  radius = 3,
): FlightDayPrice[] {
  if (!ISO_DATE.test(center)) return [];
  const cheapest = new Map<string, FlightOffer>();
  for (const offer of offers) {
    const day = offer.departureAt.slice(0, 10);
    const best = cheapest.get(day);
    if (!best || offer.priceIdr < best.priceIdr) cheapest.set(day, offer);
  }
  const days: FlightDayPrice[] = [];
  for (let n = -radius; n <= radius; n += 1) {
    const date = addDays(center, n);
    if (date < today) continue;
    days.push({ date, offer: cheapest.get(date) ?? null });
  }
  return days;
}
