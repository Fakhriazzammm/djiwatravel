import { describe, expect, it } from "vitest";
import {
  buildDayPools,
  buildStrategyRows,
  clusterPoints,
  computeBudgetPlan,
  cleanFullPlan,
  costKey,
  fallbackCosts,
  haversineKm,
  sanitizeCityCosts,
  type CityCosts,
  type FullPlanContext,
  type PlaceCandidate,
} from "@/lib/trip-plan";

const costs: CityCosts = {
  foodBudget: 120_000,
  foodMid: 300_000,
  transportDay: 90_000,
  attractionsDay: 120_000,
  hotelBudget: 500_000,
  hotelMid: 1_100_000,
};

describe("city cost guardrails", () => {
  it("accepts a sensible table and rounds it", () => {
    expect(
      sanitizeCityCosts({
        foodBudget: 123_456,
        foodMid: 310_000,
        transportDay: 88_000,
        attractionsDay: 100_000,
        hotelBudget: 503_000,
        hotelMid: 1_190_000,
      }),
    ).toEqual({
      foodBudget: 125_000,
      foodMid: 310_000,
      transportDay: 90_000,
      attractionsDay: 100_000,
      hotelBudget: 500_000,
      hotelMid: 1_190_000,
    });
  });
  it("rejects missing or non-numeric figures so the model is asked again", () => {
    expect(sanitizeCityCosts({ ...costs, hotelMid: "mahal" })).toBeNull();
    expect(sanitizeCityCosts({ foodBudget: 100_000 })).toBeNull();
    expect(sanitizeCityCosts(null)).toBeNull();
  });
  it("clamps absurd values into the bounds and keeps mid above budget", () => {
    const out = sanitizeCityCosts({
      ...costs,
      foodBudget: 5,
      foodMid: 9_000_000_000,
      hotelBudget: 2_400_000,
      hotelMid: 300_000,
    })!;
    expect(out.foodBudget).toBe(40_000);
    expect(out.foodMid).toBe(2_000_000);
    expect(out.hotelMid).toBeGreaterThanOrEqual(Math.round(out.hotelBudget * 1.2));
  });
  it("has a conservative fallback per country and a stable key", () => {
    expect(fallbackCosts("jp").hotelMid).toBeGreaterThan(fallbackCosts("TH").hotelMid);
    expect(fallbackCosts("ZZ")).toEqual(fallbackCosts("JP")); // unknown = mid tier
    expect(costKey("São Paulo", "BR")).toBe("sao-paulo|br");
  });
});

