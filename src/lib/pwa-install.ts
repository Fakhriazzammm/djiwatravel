import type { PwaConfig, PwaPlatform } from "./pwa-config";

/** Pure install-prompt policy, kept free of `window` so it can be unit tested. */

export function detectPlatform(userAgent: string, maxTouchPoints = 0): PwaPlatform {
  const ua = userAgent.toLowerCase();
  // iPadOS 13+ reports a Mac UA; touch points tell it apart from a real Mac.
  if (/iphone|ipad|ipod/.test(ua) || (ua.includes("macintosh") && maxTouchPoints > 1)) return "ios";
  if (ua.includes("android")) return "android";
  if (/windows|macintosh|linux|cros/.test(ua)) return "desktop";
  return "other";
}

/** iOS only installs from Safari; in-app browsers and Chrome/Firefox on iOS cannot. */
export function isIosSafari(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  if (!/iphone|ipad|ipod|macintosh/.test(ua)) return false;
  return (
    ua.includes("safari") && !/crios|fxios|edgios|opios|instagram|fban|fbav|line\/|gsa\//.test(ua)
  );
}

export const SNOOZE_KEY = "djiwa.pwa.snoozed-until";

export function snoozeUntil(days: number, now = Date.now()): number {
  return now + days * 24 * 60 * 60 * 1000;
}

export type InstallDecisionInput = {
  config: Pick<PwaConfig, "installPromptEnabled">;
  platform: PwaPlatform;
  standalone: boolean;
  /** Chrome/Edge handed us a deferred `beforeinstallprompt`. */
  canPrompt: boolean;
  /** iOS Safari can follow the manual "Add to Home Screen" guide. */
  iosGuideAvailable: boolean;
  snoozedUntil: number | null;
  now?: number;
};

export type InstallMode = "prompt" | "ios-guide" | null;

/** What the install card should offer right now (null = show nothing). */
export function installMode(input: InstallDecisionInput): InstallMode {
  if (!input.config.installPromptEnabled || input.standalone) return null;
  if (input.snoozedUntil !== null && (input.now ?? Date.now()) < input.snoozedUntil) return null;
  if (input.canPrompt) return "prompt";
  if (input.platform === "ios" && input.iosGuideAvailable) return "ios-guide";
  return null;
}

/**
 * Service-worker cache policy: only content-hashed build assets are cacheable. API, auth, checkout,
 * wallet and everything else stays network-only so a stale response can never be served.
 */
export function isCacheableAssetPath(pathname: string): boolean {
  return /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?)$/.test(pathname);
}
