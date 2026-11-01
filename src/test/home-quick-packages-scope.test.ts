import { describe, expect, it } from "vitest";
import { countryScopedPackages } from "@/lib/home-quick-packages";

const pkg = (name: string, locationCodes: string[]) => ({ name, locationCodes });

describe("country-scoped quick-buy packages", () => {
  const packages = [
    pkg("JP 1GB", ["JP"]),
    pkg("JP 5GB", ["JP"]),
    pkg("Global 1GB 365 hari", ["JP", "SG", "TH", "KR", "US"]),
  ];

  it("keeps a country on its own packages, excluding multi-country bundles", () => {
    expect(countryScopedPackages(packages, "JP", "Asia").map((p) => p.name)).toEqual(["JP 1GB", "JP 5GB"]);
  });

  it("falls back to bundles only when the country has no single-country package", () => {
    const onlyBundle = [pkg("Global 1GB", ["JP", "SG"])];
    expect(countryScopedPackages(onlyBundle, "JP", "Asia")).toEqual(onlyBundle);
  });

  it("leaves regional destinations with their bundles", () => {
    expect(countryScopedPackages(packages, "ASIA", "Regional")).toHaveLength(3);
  });
});
