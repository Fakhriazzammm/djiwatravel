import { describe, expect, it } from "vitest";
import { buildPlanDocHtml } from "@/lib/google-plan-doc";
import type { PlanSheetState } from "@/lib/google-sheets-plan";

const state: PlanSheetState = {
  tripName: "Tokyo <script>alert(1)</script>",
  destination: "Jepang",
  dates: "10 Des – 12 Des 2026",
  travelers: 2,
  currency: "IDR",
  departure: "2026-12-10",
  totalMinor: 1_500_000_000,
  categories: [],
  items: [
    {
      id: "1",
      date: "2026-12-10",
      start: "09:30",
      end: "11:00",
      title: "Senso-ji & taman",
      location: "Asakusa",
      notes: "pagi",
      costMinor: 5_000_000,
      currency: "IDR",
      category: "",
      lat: null,
      lng: null,
    },
    {
      id: "2",
      date: "2026-12-11",
      start: "",
      end: "",
      title: "Bebas",
      location: "",
      notes: "",
      costMinor: 0,
      currency: "IDR",
      category: "",
      lat: null,
      lng: null,
    },
  ],
  prep: [
    { id: "p1", title: "Cek visa", due: "2026-11-20", done: true },
    { id: "p2", title: "Beli eSIM", due: "", done: false },
  ],
  plan: {
    city: "Tokyo",
    tier: "nyaman",
    budget: [
      { name: "Penerbangan", amountIdr: 12_000_000, basis: "tercatat" },
      { name: "Akomodasi", amountIdr: 4_400_000, basis: "perkiraan" },
    ],
    research: {
      outbound: { priceIdr: 3_000_000, date: "2026-12-10" },
      originCode: "CGK",
      destinationCode: "TYO",
      esim: { name: "Jepang 5GB", days: 7, priceIdr: 120_000 },
    },
    costs: {},
    updatedAt: "2026-11-10",
  },
  fxFromIdr: 1,
};

describe("the plan document", () => {
  const html = buildPlanDocHtml(state, "10 November 2026");
  it("escapes everything the traveler or Travo wrote", () => {
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Senso-ji &amp; taman");
  });
  it("shows the budget with its basis, the total, and the traveler's own budget", () => {
    expect(html).toContain("Rp 12.000.000");
    expect(html).toContain("harga tercatat");
    expect(html).toContain("Rp 16.400.000");
    expect(html).toContain("Anggaran kamu: Rp 15.000.000");
  });
  it("groups the itinerary by day and shows checked preparation", () => {
    expect(html).toMatch(/Kamis, 10 Desember/);
    expect(html).toContain("09:30–11:00");
    expect(html).toContain("☑ Cek visa");
    expect(html).toContain("☐ Beli eSIM");
  });
  it("labels recorded fares as 'cek lagi' and the whole page as an estimate", () => {
    expect(html).toContain("cek lagi saat membeli");
    expect(html).toContain("perkiraan adalah taksiran");
  });
  it("still renders without a plan", () => {
    const bare = buildPlanDocHtml({ ...state, plan: null, items: [], prep: [] }, "x");
    expect(bare).toContain("Belum ada aktivitas.");
    expect(bare).not.toContain("Ringkasan uang");
  });
});
