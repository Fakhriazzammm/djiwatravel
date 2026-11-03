import { analyticsConsentGranted } from "./cookie-consent";
import { deviceFromWidth, sanitizeClickTarget, type SiteEventName } from "./site-events";

export type AnalyticsEventName =
  | "page_view"
  | "destination_view"
  | "finder_submit"
  | "checkout_start"
  | "home_esim_chip_tap"
  | "home_esim_sheet_open"
  | "home_esim_promo_tap";

export type AnalyticsEvent = {
  name: AnalyticsEventName;
  path: string;
  sessionId: string;
  attribution: {
    source?: string;
    medium?: string;
    campaign?: string;
    referrer?: string;
  };
  properties?: Record<string, string | number | boolean>;
};

const SESSION_KEY = "djiwa.analytics.session";
const ATTRIBUTION_KEY = "djiwa.analytics.attribution";
const PUBLIC_PATHS = [
  /^\/$/,
  /^\/explore\/?$/,
  /^\/(?:esim\/finder|finder)\/?$/,
  /^\/destination\/[a-z0-9-]+\/?$/,
  /^\/plan\/[a-z0-9-]+\/?$/i,
  /^\/panduan(?:\/.*)?$/,
];

function isBrowser() {
  return typeof window !== "undefined";
}

function isPublicPath(path: string) {
  return PUBLIC_PATHS.some((pattern) => pattern.test(path));
}

function configuredEndpoint() {
  const endpoint = import.meta.env["VITE_ANALYTICS_ENDPOINT"]?.trim();
  if (!endpoint) return null;
  if (endpoint.startsWith("/")) return endpoint;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function randomSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function readSessionId() {
  if (!isBrowser()) return "server";
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = randomSessionId();
  window.sessionStorage.setItem(SESSION_KEY, created);
  return created;
}

function readAttribution() {
  if (!isBrowser()) return {};
  const saved = window.sessionStorage.getItem(ATTRIBUTION_KEY);
  if (saved) {
    try {
      return JSON.parse(saved) as AnalyticsEvent["attribution"];
    } catch {
      window.sessionStorage.removeItem(ATTRIBUTION_KEY);
    }
  }
  const url = new URL(window.location.href);
  const attribution: AnalyticsEvent["attribution"] = {};
  for (const key of ["source", "medium", "campaign"] as const) {
    const value = url.searchParams.get(`utm_${key}`)?.trim().slice(0, 100);
    if (value) attribution[key] = value;
  }
  if (document.referrer) {
    try {
      attribution.referrer = new URL(document.referrer).origin.slice(0, 200);
    } catch {
      // Ignore malformed referrers rather than forwarding arbitrary browser text.
    }
  }
  window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
  return attribution;
}

export function analyticsEnabled() {
  return Boolean(configuredEndpoint());
}

export function buildAnalyticsEvent(
  name: AnalyticsEventName,
  path: string,
  properties?: AnalyticsEvent["properties"],
): AnalyticsEvent | null {
  if (!isPublicPath(path)) return null;
  return {
    name,
    path: (path.split("?")[0] ?? "").slice(0, 200),
    sessionId: readSessionId(),
    attribution: readAttribution(),
    ...(properties ? { properties } : {}),
  };
}

const HOME_EVENT_ENDPOINT = "/api/home-esim-events";

/**
 * Home eSIM funnel events go to the first-party, anonymous sink that Admin reads
 * (`home_esim_events`), not to the optional external analytics endpoint.
 */
function trackHomeEsimEvent(name: AnalyticsEventName, properties?: AnalyticsEvent["properties"]) {
  if (!isBrowser()) return;
  const destination = properties?.["destination"];
  const source = properties?.["source"];
  void fetch(HOME_EVENT_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      ...(typeof destination === "string" && /^[A-Za-z0-9]{2,8}$/.test(destination)
        ? { destination }
        : {}),
      ...(typeof source === "string" ? { source } : {}),
    }),
    keepalive: true,
    credentials: "omit",
  }).catch(() => {
    // Measurement must never affect storefront behavior.
  });
}

const SITE_EVENT_ENDPOINT = "/api/site-events";
const SITE_EVENT_NAMES_SENT: readonly string[] = [
  "page_view",
  "destination_view",
  "finder_submit",
  "checkout_start",
];

/**
 * First-party, anonymous traffic sink that Admin Analytics reads (`site_events`). It stores a
 * random session id, the public path, the referrer host and a viewport device class only.
 */
function sendSiteEvent(name: SiteEventName, path: string, target?: string) {
  if (!isBrowser() || !isPublicPath(path)) return;
  try {
    const attribution = readAttribution();
    const referrerHost = attribution.referrer ? new URL(attribution.referrer).hostname : undefined;
    void fetch(SITE_EVENT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        path: (path.split("?")[0] ?? "").slice(0, 120),
        ...(target ? { target } : {}),
        sessionId: readSessionId(),
        ...(referrerHost && referrerHost !== window.location.hostname ? { referrerHost } : {}),
        ...(attribution.source ? { utmSource: attribution.source } : {}),
        device: deviceFromWidth(window.innerWidth),
      }),
      keepalive: true,
      credentials: "omit",
    }).catch(() => {
      // Measurement must never affect storefront behavior.
    });
  } catch {
    // Storage or URL access can throw in private windows; measurement is best-effort.
  }
}

/** Records one click on a public page, labelled by an internal path or a short plain label. */
export function trackClick(path: string, rawTarget: string | null | undefined) {
  const target = sanitizeClickTarget(rawTarget);
  if (target) sendSiteEvent("click", path, target);
}

export function trackAnalytics(
  name: AnalyticsEventName,
  path: string,
  properties?: AnalyticsEvent["properties"],
) {
  if (name.startsWith("home_esim_")) {
    trackHomeEsimEvent(name, properties);
    return;
  }
  if (SITE_EVENT_NAMES_SENT.includes(name)) sendSiteEvent(name as SiteEventName, path);
  // Optional external analytics only after an explicit "Setuju" on the cookie notice.
  if (!analyticsConsentGranted()) return;
  const endpoint = configuredEndpoint();
  const event = endpoint ? buildAnalyticsEvent(name, path, properties) : null;
  if (!endpoint || !event || !isBrowser()) return;
  void fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
    keepalive: true,
    credentials: "omit",
  }).catch(() => {
    // Measurement must never affect storefront behavior.
  });
}

export function isAnalyticsPublicPath(path: string) {
  return isPublicPath(path);
}
