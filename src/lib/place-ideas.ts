/**
 * Ide tempat di Agenda. Pure helpers shared by the browser, the server and tests: the Admin
 * setting, the contract of what the AI may return, cache keys, and the suggested time slot.
 * The AI never invents places: every idea must come from fetched web text and be found on a map.
 */

export const PLACE_IDEAS_SETTING_KEY = "placeIdeas";

/** Text models on the Helipod AI Gateway, cheapest first (IDR per 1M tokens: see receipt-scan). */
export const PLACE_IDEA_MODELS = [
  "glm-5.3-flash",
  "deepseek-v4.1-flash",
  "glm-5.3-flashx",
] as const;

export type PlaceIdeaCategoryId = "all" | "food" | "cafe" | "sight" | "nature" | "shop";

export const PLACE_IDEA_CATEGORIES: {
  id: PlaceIdeaCategoryId;
  label: string;
  /** English search phrase: travel blogs and guides rank better in English. */
  search: string;
  /** Value stored as the activity category when the idea is added to the agenda. */
  activityCategory: string;
}[] = [
  { id: "all", label: "Semua", search: "best places to visit hidden gems", activityCategory: "" },
  { id: "food", label: "Makan", search: "best local restaurants to eat", activityCategory: "food" },
  { id: "cafe", label: "Kafe", search: "best cafes and coffee shops", activityCategory: "cafe" },
  {
    id: "sight",
    label: "Wisata",
    search: "top attractions and sights",
    activityCategory: "attraction",
  },
  {
    id: "nature",
    label: "Alam",
    search: "best parks gardens and nature spots",
    activityCategory: "attraction",
  },
  {
    id: "shop",
    label: "Belanja",
    search: "best shopping areas and markets",
    activityCategory: "shopping",
  },
];

export const placeIdeaCategory = (id: string) =>
  PLACE_IDEA_CATEGORIES.find((category) => category.id === id) ?? PLACE_IDEA_CATEGORIES[0]!;

export type PlaceIdeasConfig = {
  /** Kill switch: false hides the carousel and the "Ke mana lagi ya?" sheet. */
  enabled: boolean;
  /** Small carousel at the top of the Agenda. The sheet stays available when this is off. */
  showStrip: boolean;
  /** Fresh web searches per customer per day (Asia/Jakarta). Cached answers are free. */
  dailyLimit: number;
  /** How long a cached answer for one city and category stays fresh. */
  cacheDays: number;
  /** Ideas returned per search. */
  maxIdeas: number;
  model: string;
};

export const DEFAULT_PLACE_IDEAS_CONFIG: PlaceIdeasConfig = {
  enabled: true,
  showStrip: true,
  dailyLimit: 12,
  cacheDays: 7,
  maxIdeas: 6,
  model: "glm-5.3-flash",
};

const intInRange = (value: unknown, min: number, max: number, label: string) => {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max)
    throw new Error(`placeIdeas.${label} harus bilangan bulat ${min}-${max}`);
  return value as number;
};

export function parsePlaceIdeasConfig(value: unknown): PlaceIdeasConfig {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("placeIdeas harus berupa objek");
  const raw = value as Record<string, unknown>;
  for (const key of ["enabled", "showStrip"] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== "boolean")
      throw new Error(`placeIdeas.${key} harus boolean`);
  }
  const d = DEFAULT_PLACE_IDEAS_CONFIG;
  const model = raw["model"] === undefined ? d.model : raw["model"];
  if (typeof model !== "string" || !(PLACE_IDEA_MODELS as readonly string[]).includes(model))
    throw new Error(`placeIdeas.model harus salah satu: ${PLACE_IDEA_MODELS.join(", ")}`);
  return {
    enabled: (raw["enabled"] as boolean | undefined) ?? d.enabled,
    showStrip: (raw["showStrip"] as boolean | undefined) ?? d.showStrip,
    dailyLimit:
      raw["dailyLimit"] === undefined
        ? d.dailyLimit
        : intInRange(raw["dailyLimit"], 1, 100, "dailyLimit"),
    cacheDays:
      raw["cacheDays"] === undefined
        ? d.cacheDays
        : intInRange(raw["cacheDays"], 1, 30, "cacheDays"),
    maxIdeas:
      raw["maxIdeas"] === undefined ? d.maxIdeas : intInRange(raw["maxIdeas"], 3, 10, "maxIdeas"),
    model,
  };
}

