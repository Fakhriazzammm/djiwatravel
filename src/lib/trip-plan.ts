/**
 * Travo "Rencana lengkap": the pure rules. The server gathers facts (fares, eSIM, city costs, map
 * places); the model only chooses among them and writes the words. Every number that ends up in a
 * proposal is computed or checked here, never taken from the model.
 */
import { hoursForDay, isOpenAt, weekdayIndex } from "./opening-hours";
import type { AgendaChange } from "./trip-assistant";

/* ------------------------------------------------------------------------- city costs */

/** Whole IDR. Food, transport and attractions are per person per day, hotels per room per night. */
export type CityCosts = {
  foodBudget: number;
  foodMid: number;
  transportDay: number;
  attractionsDay: number;
  hotelBudget: number;
  hotelMid: number;
};
export const COST_KEYS = [
  "foodBudget",
  "foodMid",
  "transportDay",
  "attractionsDay",
  "hotelBudget",
  "hotelMid",
] as const satisfies readonly (keyof CityCosts)[];

/** Sane bounds in IDR: a figure outside them is a model slip, not a price. */
export const COST_LIMITS: Record<keyof CityCosts, readonly [number, number]> = {
  foodBudget: [40_000, 900_000],
  foodMid: [80_000, 2_000_000],
  transportDay: [15_000, 700_000],
  attractionsDay: [0, 1_200_000],
  hotelBudget: [120_000, 2_500_000],
  hotelMid: [250_000, 8_000_000],
};

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/**
 * Validates a cost table (from the model or an Admin edit). Anything missing or not a number is
 * rejected (null → ask again); values are clamped into the bounds and made consistent
 * (mid-range is always above budget).
 */
export function sanitizeCityCosts(raw: unknown): CityCosts | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const out = {} as CityCosts;
  for (const key of COST_KEYS) {
    const value = typeof source[key] === "number" ? source[key] : Number(source[key]);
    if (!Number.isFinite(value) || value < 0) return null;
    const [min, max] = COST_LIMITS[key];
    out[key] = roundTo(
      Math.min(max, Math.max(min, value)),
      key.startsWith("hotel") ? 10_000 : 5_000,
    );
  }
  if (out.foodMid < Math.round(out.foodBudget * 1.15))
    out.foodMid = roundTo(out.foodBudget * 1.4, 5_000);
  if (out.hotelMid < Math.round(out.hotelBudget * 1.2))
    out.hotelMid = roundTo(out.hotelBudget * 1.6, 10_000);
  return out;
}

const TIERS = {
  low: {
    foodBudget: 70_000,
    foodMid: 160_000,
    transportDay: 40_000,
    attractionsDay: 60_000,
    hotelBudget: 250_000,
    hotelMid: 550_000,
  },
  mid: {
    foodBudget: 130_000,
    foodMid: 300_000,
    transportDay: 90_000,
    attractionsDay: 120_000,
    hotelBudget: 500_000,
    hotelMid: 1_100_000,
  },
  high: {
    foodBudget: 220_000,
    foodMid: 500_000,
    transportDay: 150_000,
    attractionsDay: 200_000,
    hotelBudget: 800_000,
    hotelMid: 1_800_000,
  },
} satisfies Record<string, CityCosts>;

const COUNTRY_TIER: Record<string, keyof typeof TIERS> = {
  ID: "low",
  TH: "low",
  VN: "low",
  KH: "low",
  LA: "low",
  PH: "low",
  MY: "low",
  IN: "low",
  TR: "low",
  EG: "low",
  JP: "mid",
  KR: "mid",
  TW: "mid",
  CN: "mid",
  SG: "high",
  HK: "high",
  AU: "high",
  NZ: "high",
  AE: "mid",
  SA: "mid",
  US: "high",
  CA: "high",
  GB: "high",
  CH: "high",
  FR: "high",
  DE: "high",
  IT: "high",
  ES: "mid",
  NL: "high",
};

/** Conservative table when the model cannot give a valid one. */
export function fallbackCosts(countryCode: string): CityCosts {
  return { ...TIERS[COUNTRY_TIER[countryCode.toUpperCase()] ?? "mid"] };
}

const slug = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export const costKey = (city: string, countryCode: string) =>
  `${slug(city) || "kota"}|${countryCode.toLowerCase()}`;

