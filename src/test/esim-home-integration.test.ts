import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync("src/routes/index.tsx", "utf8");
const shellSource = readFileSync("src/components/shell.tsx", "utf8");

describe("Home eSIM dashboard integration", () => {
  it("renders the eSIM summary before destination discovery and removes the duplicate active-trip block", () => {
    const cardPosition = homeSource.indexOf("<EsimHomeSummaryCard");
    const destinationPosition = homeSource.indexOf("Destinasi Populer");

    expect(homeSource).toContain(
      'import { EsimHomeSummaryCard } from "@/components/esim-home-summary-card";',
    );
    expect(cardPosition).toBeGreaterThan(-1);
    expect(cardPosition).toBeLessThan(destinationPosition);
    expect(homeSource).not.toContain("Perjalanan aktif");
  });

  it("keeps the five customer bottom-navigation destinations unchanged", () => {
    for (const route of ["/", "/explore", "/my-trips", "/wallet/pay", "/profile"]) {
      expect(shellSource).toContain(`to: "${route}"`);
    }
  });
});
