/**
 * One-tap eSIM install links.
 *
 * iOS 17.4+ (Apple) and Android (Google Play services) both open the native eSIM install sheet
 * from a web link that carries the LPA string, so the customer does not have to scan a QR code on
 * the very phone that is showing it. eSIM Access documents the same links for its profiles.
 * The QR code and manual details remain the fallback on every other device.
 */
export type InstallPlatform = "ios" | "android";

const APPLE_BASE = "https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=";
const ANDROID_BASE = "https://esimsetup.android.com/esim_qrcode_provisioning?carddata=";

/** `LPA:1$<smdp>$<activation code>`; the activation code may be empty only for some profiles. */
const LPA = /^LPA:1\$([A-Za-z0-9.-]+)\$([A-Za-z0-9._+/=-]*)$/;

export function isValidLpa(lpa: string): boolean {
  return LPA.test(lpa.trim());
}

export function installPlatformFromUserAgent(userAgent: string): InstallPlatform | null {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return null;
}

/**
 * Builds the install link, or null when the LPA string is not in the expected shape (never
 * guess: a malformed link would open an install sheet for the wrong profile). The base URL stays
 * lowercase as both vendors require; only the activation code keeps its case.
 */
export function esimInstallLink(lpa: string, platform: InstallPlatform): string | null {
  const value = lpa.trim();
  const match = LPA.exec(value);
  if (!match) return null;
  const carddata = `LPA:1$${match[1]}$${match[2]}`;
  return `${platform === "ios" ? APPLE_BASE : ANDROID_BASE}${carddata}`;
}
