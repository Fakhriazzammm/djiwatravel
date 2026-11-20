import { describe, expect, it } from "vitest";
import { computeBudgetPlan } from "@/lib/trip-plan";
import type { AgendaChange } from "@/lib/trip-assistant";
import { describeSources, itemsFromAgenda, templateBudgetFromPlan } from "@/lib/trip-template-plan";
import { cleanTemplateDraft } from "@/lib/trip-templates";

const costs = {
  foodBudget: 150_000,
  foodMid: 300_000,
  transportDay: 80_000,
  attractionsDay: 120_000,
  hotelBudget: 450_000,
  hotelMid: 900_000,
};

describe("template budget from our own data", () => {
  it("names each line, says where the number came from and adds the web lines last", () => {
    const plan = computeBudgetPlan({
      days: 4,
      travelers: 1,
      costs,
      outboundIdr: 3_400_000,
      returnIdr: 4_800_000,
      esimIdr: 150_000,
      totalBudgetIdr: 0,
    });
    const budget = templateBudgetFromPlan({
      lines: plan.lines,
      city: "Kyoto",
      costSource: "admin",
      flightNote: "Harga tercatat fitur tiket kita",
      esimName: "Japan 10GB 30Days",
      extra: [{ name: "Visa", amountIdr: 450_000, note: "Dari internet" }],
    });
    const byName = Object.fromEntries((budget?.categories ?? []).map((c) => [c.name, c]));
    expect(byName["Tiket pesawat"]).toMatchObject({
      amountIdr: 8_200_000,
      note: "Harga tercatat fitur tiket kita",
    });
    expect(byName["eSIM & internet"]?.note).toBe("Japan 10GB 30Days dari katalog kita");
    expect(byName["Akomodasi"]?.note).toBe("Biaya harian Kyoto dari tim Djiwa");
    expect(byName["Makan"]).toBeTruthy();
    expect(byName["Transportasi lokal"]).toBeTruthy();
    expect(byName["Tiket & aktivitas"]).toBeTruthy();
    expect(budget?.categories.at(-1)).toMatchObject({ name: "Visa", note: "Dari internet" });
    expect(budget?.totalIdr).toBe((budget?.categories ?? []).reduce((s, c) => s + c.amountIdr, 0));
  });

  it("leaves flights and eSIM out when nothing was found", () => {
    const plan = computeBudgetPlan({
      days: 3,
      travelers: 1,
      costs,
      outboundIdr: null,
      returnIdr: null,
      esimIdr: null,
      totalBudgetIdr: 0,
    });
    const names = (
      templateBudgetFromPlan({
        lines: plan.lines,
        city: "Hanoi",
        costSource: "ai",
        flightNote: "",
        esimName: null,
      })?.categories ?? []
    ).map((c) => c.name);
    expect(names).not.toContain("Tiket pesawat");
    expect(names).not.toContain("eSIM & internet");
    expect(names).toContain("Akomodasi");
  });
});

describe("agenda to template items", () => {
  const change = (patch: Partial<AgendaChange>): AgendaChange => ({
    op: "add",
    itemId: null,
    title: "Fushimi Inari",
    date: "2027-01-12",
    startTime: "09:00",
    endTime: "10:45",
    location: "Fushimi",
    category: "sightseeing",
    estimatedCostMinor: 60_400,
    place: "Fushimi Inari",
    note: null,
    lat: 34.967,
    lng: 135.773,
    hours: null,
    ...patch,
  });
  it("maps dates to Hari N, keeps the map point and rounds the cost", () => {
    const items = itemsFromAgenda(
      [
        change({}),
        change({
          title: "Makan siang: Nishiki",
          date: "2027-01-13",
          category: "food",
          estimatedCostMinor: 0,
        }),
        change({ date: "2030-01-01" }),
      ],
      ["2027-01-12", "2027-01-13"],
      "Kyoto",
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      day: 1,
      category: "wisata",
      location: "Fushimi, Kyoto",
      lat: 34.967,
      lng: 135.773,
      costIdr: 60_000,
    });
    expect(items[1]).toMatchObject({ day: 2, category: "kuliner", costIdr: null });
  });
});

describe("sources and draft cleaning", () => {
  it("says what came from our features and what from the internet", () => {
    const rows = describeSources({
      flights: "internet",
      esim: true,
      costSource: "ai",
      places: 18,
      web: ["Visa", "Tiket pesawat"],
    });
    expect(rows[0]).toContain("internet");
    expect(rows.join(" ")).toContain("katalog Djiwa");
    expect(rows.join(" ")).toContain("18 tempat dari peta Djiwa");
    expect(rows.at(-1)).toBe("Tiket pesawat: dari internet, cek ulang sebelum berangkat");
  });

  it("keeps a real map point on a draft and drops a broken one", () => {
    const draft = cleanTemplateDraft(
      {
        title: "Kyoto 1 Hari",
        description: "",
        destinationName: "Kyoto",
        destinationCode: "JP",
        days: 1,
        items: [
          {
            day: 1,
            start: "09:00",
            end: "",
            title: "A",
            location: "",
            category: "wisata",
            lat: 34.9,
            lng: 135.7,
          },
          {
            day: 1,
            start: "11:00",
            end: "",
            title: "B",
            location: "",
            category: "wisata",
            lat: 999,
            lng: 135.7,
          },
        ],
      },
      1,
    );
    expect(draft?.items[0]).toMatchObject({ lat: 34.9, lng: 135.7 });
    expect(draft?.items[1]).not.toHaveProperty("lat");
  });
});
