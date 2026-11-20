import { describe, expect, it } from "vitest";
import {
  cleanTemplateBudget,
  cleanTemplateDraft,
  dateForDay,
  dayIndexFor,
  makeSlug,
  normalizeTripTemplatesConfig,
  parseTripTemplatesConfig,
  returnDateFor,
  splitTotalBudget,
  templatePath,
} from "@/lib/trip-templates";

describe("trip template day math", () => {
  it("maps dates to Hari N and back", () => {
    expect(dayIndexFor("2026-12-01", "2026-12-01")).toBe(1);
    expect(dayIndexFor("2026-12-01", "2026-12-04")).toBe(4);
    expect(dayIndexFor("2026-12-01", "2026-11-30")).toBeNull();
    expect(dayIndexFor("2026-12-01", "2027-02-01")).toBeNull();
    expect(dateForDay("2026-12-30", 3)).toBe("2027-01-01");
    expect(returnDateFor("2026-12-01", 5)).toBe("2026-12-05");
  });
});

describe("trip template slug and link", () => {
  it("builds a safe slug and carries the creator's affiliate code", () => {
    const slug = makeSlug("Kyoto 3 Hari: Kuil & Kuliner!", "AB12cd34ef");
    expect(slug).toMatch(/^[a-z0-9-]{6,80}$/);
    expect(slug.endsWith("-ab12cd34")).toBe(true);
    expect(templatePath(slug, "DJIWA-X1")).toBe(`/template/${slug}?ref=DJIWA-X1`);
    expect(templatePath(slug, null)).toBe(`/template/${slug}`);
  });
});

describe("trip template config", () => {
  it("falls back field by field and rejects bad admin input", () => {
    expect(normalizeTripTemplatesConfig({ maxPerUser: 9999, enabled: false })).toMatchObject({
      enabled: false,
      maxPerUser: 20,
    });
    const good = { ...normalizeTripTemplatesConfig({}) };
    expect(parseTripTemplatesConfig(good)).toEqual(good);
    expect(() => parseTripTemplatesConfig({ ...good, dailyUses: 0 })).toThrow();
    expect(() => parseTripTemplatesConfig({ ...good, enabled: "yes" })).toThrow();
  });
});

describe("cleanTemplateDraft (Travo output)", () => {
  const base = {
    title: "Kyoto 2 hari",
    description: "Santai",
    destinationName: "Kyoto, Jepang",
    destinationCode: "jp",
    days: 2,
  };
  it("keeps valid items, drops unusable ones and orders by day and time", () => {
    const draft = cleanTemplateDraft(
      {
        ...base,
        items: [
          {
            day: 2,
            start: "09:00",
            end: "08:00",
            title: "Arashiyama",
            location: "Kyoto",
            category: "wisata",
          },
          {
            day: 1,
            start: "13:00",
            end: "14:00",
            title: "Makan siang",
            location: "",
            category: "kuliner",
          },
          {
            day: 1,
            start: "25:99",
            end: "",
            title: "Fushimi Inari",
            location: "x",
            category: "aneh",
          },
          {
            day: 9,
            start: "10:00",
            end: "",
            title: "Hari di luar rentang",
            location: "",
            category: "",
          },
          { day: 1, start: "", end: "", title: "", location: "", category: "" },
        ],
      },
      2,
    );
    expect(draft?.destinationCode).toBe("JP");
    expect(draft?.items.map((i) => i.title)).toEqual([
      "Makan siang",
      "Fushimi Inari",
      "Arashiyama",
    ]);
    expect(draft?.items[1]).toMatchObject({ start: null, category: "lainnya" });
    expect(draft?.items[2]).toMatchObject({ start: "09:00", end: null });
  });
  it("caps items per day and rejects empty or untitled drafts", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      day: 1,
      start: "",
      end: "",
      title: `Tempat ${i}`,
      location: "",
      category: "wisata",
    }));
    expect(cleanTemplateDraft({ ...base, items: many }, 2)?.items).toHaveLength(8);
    expect(cleanTemplateDraft({ ...base, items: [] }, 2)).toBeNull();
    expect(cleanTemplateDraft({ ...base, title: "", items: many }, 2)).toBeNull();
    expect(cleanTemplateDraft(null, 2)).toBeNull();
  });
});

