/**
 * "Rencana lengkap" end to end against a real Postgres with a stubbed AI gateway, map and fare
 * sources. Skipped unless TEST_DATABASE_URL points at a throwaway database:
 *   TEST_DATABASE_URL=postgresql://tester@127.0.0.1:55432/t npx vitest run src/test/trip-plan.integration.test.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 60_000 });

const url = process.env["TEST_DATABASE_URL"];
const holder = vi.hoisted(() => ({
  pool: null as unknown,
  owner: { id: "u1", email: "a@b.c", guest: false } as {
    id: string;
    email: string | null;
    guest: boolean;
  } | null,
}));
vi.mock("@/db/client.server", () => ({
  get pool() {
    return holder.pool;
  },
}));
vi.mock("@/lib/guest-trips.server", () => ({
  resolveTripOwner: async () => holder.owner,
  requireTripOwner: async () => {
    if (!holder.owner) throw new Error("Autentikasi diperlukan");
    return holder.owner;
  },
  resolveTripOwnerForCreate: async () => holder.owner,
  getGuestTripStatusHandler: async () => ({}),
}));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: async () => undefined }));
vi.mock("@/lib/admin-guard.server", () => ({ getAdminEmailHandler: async () => "ops@djiwa.test" }));
vi.mock("@/lib/push.server", () => ({
  createCustomerNotification: async () => ({ created: false }),
}));
vi.mock("@/lib/google-calendar.server", () => ({
  syncItineraryItem: async () => undefined,
  renameGoogleFiles: async () => undefined,
}));
vi.mock("@/lib/flights.server", () => ({
  searchFlightPlacesHandler: async () => ({
    places: [{ code: "TYO", name: "Tokyo", countryName: "Japan", type: "city" }],
  }),
  fetchMonthOffers: async () => [
    { priceIdr: 2_400_000, departureAt: "2026-12-08T09:00:00" },
    { priceIdr: 3_000_000, departureAt: "2026-12-10T09:00:00" },
  ],
}));
vi.mock("@/lib/travo-cards.server", () => ({
  resolveTravoCards: async (requests: { kind: string; date: string }[]) =>
    requests.map((r) =>
      r.kind === "tiket"
        ? {
            kind: "tiket",
            status: "ok",
            from: "CGK",
            to: "TYO",
            date: r.date,
            returnDate: null,
            searchPath: "/tiket",
            offers: [
              {
                airline: "X",
                flightNumber: "X1",
                departureAt: r.date,
                transfers: 0,
                priceIdr: 3_000_000,
                url: null,
              },
            ],
          }
        : {
            kind: "esim",
            destination: { code: "JP", name: "Jepang", flag: "" },
            picks: [
              {
                packageCode: "p",
                tag: null,
                name: "Jepang 5GB",
                dataLabel: "5 GB",
                days: 7,
                priceIdr: 120_000,
                preorder: false,
              },
            ],
            total: 1,
            fromPriceIdr: 120_000,
          },
    ),
}));

import {
  assistantApplyHandler,
  assistantSendHandler,
  assistantPlanTripHandler,
  assistantSwapPlaceHandler,
  clearAssistantBurst,
  adminDeleteCityCostsHandler,
  adminListCityCostsHandler,
  adminSaveCityCostsHandler,
} from "@/lib/trip-assistant.server";

const TRIP = "22222222-2222-4222-8222-222222222222";
let pool: pg.Pool;
let costsCalls = 0;
let mustSeeCalls = 0;
let planCalls = 0;
let nominatimCalls = 0;
const count = async (sql: string) => Number((await pool.query(sql)).rows[0].n);

const place = (
  name: string,
  category: string,
  type: string,
  lat: number,
  lon: number,
  hours?: string,
) => ({
  lat: String(lat),
  lon: String(lon),
  name,
  category,
  type,
  address: { suburb: "Taito", city: "Tokyo" },
  extratags: hours ? { opening_hours: hours } : {},
});

const NOMINATIM: Record<string, unknown[]> = {
  "tourist attraction": [
    place("Senso-ji", "tourism", "attraction", 35.7148, 139.7967),
    place("Ueno Zoo", "tourism", "zoo", 35.7164, 139.7712, "Tu-Su 09:30-17:00"),
    place("Tokyo Skytree", "tourism", "attraction", 35.7101, 139.8107),
    place("Asakusa Culture Center", "tourism", "attraction", 35.7135, 139.7945),
    place("Kappabashi Street", "tourism", "attraction", 35.7143, 139.7889),
    place("Sumida Aquarium", "tourism", "aquarium", 35.7095, 139.8133),
    place("Yanaka Ginza", "tourism", "attraction", 35.7274, 139.7667),
  ],
  museum: [
    place("Tokyo National Museum", "tourism", "museum", 35.7188, 139.7765, "Tu-Su 09:30-17:00"),
  ],
  "temple shrine": [place("Nezu Shrine", "amenity", "place_of_worship", 35.7272, 139.7607)],
  "park garden": [place("Ueno Park", "leisure", "park", 35.7141, 139.7744)],
  "shopping mall market": [place("Ameyoko Market", "amenity", "marketplace", 35.7107, 139.7745)],
  restaurant: [
    place("Sushi Dai", "amenity", "restaurant", 35.712, 139.795),
    place("Tempura Tenya", "amenity", "restaurant", 35.711, 139.796),
    place("Izakaya Bar", "amenity", "bar", 35.71, 139.79),
  ],
  "local food": [place("Ramen Ichiran", "amenity", "fast_food", 35.713, 139.78)],
  cafe: [place("Kayaba Coffee", "amenity", "cafe", 35.723, 139.766)],
};

describe.skipIf(!url)("Rencana lengkap (real Postgres, stubbed AI and map)", () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    holder.pool = pool;
    process.env["HELIPOD_AI_KEY"] = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const target = String(input);
        if (target.includes("frankfurter"))
          return new Response(
            JSON.stringify({ date: "2026-11-09", rates: { IDR: 105, JPY: 0.0095 } }),
            {
              status: 200,
            },
          );
        if (target.includes("nominatim")) {
          nominatimCalls += 1;
          const q = new URL(target).searchParams.get("q") ?? "";
          return new Response(
            JSON.stringify(NOMINATIM[q] ?? [place("Tokyo", "place", "city", 35.68, 139.76)]),
            { status: 200 },
          );
        }
        const body = String(init?.body ?? "");
        const reply = (content: unknown) =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify(content) } }],
              usage: { prompt_tokens: 3000, completion_tokens: 900 },
            }),
            { status: 200 },
          );
        if (body.includes('"name":"city_costs"')) {
          costsCalls += 1;
          return reply({
            foodBudget: 150_000,
            foodMid: 350_000,
            transportDay: 100_000,
            attractionsDay: 90_000,
            hotelBudget: 600_000,
            hotelMid: 1_300_000,
          });
        }
        if (body.includes('"name":"must_see"')) {
          mustSeeCalls += 1;
          return reply({
            places: [
              { name: "Tokyo Tower", kind: "atraksi" },
              { name: "Meiji Jingu", kind: "taman" },
              { name: "Imaginary Palace", kind: "atraksi" },
            ],
          });
        }
        if (!body.includes('"name":"full_plan"'))
          return reply({
            reply: "Oke.",
            chips: [],
            multi: false,
            followUps: [],
            blocks: [],
            cards: [],
            kind: "none",
            title: "",
            agenda: [],
            budget: { total: 0, categories: [] },
            checklist: [],
            expense: { description: "", amount: 0, currency: "", date: "", category: "" },
          });
        planCalls += 1;
        const data = JSON.parse(
          JSON.parse(body)
            .messages.at(-1)
            .content.split("DATA (JSON):\n")[1]
            .split("\n\nPERMINTAAN")[0],
        ) as {
          days: { date: string; sights: string[]; food: string[] }[];
        };
        return reply({
          reply: "Ini rencana Tokyo kamu.",
          chips: ["Bagikan"],
          days: data.days.map((d) => ({
            date: d.date,
            items: [
              ...d.sights.slice(0, 2).map((s, i) => ({
                id: s.split(" | ")[0],
                slot: i ? "sore" : "pagi",
                start: i ? "15:00" : "09:30",
                end: i ? "16:30" : "11:30",
                note: "",
              })),
              ...d.food.slice(0, 1).map((f) => ({
                id: f.split(" | ")[0],
                slot: "makan_siang",
                start: "12:30",
                end: "13:30",
                note: "Coba menu andalannya",
              })),
              { id: "x999", slot: "malam", start: "20:00", end: "21:00", note: "karangan" },
            ],
          })),
          checklist: [
            { title: "Beli eSIM Jepang", daysBefore: 7 },
            { title: "Cek visa", daysBefore: 30 },
          ],
          tips: ["Bawa uang tunai yen"],
        });
      }),
    );
    await pool.query("drop schema public cascade; create schema public;");
    await pool.query(
      "do $$ begin create role djiwatravel_app; exception when duplicate_object then null; end $$;",
    );
    for (const file of [
      "004_admin_operations",
      "008_customer_profiles",
      "021_customer_traveler_profile",
      "018_my_trips",
      "022_travel_trip_shares",
      "019_google_calendar_sync",
      "020_allow_overnight_itinerary",
      "027_restore_admin_settings",
      "037_itinerary_map_points",
      "038_itinerary_place_image",
      "039_receipt_scans",
      "040_google_drive_sheets",
      "043_expense_items",
      "044_sheet_two_way",
      "045_place_ideas",
      "048_trip_cities",
      "058_trip_assistant",
      "059_assistant_blocks",
      "060_travo_conversations",
      "061_travo_cards",
      "062_travo_run_cards",
      "063_trip_origin",
      "064_trip_plan",
    ])
      await pool.query(readFileSync(resolve(`migrations/${file}.sql`), "utf8"));
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await pool?.end();
  });
  beforeEach(async () => {
    holder.owner = { id: "u1", email: "a@b.c", guest: false };
    clearAssistantBurst();
    costsCalls = 0;
    mustSeeCalls = 0;
    planCalls = 0;
    nominatimCalls = 0;
    await pool.query("delete from travel_trips");
    await pool.query("delete from admin_settings");
    await pool.query("delete from travel_assistant_runs");
    await pool.query("delete from travel_city_costs");
    await pool.query("delete from travel_place_cache");
    await pool.query(
      `insert into travel_trips (id,customer_auth_subject,name,destination_code,destination_name,departure_date,return_date,primary_currency,total_budget_minor,travelers_count,origin_code,origin_name)
       values ($1,'u1','Tokyo','JP','Jepang','2026-12-10','2026-12-12','IDR',3000000000,2,'CGK','Jakarta')`,
      [TRIP],
    );
    await pool.query(
      "insert into travel_trip_cities (trip_id,name,latitude,longitude) values ($1,'Tokyo',35.68,139.76)",
      [TRIP],
    );
  });

  const plan = (text = "rencana lengkap", tripId = TRIP) =>
    assistantSendHandler({ data: { tripId, text, intent: "full_plan" } });

  it("builds an itinerary, a budget and a checklist from real facts, as three separate proposals", async () => {
    const result = await plan();
    if (result.status !== "ok") throw new Error(`failed: ${JSON.stringify(result)}`);
    const proposals = result.messages.flatMap((m) => (m.proposal ? [m.proposal] : []));
    expect(proposals.map((p) => p.kind)).toEqual(["agenda", "budget", "checklist"]);
    const agenda = proposals[0]!.payload as {
      kind: "agenda";
      items: { place: string; lat: number; lng: number; placeKind: string; title: string }[];
    };
    // 3 days, only real places with a point on the map; the invented id was dropped.
    expect(agenda.items.length).toBeGreaterThanOrEqual(6);
    expect(
      agenda.items.every((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng) && i.placeKind),
    ).toBe(true);
    expect(agenda.items.some((i) => i.place === "Izakaya Bar")).toBe(false); // a bar is not offered
    expect(agenda.items.some((i) => /^Makan siang:/.test(i.title))).toBe(true);
    const budget = proposals[1]!.payload as {
      kind: "budget";
      budget: { categories: { name: string; allocatedMinor: number }[] };
    };
    const names = budget.budget.categories.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Penerbangan",
        "Akomodasi",
        "Makan & minum",
        "eSIM & internet",
        "Darurat",
      ]),
    );
    // 2 travelers x (3.000.000 out + 3.000.000 back) = Rp 12.000.000 in minor units.
    expect(budget.budget.categories.find((c) => c.name === "Penerbangan")!.allocatedMinor).toBe(
      1_200_000_000,
    );
    const first = result.messages.find((m) => !m.proposal && m.role === "assistant")!;
    expect(
      first.blocks.some(
        (b) => b.kind === "facts" && b.items.some((row) => row.startsWith("Hemat tiket")),
      ),
    ).toBe(true);
    // Fares both ways, so the traveler sees the outbound and the return price.
    expect(first.cards?.filter((c) => c.kind === "tiket")).toHaveLength(2);
    expect(first.cards?.some((c) => c.kind === "esim")).toBe(true);
    expect(result.remaining).toBe(30 - 3); // weighs 3 messages
  });

  it("applies the agenda with its map points, so the pins exist without another lookup", async () => {
    const result = await plan();
    if (result.status !== "ok") throw new Error("failed");
    const agendaProposal = result.messages.find((m) => m.proposal?.kind === "agenda")!.proposal!;
    const applied = await assistantApplyHandler({ data: { proposalId: agendaProposal.id } });
    expect(applied).toMatchObject({ ok: true, status: "applied" });
    expect(
      await count(
        "select count(*)::int n from travel_itinerary_items where latitude is not null and longitude is not null",
      ),
    ).toBeGreaterThanOrEqual(6);
    expect(
      await count("select count(*)::int n from travel_itinerary_items where latitude is null"),
    ).toBe(0);
  });

  it("swaps one place for the nearest other of the same kind, only while the proposal is open", async () => {
    const result = await plan();
    if (result.status !== "ok") throw new Error("failed");
    const proposal = result.messages.find((m) => m.proposal?.kind === "agenda")!.proposal!;
    const items = (
      proposal.payload as { items: { place: string; placeKind: string; title: string }[] }
    ).items;
    const index = items.findIndex((i) => i.placeKind === "atraksi");
    expect(index).toBeGreaterThanOrEqual(0);
    const before = items[index]!;
    const swapped = await assistantSwapPlaceHandler({ data: { proposalId: proposal.id, index } });
    const after = (
      swapped.payload as { items: { place: string; placeKind: string; title: string }[] }
    ).items[index]!;
    expect(after.place).not.toBe(before.place);
    expect(after.placeKind).toBe("atraksi");
    expect(after.title).toBe(after.place); // a sight keeps no meal prefix
    // An unknown index is refused.
    await expect(
      assistantSwapPlaceHandler({ data: { proposalId: proposal.id, index: 79 } }),
    ).rejects.toThrow();
    await assistantApplyHandler({ data: { proposalId: proposal.id } });
    await expect(
      assistantSwapPlaceHandler({ data: { proposalId: proposal.id, index } }),
    ).rejects.toThrow(/tidak bisa diubah/);
  });

  it("stores the city's daily costs once and reuses them (and the places) on the next plan", async () => {
    await plan();
    expect(costsCalls).toBe(1);
    const firstMapCalls = nominatimCalls;
    expect(firstMapCalls).toBeGreaterThan(0);
    await plan("rencana lengkap lagi");
    expect(costsCalls).toBe(1);
    expect(nominatimCalls).toBe(firstMapCalls); // cached places
    expect(await count("select count(*)::int n from travel_city_costs where source='ai'")).toBe(1);
  });

  it("an Admin-edited cost table wins over the model", async () => {
    await pool.query(
      `insert into travel_city_costs (city_key,city_name,country_code,food_budget,food_mid,transport_day,attractions_day,hotel_budget,hotel_mid,source)
       values ('tokyo|jp','Tokyo','JP',100000,200000,50000,50000,400000,800000,'admin')`,
    );
    const result = await plan();
    if (result.status !== "ok") throw new Error("failed");
    expect(costsCalls).toBe(0);
    const budget = result.messages.find((m) => m.proposal?.kind === "budget")!.proposal!
      .payload as {
      kind: "budget";
      budget: { categories: { name: string; allocatedMinor: number }[] };
    };
    // Admin hotel per night 800.000, 2 nights, 1 room for 2 people (or 400.000 if frugal).
    const hotel =
      budget.budget.categories.find((c) => c.name === "Akomodasi")!.allocatedMinor / 100;
    expect([800_000 * 2, 400_000 * 2]).toContain(hotel);
  });

  it("lets Admin edit a city's costs (validated, audited) and delete them to regenerate", async () => {
    await expect(
      adminSaveCityCostsHandler({
        data: {
          cityName: "Osaka",
          countryCode: "JP",
          reason: "uji",
          costs: {
            foodBudget: "x" as never,
            foodMid: 1,
            transportDay: 1,
            attractionsDay: 1,
            hotelBudget: 1,
            hotelMid: 1,
          },
        },
      }),
    ).rejects.toThrow(/tidak valid/);
    const saved = await adminSaveCityCostsHandler({
      data: {
        cityName: "Osaka",
        countryCode: "JP",
        reason: "samakan dengan harga lapangan",
        costs: {
          foodBudget: 5,
          foodMid: 9_000_000_000,
          transportDay: 80_000,
          attractionsDay: 60_000,
          hotelBudget: 450_000,
          hotelMid: 900_000,
        },
      },
    });
    // Out-of-range figures are clamped by the same guardrails the model's table goes through.
    expect(saved.costs.foodBudget).toBe(40_000);
    expect(saved.costs.foodMid).toBe(2_000_000);
    const list = await adminListCityCostsHandler();
    expect(list.map((r) => [r.cityKey, r.source])).toContainEqual(["osaka|jp", "admin"]);
    expect(
      await count(
        "select count(*)::int n from admin_audit_logs where action='assistant.city_costs_saved'",
      ),
    ).toBe(1);
    await adminDeleteCityCostsHandler({ data: { cityKey: "osaka|jp", reason: "buat ulang" } });
    expect(await count("select count(*)::int n from travel_city_costs")).toBe(0);
    expect(
      await count(
        "select count(*)::int n from admin_audit_logs where action='assistant.city_costs_deleted'",
      ),
    ).toBe(1);
  });

  it("adds the live fare card when the traveler talks about tickets, even if the model forgot it", async () => {
    const result = await assistantSendHandler({
      data: { tripId: TRIP, text: "ada tiket pesawat murah?", intent: "chat" },
    });
    if (result.status !== "ok") throw new Error("failed");
    const card = result.messages.at(-1)!.cards?.find((c) => c.kind === "tiket");
    expect(card).toMatchObject({ kind: "tiket", from: "CGK", to: "TYO", date: "2026-12-10" });
  });

  it("asks for the departure city instead when the trip has none", async () => {
    await pool.query("update travel_trips set origin_code=null, origin_name=null");
    const result = await assistantSendHandler({
      data: { tripId: TRIP, text: "cari tiket pesawat", intent: "chat" },
    });
    if (result.status !== "ok") throw new Error("failed");
    const texts = result.messages.map((m) => m.content).join(" ");
    expect(texts).toMatch(/Isi kota keberangkatan/);
    expect(result.messages.some((m) => m.cards?.some((c) => c.kind === "tiket"))).toBe(false);
  });

  it("wizard: creates the trip with its departure city, city point and converted budget, ready for the plan", async () => {
    const created = await assistantPlanTripHandler({
      data: {
        country: { code: "JP", name: "Jepang" },
        city: { name: "Tokyo", lat: 35.68, lng: 139.76 },
        origin: { code: "CGK", name: "Jakarta" },
        oneWay: false,
        departureDate: "2026-12-14",
        days: 3,
        travelers: 2,
        budgetIdr: 20_000_000,
        style: "nyaman",
        interests: ["Kuliner"],
        esim: true,
      },
    });
    if (created.status !== "ok") throw new Error(`failed: ${JSON.stringify(created)}`);
    const trip = (
      await pool.query(
        "select name, primary_currency, total_budget_minor::bigint::text t, origin_code, to_char(return_date,'YYYY-MM-DD') r, travelers_count from travel_trips where id=$1",
        [created.tripId],
      )
    ).rows[0];
    expect(trip).toMatchObject({
      name: "Tokyo 3 hari",
      primary_currency: "JPY",
      origin_code: "CGK",
      r: "2026-12-16",
      travelers_count: 2,
    });
    expect(trip.t).toBe(String(Math.round(20_000_000 * 0.0095 * 100))); // Rupiah converted to yen at the stubbed rate
    expect(
      await count(
        `select count(*)::int n from travel_trip_cities where trip_id='${created.tripId}' and name='Tokyo'`,
      ),
    ).toBe(1);
    expect(created.text).toContain("rencana lengkap 3 hari di Tokyo");
    // ...and the normal streamed turn builds the plan from the wizard's choices.
    const planned = await assistantSendHandler({
      data: {
        tripId: created.tripId,
        text: created.text,
        intent: "full_plan",
        plan: { oneWay: true, style: "hemat", interests: ["Kuliner"], esim: false },
      },
    });
    if (planned.status !== "ok") throw new Error(`plan failed: ${JSON.stringify(planned)}`);
    const first = planned.messages.find((m) => !m.proposal && m.role === "assistant")!;
    // One way: one fare card, no return, no eSIM card; the budget says so and keeps the chosen style.
    expect(first.cards?.filter((c) => c.kind === "tiket")).toHaveLength(1);
    expect(first.cards?.some((c) => c.kind === "esim")).toBe(false);
    expect(first.blocks.flatMap((b) => b.items).some((r) => r.startsWith("Sekali jalan"))).toBe(
      true,
    );
    expect(
      first.blocks.flatMap((b) => b.items).some((r) => r.startsWith("Gaya anggaran: hemat")),
    ).toBe(true);
    const budget = planned.messages.find((m) => m.proposal?.kind === "budget")!.proposal!
      .payload as {
      kind: "budget";
      budget: { categories: { name: string; allocatedMinor: number }[] };
    };
    expect(budget.budget.categories.some((c) => c.name === "eSIM & internet")).toBe(false);
  });

  it("wizard: a guest who already used the free plan is told before any trip is created", async () => {
    holder.owner = { id: "guest-9", email: null, guest: true };
    await pool.query("update travel_trips set customer_auth_subject='guest-9'");
    await assistantSendHandler({
      data: { tripId: TRIP, text: "rencana lengkap", intent: "full_plan" },
    });
    const before = await count("select count(*)::int n from travel_trips");
    const blocked = await assistantPlanTripHandler({
      data: {
        country: { code: "JP", name: "Jepang" },
        city: { name: "Tokyo", lat: 35.68, lng: 139.76 },
        origin: null,
        oneWay: true,
        departureDate: "2026-12-14",
        days: 3,
        travelers: 1,
        budgetIdr: 0,
        style: "auto",
        interests: [],
        esim: false,
      },
    });
    expect(blocked.status).toBe("limit");
    expect(await count("select count(*)::int n from travel_trips")).toBe(before);
  });

  it("puts the city's well-known places (found on the map) into the plan, once per city", async () => {
    const result = await plan();
    if (result.status !== "ok") throw new Error("failed");
    const agenda = result.messages.find((m) => m.proposal?.kind === "agenda")!.proposal!
      .payload as { items: { place: string }[] };
    const names = agenda.items.map((i) => i.place);
    expect(names.some((n) => n === "Tokyo Tower" || n === "Meiji Jingu")).toBe(true);
    expect(
      await count("select count(*)::int n from travel_place_cache where kind='v2:must-see'"),
    ).toBe(1);
    expect(mustSeeCalls).toBe(1);
    await plan("lagi");
    expect(mustSeeCalls).toBe(1); // cached for the week
  });

  it("drops zero lines from the budget and never rounds a small amount to nothing", async () => {
    const result = await plan();
    if (result.status !== "ok") throw new Error("failed");
    const budget = result.messages.find((m) => m.proposal?.kind === "budget")!.proposal!
      .payload as { budget: { categories: { allocatedMinor: number }[] } };
    expect(budget.budget.categories.every((c) => c.allocatedMinor > 0)).toBe(true);
  });

  it("gives a guest exactly one full plan, then asks them to sign in", async () => {
    holder.owner = { id: "guest-1", email: null, guest: true };
    await pool.query("update travel_trips set customer_auth_subject='guest-1'");
    const first = await plan();
    expect(first.status).toBe("ok");
    const second = await plan("lagi dong");
    expect(second.status).toBe("limit");
    expect((second as { message: string }).message).toMatch(/Masuk atau daftar/);
    // The quota shown stays real: one full plan used 1 of the guest's daily messages, not all of them.
    expect((second as { remaining: number }).remaining).toBeGreaterThan(0);
    expect(
      await count(
        "select count(*)::int n from travel_assistant_runs where intent='full_plan' and status='ok'",
      ),
    ).toBe(1);
  });

  it("asks for a city first instead of guessing one", async () => {
    await pool.query("delete from travel_trip_cities");
    const result = await plan();
    if (result.status !== "ok") throw new Error("failed");
    expect(result.messages.at(-1)!.content).toMatch(/Kota mana/);
    expect(result.messages.some((m) => m.proposal)).toBe(false);
    expect(planCalls).toBe(0);
  });

  it("is switched off by Admin and never touches the model then", async () => {
    await pool.query(
      `insert into admin_settings (setting_key, value_json, version) values ('tripAssistant', '{"fullPlan": false}'::jsonb, 1)`,
    );
    const result = await plan();
    expect(result.status).toBe("error");
    expect(planCalls).toBe(0);
  });
});
