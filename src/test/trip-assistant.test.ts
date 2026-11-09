import { describe, expect, it } from "vitest";
import { validateAdminSetting } from "@/lib/admin-settings";
import {
  DEFAULT_TRIP_ASSISTANT_CONFIG,
  buildAssistantContext,
  buildAssistantSystemPrompt,
  buildNudges,
  cleanAssistantReply,
  detectIntent,
  extractReplyPrefix,
  pickReminder,
  isGenerationIntent,
  normalizeTripAssistantConfig,
  parseJsonLoose,
  parseTripAssistantConfig,
  toMinor,
  type CleanContext,
  type TripFacts,
} from "@/lib/trip-assistant";
import { allowAssistantBurst } from "@/lib/trip-assistant.server";

const ID = "11111111-1111-4111-8111-111111111111";
const ctx = (over: Partial<CleanContext> = {}): CleanContext => ({
  config: DEFAULT_TRIP_ASSISTANT_CONFIG,
  currency: "IDR",
  departureDate: "2026-11-07",
  returnDate: "2026-11-12",
  itemIds: new Set([ID]),
  budgetNames: [],
  today: "2026-11-09",
  ...over,
});
const row = (over: Record<string, unknown> = {}) => ({
  op: "add",
  id: "",
  title: "Sarapan Tsukiji",
  date: "2026-11-09",
  start: "08:30",
  end: "",
  location: "Tsukiji",
  category: "food",
  cost: 150000,
  note: "",
  ...over,
});
const reply = (over: Record<string, unknown> = {}) => ({
  reply: "Ini usulan.",
  chips: [],
  multi: false,
  kind: "agenda",
  title: "Hari ke-3",
  agenda: [row()],
  budget: { total: 0, categories: [] },
  checklist: [],
  expense: { description: "", amount: 0, currency: "", date: "", category: "" },
  ...over,
});

describe("tripAssistant admin setting", () => {
  it("fills defaults and rejects values outside the safe range", () => {
    expect(parseTripAssistantConfig({})).toEqual(DEFAULT_TRIP_ASSISTANT_CONFIG);
    expect(parseTripAssistantConfig({ dailyMessages: 5, guestDailyMessages: 0 })).toMatchObject({
      dailyMessages: 5,
      guestDailyMessages: 0,
    });
    expect(() => parseTripAssistantConfig({ dailyMessages: 0 })).toThrow(/dailyMessages/);
    expect(() => parseTripAssistantConfig({ maxAgendaItems: 99 })).toThrow(/maxAgendaItems/);
    expect(() => parseTripAssistantConfig({ model: "gpt-x" })).toThrow(/model/);
    expect(() => parseTripAssistantConfig({ tone: "x".repeat(301) })).toThrow(/tone/);
    expect(() => parseTripAssistantConfig({ enabled: "yes" })).toThrow(/enabled/);
  });

  it("falls back to defaults on a bad stored value and is a known Admin setting", () => {
    expect(normalizeTripAssistantConfig({ dailyMessages: -1 })).toEqual(
      DEFAULT_TRIP_ASSISTANT_CONFIG,
    );
    expect(validateAdminSetting("tripAssistant", DEFAULT_TRIP_ASSISTANT_CONFIG)).toBe(true);
    expect(() => validateAdminSetting("tripAssistant", { historyDays: 1 })).toThrow();
  });

  it("uses the cheap model to talk and the stronger one to build", () => {
    expect(DEFAULT_TRIP_ASSISTANT_CONFIG.model).toBe("glm-5.3-flash");
    expect(isGenerationIntent("plan")).toBe(true);
    expect(isGenerationIntent("budget")).toBe(true);
    expect(isGenerationIntent("tidy")).toBe(true);
    expect(isGenerationIntent("chat")).toBe(false);
    expect(isGenerationIntent("expense")).toBe(false);
  });
});

describe("detectIntent", () => {
  it("reads Indonesian requests", () => {
    expect(detectIntent("Bantu atur anggaran 15 juta")).toBe("budget");
    expect(detectIntent("buatkan itinerary hari ke-3")).toBe("plan");
    expect(detectIntent("rapikan agenda, ada yang bentrok?")).toBe("tidy");
    expect(detectIntent("apa persiapan yang belum?")).toBe("checklist");
    expect(detectIntent("ramen 1.200 yen")).toBe("chat");
    expect(detectIntent("catat makan ramen 1200 yen")).toBe("expense");
    expect(detectIntent("cuaca besok bagaimana?")).toBe("chat");
  });
});

