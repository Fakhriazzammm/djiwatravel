import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GOOGLE_ANALYTICS_ID, googleAnalyticsHeadScripts } from "@/lib/google-analytics";

describe("Google Analytics head scripts", () => {
  it("is wired into the SSR root head", () => {
    const rootSource = readFileSync("src/routes/__root.tsx", "utf8");

    expect(rootSource).toContain(
      'import { googleAnalyticsHeadScripts } from "../lib/google-analytics";',
    );
    expect(rootSource).toContain("scripts: googleAnalyticsHeadScripts,");
  });

  it("keeps the public gtag loader and config aligned", () => {
    const [loader, config] = googleAnalyticsHeadScripts;

    expect(loader).toMatchObject({
      async: true,
      src: `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`,
    });
    expect(config.children).toContain("window.dataLayer = window.dataLayer || [];");
    expect(config.children).toContain("gtag('js', new Date());");
    expect(config.children).toContain(`gtag('config', '${GOOGLE_ANALYTICS_ID}');`);
  });
});
