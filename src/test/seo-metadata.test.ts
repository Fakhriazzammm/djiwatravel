import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "src/routes");
const readRoute = (name: string) => readFileSync(resolve(root, name), "utf8");

describe("public SEO metadata wiring", () => {
  it("keeps the home entity schema limited to actual brand/site identity", () => {
    const home = readRoute("index.tsx");
    expect(home).toContain('"@type": "Organization"');
    expect(home).toContain('"@type": "WebSite"');
    expect(home).toContain('logo: "https://djiwatravel.com/icon-512.png"');
    expect(home).not.toContain("SearchAction");
  });

  it("covers social metadata for each indexable route family", () => {
    for (const route of ["index.tsx", "explore.tsx", "finder.tsx", "panduan.index.tsx", "destination.$code.tsx"]) {
      const source = readRoute(route);
      expect(source).toContain('property: "og:type"');
      expect(source).toContain('property: "og:image"');
      expect(source).toContain('name: "twitter:card"');
      expect(source).toContain('name: "twitter:title"');
      expect(source).toContain('name: "twitter:description"');
      expect(source).toContain('name: "twitter:image"');
      expect(source).toContain('rel: "canonical"');
    }
  });

  it("keeps private and transactional routes out of the public sitemap", () => {
    const sitemap = readFileSync(resolve(process.cwd(), "src/routes/sitemap[.]xml.ts"), "utf8");
    const robots = readFileSync(resolve(process.cwd(), "public/robots.txt"), "utf8");
    expect(sitemap).not.toMatch(/urlEntry\([^)]*\/(?:admin|checkout|order|receipt|profile|api)/);
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("Disallow: /api/");
  });
});