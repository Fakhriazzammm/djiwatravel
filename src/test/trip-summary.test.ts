import { describe, expect, it } from "vitest";
import { buildTripSummary, type SummaryInput } from "@/lib/trip-summary";

const base = (over: Partial<SummaryInput> = {}): SummaryInput => ({
  today: "2026-11-09",
  name: "Jepang",
  destination: "Jepang",
  departureDate: "2026-11-08",
  returnDate: "2026-11-12",
  travelers: 2,
  currency: "IDR",
  cities: ["Tokyo"],
  totalBudgetMinor: 1_000_000_000,
  itinerary: [
    {
      id: "a",
      activity_date: "2026-11-08",
      start_time: "10:00:00",
      end_time: "11:00:00",
      title: "Donki",
      location: "Donki",
      latitude: 35.6,
      longitude: 139.7,
    },
    {
      id: "b",
      activity_date: "2026-11-08",
      start_time: "10:30:00",
      end_time: "11:30:00",
      title: "Ramen",
      location: "Ginza",
    },
    {
      id: "c",
      activity_date: "2026-11-09",
      start_time: "09:00:00",
      title: "Sensō-ji",
      location: "Asakusa",
      latitude: 35.7,
      longitude: 139.8,
    },
  ],
  budget: [
    { id: "k1", name: "Makan", allocated_minor: 300_000_000 },
    { id: "k2", name: "Akomodasi", allocated_minor: 500_000_000 },
    { id: "k3", name: "Kosong", allocated_minor: 0 },
  ],
  expenses: [
    {
      id: "e1",
      category_id: "k1",
      description: "Ramen",
      converted_amount_minor: 12_600_000,
      transaction_date: "2026-11-08",
    },
    {
      id: "e2",
      category_id: "k1",
      description: "Kopi",
      converted_amount_minor: 4_000_000,
      transaction_date: "2026-11-09",
    },
  ],
  checklist: [
    { id: "c1", title: "Paspor", is_completed: true },
    { id: "c2", title: "Visa", is_completed: false },
  ],
  bookings: [
    { id: "b1", title: "Hotel", category: "Akomodasi", status: "confirmed" },
    { id: "b2", title: "Tiket", category: "Penerbangan", status: "pending" },
    { id: "b3", title: "Dibatalkan", category: "x", status: "cancelled" },
  ],
  ...over,
});

describe("buildTripSummary", () => {
  it("reads every page into one summary", () => {
    const s = buildTripSummary(base());
    expect(s.countdown).toBe("Hari ke-2 dari 5");
    expect(s.agenda).toMatchObject({ total: 3, daysTotal: 5, daysFilled: 2, pinned: 2 });
    expect(s.agenda.days[0]!.items.map((i) => i.title)).toEqual(["Donki", "Ramen"]);
    expect(s.budget).toMatchObject({
      set: true,
      spentMinor: 16_600_000,
      remainingMinor: 983_400_000,
      percent: 2,
    });
    expect(s.budget.categories.map((c) => [c.name, c.spentMinor])).toEqual([
      ["Akomodasi", 0],
      ["Makan", 16_600_000],
    ]);
    expect(s.budget.recent[0]).toMatchObject({ description: "Kopi" });
    expect(s.checklist).toMatchObject({ done: 1, total: 2 });
    expect(s.checklist.open).toEqual([{ id: "c2", title: "Visa" }]);
    expect(s.bookings.map((b) => b.title)).toEqual(["Hotel", "Tiket"]); // cancelled ones are left out
  });

  it("lists what needs attention, most useful first, each with an action", () => {
    const s = buildTripSummary(base());
    expect(s.attention.map((a) => a.id)).toEqual(["empty", "clash", "pin", "check", "pending"]);
    expect(s.attention.find((a) => a.id === "empty")).toMatchObject({
      text: "3 hari belum punya agenda",
      action: "plan",
    });
    expect(s.attention.find((a) => a.id === "clash")?.action).toBe("tidy");
    expect(s.attention.find((a) => a.id === "pin")?.action).toBe("pin");
    expect(s.attention.find((a) => a.id === "pending")?.action).toBeNull();
  });

  it("flags a missing, unsplit and overspent budget", () => {
    expect(buildTripSummary(base({ totalBudgetMinor: 0 })).attention[0]).toMatchObject({
      id: "budget",
      action: "budget",
    });
    expect(
      buildTripSummary(base({ budget: [{ id: "k1", name: "Makan", allocated_minor: 0 }] }))
        .attention[0],
    ).toMatchObject({ id: "split" });
    const over = buildTripSummary(base({ totalBudgetMinor: 10_000_000 }));
    expect(over.attention.map((a) => a.id)).toContain("over");
    expect(over.budget.percent).toBe(100);
  });

  it("is quiet and complete for a tidy trip", () => {
    const s = buildTripSummary(
      base({
        itinerary: ["08", "09", "10", "11", "12"].map((d, i) => ({
          id: `i${i}`,
          activity_date: `2026-11-${d}`,
          start_time: "10:00:00",
          title: "X",
          latitude: 1,
          longitude: 1,
        })),
        checklist: [{ id: "c1", title: "Paspor", is_completed: true }],
        bookings: [{ id: "b1", title: "Hotel", category: "A", status: "confirmed" }],
      }),
    );
    expect(s.attention).toEqual([]);
    expect(s.agenda.daysFilled).toBe(5);
  });

  it("handles a brand new trip with no dates or data", () => {
    const s = buildTripSummary(
      base({
        departureDate: null,
        returnDate: null,
        itinerary: [],
        budget: [],
        expenses: [],
        checklist: [],
        bookings: [],
        totalBudgetMinor: 0,
      }),
    );
    expect(s.countdown).toBe("Tanggal belum diatur");
    expect(s.agenda).toMatchObject({ total: 0, daysTotal: 0 });
    expect(s.budget.set).toBe(false);
    expect(s.attention.map((a) => a.id)).toEqual(["budget"]);
  });

  it("counts down before departure and after it ends", () => {
    expect(buildTripSummary(base({ today: "2026-11-01" })).countdown).toBe("7 hari lagi");
    expect(buildTripSummary(base({ today: "2026-11-08" })).countdown).toBe("Berangkat hari ini");
    expect(buildTripSummary(base({ today: "2026-11-09" })).countdown).toBe("Hari ke-2 dari 5");
    expect(buildTripSummary(base({ today: "2026-12-01" })).countdown).toBe("Perjalanan selesai");
  });
});