/* ------------------------------------------------------------------------------ budget */

export type BudgetLine = { name: string; amountIdr: number; basis: "tercatat" | "perkiraan" };
export type BudgetPlanInput = {
  days: number;
  travelers: number;
  costs: CityCosts;
  /** One-way fare per traveler in IDR from the recorded fares, or null when none was found. */
  outboundIdr: number | null;
  returnIdr: number | null;
  /** Cheapest eSIM plan for the trip in IDR (one per traveler), or null. */
  esimIdr: number | null;
  /** The traveler's own total budget in IDR (0 = none). */
  totalBudgetIdr: number;
};
export type BudgetPlan = {
  tier: "hemat" | "nyaman";
  lines: BudgetLine[];
  totalIdr: number;
  shortfallIdr: number;
};

const r10k = (value: number) => Math.round(value / 10_000) * 10_000;

function linesFor(input: BudgetPlanInput, tier: "hemat" | "nyaman"): BudgetLine[] {
  const days = Math.max(1, input.days);
  const nights = Math.max(1, days - 1);
  const people = Math.max(1, input.travelers);
  const rooms = Math.ceil(people / 2);
  const food = tier === "hemat" ? input.costs.foodBudget : input.costs.foodMid;
  const hotel = tier === "hemat" ? input.costs.hotelBudget : input.costs.hotelMid;
  const lines: BudgetLine[] = [];
  const out = input.outboundIdr;
  const back = input.returnIdr;
  if (out !== null || back !== null) {
    const both = out !== null && back !== null;
    lines.push({
      name: "Penerbangan",
      amountIdr: r10k(((out ?? back ?? 0) + (back ?? out ?? 0)) * people),
      basis: both ? "tercatat" : "perkiraan",
    });
  }
  lines.push(
    { name: "Akomodasi", amountIdr: r10k(hotel * nights * rooms), basis: "perkiraan" },
    { name: "Makan & minum", amountIdr: r10k(food * days * people), basis: "perkiraan" },
    {
      name: "Transportasi",
      amountIdr: r10k(input.costs.transportDay * days * people),
      basis: "perkiraan",
    },
    {
      name: "Aktivitas",
      amountIdr: r10k(input.costs.attractionsDay * days * people),
      basis: "perkiraan",
    },
  );
  if (input.esimIdr)
    lines.push({
      name: "eSIM & internet",
      amountIdr: r10k(input.esimIdr * people),
      basis: "tercatat",
    });
  const subtotal = lines.reduce((sum, l) => sum + l.amountIdr, 0);
  lines.push({ name: "Darurat", amountIdr: r10k(subtotal * 0.05), basis: "perkiraan" });
  return lines;
}

/**
 * The budget split Travo proposes, built from recorded fares, plan prices and the city's daily
 * costs. Mid-range ("nyaman") when the traveler's budget allows it, else frugal ("hemat"); left-over
 * money goes to shopping, never invented elsewhere.
 */
export function computeBudgetPlan(input: BudgetPlanInput): BudgetPlan {
  let tier: "hemat" | "nyaman" = "nyaman";
  let lines = linesFor(input, tier);
  let total = lines.reduce((s, l) => s + l.amountIdr, 0);
  if (input.totalBudgetIdr > 0 && total > input.totalBudgetIdr) {
    tier = "hemat";
    lines = linesFor(input, tier);
    total = lines.reduce((s, l) => s + l.amountIdr, 0);
  }
  let shortfall = 0;
  if (input.totalBudgetIdr > 0) {
    if (total > input.totalBudgetIdr) shortfall = total - input.totalBudgetIdr;
    else {
      const left = input.totalBudgetIdr - total;
      const shopping = r10k(left * 0.6);
      if (shopping > 0) {
        lines.push({ name: "Belanja", amountIdr: shopping, basis: "perkiraan" });
        total += shopping;
      }
      const reserve = r10k(left - shopping);
      if (reserve > 0) {
        const darurat = lines.find((l) => l.name === "Darurat");
        if (darurat) darurat.amountIdr += reserve;
        else lines.push({ name: "Darurat", amountIdr: reserve, basis: "perkiraan" });
        total += reserve;
      }
    }
  }
  return { tier, lines, totalIdr: total, shortfallIdr: shortfall };
}

