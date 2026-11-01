/**
 * Cookie consent: asked once per visitor (device), remembered in localStorage and a first-party
 * cookie so it is never asked again after sign-in or registration.
 *
 * `essential` keeps only what the site needs (sign-in session, order access, language, this
 * choice). `all` additionally allows the optional analytics endpoint and campaign attribution.
 */

export type ConsentChoice = "all" | "essential";

export const CONSENT_KEY = "djiwa.cookie-consent.v1";
export const CONSENT_COOKIE = "djiwa_cookie_consent";
export const CONSENT_EVENT = "djiwa:cookie-consent";

const isChoice = (value: unknown): value is ConsentChoice =>
  value === "all" || value === "essential";

export function readConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(CONSENT_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { choice?: unknown };
      if (isChoice(parsed.choice)) return parsed.choice;
    }
  } catch {
    // Fall through to the cookie.
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=(all|essential)`));
  return match && isChoice(match[1]) ? match[1] : null;
}

export function saveConsent(choice: ConsentChoice): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, at: new Date().toISOString() }));
  } catch {
    // Storage may be blocked; the cookie below still remembers the choice.
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${choice}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
}

/** Optional analytics and attribution run only after an explicit "Setuju". */
export function analyticsConsentGranted(): boolean {
  return readConsent() === "all";
}
