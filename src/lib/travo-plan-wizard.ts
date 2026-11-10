/**
 * The "Itinerary lengkap" wizard on the Travo page: Travo asks one thing at a time in its own bubble
 * (chips, typed answers, dates), the answers are checked here, and the finished set becomes one
 * request that creates the trip and builds the full plan. Pure rules; the screen is travo-plan-wizard.tsx.
 */
import { popularCitiesFor, type TripCity } from "./trip-cities";
import { searchCountries } from "./trip-countries";

export const WIZARD_STEPS = [
  "country",
  "city",
  "origin",
  "tripType",
  "departure",
  "days",
  "travelers",
  "budget",
  "style",
  "interests",
  "esim",
  "confirm",
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export type WizardAnswers = {
  country?: { code: string; name: string };
  city?: { name: string; lat?: number; lng?: number };
  /** null = "belum tahu": no fares are looked up. */
  origin?: { code: string; name: string } | null;
  oneWay?: boolean;
  departureDate?: string;
  days?: number;
  travelers?: number;
  /** Whole IDR; 0 = "hitungkan saja". */
  budgetIdr?: number;
  style?: "hemat" | "nyaman" | "auto";
  interests?: string[];
  esim?: boolean;
  confirmed?: boolean;
};

export const POPULAR_COUNTRIES = [
  { code: "JP", name: "Jepang" },
  { code: "KR", name: "Korea Selatan" },
  { code: "TH", name: "Thailand" },
  { code: "SG", name: "Singapura" },
  { code: "MY", name: "Malaysia" },
  { code: "VN", name: "Vietnam" },
  { code: "TW", name: "Taiwan" },
  { code: "AU", name: "Australia" },
] as const;
export const INTERESTS = [
  "Kuliner",
  "Belanja",
  "Alam",
  "Budaya & sejarah",
  "Anak-anak",
  "Santai",
  "Foto-foto",
] as const;
export const DAY_CHOICES = [3, 4, 5, 7, 10] as const;
export const MAX_WIZARD_DAYS = 10;

export type Ask =
  | { kind: "chips"; chips: string[]; input?: string }
  | { kind: "place" }
  | { kind: "date"; min: string; max: string }
  | { kind: "money"; chips: string[] }
  | { kind: "number"; chips: string[]; placeholder: string; min: number; max: number }
  | { kind: "multi"; chips: string[] }
  | { kind: "confirm" };

export type Question = { step: WizardStep; text: string; ask: Ask };

/** The first step that still needs an answer, or null when everything is answered. */
export function nextStep(a: WizardAnswers): WizardStep | null {
  if (!a.country) return "country";
  if (!a.city) return "city";
  if (a.origin === undefined) return "origin";
  if (a.oneWay === undefined) return "tripType";
  if (!a.departureDate) return "departure";
  if (!a.days) return "days";
  if (!a.travelers) return "travelers";
  if (a.budgetIdr === undefined) return "budget";
  if (!a.style) return "style";
  if (!a.interests) return "interests";
  if (a.esim === undefined) return "esim";
  if (!a.confirmed) return "confirm";
  return null;
}

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const returnDateOf = (a: WizardAnswers) =>
  a.departureDate && a.days ? addDays(a.departureDate, a.days - 1) : null;

export function question(step: WizardStep, a: WizardAnswers, today: string): Question {
  switch (step) {
    case "country":
      return {
        step,
        text: "Mau liburan ke mana? Pilih negaranya, atau ketik sendiri.",
        ask: {
          kind: "chips",
          chips: POPULAR_COUNTRIES.map((c) => c.name),
          input: "Ketik negara tujuan",
        },
      };
    case "city": {
      const popular = popularCitiesFor(a.country?.code)
        .slice(0, 8)
        .map((c) => c.name);
      return {
        step,
        text: `Kota mana di ${a.country?.name ?? "sana"} yang jadi basis rencananya?`,
        ask: { kind: "chips", chips: popular, input: "Ketik nama kota" },
      };
    }
    case "origin":
      return {
        step,
        text: "Berangkat dari kota atau bandara mana? Aku pakai ini untuk mencari harga tiket pesawat.",
        ask: { kind: "place" },
      };
    case "tripType":
      return {
        step,
        text: "Tiketnya pulang-pergi atau sekali jalan?",
        ask: { kind: "chips", chips: ["Pulang-pergi", "Sekali jalan"] },
      };
    case "departure":
      return {
        step,
        text: "Kapan mau berangkat?",
        ask: { kind: "date", min: today, max: addDays(today, 540) },
      };
    case "days":
      return {
        step,
        text: `Berapa hari di ${a.city?.name ?? "sana"}? (maksimal ${MAX_WIZARD_DAYS} hari)`,
        ask: {
          kind: "number",
          chips: DAY_CHOICES.map((d) => `${d} hari`),
          placeholder: "Ketik jumlah hari",
          min: 1,
          max: MAX_WIZARD_DAYS,
        },
      };
    case "travelers":
      return {
        step,
        text: "Berapa orang yang berangkat?",
        ask: {
          kind: "number",
          chips: ["1 orang", "2 orang", "3 orang", "4 orang"],
          placeholder: "Ketik jumlah orang",
          min: 1,
          max: 10,
        },
      };
    case "budget":
      return {
        step,
        text: "Total anggaran untuk semuanya (tiket, hotel, makan, eSIM)? Boleh kosong, nanti aku hitungkan.",
        ask: { kind: "money", chips: ["Hitungkan saja", "Rp 10 juta", "Rp 20 juta", "Rp 35 juta"] },
      };
    case "style":
      return {
        step,
        text: "Gaya perjalanannya?",
        ask: { kind: "chips", chips: ["Hemat", "Nyaman", "Terserah Travo"] },
      };
    case "interests":
      return {
        step,
        text: "Kamu suka apa? Pilih beberapa, lalu lanjut.",
        ask: { kind: "multi", chips: [...INTERESTS] },
      };
    case "esim":
      return {
        step,
        text: "Mau sekalian aku carikan paket eSIM untuk internet di sana?",
        ask: { kind: "chips", chips: ["Ya, sertakan eSIM", "Tidak perlu"] },
      };
    case "confirm":
      return {
        step,
        text: "Sudah lengkap. Cek ringkasannya, lalu aku buatkan rencananya.",
        ask: { kind: "confirm" },
      };
  }
}

export type Parsed =
  { ok: true; patch: Partial<WizardAnswers>; echo: string } | { ok: false; message: string };

const digits = (raw: string) => Number(raw.replace(/[^\d]/g, ""));
const titleCase = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");

/** Reads one answer. A rejected answer says why, in Travo's voice, so the traveler can retry. */
export function parseAnswer(
  step: WizardStep,
  raw: string,
  a: WizardAnswers,
  today: string,
): Parsed {
  const text = raw.trim();
  if (!text) return { ok: false, message: "Jawabannya masih kosong." };
  const ok = (patch: Partial<WizardAnswers>, echo = text): Parsed => ({ ok: true, patch, echo });
  switch (step) {
    case "country": {
      const popular = POPULAR_COUNTRIES.find((c) => c.name.toLowerCase() === text.toLowerCase());
      const found = popular ?? searchCountries(text)[0];
      if (!found)
        return {
          ok: false,
          message: `Aku belum menemukan negara “${text}”. Coba tulis namanya lagi.`,
        };
      if (found.code === "ID")
        return {
          ok: false,
          message: "Ini untuk perjalanan ke luar negeri. Pilih negara tujuan lain ya.",
        };
      return ok({ country: { code: found.code, name: found.name } }, found.name);
    }
    case "city": {
      const known = popularCitiesFor(a.country?.code).find(
        (c: TripCity) => c.name.toLowerCase() === text.toLowerCase(),
      );
      if (known) return ok({ city: { name: known.name, lat: known.lat, lng: known.lng } });
      if (text.length < 2 || text.length > 60 || /[<>]/.test(text))
        return { ok: false, message: "Nama kotanya belum terbaca. Coba tulis lagi." };
      return ok({ city: { name: titleCase(text) } });
    }
    case "tripType":
      return /sekali/i.test(text)
        ? ok({ oneWay: true })
        : /pulang|pp|balik/i.test(text)
          ? ok({ oneWay: false })
          : { ok: false, message: "Pilih pulang-pergi atau sekali jalan." };
    case "departure": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`)))
        return { ok: false, message: "Tanggalnya belum terbaca. Pilih dari kalender." };
      if (text < today)
        return { ok: false, message: "Tanggal itu sudah lewat. Pilih tanggal yang akan datang." };
      if (text > addDays(today, 540))
        return { ok: false, message: "Terlalu jauh. Pilih tanggal dalam 18 bulan ke depan." };
      return ok(
        { departureDate: text },
        new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" }).format(
          new Date(`${text}T00:00:00Z`),
        ),
      );
    }
    case "days": {
      const n = digits(text);
      if (!n || n < 1) return { ok: false, message: "Isi jumlah harinya dengan angka." };
      if (n > MAX_WIZARD_DAYS)
        return {
          ok: false,
          message: `Rencana lengkap sampai ${MAX_WIZARD_DAYS} hari. Pilih yang lebih singkat.`,
        };
      return ok({ days: n }, `${n} hari`);
    }
    case "travelers": {
      const n = digits(text);
      if (!n || n < 1 || n > 10) return { ok: false, message: "Jumlah orang 1 sampai 10." };
      return ok({ travelers: n }, `${n} orang`);
    }
    case "budget": {
      if (/hitung|terserah|belum|auto/i.test(text)) return ok({ budgetIdr: 0 }, "Hitungkan saja");
      let n = digits(text);
      if (/juta|jt/i.test(text))
        n = Number(text.replace(/[^\d,.]/g, "").replace(",", ".")) * 1_000_000;
      if (!Number.isFinite(n) || n < 1_000_000)
        return {
          ok: false,
          message: "Anggaran minimal Rp 1.000.000. Ketik angkanya, mis. 20 juta atau 20000000.",
        };
      if (n > 2_000_000_000)
        return { ok: false, message: "Angkanya terlalu besar. Coba cek lagi." };
      return ok(
        { budgetIdr: Math.round(n / 10_000) * 10_000 },
        `Rp ${Math.round(n).toLocaleString("id-ID")}`,
      );
    }
    case "style":
      return /hemat/i.test(text)
        ? ok({ style: "hemat" })
        : /nyaman/i.test(text)
          ? ok({ style: "nyaman" })
          : ok({ style: "auto" }, "Terserah Travo");
    case "interests": {
      const picked = text
        .split(",")
        .map((t) => t.trim())
        .filter((t) => (INTERESTS as readonly string[]).includes(t));
      return ok({ interests: picked }, picked.length ? picked.join(", ") : "Terserah Travo");
    }
    case "esim":
      return /ya|sertakan|mau/i.test(text) && !/tidak/i.test(text)
        ? ok({ esim: true }, "Ya, sertakan eSIM")
        : ok({ esim: false }, "Tidak perlu");
    case "origin":
    case "confirm":
      return { ok: false, message: "Pilih dari pilihan di atas." };
  }
}

/** The recap shown before building: each line "Label: value". */
export function recapLines(a: WizardAnswers): string[] {
  const dep = a.departureDate;
  const ret = returnDateOf(a);
  const fmt = (d: string) =>
    new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${d}T00:00:00Z`));
  return [
    `Tujuan: ${a.city?.name ?? "?"}, ${a.country?.name ?? "?"}`,
    `Berangkat dari: ${a.origin ? a.origin.name : "belum diisi (tiket tidak dihitung)"}`,
    `Tiket: ${a.oneWay ? "sekali jalan" : "pulang-pergi"}`,
    `Tanggal: ${dep ? fmt(dep) : "?"}${ret && !a.oneWay ? ` – ${fmt(ret)}` : ""} · ${a.days ?? "?"} hari`,
    `Traveler: ${a.travelers ?? "?"} orang`,
    `Anggaran: ${a.budgetIdr ? `Rp ${a.budgetIdr.toLocaleString("id-ID")}` : "dihitung Travo"}`,
    `Gaya: ${a.style === "hemat" ? "hemat" : a.style === "nyaman" ? "nyaman" : "terserah Travo"}`,
    `Minat: ${a.interests?.length ? a.interests.join(", ") : "terserah Travo"}`,
    `eSIM: ${a.esim ? "disertakan" : "tidak"}`,
  ];
}

export type PlanTripRequest = {
  country: { code: string; name: string };
  city: { name: string; lat?: number; lng?: number };
  origin: { code: string; name: string } | null;
  oneWay: boolean;
  departureDate: string;
  days: number;
  travelers: number;
  budgetIdr: number;
  style: "hemat" | "nyaman" | "auto";
  interests: string[];
  esim: boolean;
};

/** The finished answers as the request that creates the trip; null while something is missing. */
export function toRequest(a: WizardAnswers): PlanTripRequest | null {
  if (
    !a.country ||
    !a.city ||
    a.origin === undefined ||
    a.oneWay === undefined ||
    !a.departureDate ||
    !a.days ||
    !a.travelers ||
    a.budgetIdr === undefined ||
    !a.style ||
    !a.interests ||
    a.esim === undefined
  )
    return null;
  return {
    country: a.country,
    city: a.city,
    origin: a.origin,
    oneWay: a.oneWay,
    departureDate: a.departureDate,
    days: a.days,
    travelers: a.travelers,
    budgetIdr: a.budgetIdr,
    style: a.style,
    interests: a.interests,
    esim: a.esim,
  };
}
