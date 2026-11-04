import { CONSENT_COOKIE, analyticsConsentGranted } from "./cookie-consent";

/** GA4 measurement ID. Public by design (it ships in every page's gtag snippet). */
export const GA_MEASUREMENT_ID = "G-RTNZ9ND2TH";

type GtagWindow = Window & { gtag?: (...args: unknown[]) => void };

/**
 * Google tag in the server-rendered <head> of every page (so Google can detect it), running in
 * Consent Mode v2: analytics storage stays denied (cookieless pings only) until the visitor
 * presses "Setuju" on the cookie notice. A returning visitor who already agreed starts granted.
 */
export const GA_INLINE_SCRIPT = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
var ok=/(?:^|; )${CONSENT_COOKIE}=all/.test(document.cookie);
gtag('consent','default',{analytics_storage:ok?'granted':'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
gtag('js',new Date());
gtag('config','${GA_MEASUREMENT_ID}',{send_page_view:false});`;

export const GA_SCRIPT_SRC = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;

function isAdminPath(path: string) {
  return path === "/admin" || path.startsWith("/admin/");
}

/** Reports a page view for customer pages (Admin is never measured). */
export function trackGooglePageView(path: string) {
  if (typeof window === "undefined" || isAdminPath(path)) return;
  (window as GtagWindow).gtag?.("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

/** Grants analytics storage once the visitor accepts cookies (called on the consent event). */
export function syncGoogleConsent() {
  (window as GtagWindow).gtag?.("consent", "update", {
    analytics_storage: analyticsConsentGranted() ? "granted" : "denied",
  });
}
