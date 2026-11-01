import { describe, expect, it } from "vitest";
import { buildDestinationFacts, buildLlmsTxt, buildRobotsTxt, faqPageJsonLd } from "@/lib/geo";
import { DEFAULT_GEO_CONFIG, parseGeoConfig } from "@/lib/geo-config";
import { productJsonLd } from "@/lib/seo";
import type { ViewPackage } from "@/lib/package-view";

const pkg = (over: Partial<ViewPackage>): ViewPackage => ({
  packageCode: "P1",
  name: "Japan 5GB 7Days",
  locationCodes: ["JP"],
  volumeBytes: 5 * 1_073_741_824,
  unlimited: false,
  durationDays: 7,
  priceIdr: 99_000,
  sellable: true,
  ...over,
});

describe("GEO builders", () => {
  it("builds an answer-first summary from sellable packages only", () => {
    const f = buildDestinationFacts("Jepang", [
      pkg({}),
      pkg({ packageCode: "P2", priceIdr: 50_000, volumeBytes: 1_073_741_824, durationDays: 3 }),
      pkg({ packageCode: "P3", priceIdr: 1_000, sellable: false }),
    ]);
    expect(f.count).toBe(2);
    expect(f.cheapest?.packageCode).toBe("P2");
    expect(f.answer).toContain("Rp50.000");
    expect(f.answer).toContain("3–7 hari");
    expect(f.faqs.length).toBeGreaterThanOrEqual(4);
    expect(faqPageJsonLd(f.faqs).mainEntity).toHaveLength(f.faqs.length);
  });

  it("is safe when nothing is sellable", () => {
    const f = buildDestinationFacts("Mars", []);
    expect(f.count).toBe(0);
    expect(f.cheapest).toBeNull();
  });

  it("robots.txt opens AI bots by default and closes them on Admin switch", () => {
    const open = buildRobotsTxt(DEFAULT_GEO_CONFIG);
    expect(open).toMatch(/User-agent: GPTBot\nAllow: \//);
    expect(open).toContain("llms.txt");
    const closed = buildRobotsTxt({ aiSearchEnabled: false, aiTrainingEnabled: false });
    expect(closed).toMatch(/User-agent: PerplexityBot\nDisallow: \//);
    expect(closed).toMatch(/User-agent: ClaudeBot\nDisallow: \//);
    expect(closed).toContain("Disallow: /admin");
    expect(closed).toContain("Sitemap:");
  });

  it("llms.txt lists destinations and guides", () => {
    const t = buildLlmsTxt({
      destinations: [{ code: "JP", nameId: "Jepang" }],
      guides: [{ slug: "g", title: "Panduan", description: "d" }],
    });
    expect(t).toContain("/destination/jp");
    expect(t).toContain("/panduan/g");
  });

  it("validates the admin config", () => {
    expect(() => parseGeoConfig({ aiSearchEnabled: "yes" })).toThrow();
    expect(parseGeoConfig({})).toEqual(DEFAULT_GEO_CONFIG);
  });

  it("product schema carries validity, availability and seller", () => {
    const ld = productJsonLd({
      name: "n",
      description: "d",
      sku: "s",
      url: "u",
      priceIdr: 1,
      available: false,
    }) as {
      offers: { availability: string; priceValidUntil: string; seller: unknown };
    };
    expect(ld.offers.availability).toBe("https://schema.org/OutOfStock");
    expect(ld.offers.priceValidUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ld.offers.seller).toBeTruthy();
  });
});
