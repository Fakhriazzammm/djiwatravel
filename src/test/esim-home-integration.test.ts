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
    expect(homeSource).toContain(
      'import { EsimPackageResults } from "@/components/esim-package-results";',
    );
    expect(homeSource).toContain("onSearchPackages={() => setSearchOpen(true)}");
    expect(homeSource).toContain("<EsimPackageResults");
    expect(cardPosition).toBeGreaterThan(-1);
    expect(cardPosition).toBeLessThan(destinationPosition);
    expect(homeSource).not.toContain("Perjalanan aktif");
  });

  it("keeps the five customer bottom-navigation destinations unchanged", () => {
    for (const route of ["/", "/explore", "/my-trips", "/wallet", "/profile"]) {
      expect(shellSource).toContain(`to: "${route}"`);
    }
  });
});

describe("shared eSIM modules (no duplicated flows)", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("reads a destination's packages through one server function everywhere", () => {
    expect(read("src/routes/destination.$code.tsx")).toContain("getDestinationPage");
    expect(read("src/lib/destination-page.server.ts")).toContain("getDestinationPackagesHandler");
    expect(read("src/components/esim-destination-sheet.tsx")).toContain("getDestinationPackages");
    expect(read("src/routes/destination.$code.tsx")).not.toContain("readSellability");
  });

  it("opens one package sheet from the rail, search results and the promo banner", () => {
    expect(homeSource).toContain("<EsimDestinationSheet");
    expect(homeSource.match(/<EsimDestinationSheet/g)).toHaveLength(1);
    expect(homeSource).toContain('openSheet(destination, "search")');
    expect(homeSource).toContain("home_esim_chip_tap");
    expect(homeSource).toContain("home_esim_promo_tap");
    expect(homeSource).toContain("openPromo");
  });

  it("renders the status chip, quota ring and stepper from shared components", () => {
    const card = read("src/components/esim-home-summary-card.tsx");
    expect(card).toContain("EsimStatusBadge");
    // The Home rail shows a linear progress bar (not the ring used on the eSIM list).
    expect(card).toContain('role="progressbar"');
    expect(card).toContain("EsimActivationStepper");
    expect(card).not.toContain("function statusBadge");
    expect(read("src/components/travel-usage-card.tsx")).toContain("QuotaRing");
  });

  it("previews the admin setting with the real customer card and one config record", () => {
    const panel = read("src/components/admin-home-esim-panel.tsx");
    expect(panel).toContain("<EsimHomeSummaryCard");
    expect(read("src/routes/admin.settings.tsx")).toContain("AdminHomeEsimPanel");
    expect(read("src/hooks/use-home-esim-config.ts")).toContain("getHomeEsimConfig");
    expect(read("src/lib/home-esim-config.server.ts")).toContain("admin_settings");
  });
});
