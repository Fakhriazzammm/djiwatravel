import { describe, expect, it } from "vitest";
import {
  cleanTemplateDraft,
  dateForDay,
  dayIndexFor,
  makeSlug,
  normalizeTripTemplatesConfig,
  parseTripTemplatesConfig,
  returnDateFor,
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
