import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTravelGuide, travelGuides, travelGuideSlugs } from "@/lib/travel-guides";

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
    expect(detail).toContain("<GuideShareActions title={guide.title}");
    expect(detail).toContain('"@type": "Article"');
    expect(detail).toContain(
      "image: loaderData.image ? `${BASE_URL}${loaderData.image}` : undefined",
    );
    expect(detail).toContain('"@type": "BreadcrumbList"');
    expect(guideIndex).toContain("tax refund Jepang");
    expect(sitemap).toContain("travelGuideSlugs.map");
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
