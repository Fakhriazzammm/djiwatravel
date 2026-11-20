import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  research: {
    outbound: { priceIdr: 3_400_000, date: "2027-01-10" } as {
      priceIdr: number;
      date: string;
    } | null,
    returnLeg: { priceIdr: 4_800_000, date: "2027-01-14" } as {
      priceIdr: number;
      date: string;
    } | null,
    cheapestOutbound: null as { priceIdr: number; date: string } | null,
    esim: { name: "Japan 10GB 30Days", days: 30, priceIdr: 150_000 } as {
      name: string;
      days: number;
      priceIdr: number;
    } | null,
    guides: [],
    sourcesDown: [] as string[],
  },
  searchWeb: vi.fn(async (_q: string) => [{ title: "t", url: "https://example.com/a" }]),
  webAmount: 450_000,
  webSlot: true,
}));

vi.mock("@/lib/receipt-scan.server", () => ({
  fetchFxRate: async () => ({ rate: 1, rateDate: "2027-01-01", source: "test" }),
}));
vi.mock("@/lib/place-ideas.server", () => ({
  searchWeb: (q: string) => h.searchWeb(q),
  fetchPages: async () => [{ title: "t", url: "https://example.com/a", text: "x".repeat(300) }],
  reserveSearchSlot: () => h.webSlot,
}));
vi.mock("@/lib/trip-assistant-places.server", () => ({ nominatimVenue: async () => null }));
vi.mock("@/lib/trip-plan.server", () => ({
  getCityCosts: async () => ({
    costs: {
      foodBudget: 150_000,
      foodMid: 300_000,
      transportDay: 80_000,
      attractionsDay: 120_000,
      hotelBudget: 450_000,
      hotelMid: 900_000,
    },
    source: "admin" as const,
    usage: { input: 0, output: 0 },
  }),
  loadPlanResearch: async () => ({ research: h.research, cards: [], destinationCode: "TYO" }),
  getMustSeePlaces: async () => ({ places: [], usage: { input: 0, output: 0 } }),
  getPlaceCandidates: async () =>
    Array.from({ length: 12 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Tempat ${i + 1}`,
      kind: i < 6 ? "atraksi" : "makan",
      area: `Area ${i % 3}`,
      lat: 35 + i * 0.01,
      lng: 135 + i * 0.01,
      popular: i < 3,
      hours: null,
    })),
}));
vi.mock("@/lib/trip-assistant.server", () => ({
  askModel: async (
    _model: string,
    _system: string,
    messages: { content: string }[],
    _max: number,
    _onReply: unknown,
    schema?: { name: string },
  ) => {
    if (schema?.name === "web_price")
      return {
        parsed: { amount: h.webAmount, currency: "IDR", confident: true, source: 1 },
        usage: { input: 1, output: 1 },
      };
    const data = JSON.parse(messages[0]!.content.split("\n")[1]!.replace(/^\s*/, "")) as {
      days: { date: string; sights: string[]; food: string[] }[];
    };
    return {
      parsed: {
        reply: "Rencana santai.",
        chips: [],
        tips: ["Naik kereta."],
        checklist: [],
        days: data.days.map((day) => ({
          date: day.date,
          items: [
            {
              id: day.sights[0]!.split(" | ")[0],
              slot: "pagi",
              start: "09:00",
              end: "10:30",
              note: "",
            },
            {
              id: day.food[0]!.split(" | ")[0],
              slot: "makan_siang",
              start: "12:30",
              end: "13:30",
              note: "",
            },
          ],
        })),
      },
      usage: { input: 10, output: 20 },
    };
  },
}));

import { buildTemplateFromOwnData } from "@/lib/trip-template-plan.server";

const input = {
  owner: { id: "u1", email: null, guest: false },
  generationModel: "m",
  tone: "",
  country: { code: "JP", name: "Jepang" },
  city: { name: "Kyoto", lat: 35, lng: 135 },
  days: 2,
  style: "auto" as const,
  interests: ["kuliner"],
  origin: null,
};

beforeEach(() => {
  h.searchWeb.mockClear();
  h.research.outbound = { priceIdr: 3_400_000, date: "2027-01-10" };
  h.research.returnLeg = { priceIdr: 4_800_000, date: "2027-01-14" };
  h.research.cheapestOutbound = null;
  h.research.esim = { name: "Japan 10GB 30Days", days: 30, priceIdr: 150_000 };
  h.webAmount = 450_000;
  h.webSlot = true;
  process.env["TINYFISH_API_KEY"] = "test-key";
});

describe("template drafted from our own data first", () => {
  it("uses recorded fares and the eSIM catalog, and asks the web only for visa and insurance", async () => {
    const result = await buildTemplateFromOwnData(input);
    expect(result).toMatchObject({ status: "ok" });
    if (result.status !== "ok") return;
    const lines = Object.fromEntries(
      (result.draft.budget?.categories ?? []).map((c) => [c.name, c]),
    );
    expect(lines["Tiket pesawat"]?.amountIdr).toBe(8_200_000);
    expect(lines["Tiket pesawat"]?.note).toContain("fitur tiket kita");
    expect(lines["eSIM & internet"]?.amountIdr).toBe(150_000);
    expect(lines["Visa"]?.note).toContain("internet");
    expect(lines["Asuransi perjalanan"]).toBeTruthy();
    // Two web lookups only (visa, insurance): flights and eSIM came from our features.
    expect(h.searchWeb).toHaveBeenCalledTimes(2);
    expect(result.draft.items.length).toBeGreaterThanOrEqual(4);
    expect(result.draft.items.every((item) => item.lat != null)).toBe(true);
    expect(result.sources.join(" ")).toContain("harga tercatat di fitur tiket Djiwa");
  });

  it("falls back to the month's cheapest recorded fare before the web", async () => {
    h.research.outbound = null;
    h.research.returnLeg = null;
    h.research.cheapestOutbound = { priceIdr: 3_000_000, date: "2027-01-20" };
    const result = await buildTemplateFromOwnData(input);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(h.searchWeb).toHaveBeenCalledTimes(2);
    expect(result.sources[0]).toContain("tarif termurah bulan itu");
  });

  it("asks the web for the flight only when no fare is recorded, and marks it", async () => {
    h.research.outbound = null;
    h.research.returnLeg = null;
    h.webAmount = 6_000_000;
    const result = await buildTemplateFromOwnData(input);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(h.searchWeb).toHaveBeenCalledTimes(3);
    const flight = result.draft.budget?.categories.find((c) => c.name === "Tiket pesawat");
    expect(flight?.note).toContain("internet");
    expect(result.sources[0]).toContain("perkiraan dari internet");
  });

  it("never invents a line: without the web key or a search slot there is no visa or flight line", async () => {
    h.research.outbound = null;
    h.research.returnLeg = null;
    h.research.esim = null;
    delete process.env["TINYFISH_API_KEY"];
    const result = await buildTemplateFromOwnData(input);
    if (result.status !== "ok") throw new Error("expected ok");
    const names = (result.draft.budget?.categories ?? []).map((c) => c.name);
    expect(names).not.toContain("Tiket pesawat");
    expect(names).not.toContain("eSIM & internet");
    expect(names).not.toContain("Visa");
    expect(h.searchWeb).not.toHaveBeenCalled();
    expect(names).toContain("Akomodasi");
  });

  it("rejects a web price outside sane bounds", async () => {
    h.webAmount = 90_000_000;
    const result = await buildTemplateFromOwnData(input);
    if (result.status !== "ok") throw new Error("expected ok");
    const names = (result.draft.budget?.categories ?? []).map((c) => c.name);
    expect(names).not.toContain("Visa");
    expect(names).not.toContain("Asuransi perjalanan");
  });
});