/* ------------------------------------------------------------------------------ places */

export type PlaceKind = "makan" | "kafe" | "atraksi" | "belanja" | "taman";
export const PLACE_KIND_LABEL: Record<PlaceKind, string> = {
  makan: "Makan",
  kafe: "Kafe",
  atraksi: "Wisata",
  belanja: "Belanja",
  taman: "Taman",
};
export type PlaceCandidate = {
  id: string;
  name: string;
  kind: PlaceKind;
  lat: number;
  lng: number;
  /** OpenStreetMap opening_hours, when the map has them. */
  hours: string | null;
  area: string;
};

export const isFoodKind = (kind: PlaceKind) => kind === "makan" || kind === "kafe";

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Rough minutes between two points in a city (walking/transit mix). */
export const travelMinutes = (km: number) => Math.max(5, Math.round((km / 18) * 60 + 8));

type Point = { lat: number; lng: number };

/** Deterministic k-means: farthest-first start, 8 rounds. Returns the cluster number per point. */
export function clusterPoints(points: readonly Point[], k: number): number[] {
  const n = points.length;
  if (!n) return [];
  const count = Math.max(1, Math.min(k, n));
  const centers: Point[] = [points[0]!];
  while (centers.length < count) {
    let best = 0;
    let bestDistance = -1;
    points.forEach((point, index) => {
      const nearest = Math.min(...centers.map((c) => haversineKm(point, c)));
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = index;
      }
    });
    centers.push(points[best]!);
  }
  let assign = new Array<number>(n).fill(0);
  for (let round = 0; round < 8; round += 1) {
    assign = points.map((point) => {
      let best = 0;
      let bestDistance = Infinity;
      centers.forEach((center, index) => {
        const d = haversineKm(point, center);
        if (d < bestDistance) {
          bestDistance = d;
          best = index;
        }
      });
      return best;
    });
    for (let c = 0; c < count; c += 1) {
      const members = points.filter((_, i) => assign[i] === c);
      if (!members.length) continue;
      centers[c] = {
        lat: members.reduce((s, m) => s + m.lat, 0) / members.length,
        lng: members.reduce((s, m) => s + m.lng, 0) / members.length,
      };
    }
  }
  return assign;
}

export type DayPool = {
  date: string;
  sights: PlaceCandidate[];
  food: PlaceCandidate[];
  center: Point | null;
};

/**
 * Splits the city's places over the trip days by closeness: sights are clustered, then each day
 * gets the food nearest to its sights. A place is offered to one day only.
 */
export function buildDayPools(
  dates: readonly string[],
  candidates: readonly PlaceCandidate[],
  perDaySights = 5,
  perDayFood = 5,
): DayPool[] {
  const sights = candidates.filter((c) => !isFoodKind(c.kind));
  const food = candidates.filter((c) => isFoodKind(c.kind));
  const assign = clusterPoints(sights, dates.length);
  const pools: DayPool[] = dates.map((date) => ({ date, sights: [], food: [], center: null }));
  // Sparser clusters first, so a thin area is not left with nothing.
  const clusters = [...new Set(assign)];
  clusters.forEach((cluster, index) => {
    const pool = pools[index % pools.length]!;
    const members = sights.filter((_, i) => assign[i] === cluster);
    pool.sights.push(...members);
  });
  for (const pool of pools) {
    pool.sights = pool.sights.slice(0, perDaySights);
    if (pool.sights.length)
      pool.center = {
        lat: pool.sights.reduce((s, p) => s + p.lat, 0) / pool.sights.length,
        lng: pool.sights.reduce((s, p) => s + p.lng, 0) / pool.sights.length,
      };
  }
  const used = new Set<string>();
  for (const pool of pools) {
    const center = pool.center ?? candidates[0] ?? null;
    if (!center) continue;
    const nearest = (kind: PlaceKind, count: number) =>
      food
        .filter((f) => f.kind === kind && !used.has(f.id))
        .sort((a, b) => haversineKm(a, center) - haversineKm(b, center))
        .slice(0, count);
    // Meals first (restaurants), then a couple of cafes, so lunch and dinner are not cafes.
    const near = [...nearest("makan", Math.max(1, perDayFood - 2)), ...nearest("kafe", 2)];
    for (const f of near) used.add(f.id);
    pool.food = near;
  }
  return pools;
}