/** Read path: a stored value that no longer validates falls back to the defaults. */
export function normalizePlaceIdeasConfig(value: unknown): PlaceIdeasConfig {
  try {
    return parsePlaceIdeasConfig(value);
  } catch {
    return DEFAULT_PLACE_IDEAS_CONFIG;
  }
}

/* -------------------------------------------------------------------------- the idea */

export type PlaceIdea = {
  /** Stable id: name + rounded coordinates, used to hide an idea from Admin. */
  key: string;
  name: string;
  category: PlaceIdeaCategoryId;
  /** One short Indonesian sentence on why it is worth a visit. */
  why: string;
  area: string;
  /** Null when the place could not be checked on a map (no venue geocoder): it is shown without a pin. */
  lat: number | null;
  lng: number | null;
  /** Where the recommendation came from: shown as a credit and a link. */
  sourceHost: string;
  sourceUrl: string;
  /** A Wikimedia photo only when it clearly belongs to the place; otherwise null (illustration). */
  imageUrl: string | null;
};

export type PlaceIdeasResponse =
  | { status: "ok"; ideas: PlaceIdea[]; cached: boolean; remaining: number; destination: string }
  | {
      status: "disabled" | "limit" | "busy" | "empty" | "error";
      message: string;
      remaining: number;
    };

export type PlaceIdeasStatus = {
  available: boolean;
  showStrip: boolean;
  dailyLimit: number;
  remaining: number;
};

export const UNAVAILABLE_PLACE_IDEAS: PlaceIdeasStatus = {
  available: false,
  showStrip: false,
  dailyLimit: 0,
  remaining: 0,
};

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** One cache row per city + category (+ optional free-text query). */
export function placeIdeasCacheKey(destination: string, category: string, query = "") {
  return [fold(destination), category, fold(query)].join("|").slice(0, 240);
}

export function placeIdeaKey(name: string, lat: number | null, lng: number | null) {
  if (lat === null || lng === null) return fold(name).slice(0, 160);
  return `${fold(name)}@${lat.toFixed(3)},${lng.toFixed(3)}`.slice(0, 160);
}

export type RawIdea = { name: string; category: PlaceIdeaCategoryId; why: string; source: number };

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * Checks what the model returned. An idea is kept only with a name, a known category and a
 * source number that points at one of the pages we actually fetched.
 */
export function cleanRawIdeas(parsed: unknown, sourceCount: number, max: number): RawIdea[] {
  const list =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { places?: unknown }).places)
      ? ((parsed as { places: unknown[] }).places as unknown[])
      : [];
  const seen = new Set<string>();
  const out: RawIdea[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const name = text(row["name"], 80);
    const why = text(row["why"], 140);
    const source = Number(row["source"]);
    const category = PLACE_IDEA_CATEGORIES.some((c) => c.id === row["category"] && c.id !== "all")
      ? (row["category"] as PlaceIdeaCategoryId)
      : null;
    if (!name || !why || !category) continue;
    if (!Number.isInteger(source) || source < 1 || source > sourceCount) continue;
    const dedupe = fold(name);
    if (!dedupe || seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ name, category, why, source });
    if (out.length >= max) break;
  }
  return out;
}

/* --------------------------------------------------------------------- time suggestion */

const toMinutes = (value: string | null | undefined) => {
  const match = /^(\d{2}):(\d{2})/.exec(value ?? "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const fromMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * Suggested start and end for a new idea on one day: 30 minutes after the last timed activity
 * (or 10:00 on an empty day), one hour long, never past 23:00. The traveler can edit both.
 */
export function suggestSlot(
  dayItems: { start: string | null | undefined; end?: string | null | undefined }[],
  durationMinutes = 60,
) {
  let after: number | null = null;
  for (const item of dayItems) {
    const end = toMinutes(item.end) ?? ((s) => (s === null ? null : s + 60))(toMinutes(item.start));
    if (end !== null && (after === null || end > after)) after = end;
  }
  const rounded = after === null ? 10 * 60 : Math.ceil((after + 30) / 15) * 15;
  const start = Math.min(rounded, 22 * 60 - durationMinutes + 60);
  const end = Math.min(start + durationMinutes, 23 * 60 + 59);
  return { start: fromMinutes(start), end: fromMinutes(end) };
}

export function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
