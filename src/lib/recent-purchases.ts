/**
 * Home "pembelian terbaru" toast: pure helpers shared by the server feed and the client toast.
 *
 * Only real, paid orders are ever described as purchases, and only with a masked first name. When
 * there are none in the window the feed switches to `popular` entries (real catalogue packages,
 * no person, no timestamp) so nothing is presented as a sale that did not happen.
 */

export type RecentPurchaseKind = "real" | "popular";

export type RecentPurchase = {
  key: string;
  kind: RecentPurchaseKind;
  /** Masked name for real orders ("F***"); null for popular entries. */
  maskedName: string | null;
  /** Catalogue destination code (upper-case); resolves flag and name on the client. */
  destinationCode: string;
  /** "5 GB · 30 Hari" */
  packageLabel: string;
  /** Minutes since payment for real orders; null for popular entries. */
  minutesAgo: number | null;
  /** Selling price for popular entries (real orders never expose their amount). */
  priceIdr: number | null;
};

export type RecentPurchaseFeed = { enabled: boolean; items: RecentPurchase[] };

export const RECENT_WINDOW_HOURS = 72;

/** "Fakhri Azzam" → "F***"; empty or missing → "Traveler". */
export function maskName(name?: string | null): string {
  const first = name?.trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{N}]/gu, "");
  if (!first) return "Traveler";
  return `${first.slice(0, 1).toUpperCase()}***`;
}

export function packageSizeLabel(volumeBytes: number | null, durationDays: number | null): string {
  const parts: string[] = [];
  if (volumeBytes && volumeBytes > 0) {
    const gb = volumeBytes / 1024 ** 3;
    parts.push(gb >= 1 ? `${Math.round(gb * 10) / 10} GB` : `${Math.round(volumeBytes / 1024 ** 2)} MB`);
  }
  if (durationDays && durationDays > 0) parts.push(`${durationDays} Hari`);
  return parts.join(" · ");
}

export function agoLabel(minutes: number): string {
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}
