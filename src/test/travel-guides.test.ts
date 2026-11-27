import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { itineraryGuides } from "@/lib/travel-guides-itinerary";
import { officialTemplates } from "@/lib/official-templates";
import { buildGuideRss, buildGuidesFullText } from "@/lib/guide-feed";
import {
  getNewestTravelGuides,
  getTravelGuide,
  travelGuides,
  travelGuideSlugs,
} from "@/lib/travel-guides";

describe("travel guide SEO registry", () => {
  it("includes the 2026 Japan tax refund guide and its key traveler rules", () => {
    const guide = getTravelGuide("tax-refund-jepang-2026");
    expect(guide).toBeDefined();
    if (!guide) return;

    expect(guide.title).toContain("Tax Refund Jepang 2026");
    expect(guide.description).toMatch(/1 November 2026/);
    expect(guide.image).toBe("/assets/guides/tax-refund-jepang-2026.jpg");
    expect(guide.sources?.map((source) => source.url)).toContain(
      "https://www.mlit.go.jp/kankocho/tax-free/page01_000001_00021.html",
    );

    const copy = [...guide.paragraphs, ...guide.steps.map((step) => step.body)].join(" ");
    expect(copy).toMatch(/90 hari/);
    expect(copy).toMatch(/¥5\.000/);
    expect(copy).toMatch(/nota/);
    expect(copy).toMatch(/bagasi tercatat/);
    expect(copy).toMatch(/barang habis pakai/);
  });

  it("contains useful, unique Indonesian guides", () => {
    expect(travelGuides.length).toBeGreaterThanOrEqual(3);
    expect(new Set(travelGuideSlugs).size).toBe(travelGuides.length);
    expect(new Set(travelGuides.map((guide) => guide.title)).size).toBe(travelGuides.length);
    for (const guide of travelGuides) {
      expect(guide.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(guide.description.length).toBeGreaterThan(60);
      expect(guide.heading.length).toBeGreaterThan(20);
      expect(guide.paragraphs.length).toBeGreaterThanOrEqual(2);
      expect(guide.steps.length).toBeGreaterThanOrEqual(3);
      expect(guide.relatedDestinations.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("ships ten answer-first explainer guides with FAQ, summary and citations", () => {
    const explainers = travelGuides.filter((g) => g.publishedAt === "2026-11-24");
    expect(explainers).toHaveLength(10);
    for (const g of explainers) {
      expect(g.summary && g.summary.length).toBeGreaterThan(120);
      expect(g.faqs?.length).toBeGreaterThanOrEqual(3);
      expect(g.keywords?.length).toBeGreaterThanOrEqual(2);
      expect(g.title.length).toBeLessThanOrEqual(75);
      expect(g.description.length).toBeLessThanOrEqual(200);
      expect(g.paragraphs.join(" ")).not.toMatch(/Rp\s?\d/);
    }
  });

  it("ships ten transport guides with answer-first copy and distinct covers", () => {
    const arrivals = travelGuides.filter((guide) => guide.publishedAt === "2026-11-25");
    expect(arrivals.map((guide) => guide.slug)).toEqual([
      "jr-pass-jepang-worth-it-tokyo-kyoto-osaka",
      "suica-vs-icoca-kartu-transportasi-jepang",
      "cara-naik-mrt-singapura-kartu-contactless-ez-link",
      "incheon-ke-seoul-arex-express-all-stop",
      "suvarnabhumi-ke-bangkok-airport-rail-link",
      "kansai-airport-ke-osaka-nankai-rapit-haruka",
      "klia-ke-kuala-lumpur-ekspres-atau-transit",
      "cara-pakai-tmoney-seoul-beli-top-up",
      "bandara-hong-kong-ke-kota-airport-express-atau-bus",
      "taoyuan-airport-ke-taipei-main-station-mrt",
    ]);
    expect(new Set(arrivals.map(({ image }) => image)).size).toBe(10);
    for (const guide of arrivals) {
      expect(guide.summary?.length).toBeGreaterThan(120);
      expect(guide.faqs?.length).toBeGreaterThanOrEqual(3);
      expect(guide.keywords?.length).toBeGreaterThanOrEqual(2);
      expect(guide.sources?.length).toBeGreaterThanOrEqual(2);
      expect(guide.title.length).toBeLessThanOrEqual(75);
      expect(guide.description.length).toBeLessThanOrEqual(200);
      expect(guide.paragraphs.length).toBeGreaterThanOrEqual(4);
      expect(guide.steps.length).toBeGreaterThanOrEqual(3);
      expect(guide.imageAlt?.length).toBeGreaterThan(20);
      expect(guide.relatedLinks?.length).toBeGreaterThanOrEqual(1);
      expect(["jp", "sg", "kr", "th", "my", "hk", "tw"]).toContain(
        guide.relatedDestinations[0]?.code,
      );
      expect(guide.sources?.every((source) => source.url.startsWith("https://"))).toBe(true);
      const image = guide.image;
      expect(image).toMatch(/^\/assets\/guides\/.+\.jpg$/);
      if (!image) continue;
      expect(existsSync(resolve(process.cwd(), `public${image}`))).toBe(true);
    }
  });

  it("publishes ten illustrated search guides at the front of the November release", () => {
    const guides = travelGuides.filter(
      (g) => g.publishedAt === "2026-11-27" && !itineraryGuides.includes(g),
    );
    expect(guides).toHaveLength(10);
    expect(new Set(guides.map((g) => g.image)).size).toBe(10);
    const newest = getNewestTravelGuides(10 + itineraryGuides.length);
    for (const guide of guides) expect(newest).toContain(guide);
    for (const guide of guides) {
      expect(guide.faqs?.length).toBeGreaterThanOrEqual(2);
      expect(guide.summary?.length).toBeGreaterThan(120);
    }
  });

  it("publishes a copyable Travo template for every itinerary guide", () => {
    expect(officialTemplates).toHaveLength(12);
    const slugs = new Set(officialTemplates.map((t) => t.slug));
    expect(slugs.size).toBe(12);
    for (const t of officialTemplates) {
      expect(t.slug).toMatch(/^[a-z0-9-]{6,80}$/);
      expect(t.days.length).toBeGreaterThanOrEqual(4);
      for (const day of t.days) {
        expect(day.length).toBeGreaterThanOrEqual(2);
        const times = day.map((i) => i[0]);
        expect([...times].sort()).toEqual(times);
        for (const [start, title, location] of day) {
          expect(start).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
          expect(title.length).toBeLessThanOrEqual(160);
          expect(location.length).toBeLessThanOrEqual(200);
        }
      }
    }
    for (const guide of itineraryGuides) {
      for (const link of guide.relatedLinks ?? []) {
        if ("template" in link) expect(slugs.has(link.template)).toBe(true);
      }
    }
    const sql = readFileSync(
      resolve(process.cwd(), "migrations/088_travo_official_templates.sql"),
      "utf8",
    );
    for (const slug of slugs) expect(sql).toContain(`'${slug}'`);
  });

  it("builds RSS and full-text feeds for every guide", () => {
    const rss = buildGuideRss(travelGuides);
    const full = buildGuidesFullText(travelGuides);
    for (const g of travelGuides) {
      expect(rss).toContain(`/panduan/${g.slug}`);
      expect(full).toContain(g.title);
    }
    expect(rss).toContain('<rss version="2.0"');
  });

  it("resolves known slugs and rejects unknown input", () => {
    expect(getTravelGuide(travelGuideSlugs[0]!)).toBe(travelGuides[0]);
    expect(getTravelGuide("tidak-ada")).toBeUndefined();
    expect(getTravelGuide("<script>alert(1)</script>")).toBeUndefined();
  });

  it("keeps public guide metadata, schema, and sitemap wiring explicit", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/routes/panduan.$slug.tsx"), "utf8");
    const guideIndex = readFileSync(resolve(process.cwd(), "src/routes/panduan.index.tsx"), "utf8");
    const sitemap = readFileSync(resolve(process.cwd(), "src/routes/sitemap[.]xml.ts"), "utf8");
    expect(detail).toContain('rel: "canonical"');
    expect(detail).toContain('property: "og:type", content: "article"');
    expect(detail).toContain('property: "og:image:alt"');
    expect(detail).toContain("<GuideShareActions title={guide.title}");
    expect(detail).toContain('"@type": "Article"');
    expect(detail).toContain(
      "image: loaderData.image ? `${BASE_URL}${loaderData.image}` : undefined",
    );
    expect(detail).toContain('"@type": "BreadcrumbList"');
    expect(guideIndex).toContain("tax refund Jepang");
    expect(guideIndex).toContain('property: "og:image"');
    expect(sitemap).toContain("getNewestTravelGuides().map");
    expect(sitemap).toContain("<lastmod>");
    expect(sitemap).not.toMatch(/urlEntry\(`\/(?:admin|api|checkout|order|receipt|my-esim)/);
  });

  it("attaches an original image and descriptive alternative text to every guide", () => {
    const added = travelGuides.filter((guide) => guide.image);
    expect(added).toHaveLength(travelGuides.length);
    expect(added.every((guide) => guide.imageAlt)).toBe(true);
    for (const guide of added) {
      expect(guide.image).toMatch(/^\/assets\/guides\/.+\.jpg$/);
      expect(existsSync(resolve(process.cwd(), `public${guide.image}`))).toBe(true);
    }
    const citedGuides = travelGuides.filter((guide) => guide.sources?.length);
    expect(citedGuides).toHaveLength(travelGuides.length);
    expect(
      citedGuides.every((guide) =>
        guide.sources?.every((source) => source.url.startsWith("https://")),
      ),
    ).toBe(true);
  });

  it("links every internal guide reference to an existing guide", () => {
    for (const guide of travelGuides) {
      for (const link of guide.relatedLinks ?? []) {
        if ("guide" in link) expect(getTravelGuide(link.guide)).toBeDefined();
      }
    }
  });

  it("renders guide images and cited source links in article pages", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/routes/panduan.$slug.tsx"), "utf8");
    expect(detail).toContain("guide.image");
    expect(detail).toContain("guide.sources");
    expect(detail).toContain('property: "og:image"');
  });
});