describe("cleanAssistantReply", () => {
  it("turns a valid agenda answer into a proposal with minor-unit money", () => {
    const out = cleanAssistantReply(reply(), ctx());
    expect(out.proposal?.payload).toMatchObject({
      kind: "agenda",
      items: [
        {
          op: "add",
          title: "Sarapan Tsukiji",
          date: "2026-11-09",
          startTime: "08:30",
          estimatedCostMinor: 15_000_000,
        },
      ],
    });
  });

  it("drops dates outside the trip, unknown ids and bad times", () => {
    const out = cleanAssistantReply(
      reply({
        agenda: [
          row({ date: "2027-01-01" }),
          row({ op: "update", id: "22222222-2222-4222-8222-222222222222" }),
          row({ op: "update", id: ID, start: "9pm", title: "Geser" }),
        ],
      }),
      ctx(),
    );
    expect(out.proposal?.payload).toMatchObject({
      items: [{ op: "update", itemId: ID, startTime: null }],
    });
    expect((out.proposal!.payload as { items: unknown[] }).items).toHaveLength(1);
  });

  it("returns no proposal when nothing valid is left", () => {
    const out = cleanAssistantReply(reply({ agenda: [row({ date: "nope" })] }), ctx());
    expect(out.proposal).toBeNull();
    expect(out.dropped).toBe("agenda_empty");
    expect(out.reply).toBe("Ini usulan.");
  });

  it("respects the Admin switches", () => {
    const off = { ...DEFAULT_TRIP_ASSISTANT_CONFIG, allowAgenda: false, allowBudget: false };
    expect(cleanAssistantReply(reply(), ctx({ config: off })).proposal).toBeNull();
    expect(
      cleanAssistantReply(
        reply({
          kind: "budget",
          budget: { total: 1e6, categories: [{ name: "Makan", amount: 5e5 }] },
        }),
        ctx({ config: off }),
      ).proposal,
    ).toBeNull();
  });

  it("caps the number of activities", () => {
    const many = Array.from({ length: 20 }, (_, i) => row({ title: `Tempat ${i}` }));
    const out = cleanAssistantReply(reply({ agenda: many }), ctx());
    expect((out.proposal!.payload as { items: unknown[] }).items).toHaveLength(
      DEFAULT_TRIP_ASSISTANT_CONFIG.maxAgendaItems,
    );
  });

  it("scales a budget split that is larger than its total", () => {
    const out = cleanAssistantReply(
      reply({
        kind: "budget",
        agenda: [],
        budget: {
          total: 10_000_000,
          categories: [
            { name: "Penerbangan", amount: 8_000_000 },
            { name: "Akomodasi", amount: 8_000_000 },
          ],
        },
      }),
      ctx(),
    );
    const payload = out.proposal!.payload as {
      budget: { totalMinor: number; categories: { allocatedMinor: number }[] };
    };
    const sum = payload.budget.categories.reduce((s, c) => s + c.allocatedMinor, 0);
    expect(payload.budget.totalMinor).toBe(1_000_000_000);
    expect(sum).toBeLessThanOrEqual(payload.budget.totalMinor);
  });

  it("reads an expense and defaults to the trip currency and today", () => {
    const out = cleanAssistantReply(
      reply({
        kind: "expense",
        agenda: [],
        expense: {
          description: "Ramen",
          amount: 1200,
          currency: "jpy",
          date: "",
          category: "Makan & minum",
        },
      }),
      ctx({ currency: "JPY" }),
    );
    expect(out.proposal?.payload).toMatchObject({
      kind: "expense",
      expense: { description: "Ramen", amountMinor: 120_000, currency: "JPY", date: "2026-11-09" },
    });
  });

  it("keeps quick replies short, unique and capped; multi needs 2+ options", () => {
    const out = cleanAssistantReply(
      reply({
        kind: "none",
        agenda: [],
        chips: ["Kuliner", "Kuliner", "Belanja", "Budaya", "Alam", "Anime", "Santai"],
        multi: true,
      }),
      ctx(),
    );
    expect(out.chips?.options).toEqual(["Kuliner", "Belanja", "Budaya", "Alam", "Anime"]);
    expect(out.chips?.multi).toBe(true);
    expect(
      cleanAssistantReply(reply({ kind: "none", agenda: [], chips: ["Ya"], multi: true }), ctx())
        .chips?.multi,
    ).toBe(false);
  });

  it("survives garbage", () => {
    expect(cleanAssistantReply(null, ctx())).toMatchObject({ reply: "", proposal: null });
    expect(cleanAssistantReply("x", ctx()).proposal).toBeNull();
  });
});

