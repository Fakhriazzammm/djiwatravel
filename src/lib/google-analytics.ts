import { analyticsConsentGranted } from "./cookie-consent";

/** GA4 measurement ID. Public by design (it ships in every page's gtag snippet). */
export const GA_MEASUREMENT_ID = "G-RTNZ9ND2TH";

type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

let loaded = false;

function isAdminPath(path: string) {
  return path === "/admin" || path.startsWith("/admin/");
}

/** Loads gtag.js once, only after an explicit "Setuju" on the cookie notice. */
function loadGoogleAnalytics() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  const w = window as GtagWindow;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtag() {
    // gtag.js requires the real `arguments` object, not a rest array.
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  w.gtag("js", new Date());
  // Page views are sent manually below because the app is a client-routed SPA.
  w.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

/** Reports a page view for customer pages (Admin is never measured). Safe to call on every navigation. */
export function trackGooglePageView(path: string) {
  if (typeof window === "undefined" || isAdminPath(path)) return;
  if (!analyticsConsentGranted()) return;
  loadGoogleAnalytics();
  (window as GtagWindow).gtag?.("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}
