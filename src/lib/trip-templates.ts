/** Pure rules for trip templates (no server imports): config, day math, slugs and AI draft cleaning. */

export const TRIP_TEMPLATES_SETTING_KEY = "tripTemplates";

export type TripTemplatesConfig = {
  /** Kill switch: hides the gallery, the public page and "Jadikan template". */
  enabled: boolean;
  /** Show the "Template" tile next to Tiket on Home and Explore. */
  showTile: boolean;
  /** A new template is shared to the Feeds timeline (the member can untick it per template). */
  shareToFeed: boolean;
  /** Published templates one member may keep at a time. */
  maxPerUser: number;
  /** Travo may draft a template from a short brief. */
  aiEnabled: boolean;
  /** Travo template drafts per member per day (Asia/Jakarta). */
  aiDailyDrafts: number;
  /** Times a member can copy templates per day (abuse limit). */
  dailyUses: number;
};

export const DEFAULT_TRIP_TEMPLATES_CONFIG: TripTemplatesConfig = {
  enabled: true,
  showTile: true,
  shareToFeed: true,
  maxPerUser: 20,
  aiEnabled: true,
  aiDailyDrafts: 5,
  dailyUses: 20,
};

const num = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

export function normalizeTripTemplatesConfig(value: unknown): TripTemplatesConfig {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const d = DEFAULT_TRIP_TEMPLATES_CONFIG;
  return {
    enabled: flag(raw["enabled"], d.enabled),
    showTile: flag(raw["showTile"], d.showTile),
    shareToFeed: flag(raw["shareToFeed"], d.shareToFeed),
    maxPerUser: num(raw["maxPerUser"], d.maxPerUser, 1, 200),
    aiEnabled: flag(raw["aiEnabled"], d.aiEnabled),
    aiDailyDrafts: num(raw["aiDailyDrafts"], d.aiDailyDrafts, 0, 50),
    dailyUses: num(raw["dailyUses"], d.dailyUses, 1, 200),
  };
}

/** Admin write: strict, so a bad value is rejected instead of silently replaced. */
export function parseTripTemplatesConfig(value: unknown): TripTemplatesConfig {
  if (!value || typeof value !== "object") throw new Error("Konfigurasi template tidak valid");
  const raw = value as Record<string, unknown>;
  for (const key of ["enabled", "showTile", "shareToFeed", "aiEnabled"])
    if (typeof raw[key] !== "boolean") throw new Error(`${key} harus boolean`);
  const strict = (key: string, min: number, max: number) => {
    const n = Number(raw[key]);
    if (!Number.isInteger(n) || n < min || n > max)
      throw new Error(`${key} harus bilangan bulat ${min}-${max}`);
    return n;
  };
  return {
    enabled: raw["enabled"] as boolean,
    showTile: raw["showTile"] as boolean,
    shareToFeed: raw["shareToFeed"] as boolean,
    aiEnabled: raw["aiEnabled"] as boolean,
    maxPerUser: strict("maxPerUser", 1, 200),
    aiDailyDrafts: strict("aiDailyDrafts", 0, 50),
    dailyUses: strict("dailyUses", 1, 200),
  };
}

export const TEMPLATE_MAX_DAYS = 30;
export const TEMPLATE_MAX_ITEMS = 120;
export const TEMPLATE_CATEGORIES = [
  "wisata",
  "kuliner",
  "belanja",
  "transport",
  "akomodasi",
  "lainnya",
] as const;

/** `YYYY-MM-DD` of the n-th day (1-based) of a trip that starts on `start`. */
export function dateForDay(start: string, dayIndex: number): string {
  const base = Date.parse(`${start}T00:00:00Z`);
  return new Date(base + (dayIndex - 1) * 86_400_000).toISOString().slice(0, 10);
}

/** 1-based day number of `date` in a trip that starts on `start`; null when outside 1..max. */
export function dayIndexFor(start: string, date: string, max = TEMPLATE_MAX_DAYS): number | null {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const day = Math.round((b - a) / 86_400_000) + 1;
  return day >= 1 && day <= max ? day : null;
}

/** Last date of a trip of `days` days starting on `start`. */
export const returnDateFor = (start: string, days: number) => dateForDay(start, days);

export function makeSlug(title: string, suffix: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  const tail = suffix
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  return `${base || "template"}-${tail}`;
}