describe("template budget (Travo output)", () => {
  it("cleans lines, merges duplicates, rounds and totals", () => {
    const budget = cleanTemplateBudget([
      { name: "Makan", amountIdr: 1_500_000.4 },
      { name: "Makan", amountIdr: 500_000 },
      { name: "Akomodasi", amountIdr: 4_000_000 },
      { name: "", amountIdr: 100 },
      { name: "Nol", amountIdr: 0 },
      { name: "Negatif", amountIdr: -5 },
      null,
    ]);
    expect(budget).toEqual({
      categories: [
        { name: "Makan", amountIdr: 2_000_000 },
        { name: "Akomodasi", amountIdr: 4_000_000 },
      ],
      totalIdr: 6_000_000,
    });
    expect(cleanTemplateBudget([])).toBeNull();
    expect(cleanTemplateBudget("x")).toBeNull();
  });

  it("keeps per-item costs and the budget on a cleaned draft", () => {
    const draft = cleanTemplateDraft(
      {
        title: "Bali 2 hari",
        description: "",
        destinationName: "Bali",
        destinationCode: "ID",
        days: 2,
        items: [
          {
            day: 1,
            start: "09:00",
            end: "",
            title: "Tanah Lot",
            location: "Tabanan",
            category: "wisata",
            costIdr: 60_000,
          },
          {
            day: 1,
            start: "12:00",
            end: "",
            title: "Makan",
            location: "",
            category: "kuliner",
            costIdr: -1,
          },
        ],
        budget: [{ name: "Akomodasi", amountIdr: 800_000 }],
      },
      2,
    );
    expect(draft?.items.map((i) => i.costIdr)).toEqual([60_000, null]);
    expect(draft?.budget?.totalIdr).toBe(800_000);
  });
});

describe("splitTotalBudget (a trip that only has a lump sum)", () => {
  it("splits into the default categories and always adds up to the total", () => {
    for (const total of [15_000_000, 7_333_000, 999_000, 500_000]) {
      const lines = splitTotalBudget(total);
      expect(lines.reduce((sum, l) => sum + l.amountIdr, 0)).toBe(total);
      expect(lines.every((l) => l.amountIdr > 0)).toBe(true);
    }
    expect(splitTotalBudget(15_000_000).map((l) => l.name)).toEqual([
      "Akomodasi",
      "Transportasi",
      "Makan",
      "Tiket & aktivitas",
      "Belanja & lainnya",
    ]);
    expect(splitTotalBudget(15_000_000)[0]?.amountIdr).toBe(5_850_000);
  });
  it("keeps a tiny total as one line and ignores nothing-or-negative", () => {
    expect(splitTotalBudget(300_000)).toEqual([{ name: "Total anggaran", amountIdr: 300_000 }]);
    expect(splitTotalBudget(0)).toEqual([]);
    expect(splitTotalBudget(-5)).toEqual([]);
  });
});

describe("template budget notes", () => {
  it("keeps a short source note per line and drops it when empty", () => {
    const budget = cleanTemplateBudget([
      { name: "Tiket pesawat", amountIdr: 8_200_000, note: "  Harga tercatat Aviasales  " },
      { name: "Makan", amountIdr: 3_000_000, note: "" },
    ]);
    expect(budget?.categories[0]).toEqual({
      name: "Tiket pesawat",
      amountIdr: 8_200_000,
      note: "Harga tercatat Aviasales",
    });
    expect(budget?.categories[1]).toEqual({ name: "Makan", amountIdr: 3_000_000 });
  });
});