describe("helpers", () => {
  it("rounds money to a sensible unit and stores minor units", () => {
    expect(toMinor(3_847_221, "IDR")).toBe(385_000_000);
    expect(toMinor(1234, "JPY")).toBe(120_000);
    expect(toMinor(-5, "IDR")).toBe(0);
  });

  it("parses fenced or chatty JSON", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('Berikut: {"a":2} selesai')).toEqual({ a: 2 });
    expect(parseJsonLoose("bukan json")).toBeNull();
  });

  it("builds a compact context in whole units and a prompt with the Admin rules", () => {
    const facts: TripFacts = {
      today: "2026-11-09",
      name: "Jepang",
      destination: "Japan",
      departureDate: "2026-11-07",
      returnDate: "2026-11-12",
      travelers: 2,
      currency: "IDR",
      totalBudgetMinor: 1_000_000_000,
      spentMinor: 0,
      cities: ["Tokyo"],
      itinerary: [
        {
          id: ID,
          date: "2026-11-08",
          start: "10:00",
          end: null,
          title: "Donki",
          location: "Donki",
          category: null,
          costMinor: null,
        },
      ],
      checklist: [{ id: ID, title: "Paspor", done: false }],
      budget: [{ name: "Makan & minum", allocatedMinor: 0, spentMinor: 0 }],
      bookings: [],
      knownPlaces: [{ name: "Fuglen", area: "Shibuya", why: "Kopi", category: "cafe" }],
    };
    const json = JSON.parse(buildAssistantContext(facts));
    expect(json.trip.totalBudget).toBe(10_000_000);
    expect(json.agenda[0].items[0]).toContain(`id=${ID}`);
    expect(json.knownPlaces[0]).toContain("Fuglen");
    const prompt = buildAssistantSystemPrompt(
      {
        ...DEFAULT_TRIP_ASSISTANT_CONFIG,
        allowAgenda: false,
        tone: "panggil kak",
        blockedTopics: "politik",
      },
      "plan",
      "2026-11-09",
    );
    expect(prompt).toMatch(/never use kind=agenda/);
    expect(prompt).toMatch(/panggil kak/);
    expect(prompt).toMatch(/politik/);
  });

  it("offers the most useful nudges first without any AI call", () => {
    const nudges = buildNudges({
      today: "2026-11-09",
      departureDate: "2026-11-07",
      returnDate: "2026-11-12",
      itineraryDates: ["2026-11-08"],
      checklistOpen: 6,
      budgetSet: false,
      budgetAllocated: false,
      bookingsActive: 0,
    });
    expect(nudges.map((n) => n.intent)).toEqual(["budget", "plan", "tidy", "checklist"]);
    expect(
      buildNudges({
        today: "2026-11-09",
        departureDate: null,
        returnDate: null,
        itineraryDates: [],
        checklistOpen: 0,
        budgetSet: true,
        budgetAllocated: true,
        bookingsActive: 0,
      }).map((n) => n.intent),
    ).toEqual(["plan"]);
  });

  it("limits a burst of calls per traveler", () => {
    const now = 1_000_000;
    for (let i = 0; i < 8; i++) expect(allowAssistantBurst("burst-user", now + i)).toBe(true);
    expect(allowAssistantBurst("burst-user", now + 9)).toBe(false);
    expect(allowAssistantBurst("burst-user", now + 61_000)).toBe(true);
  });
});

describe("extractReplyPrefix (streaming)", () => {
  it("returns the reply as it grows and when it is complete", () => {
    expect(extractReplyPrefix('{"rep')).toEqual({ text: "", done: false });
    expect(extractReplyPrefix('{"reply":"Hal')).toEqual({ text: "Hal", done: false });
    expect(extractReplyPrefix('{"reply":"Halo!","chips":[]')).toEqual({
      text: "Halo!",
      done: true,
    });
  });

  it("decodes escapes and holds back half-received ones", () => {
    expect(extractReplyPrefix('{"reply":"Baris 1\\nBaris \\"dua\\""').text).toBe(
      'Baris 1\nBaris "dua"',
    );
    expect(extractReplyPrefix('{"reply":"Kopi \\u00e9').text).toBe("Kopi é");
    expect(extractReplyPrefix('{"reply":"Kopi \\u00').text).toBe("Kopi ");
    expect(extractReplyPrefix('{"reply":"a\\').text).toBe("a");
    expect(extractReplyPrefix('{ "reply" : "spasi" }').text).toBe("spasi");
  });
});

describe("pickReminder", () => {
  const base = {
    tripId: "t1",
    name: "Jepang",
    daysToDeparture: 5,
    daysToReturn: 10,
    budgetSet: true,
    itemCount: 3,
    todayItemCount: 1,
    openChecklist: 0,
    today: "2026-11-09",
  };
  it("stays quiet when nothing needs attention", () => {
    expect(pickReminder(base)).toBeNull();
    expect(pickReminder({ ...base, daysToDeparture: 30, budgetSet: false })).toBeNull(); // too early
    expect(
      pickReminder({ ...base, daysToDeparture: -20, daysToReturn: -15, budgetSet: false }),
    ).toBeNull(); // over
  });
  it("picks the most urgent thing, with a stable key per kind", () => {
    expect(pickReminder({ ...base, budgetSet: false })?.eventKey).toBe("assistant:t1:budget");
    expect(pickReminder({ ...base, itemCount: 0 })?.eventKey).toBe("assistant:t1:agenda");
    expect(pickReminder({ ...base, daysToDeparture: 2, openChecklist: 4 })).toMatchObject({
      eventKey: "assistant:t1:checklist",
      title: "4 persiapan belum selesai",
    });
    expect(pickReminder({ ...base, daysToDeparture: -1, todayItemCount: 0 })?.eventKey).toBe(
      "assistant:t1:today:2026-11-09",
    );
    expect(pickReminder({ ...base, itemCount: 0, budgetSet: false })?.eventKey).toBe(
      "assistant:t1:budget",
    );
  });
});