/* -------------------------------------------------------------------------- the model's plan */

export const PLAN_SLOTS = [
  "sarapan",
  "pagi",
  "makan_siang",
  "sore",
  "makan_malam",
  "malam",
] as const;
export type PlanSlot = (typeof PLAN_SLOTS)[number];
const SLOT_DEFAULT_START: Record<PlanSlot, string> = {
  sarapan: "08:00",
  pagi: "09:30",
  makan_siang: "12:30",
  sore: "15:00",
  makan_malam: "19:00",
  malam: "20:30",
};

/** Flat on purpose (no nulls or unions), like the chat schema. */
export const FULL_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "chips", "days", "checklist", "tips"],
  properties: {
    reply: { type: "string" },
    chips: { type: "array", items: { type: "string" } },
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "items"],
        properties: {
          date: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "slot", "start", "end", "note"],
              properties: {
                id: { type: "string" },
                slot: { type: "string", enum: [...PLAN_SLOTS] },
                start: { type: "string" },
                end: { type: "string" },
                note: { type: "string" },
              },
            },
          },
        },
      },
    },
    checklist: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "daysBefore"],
        properties: { title: { type: "string" }, daysBefore: { type: "integer" } },
      },
    },
    tips: { type: "array", items: { type: "string" } },
  },
} as const;

const clean = (value: unknown, max: number) =>
  (typeof value === "string" ? value : "").replace(/\s+/g, " ").trim().slice(0, max);
