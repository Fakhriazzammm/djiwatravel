/**
 * Persetujuan data akun: pure rules shared by the prompt, Profil > Privasi, the server and Admin.
 * Analytics is not here on purpose: it is the device choice made in the cookie banner.
 */

export const CONSENT_VERSION = "2026-11-14";

export const CONSENT_PURPOSES = ["community", "ai", "personalization", "promo"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const CONSENT_LABEL: Record<ConsentPurpose, string> = {
  community: "Komunitas",
  ai: "Asisten Travo (AI)",
  personalization: "Personalisasi",
  promo: "Kabar & promo",
};

export const CONSENT_DETAIL: Record<ConsentPurpose, string> = {
  community:
    "Nama depan, postingan, foto, dan komentarmu tampil ke traveler lain. Wajib untuk memposting dan berkomentar, tidak untuk membaca.",
  ai: "Pertanyaan, Agenda, dan foto yang kamu kirim diproses penyedia AI pihak ketiga, dengan data pesanan disamarkan.",
  personalization: "Tujuan, Agenda, dan riwayat pesananmu dipakai untuk saran dan ingatan Travo.",
  promo: "Promo dan panduan baru lewat notifikasi dan email. Notifikasi pesanan tetap terkirim.",
};

export const CONSENT_FEATURES: Record<ConsentPurpose, string[]> = {
  community: ["Feeds", "Bagikan titipan"],
  ai: ["Travo", "Rencana lengkap", "Ide tempat", "Scan struk", "Cari barang dari foto"],
  personalization: ["Explore", "Feeds", "Memori Travo"],
  promo: ["Notifikasi", "Email"],
};

/** What the single "Setuju" button on the prompt turns on. Promo is never bundled in. */
export const ONE_TAP_PURPOSES: readonly ConsentPurpose[] = ["community", "ai", "personalization"];

export const CONSENT_SNOOZE_DAYS = 7;

export const CONSENT_SOURCES = ["prompt", "settings", "just_in_time"] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export const isConsentPurpose = (value: unknown): value is ConsentPurpose =>
  typeof value === "string" && (CONSENT_PURPOSES as readonly string[]).includes(value);

/** The member's current answers. `needsPrompt` is true until they answer or ask to be asked later. */
export type ConsentState = {
  purposes: Record<ConsentPurpose, boolean>;
  answered: boolean;
  snoozedUntil: string | null;
  needsPrompt: boolean;
  version: string;
};

export const EMPTY_CONSENT_STATE: ConsentState = {
  purposes: { community: false, ai: false, personalization: false, promo: false },
  answered: false,
  snoozedUntil: null,
  needsPrompt: false,
  version: CONSENT_VERSION,
};

export function computeNeedsPrompt(
  answered: boolean,
  snoozedUntil: string | null,
  now = Date.now(),
): boolean {
  if (answered) return false;
  if (snoozedUntil && new Date(snoozedUntil).getTime() > now) return false;
  return true;
}

/** Shown wherever a feature is blocked for lack of consent: friendly text with where to fix it. */
export function consentRequiredMessage(purpose: ConsentPurpose): string {
  return `Aktifkan “${CONSENT_LABEL[purpose]}” di Profil › Privasi & data untuk memakai fitur ini.`;
}
