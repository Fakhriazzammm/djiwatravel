/**
 * Home hero: the sky illustration, greeting and clock follow the customer's device time.
 *
 * Admin can pin one phase (Admin → Settings → eSIM Beranda → Hero Beranda); `auto` follows the
 * clock. Phase boundaries live here only, so Home and the Admin preview cannot drift apart.
 */

export const HERO_PHASES = ["subuh", "pagi", "siang", "sore", "malam", "tengah-malam"] as const;
export type HeroPhase = (typeof HERO_PHASES)[number];
export type HeroSkyMode = "auto" | HeroPhase;

export const HERO_PHASE_LABEL: Record<HeroPhase, string> = {
  subuh: "Subuh (04.00–06.29)",
  pagi: "Pagi (06.30–10.29)",
  siang: "Siang (10.30–14.59)",
  sore: "Sore (15.00–18.14)",
  malam: "Malam (18.15–23.29)",
  "tengah-malam": "Tengah malam (23.30–03.59)",
};

const GREETING: Record<HeroPhase, string> = {
  subuh: "Selamat subuh",
  pagi: "Selamat pagi",
  siang: "Selamat siang",
  sore: "Selamat sore",
  malam: "Selamat malam",
  "tengah-malam": "Masih terjaga",
};

/**
 * Phases whose upper-left sky (where the clock, greeting and title sit) is deep enough for white
 * text. Only the pale morning sky uses dark ink. Each illustration keeps that corner calm.
 */
const DARK: ReadonlySet<HeroPhase> = new Set(["subuh", "siang", "sore", "malam", "tengah-malam"]);

/** [first minute of the day, phase], ascending. */
const STARTS: ReadonlyArray<readonly [number, HeroPhase]> = [
  [0, "tengah-malam"],
  [4 * 60, "subuh"],
  [6 * 60 + 30, "pagi"],
  [10 * 60 + 30, "siang"],
  [15 * 60, "sore"],
  [18 * 60 + 15, "malam"],
  [23 * 60 + 30, "tengah-malam"],
];

export function heroPhaseAt(date: Date): HeroPhase {
  const minutes = date.getHours() * 60 + date.getMinutes();
  let phase: HeroPhase = "tengah-malam";
  for (const [start, name] of STARTS) if (minutes >= start) phase = name;
  return phase;
}

export function resolveHeroPhase(mode: HeroSkyMode, date: Date): HeroPhase {
  return mode === "auto" ? heroPhaseAt(date) : mode;
}

export function isDarkPhase(phase: HeroPhase): boolean {
  return DARK.has(phase);
}

export function heroGreeting(phase: HeroPhase, firstName?: string | null): string {
  const name = firstName?.trim();
  return name ? `${GREETING[phase]}, ${name}` : GREETING[phase];
}

export function heroSkyImage(phase: HeroPhase): string {
  return `/assets/home-hero/sky-${phase}-v2.jpg`;
}

export const HERO_MASCOT = "/assets/home-hero/mascot-v4.png";

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** "Senin · 2 November 2026 · 09.41" from the device clock. */
export function heroClockLine(date: Date): { day: string; date: string; time: string } {
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    day: DAYS[date.getDay()] ?? "",
    date: `${date.getDate()} ${MONTHS[date.getMonth()] ?? ""} ${date.getFullYear()}`,
    time: `${pad(date.getHours())}.${pad(date.getMinutes())}`,
  };
}

export function isHeroSkyMode(value: unknown): value is HeroSkyMode {
  return value === "auto" || (typeof value === "string" && (HERO_PHASES as readonly string[]).includes(value));
}
