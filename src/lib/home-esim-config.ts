/**
 * Admin-controlled settings for the Home eSIM card.
 *
 * One record (`admin_settings.homeEsim`) is read by the customer Home card, the package sheet,
 * the low-quota threshold and the promo banner, and written only by the Admin console. Keeping the
 * shape, defaults and validation here means the two surfaces cannot drift apart.
 */

import { LOW_QUOTA_PERCENT } from "./travel-journey";

export type HomePromo = {
  enabled: boolean;
  text: string;
  /** Opens this destination's package sheet; when omitted the banner opens the Home search. */
  destinationCode?: string | undefined;
  startsAt?: string | undefined;
  endsAt?: string | undefined;
};

export type HomeEsimConfig = {
  quickBuyEnabled: boolean;
  /** Shows the My Trips widget on Home. Admin-controlled; defaults on. */
  myTripsWidgetEnabled: boolean;
  /** Destination codes pinned first in the Home rail; unknown codes are ignored. */
  destinationOrder: string[];
  lowQuotaPercent: number;
  promo: HomePromo;
};

export const LOW_QUOTA_MIN = 5;
export const LOW_QUOTA_MAX = 40;
export const DEFAULT_LOW_QUOTA_PERCENT = LOW_QUOTA_PERCENT;
export const PROMO_TEXT_MAX = 80;
export const DESTINATION_ORDER_MAX = 12;

export const DEFAULT_HOME_ESIM_CONFIG: HomeEsimConfig = {
  quickBuyEnabled: true,
  myTripsWidgetEnabled: true,
  destinationOrder: [],
  lowQuotaPercent: DEFAULT_LOW_QUOTA_PERCENT,
  promo: { enabled: false, text: "" },
};

const CODE = /^[A-Z0-9]{2,8}$/;

function isoOrUndefined(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} bukan tanggal yang valid`);
  }
  return new Date(value).toISOString();
}

/** Strict parser used for admin writes: any invalid field rejects the whole save. */
export function parseHomeEsimConfig(value: unknown): HomeEsimConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("homeEsim harus berupa objek");
  }
  const input = value as {
    quickBuyEnabled?: unknown;
    myTripsWidgetEnabled?: unknown;
    destinationOrder?: unknown;
    lowQuotaPercent?: unknown;
    promo?: unknown;
  };
  if (typeof input.quickBuyEnabled !== "boolean") {
    throw new Error("quickBuyEnabled harus boolean");
  }
  // Records saved before the widget existed omit the flag; treat that as enabled.
  if (input.myTripsWidgetEnabled !== undefined && typeof input.myTripsWidgetEnabled !== "boolean") {
    throw new Error("myTripsWidgetEnabled harus boolean");
  }
  const order = Array.isArray(input.destinationOrder) ? input.destinationOrder : null;
  if (!order || order.length > DESTINATION_ORDER_MAX) {
    throw new Error(`destinationOrder maksimal ${DESTINATION_ORDER_MAX} kode`);
  }
  const destinationOrder = order.map((code) => {
    const normalized = typeof code === "string" ? code.trim().toUpperCase() : "";
    if (!CODE.test(normalized)) throw new Error("Kode destinasi tidak valid");
    return normalized;
  });
  if (new Set(destinationOrder).size !== destinationOrder.length) {
    throw new Error("Kode destinasi tidak boleh duplikat");
  }
  const lowQuotaPercent = Number(input.lowQuotaPercent);
  if (
    !Number.isInteger(lowQuotaPercent) ||
    lowQuotaPercent < LOW_QUOTA_MIN ||
    lowQuotaPercent > LOW_QUOTA_MAX
  ) {
    throw new Error(`lowQuotaPercent harus ${LOW_QUOTA_MIN}-${LOW_QUOTA_MAX}`);
  }
  const promoInput = input.promo as
    | {
        enabled?: unknown;
        text?: unknown;
        destinationCode?: unknown;
        startsAt?: unknown;
        endsAt?: unknown;
      }
    | undefined;
  if (!promoInput || typeof promoInput !== "object") throw new Error("promo wajib diisi");
  const enabled = promoInput.enabled === true;
  const text = typeof promoInput.text === "string" ? promoInput.text.trim() : "";
  if (text.length > PROMO_TEXT_MAX || /[<>]/.test(text)) {
    throw new Error(`Teks promo maksimal ${PROMO_TEXT_MAX} karakter tanpa HTML`);
  }
  if (enabled && !text) throw new Error("Banner promo aktif membutuhkan teks");
  const rawCode =
    typeof promoInput.destinationCode === "string" ? promoInput.destinationCode.trim() : "";
  const destinationCode = rawCode ? rawCode.toUpperCase() : undefined;
  if (destinationCode && !CODE.test(destinationCode)) {
    throw new Error("Kode destinasi promo tidak valid");
  }
  const startsAt = isoOrUndefined(promoInput.startsAt, "startsAt");
  const endsAt = isoOrUndefined(promoInput.endsAt, "endsAt");
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new Error("Akhir promo harus setelah awal promo");
  }
  return {
    quickBuyEnabled: input.quickBuyEnabled,
    myTripsWidgetEnabled: input.myTripsWidgetEnabled ?? true,
    destinationOrder,
    lowQuotaPercent,
    promo: { enabled, text, destinationCode, startsAt, endsAt },
  };
}

/** Lenient reader for customers: a bad or missing record never blocks the Home card. */
export function normalizeHomeEsimConfig(value: unknown): HomeEsimConfig {
  try {
    return parseHomeEsimConfig(value);
  } catch {
    return DEFAULT_HOME_ESIM_CONFIG;
  }
}

/** The promo the customer may see right now, judged by the server clock the caller passes in. */
export function activeHomePromo(config: HomeEsimConfig, now: number): HomePromo | null {
  const { promo } = config;
  if (!promo.enabled || !promo.text) return null;
  if (promo.startsAt && now < Date.parse(promo.startsAt)) return null;
  if (promo.endsAt && now >= Date.parse(promo.endsAt)) return null;
  return promo;
}

/** Admin-pinned codes first (in their saved order), then the remaining destinations as given. */
export function orderHomeDestinations<T extends { code: string }>(
  destinations: readonly T[],
  order: readonly string[],
): T[] {
  const byCode = new Map(destinations.map((item) => [item.code.toUpperCase(), item]));
  const pinned = order.flatMap((code) => {
    const found = byCode.get(code.toUpperCase());
    return found ? [found] : [];
  });
  const pinnedSet = new Set(pinned);
  return [...pinned, ...destinations.filter((item) => !pinnedSet.has(item))];
}

export function resolveLowQuotaPercent(config: Pick<HomeEsimConfig, "lowQuotaPercent">): number {
  return config.lowQuotaPercent;
}