describe("budget from data, not guesses", () => {
  const base = {
    days: 5,
    travelers: 2,
    costs,
    outboundIdr: 3_000_000,
    returnIdr: 3_200_000,
    esimIdr: 120_000,
    totalBudgetIdr: 0,
  };
  it("builds lines from fares, plans and the city's daily costs", () => {
    const plan = computeBudgetPlan(base);
    const by = Object.fromEntries(plan.lines.map((l) => [l.name, l]));
    expect(by["Penerbangan"]).toMatchObject({ amountIdr: 12_400_000, basis: "tercatat" });
    expect(by["Akomodasi"]!.amountIdr).toBe(1_100_000 * 4); // 4 nights, 1 room for 2
    expect(by["Makan & minum"]!.amountIdr).toBe(300_000 * 5 * 2);
    expect(by["eSIM & internet"]!.amountIdr).toBe(240_000);
    expect(plan.tier).toBe("nyaman");
    expect(plan.totalIdr).toBe(plan.lines.reduce((s, l) => s + l.amountIdr, 0));
  });
  it("marks a one-way fare doubled as an estimate", () => {
    const plan = computeBudgetPlan({ ...base, returnIdr: null });
    expect(plan.lines[0]).toMatchObject({
      name: "Penerbangan",
      amountIdr: 12_000_000,
      basis: "perkiraan",
    });
  });
  it("skips the fare line when no fare was recorded", () => {
    const plan = computeBudgetPlan({ ...base, outboundIdr: null, returnIdr: null });
    expect(plan.lines.find((l) => l.name === "Penerbangan")).toBeUndefined();
  });
  it("counts a one-way fare once", () => {
    const plan = computeBudgetPlan({ ...base, oneWay: true });
    expect(plan.lines[0]).toMatchObject({
      name: "Penerbangan",
      amountIdr: 6_000_000,
      basis: "tercatat",
    });
  });
  it("keeps a chosen style even when the budget is tight, and reports the shortfall", () => {
    const plan = computeBudgetPlan({ ...base, forceTier: "nyaman", totalBudgetIdr: 15_000_000 });
    expect(plan.tier).toBe("nyaman");
    expect(plan.shortfallIdr).toBeGreaterThan(0);
    expect(computeBudgetPlan({ ...base, forceTier: "hemat" }).tier).toBe("hemat");
  });
  it("goes frugal and reports the shortfall when the budget is tight", () => {
    const plan = computeBudgetPlan({ ...base, totalBudgetIdr: 15_000_000 });
    expect(plan.tier).toBe("hemat");
    expect(plan.shortfallIdr).toBe(Math.max(0, plan.totalIdr - 15_000_000));
  });
  it("puts left-over money into shopping and a reserve, never above the budget", () => {
    const plan = computeBudgetPlan({ ...base, totalBudgetIdr: 60_000_000 });
    expect(plan.shortfallIdr).toBe(0);
    expect(plan.lines.some((l) => l.name === "Belanja")).toBe(true);
    expect(plan.totalIdr).toBeLessThanOrEqual(60_000_000);
  });
  it("describes the strategy with recorded facts and a saving only when it is real", () => {
    const plan = computeBudgetPlan(base);
    const rows = buildStrategyRows({
      budget: plan,
      travelers: 2,
      totalBudgetIdr: 0,
      research: {
        outbound: { priceIdr: 3_000_000, date: "2026-12-10" },
        returnLeg: null,
        cheapestOutbound: { priceIdr: 2_400_000, date: "2026-12-08" },
        esim: null,
        guides: [],
        sourcesDown: [],
      },
    });
    expect(rows.join("\n")).toContain("Hemat tiket: berangkat 2026-12-08 bisa hemat Rp 1.200.000");
    expect(rows.join("\n")).toContain("Tiket pergi: Rp 3.000.000/orang (tercatat 2026-12-10)");
  });
});

const place = (
  id: string,
  kind: PlaceCandidate["kind"],
  lat: number,
  lng: number,
  hours: string | null = null,
): PlaceCandidate => ({
  id,
  name: `Tempat ${id}`,
  kind,
  lat,
  lng,
  hours,
  area: "Shinjuku, Tokyo",
});

describe("grouping places by day", () => {
  const east = [
    place("p1", "atraksi", 35.71, 139.8),
    place("p2", "atraksi", 35.712, 139.81),
    place("p3", "taman", 35.709, 139.79),
  ];
  const west = [place("p4", "atraksi", 35.66, 139.7), place("p5", "belanja", 35.662, 139.71)];
  const food = [
    place("f1", "makan", 35.711, 139.8),
    place("f2", "makan", 35.661, 139.705),
    place("f3", "kafe", 35.665, 139.7),
  ];
  it("measures distance", () => {
    expect(haversineKm({ lat: 35.68, lng: 139.76 }, { lat: 35.68, lng: 139.76 })).toBe(0);
    expect(haversineKm({ lat: 35.68, lng: 139.76 }, { lat: 34.69, lng: 135.5 })).toBeGreaterThan(
      380,
    );
  });
  it("separates two distant areas into two clusters", () => {
    const a = clusterPoints([...east, ...west], 2);
    expect(new Set(a.slice(0, 3)).size).toBe(1);
    expect(new Set(a.slice(3)).size).toBe(1);
    expect(a[0]).not.toBe(a[3]);
  });
  it("gives each day its own area and the food nearest to it, each place once", () => {
    const pools = buildDayPools(["2026-12-10", "2026-12-11"], [...east, ...west, ...food]);
    expect(pools).toHaveLength(2);
    const ids = pools.flatMap((p) => [...p.sights, ...p.food]).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const eastDay = pools.find((p) => p.sights.some((s) => s.id === "p1"))!;
    expect(eastDay.sights.map((s) => s.id).sort()).toEqual(["p1", "p2", "p3"]);
    expect(eastDay.food[0]!.id).toBe("f1");
  });
});