const hhmm = (value: unknown) => {
  const m = String(value ?? "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return m ? `${m[1]}:${m[2]}` : null;
};
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const hhmmOf = (total: number) =>
  `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

export type FullPlanContext = {
  dates: readonly string[];
  candidates: readonly PlaceCandidate[];
  costs: CityCosts;
  tier: "hemat" | "nyaman";
  travelers: number;
  /** IDR → trip currency multiplier. */
  fxFromIdr: number;
  toMinor: (major: number) => number;
  departureDate: string | null;
  maxItems: number;
  today: string;
};

export type FullPlanResult = {
  reply: string;
  chips: string[];
  tips: string[];
  agenda: AgendaChange[];
  checklist: { title: string; dueDate: string | null }[];
  dropped: { unknownPlace: number; badDate: number; closed: number };
};

const dayBefore = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

/**
 * Turns the model's answer into agenda changes and checklist items. A place must be one of the
 * offered candidates (so it has a real point on the map), a date must be a trip day, costs come
 * from the city's table, and a place the map says is closed at that hour is moved or marked.
 */
export function cleanFullPlan(parsed: unknown, ctx: FullPlanContext): FullPlanResult {
  const raw = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  const byId = new Map(ctx.candidates.map((c) => [c.id, c]));
  const dropped = { unknownPlace: 0, badDate: 0, closed: 0 };
  const agenda: AgendaChange[] = [];
  const usedIds = new Set<string>();
  const foodPerPerson = ctx.tier === "hemat" ? ctx.costs.foodBudget : ctx.costs.foodMid;
  const days = Array.isArray(raw["days"]) ? (raw["days"] as unknown[]) : [];
  for (const day of days) {
    const d = (day && typeof day === "object" ? day : {}) as Record<string, unknown>;
    const date = typeof d["date"] === "string" ? d["date"] : "";
    if (!ctx.dates.includes(date)) {
      dropped.badDate += 1;
      continue;
    }
    const rows = Array.isArray(d["items"]) ? (d["items"] as unknown[]) : [];
    const items: { start: number; change: AgendaChange }[] = [];
    for (const row of rows) {
      if (agenda.length + items.length >= ctx.maxItems) break;
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      const place = byId.get(clean(r["id"], 24));
      if (!place || usedIds.has(place.id)) {
        dropped.unknownPlace += 1;
        continue;
      }
      const slot = (PLAN_SLOTS as readonly string[]).includes(String(r["slot"]))
        ? (String(r["slot"]) as PlanSlot)
        : isFoodKind(place.kind)
          ? "makan_siang"
          : "pagi";
      const start = hhmm(r["start"]) ?? SLOT_DEFAULT_START[slot];
      let end = hhmm(r["end"]);
      if (!end || minutes(end) <= minutes(start)) {
        const length = isFoodKind(place.kind) ? 75 : 105;
        end = hhmmOf(Math.min(23 * 60 + 30, minutes(start) + length));
      }
      let hours: AgendaChange["hours"] = null;
      let dayHours: string | null = null;
      if (place.hours) {
        const weekday = weekdayIndex(date);
        if (weekday !== null) {
          const open = isOpenAt(place.hours, weekday, minutes(start));
          dayHours = hoursForDay(place.hours, weekday);
          hours = { raw: place.hours, open };
          if (open === false) dropped.closed += 1;
        }
      }
      const perPerson = isFoodKind(place.kind)
        ? place.kind === "kafe"
          ? foodPerPerson / 8
          : foodPerPerson / 3
        : place.kind === "belanja"
          ? 0
          : ctx.costs.attractionsDay / 2;
      const costIdr = perPerson * ctx.travelers;
      // The label follows the real hour and place type, not the model's slot word.
      const hour = minutes(start) / 60;
      const meal =
        place.kind === "kafe"
          ? "Ngopi"
          : hour < 10.5
            ? "Sarapan"
            : hour < 16
              ? "Makan siang"
              : "Makan malam";
      const label = isFoodKind(place.kind) ? `${meal}: ${place.name}` : place.name;
      const noteText = clean(r["note"], 240);
      usedIds.add(place.id);
      items.push({
        start: minutes(start),
        change: {
          op: "add",
          itemId: null,
          title: label.slice(0, 160),
          date,
          startTime: start,
          endTime: end,
          location: place.area || null,
          category: isFoodKind(place.kind)
            ? "food"
            : place.kind === "belanja"
              ? "shopping"
              : "sightseeing",
          estimatedCostMinor: costIdr > 0 ? ctx.toMinor(costIdr * ctx.fxFromIdr) : null,
          place: place.name,
          note: noteText || null,
          lat: place.lat,
          lng: place.lng,
          hours: hours ? { raw: dayHours ?? place.hours ?? "", open: hours.open } : null,
          placeKind: place.kind,
        },
      });
    }
    items.sort((a, b) => a.start - b.start);
    agenda.push(...items.map((i) => i.change));
  }
  const checklist = (Array.isArray(raw["checklist"]) ? (raw["checklist"] as unknown[]) : [])
    .map((row) => {
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      const title = clean(r["title"], 120);
      const before = Number(r["daysBefore"]);
      let dueDate: string | null = null;
      if (ctx.departureDate && Number.isFinite(before) && before >= 0 && before <= 180) {
        const due = dayBefore(ctx.departureDate, Math.round(before));
        dueDate = due >= ctx.today ? due : ctx.today;
      }
      return { title, dueDate };
    })
    .filter((i, idx, all) => i.title && all.findIndex((x) => x.title === i.title) === idx)
    .slice(0, 10);
  const chips = (Array.isArray(raw["chips"]) ? (raw["chips"] as unknown[]) : [])
    .map((c) => clean(c, 36))
    .filter((c, i, all) => c && all.indexOf(c) === i)
    .slice(0, 4);
  const tips = (Array.isArray(raw["tips"]) ? (raw["tips"] as unknown[]) : [])
    .map((t) => clean(t, 160))
    .filter(Boolean)
    .slice(0, 3);
  return { reply: clean(raw["reply"], 450), chips, tips, agenda, checklist, dropped };
}

/* ------------------------------------------------------------------------- prompt context */

export type PlanResearch = {
  /** Cheapest recorded fare per traveler for the trip dates, in IDR, with when it was recorded. */
  outbound: { priceIdr: number; date: string } | null;
  returnLeg: { priceIdr: number; date: string } | null;
  cheapestOutbound: { priceIdr: number; date: string } | null;
  esim: { name: string; days: number; priceIdr: number } | null;
  guides: { title: string; slug: string }[];
  sourcesDown: string[];
};

export const formatIdr = (value: number) =>
  `Rp ${Math.round(value).toLocaleString("id-ID").replace(/,/g, ".")}`;

/** Facts the server worked out, shown as rows under Travo's sentence. Pure strings, no model. */
export function buildStrategyRows(input: {
  budget: BudgetPlan;
  research: PlanResearch;
  travelers: number;
  totalBudgetIdr: number;
}): string[] {
  const rows: string[] = [];
  const { budget, research } = input;
  if (research.outbound)
    rows.push(
      `Tiket pergi: ${formatIdr(research.outbound.priceIdr)}/orang (tercatat ${research.outbound.date})`,
    );
  else rows.push("Tiket: harga belum tercatat, belum termasuk di anggaran");
  const cheapest = research.cheapestOutbound;
  if (cheapest && research.outbound && cheapest.priceIdr < research.outbound.priceIdr) {
    const saving = (research.outbound.priceIdr - cheapest.priceIdr) * input.travelers;
    if (saving >= 50_000)
      rows.push(`Hemat tiket: berangkat ${cheapest.date} bisa hemat ${formatIdr(saving)}`);
  }
  rows.push(`Gaya anggaran: ${budget.tier === "hemat" ? "hemat" : "nyaman"} (perkiraan)`);
  rows.push(`Total perkiraan: ${formatIdr(budget.totalIdr)}`);
  if (budget.shortfallIdr > 0)
    rows.push(
      `Kurang dari anggaranmu: ${formatIdr(budget.shortfallIdr)} (kurangi hari, hotel, atau pilih tanggal tiket lebih murah)`,
    );
  else if (input.totalBudgetIdr > 0)
    rows.push(`Sisa dari anggaranmu: ${formatIdr(input.totalBudgetIdr - budget.totalIdr)}`);
  if (research.esim)
    rows.push(`eSIM: ${research.esim.name} ${formatIdr(research.esim.priceIdr)}/orang`);
  return rows;
}

export function buildFullPlanPrompt(today: string, tone: string): string {
  const lines = [
    "You are Travo, the friendly trip assistant of Djiwa Travel. Answer ONLY with JSON that follows the schema. Casual, polite Indonesian, aku/kamu.",
    "Task: build the day-by-day itinerary of this trip from the offered places. You may ONLY use places listed under days[].sights and days[].food (and their `id`). Never write a place name yourself and never invent ids.",
    "Per day: 2-3 sights (sorted by closeness and opening hours), a lunch and a dinner chosen from that day's food list, optionally breakfast or a cafe. Realistic times (24h HH:MM), leave time to travel between places; first day starts later and the last day ends earlier if flights are known. Respect opening hours shown (`jam=`); when unknown, still plan but say 'cek jam buka' in `note`.",
    "Match the traveler's interests and pace from their message and the trip. `note` is one short reason or tip per item (max 120 chars), empty when nothing to add.",
    "`reply`: one or two short sentences introducing the plan (no markdown, no emoji, max 400 chars). `tips`: up to 3 helpful, non-price tips about this city. `chips`: 2-4 short next-step taps. `checklist`: up to 8 preparation items specific to the destination (passport, visa, eSIM, adapter, local rules, tax-free, etc.) with `daysBefore` = how many days before departure to do it (integer).",
    "Never state prices or opening hours that are not given; the server adds the numbers.",
    `Today is ${today}.`,
  ];
  if (tone) lines.push(`House style from the team: ${tone}`);
  return lines.join("\n");
}

export function buildFullPlanContext(input: {
  name: string;
  destination: string;
  city: string;
  dates: readonly string[];
  travelers: number;
  tier: "hemat" | "nyaman";
  pools: readonly DayPool[];
  existing: readonly string[];
}): string {
  const short = (p: PlaceCandidate) =>
    `${p.id} | ${p.name} | ${PLACE_KIND_LABEL[p.kind]} | ${p.area}${p.hours ? ` | jam=${p.hours.slice(0, 60)}` : ""}`;
  return JSON.stringify({
    trip: {
      name: input.name,
      destination: input.destination,
      city: input.city,
      travelers: input.travelers,
      style: input.tier,
    },
    existingAgenda: input.existing,
    days: input.pools.map((pool, index) => ({
      day: index + 1,
      date: pool.date,
      sights: pool.sights.map(short),
      food: pool.food.map(short),
    })),
  });
}
