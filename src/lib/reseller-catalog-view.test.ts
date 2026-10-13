import { describe, expect, it } from "vitest";
import { filterPackagesByDestination } from "./reseller-catalog-view";

describe("filterPackagesByDestination", () => {
  const packages = [
    { packageCode: "asia", locationCodes: ["JP", "KR"] },
    { packageCode: "japan", locationCodes: ["JP"] },
    { packageCode: "europe", locationCodes: ["EU"] },
  ];

  it("matches an exact destination code", () => {
    expect(filterPackagesByDestination(packages, "jp").map((pkg) => pkg.packageCode)).toEqual([
      "asia",
      "japan",
    ]);
  });

  it("matches regional coverage without requiring a provider regional code", () => {
    expect(
      filterPackagesByDestination(packages, "ASIA", ["JP", "KR"]).map((pkg) => pkg.packageCode),
    ).toEqual(["asia", "japan"]);
  });
});