describe("cleaning the model's plan", () => {
  const candidates = [
    place("p1", "atraksi", 35.71, 139.8, "Mo-Su 09:00-17:00"),
    place("f1", "makan", 35.711, 139.8),
    place("p2", "atraksi", 35.7, 139.7, "Mo-Fr 09:00-12:00"),
  ];
  const ctx: FullPlanContext = {
    dates: ["2026-12-10", "2026-12-11"],
    candidates,
    costs,
    tier: "nyaman",
    travelers: 2,
    fxFromIdr: 1,
    toMinor: (major) => Math.round(major / 10_000) * 10_000 * 100,
    departureDate: "2026-12-10",
    maxItems: 10,
    today: "2026-11-10",
  };
  it("keeps only offered places, real trip days, sorted by time, with costs from the city table", () => {
    const out = cleanFullPlan(
      {
        reply: "Ini rencananya.",
        chips: ["Ganti tempat"],
        tips: ["Bawa uang tunai"],
        days: [
          {
            date: "2026-12-10",
            items: [
              { id: "f1", slot: "makan_siang", start: "12:30", end: "13:45", note: "Enak" },
              { id: "p1", slot: "pagi", start: "09:30", end: "11:30", note: "" },
              { id: "x99", slot: "sore", start: "15:00", end: "16:00", note: "karangan" },
            ],
          },
          {
            date: "2027-01-01",
            items: [{ id: "p2", slot: "pagi", start: "10:00", end: "11:00", note: "" }],
          },
        ],
        checklist: [
          { title: "Beli eSIM", daysBefore: 3 },
          { title: "Beli eSIM", daysBefore: 5 },
        ],
      },
      ctx,
    );
    expect(out.agenda.map((i) => i.place)).toEqual(["Tempat p1", "Tempat f1"]);
    expect(out.agenda[0]).toMatchObject({
      op: "add",
      lat: 35.71,
      lng: 139.8,
      placeKind: "atraksi",
      category: "sightseeing",
    });
    expect(out.agenda[1]!.title).toBe("Makan siang: Tempat f1");
    expect(out.agenda[1]!.estimatedCostMinor).toBe((300_000 / 3) * 2 * 100); // 200.000, in minor units
    expect(out.dropped).toMatchObject({ unknownPlace: 1, badDate: 1 });
    expect(out.checklist).toEqual([{ title: "Beli eSIM", dueDate: "2026-12-07" }]);
    expect(out.tips).toEqual(["Bawa uang tunai"]);
  });
  it("labels meals by the real hour and place type, not the model's slot word", () => {
    const cafe = place("c1", "kafe", 35.7, 139.7);
    const out = cleanFullPlan(
      {
        days: [
          {
            date: "2026-12-10",
            items: [
              { id: "c1", slot: "makan_malam", start: "13:00", end: "14:00", note: "" },
              { id: "f1", slot: "makan_malam", start: "08:30", end: "09:15", note: "" },
            ],
          },
        ],
      },
      { ...ctx, candidates: [...candidates, cafe] },
    );
    expect(out.agenda.map((i) => i.title)).toEqual(["Sarapan: Tempat f1", "Ngopi: Tempat c1"]);
  });
  it("flags a place the map says is closed at that hour instead of hiding it", () => {
    const out = cleanFullPlan(
      {
        days: [
          { date: "2026-12-13", items: [] },
          {
            date: "2026-12-10",
            items: [{ id: "p2", slot: "sore", start: "15:00", end: "16:00", note: "" }],
          },
        ],
      },
      { ...ctx, dates: ["2026-12-10", "2026-12-13"] },
    );
    expect(out.agenda[0]!.hours?.open).toBe(false);
    expect(out.dropped.closed).toBe(1);
  });
  it("never uses the same place twice and respects the item cap", () => {
    const out = cleanFullPlan(
      {
        days: [
          {
            date: "2026-12-10",
            items: [
              { id: "p1", slot: "pagi", start: "09:00", end: "10:00", note: "" },
              { id: "p1", slot: "sore", start: "15:00", end: "16:00", note: "" },
              { id: "f1", slot: "makan_siang", start: "12:00", end: "13:00", note: "" },
            ],
          },
        ],
      },
      { ...ctx, maxItems: 2 },
    );
    expect(out.agenda).toHaveLength(2);
  });
  it("survives garbage", () => {
    expect(cleanFullPlan("nonsense", ctx).agenda).toEqual([]);
    expect(cleanFullPlan(null, ctx).checklist).toEqual([]);
  });
});
