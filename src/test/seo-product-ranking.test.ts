import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/seo";
import { toViewPackage } from "@/lib/package-view";

const sourceRoot = resolve(process.cwd(), "src");

function read(path: string) {
  return readFileSync(resolve(sourceRoot, path), "utf8");
}

describe("public product SEO contract", () => {
  it("projects only public package fields into the SSR view", () => {
    const view = toViewPackage({
      packageCode: "JP-5GB-15D",
      name: "Japan 5GB",
      locationCodes: ["JP"],
      volumeBytes: 5_000_000_000,
      durationDays: 15,
      sellingPrice: { providerCostIdr: 10_000, sellingPriceIdr: 75_000 },
      providerSnapshot: { providerSecret: "never-render" },
    } as never);

    expect(view).toEqual({
      packageCode: "JP-5GB-15D",
      name: "Japan 5GB",
      locationCodes: ["JP"],
      volumeBytes: 5_000_000_000,
      unlimited: false,
      durationDays: 15,
      priceIdr: 75_000,
      sellable: true,
    });
    expect(JSON.stringify(view)).not.toMatch(
      /providerCost|margin|providerSnapshot|secret|iccid|order/i,
    );
  });

  it("creates truthful Product and breadcrumb JSON-LD without private fields", () => {
    const product = productJsonLd({
      name: "eSIM Jepang 5 GB",
      description: "5 GB untuk Jepang selama 15 hari.",
      sku: "JP-5GB-15D",
      url: "https://djiwatravel.com/plan/JP-5GB-15D",
      priceIdr: 75_000,
    });
    const breadcrumb = breadcrumbJsonLd([
      { name: "Beranda", url: "https://djiwatravel.com/" },
      { name: "Jepang", url: "https://djiwatravel.com/destination/jp" },
    ]);

    expect(product["@type"]).toBe("Product");
    expect((product["offers"] as Record<string, unknown>)["price"]).toBe(75_000);
    expect(breadcrumb["itemListElement"]).toHaveLength(2);
    expect(JSON.stringify({ product, breadcrumb })).not.toMatch(
      /providerCost|margin|providerSnapshot|iccid|customer|order/i,
    );
  });

  it("keeps sitemap and robots on an explicit public allowlist", () => {
    const sitemap = read("routes/sitemap[.]xml.ts");
    const robots = readFileSync(resolve(process.cwd(), "public/robots.txt"), "utf8");
    expect(sitemap).toContain("getIndexablePlans");
    expect(sitemap).toContain("/plan/");
    expect(sitemap).not.toMatch(
      /urlEntry\([^)]*\/(?:admin|api|checkout|order|receipt|my-esim|wallet)/,
    );
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("Disallow: /api/");
  });

  it("keeps plan checkout as a link, not the SEO authority", () => {
    const plan = read("routes/plan.$id.tsx");
    expect(plan).toContain('rel: "canonical"');
    expect(plan).toContain("productJsonLd");
    expect(plan).toContain('to="/checkout/$id"');
    expect(plan).not.toContain('redirect({ to: "/checkout/$id"');
  });
});
