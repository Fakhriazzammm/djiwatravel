import { fetchFxRate } from "./receipt-scan.server";
import type { TripOwner } from "./guest-trips.server";
import { fetchPages, reserveSearchSlot, searchWeb } from "./place-ideas.server";
import { askModel } from "./trip-assistant.server";
import { nominatimVenue } from "./trip-assistant-places.server";
import {
  buildDayPools,
  buildFullPlanContext,
  buildFullPlanPrompt,
  cleanFullPlan,
  computeBudgetPlan,
  costKey,
  FULL_PLAN_SCHEMA,
} from "./trip-plan";
import {
  getCityCosts,
  getMustSeePlaces,
  getPlaceCandidates,
  loadPlanResearch,
} from "./trip-plan.server";
import {
  describeSources,
  itemsFromAgenda,
  templateBudgetFromPlan,
  type WebLine,
} from "./trip-template-plan";
import { type TemplateDraft } from "./trip-templates";

/**
 * A template drafted from our own data first: recorded fares and the eSIM catalog (the flight and
 * eSIM features), the city cost table, and places found on the map. The internet (TinyFish search
 * plus a reading model) is only asked for what none of our features has: visa and insurance, and
 * a flight price when no fare is recorded. Nothing is invented: a line without a source is left out.
 */

export type TemplatePlanInput = {
  owner: TripOwner;
  generationModel: string;
  tone: string;
  country: { code: string; name: string };
  city: { name: string; lat?: number | undefined; lng?: number | undefined };
  days: number;
  style: "hemat" | "nyaman" | "auto";
  interests: string[];
  origin: { code: string; name: string } | null;
};

export type TemplatePlanResult =
  | { status: "ok"; draft: TemplateDraft; sources: string[]; usage: Usage }
  | { status: "error"; message: string; usage: Usage };

type Usage = { input: number; output: number };

const WEB_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["amount", "currency", "confident", "source"],
  properties: {
    amount: { type: "number" },
    currency: { type: "string" },
    confident: { type: "boolean" },
    source: { type: "integer" },
  },
} as const;

/** One typical price per traveler read from the web, in rupiah; null when nothing clear was found. */
async function webEstimateIdr(
  what: string,
  query: string,
  bounds: { min: number; max: number },
  ask: Ask,
  addUsage: (u: Usage) => void,
): Promise<number | null> {
  if (!process.env["TINYFISH_API_KEY"] || !reserveSearchSlot()) return null;
  try {
    const found = await searchWeb(query);
    const pages = await fetchPages(found.slice(0, 3));
    if (!pages.length) return null;
    const outcome = await ask(
      "You read web pages and extract ONE typical price. Use only numbers that appear in the sources; never guess. If the sources do not state a clear price (or say none is needed), set confident=false. `amount` is the price for ONE traveler for what is asked, `currency` its ISO 4217 code, `source` the 1-based number of the page it came from.",
      `Asked: ${what}\n\n${pages.map((page, index) => `SOURCE ${index + 1} (${page.url}):\n${page.text}`).join("\n\n")}`,
      { name: "web_price", schema: WEB_SCHEMA },
    );
    addUsage(outcome.usage);
    const row = (outcome.parsed ?? {}) as Record<string, unknown>;
    const amount = Number(row["amount"]);
    const currency = String(row["currency"] ?? "")
      .trim()
      .toUpperCase();
    if (row["confident"] !== true || !Number.isFinite(amount) || amount <= 0) return null;
    if (!/^[A-Z]{3}$/.test(currency)) return null;
    const fx = currency === "IDR" ? { rate: 1 } : await fetchFxRate({ from: currency, to: "IDR" });
    if (!fx) return null;
    const idr = Math.round((amount * fx.rate) / 10_000) * 10_000;
    return idr >= bounds.min && idr <= bounds.max ? idr : null;
  } catch {
    return null;
  }
}

type Ask = (
  system: string,
  user: string,
  schema: { name: string; schema: object },
) => ReturnType<typeof askModel>;

const jakartaToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export async function buildTemplateFromOwnData(
  input: TemplatePlanInput,
): Promise<TemplatePlanResult> {
  let usage: Usage = { input: 0, output: 0 };
  const addUsage = (u: Usage) => {
    usage = { input: usage.input + u.input, output: usage.output + u.output };
  };
  const fail = (message: string): TemplatePlanResult => ({ status: "error", message, usage });
  const ask: Ask = (system, user, schema) =>
    askModel(
      input.generationModel,
      system,
      [{ role: "user", content: user }],
      700,
      undefined,
      schema,
    );
  const { city, country } = input;
  const today = jakartaToday();
  // Fares are looked up for a date a few weeks ahead: a template has no date of its own.
  const departure = addDays(today, 45);
  const dates = Array.from({ length: input.days }, (_, i) => addDays(departure, i));

  try {
    const anchor =
      city.lat != null && city.lng != null
        ? { lat: city.lat, lng: city.lng }
        : await nominatimVenue(`${city.name}, ${country.name}`, null).then((hit) =>
            hit ? { lat: hit.lat, lng: hit.lng } : null,
          );
    if (!anchor)
      return fail(`Aku belum menemukan ${city.name} di peta. Coba tulis nama kotanya lagi.`);

    const [costs, research] = await Promise.all([
      getCityCosts({ name: city.name, countryCode: country.code }, ask),
      loadPlanResearch({
        owner: input.owner,
        originCode: input.origin?.code ?? "JKT",
        cityName: city.name,
        countryName: country.name,
        countryCode: country.code,
        departureDate: departure,
        returnDate: dates.at(-1)!,
        days: input.days,
        flights: true,
        esim: true,
      }),
    ]);
    addUsage(costs.usage);
    const r = research.research;

    // 1) flights from our own fare records, 2) the month's cheapest recorded fare, 3) the web.
    let flights: "tercatat" | "bulan" | "internet" | "tidak ada" = "tidak ada";
    let outbound = r.outbound?.priceIdr ?? null;
    let back = r.returnLeg?.priceIdr ?? null;
    if (outbound !== null || back !== null) flights = "tercatat";
    else if (r.cheapestOutbound) {
      outbound = r.cheapestOutbound.priceIdr;
      flights = "bulan";
    }
    const web: string[] = [];
    if (flights === "tidak ada") {
      const roundTrip = await webEstimateIdr(
        `harga tiket pesawat pulang pergi ${input.origin?.name ?? "Jakarta"} ke ${city.name} ${country.name} per orang`,
        `harga tiket pesawat ${input.origin?.name ?? "Jakarta"} ke ${city.name} pulang pergi`,
        { min: 500_000, max: 40_000_000 },
        ask,
        addUsage,
      );
      if (roundTrip) {
        outbound = Math.round(roundTrip / 2);
        back = outbound;
        flights = "internet";
      }
    }

    const budgetPlan = computeBudgetPlan({
      days: input.days,
      travelers: 1,
      costs: costs.costs,
      outboundIdr: outbound,
      returnIdr: back,
      esimIdr: r.esim?.priceIdr ?? null,
      totalBudgetIdr: 0,
      ...(input.style !== "auto" ? { forceTier: input.style } : {}),
    });

    // Visa and insurance are not features of ours yet: ask the web, and leave the line out when unsure.
    const extra: WebLine[] = [];
    const visa = await webEstimateIdr(
      `biaya visa turis ${country.name} untuk paspor Indonesia (nol bila bebas visa)`,
      `biaya visa turis ${country.name} paspor Indonesia`,
      { min: 50_000, max: 5_000_000 },
      ask,
      addUsage,
    );
    const insurance = await webEstimateIdr(
      `premi asuransi perjalanan ${country.name} ${input.days} hari per orang`,
      `harga asuransi perjalanan ke ${country.name} ${input.days} hari`,
      { min: 50_000, max: 3_000_000 },
      ask,
      addUsage,
    );
    if (visa) {
      extra.push({ name: "Visa", amountIdr: visa, note: "Dari internet, cek ketentuan terbaru" });
      web.push("Visa");
    }
    if (insurance) {
      extra.push({
        name: "Asuransi perjalanan",
        amountIdr: insurance,
        note: "Dari internet, bandingkan sebelum membeli",
      });
      web.push("Asuransi");
    }
    if (flights === "internet") web.push("Tiket pesawat");

    const must = await getMustSeePlaces(
      costKey(city.name, country.code),
      { name: city.name, countryName: country.name },
      anchor,
      ask,
    );
    addUsage(must.usage);
    const candidates = await getPlaceCandidates(costKey(city.name, country.code), anchor, {
      budgetMs: 16_000,
      extra: must.places,
    });
    const sights = candidates.filter((c) => c.kind !== "makan" && c.kind !== "kafe").length;
    if (candidates.length < 8 || sights < 3)
      return fail(
        `Data tempat di peta untuk ${city.name} masih tipis, jadi aku tidak mau mengarang. Coba kota yang lebih besar.`,
      );

    const pools = buildDayPools(dates, candidates);
    const interests = input.interests.length ? ` Minat: ${input.interests.join(", ")}.` : "";
    const outcome = await askModel(
      input.generationModel,
      buildFullPlanPrompt(today, input.tone),
      [
        {
          role: "user",
          content: `DATA (JSON):\n${buildFullPlanContext({
            name: `${city.name} ${input.days} hari`,
            destination: country.name,
            city: city.name,
            dates,
            travelers: 1,
            tier: budgetPlan.tier,
            pools,
            existing: [],
            ...(input.interests.length ? { interests: input.interests } : {}),
          })}\n\nPERMINTAAN TRAVELER:\nSusun template itinerary ${input.days} hari di ${city.name}.${interests}`,
        },
      ],
      6000,
      undefined,
      { name: "full_plan", schema: FULL_PLAN_SCHEMA },
    );
    addUsage(outcome.usage);
    const plan = cleanFullPlan(outcome.parsed, {
      dates,
      candidates,
      costs: costs.costs,
      tier: budgetPlan.tier,
      travelers: 1,
      fxFromIdr: 1,
      toMinor: (major) => Math.round(major),
      departureDate: dates[0] ?? null,
      maxItems: Math.min(input.days * 6, 48),
      today,
    });
    if (plan.agenda.length < Math.min(3, input.days * 2))
      return fail("Template belum berhasil disusun. Coba kirim lagi.");

    const items = itemsFromAgenda(plan.agenda, dates, city.name);
    const flightNote =
      flights === "tercatat"
        ? `Harga tercatat fitur tiket kita, ${input.origin?.name ?? "Jakarta"} pulang-pergi (bisa berubah)`
        : flights === "bulan"
          ? "Tarif termurah bulan itu di fitur tiket kita (bisa berubah)"
          : "Perkiraan dari internet, cek ulang di pencarian tiket";
    const budget = templateBudgetFromPlan({
      lines: budgetPlan.lines,
      city: city.name,
      costSource: costs.source,
      flightNote,
      esimName: r.esim?.name ?? null,
      extra,
    });
    const description = [plan.reply, plan.tips[0]].filter(Boolean).join(" ").slice(0, 600);
    return {
      status: "ok",
      usage,
      draft: {
        title: `${city.name} ${input.days} Hari`,
        description,
        destinationName: `${city.name}, ${country.name}`,
        destinationCode: country.code.toUpperCase(),
        days: input.days,
        items,
        budget,
      },
      sources: describeSources({
        flights,
        esim: Boolean(r.esim),
        costSource: costs.source,
        places: items.filter((item) => item.lat != null).length,
        web,
      }),
    };
  } catch (error) {
    console.error("[trip-template-plan] failed", error instanceof Error ? error.message : error);
    return fail("Travo sedang sibuk. Coba lagi sebentar lagi.");
  }
}
