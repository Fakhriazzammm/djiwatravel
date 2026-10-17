export type AnalyticsEventName =
  "page_view" | "destination_view" | "finder_submit" | "checkout_start";

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
  /^\/finder\/?$/,
  /^\/destination\/[a-z0-9-]+\/?$/,
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

export function trackAnalytics(
  name: AnalyticsEventName,
  path: string,
  properties?: AnalyticsEvent["properties"],
) {
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
