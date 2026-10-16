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
    for (const route of [
      "index.tsx",
      "explore.tsx",
      "finder.tsx",
      "panduan.index.tsx",
      "destination.$code.tsx",
      "esim-untuk-traveler-indonesia.tsx",
    ]) {
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

  it("gives every trust page canonical, social, and breadcrumb metadata", () => {
    for (const route of [
      "tentang-djiwa-travel.tsx",
      "bantuan-esim.tsx",
      "kebijakan-refund.tsx",
      "syarat-ketentuan.tsx",
      "kebijakan-privasi.tsx",
      "kontak.tsx",
    ]) {
      const source = readRoute(route);
      expect(source).toContain("publicTrustHead");
      expect(source).toContain("createFileRoute");
      expect(source).not.toContain('name: "robots", content: "noindex"');
    }
    const trust = readFileSync(resolve(process.cwd(), "src/components/public-trust.tsx"), "utf8");
    expect(trust).toContain('property: "og:type"');
    expect(trust).toContain('name: "twitter:card"');
    expect(trust).toContain('rel: "canonical"');
    expect(trust).toContain('"@type": "BreadcrumbList"');
  });

  it("links the public trust pages and known support channel", () => {
    const home = readRoute("index.tsx");
    const trust = readFileSync(resolve(process.cwd(), "src/components/public-trust.tsx"), "utf8");
    for (const path of [
      "/tentang-djiwa-travel",
      "/bantuan-esim",
      "/kebijakan-refund",
      "/syarat-ketentuan",
      "/kebijakan-privasi",
      "/kontak",
    ]) {
      expect(trust).toContain(`to="${path}"`);
    }
    expect(home).toContain("TrustLinks");
    expect(trust).toContain("https://wa.me/6285156399831");
  });

  it("defines the traveler landing page with public links and WebPage schema", () => {
    const landing = readRoute("esim-untuk-traveler-indonesia.tsx");
    expect(landing).toContain('createFileRoute("/esim-untuk-traveler-indonesia")');
    expect(landing).toContain("eSIM untuk Traveler Indonesia");
    expect(landing).toContain('"@type": "WebPage"');
    expect(landing).toContain('"@type": "BreadcrumbList"');
    expect(landing).toContain('to="/explore"');
    expect(landing).toContain('to="/finder"');
    expect(landing).toContain('to="/destination/$code"');
    expect(landing).toContain('to="/panduan/$slug"');
  });

  it("includes the public landing page in the sitemap and home entry point", () => {
    const sitemap = readFileSync(resolve(process.cwd(), "src/routes/sitemap[.]xml.ts"), "utf8");
    const home = readRoute("index.tsx");
    expect(sitemap).toContain("/esim-untuk-traveler-indonesia");
    for (const path of [
      "/tentang-djiwa-travel",
      "/bantuan-esim",
      "/kebijakan-refund",
      "/syarat-ketentuan",
      "/kebijakan-privasi",
      "/kontak",
    ]) {
      expect(sitemap).toContain(path);
    }
    expect(home).toContain('to="/esim-untuk-traveler-indonesia"');
  });

  it("renders Google Search Console verification from the root head", () => {
    const rootRoute = readRoute("__root.tsx");
    expect(rootRoute).toContain(
      '{ name: "google-site-verification", content: "BfdCUEfjXfCIxMExcD8jwOtUUTaUNw_rEa6mmjbZwZ0" }',
    );
    expect(rootRoute).toContain("<head><HeadContent /></head>");
  });

  it("keeps private and transactional routes out of the public sitemap", () => {
    const sitemap = readFileSync(resolve(process.cwd(), "src/routes/sitemap[.]xml.ts"), "utf8");
    const robots = readFileSync(resolve(process.cwd(), "public/robots.txt"), "utf8");
    expect(sitemap).not.toMatch(/urlEntry\([^)]*\/(?:admin|checkout|order|receipt|profile|api)/);
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("Disallow: /api/");
  });
});