export function templatePath(slug: string, affiliateCode?: string | null) {
  const code = affiliateCode?.trim();
  return `/template/${slug}${code ? `?ref=${encodeURIComponent(code)}` : ""}`;
}

export type TemplateItem = {
  day: number;
  start: string | null;
  end: string | null;
  title: string;
  location: string | null;
  category: string | null;
  lat?: number | null;
  lng?: number | null;
  image?: string | null;
};

export type TemplateDraft = {
  title: string;
  description: string;
  destinationName: string;
  destinationCode: string | null;
  days: number;
  items: TemplateItem[];
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * Turns the model's JSON into a safe draft: text capped, days inside the requested range, times
 * valid and in order, at most 8 items a day. Anything unusable is dropped, never guessed.
 */
export function cleanTemplateDraft(raw: unknown, maxDays: number): TemplateDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const title = text(data["title"], 120);
  const days = Math.min(
    TEMPLATE_MAX_DAYS,
    Math.max(1, Math.min(maxDays, Number(data["days"]) || maxDays)),
  );
  const list = Array.isArray(data["items"]) ? data["items"] : [];
  const perDay = new Map<number, number>();
  const items: TemplateItem[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const day = Math.round(Number(row["day"]));
    const itemTitle = text(row["title"], 160);
    if (!itemTitle || !Number.isFinite(day) || day < 1 || day > days) continue;
    const count = perDay.get(day) ?? 0;
    if (count >= 8) continue;
    const start = typeof row["start"] === "string" && TIME.test(row["start"]) ? row["start"] : null;
    let end = typeof row["end"] === "string" && TIME.test(row["end"]) ? row["end"] : null;
    if (start && end && end < start) end = null;
    perDay.set(day, count + 1);
    items.push({
      day,
      start,
      end: start ? end : null,
      title: itemTitle,
      location: text(row["location"], 200) || null,
      category: normalizeCategory(row["category"]),
    });
    if (items.length >= TEMPLATE_MAX_ITEMS) break;
  }
  if (title.length < 3 || items.length === 0) return null;
  items.sort((a, b) => a.day - b.day || (a.start ?? "99:99").localeCompare(b.start ?? "99:99"));
  const code = text(data["destinationCode"], 8).toUpperCase();
  return {
    title,
    description: text(data["description"], 600),
    destinationName: text(data["destinationName"], 120) || title,
    destinationCode: /^[A-Z]{2}$/.test(code) ? code : null,
    days,
    items,
  };
}

export function normalizeCategory(value: unknown): string | null {
  const v = text(value, 40).toLowerCase();
  if (!v) return null;
  return (TEMPLATE_CATEGORIES as readonly string[]).includes(v) ? v : "lainnya";
}

/** JSON schema the model must answer for a template draft. */
export const TEMPLATE_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "destinationName", "destinationCode", "days", "items"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    destinationName: { type: "string" },
    destinationCode: { type: "string" },
    days: { type: "integer" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["day", "start", "end", "title", "location", "category"],
        properties: {
          day: { type: "integer" },
          start: { type: "string" },
          end: { type: "string" },
          title: { type: "string" },
          location: { type: "string" },
          category: { type: "string" },
        },
      },
    },
  },
} as const;

export function templateDraftPrompt(brief: string, days: number) {
  return {
    system: [
      "Kamu Travo, asisten perjalanan Djiwa Travel. Tugasmu menyusun TEMPLATE itinerary yang bisa dipakai traveler Indonesia lain.",
      "Jawab hanya JSON sesuai skema. Bahasa Indonesia, nada ramah dan ringkas.",
      `Buat tepat ${days} hari. Tiap hari 3-6 kegiatan dengan urutan dan jam yang realistis (format 24 jam HH:MM), kelompokkan per area, sisakan waktu makan dan jalan.`,
      "Hanya sebut tempat nyata yang kamu yakin ada. Jangan mengarang nama tempat, harga, atau jam buka. Kosongkan `end` bila tidak yakin.",
      "`category` salah satu: wisata, kuliner, belanja, transport, akomodasi, lainnya.",
      "`destinationCode` kode negara 2 huruf (contoh JP, ID, TH). `title` maksimal 60 karakter, tanpa emoji.",
      "Jangan menyertakan data pribadi, nomor pesanan, atau catatan privat apa pun.",
    ].join("\n"),
    user: `Permintaan traveler: ${brief}`,
  };
}
