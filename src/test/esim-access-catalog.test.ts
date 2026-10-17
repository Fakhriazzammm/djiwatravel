import { describe, expect, it, vi } from "vitest";
import {
  isRecommendablePackage,
  loadResellerCatalog,
  normalizeEsimAccessPackage,
} from "@/lib/esim-access-catalog";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/esim-access", () => ({ queryEsimAccessPackages: query }));

describe("direct provider catalog", () => {
  it("omits optional speed and reliability when the provider does not supply them", () => {
    const result = normalizeEsimAccessPackage({
      packageCode: "TH-1",
      locationCode: "TH",
      price: 100,
    });
    expect(result).not.toHaveProperty("speed");
    expect(result).not.toHaveProperty("unlimited");
    expect(result).not.toHaveProperty("available");
    expect(result).not.toHaveProperty("reliabilityScore");
  });

  it("hides packages the partner cannot sell instead of faking cheap or unlimited terms", async () => {
    const valid = {
      packageCode: "valid",
      locationCode: "JP",
      price: 10000,
      duration: 7,
      volume: 3e9,
    };
    query.mockResolvedValue({
      obj: {
        packageList: [
          valid,
          { ...valid, packageCode: "zero-price", price: 0 },
          { ...valid, packageCode: "missing-price", price: undefined },
          { ...valid, packageCode: "negative-price", price: -1 },
          { ...valid, packageCode: "nan-price", price: NaN },
          {
            ...valid,
            packageCode: "missing-location",
            locationCode: undefined,
          },
          { ...valid, packageCode: "missing-duration", duration: undefined },
          { ...valid, packageCode: "unknown-data", volume: 0 },
          { ...valid, packageCode: "unavailable", available: false },
          { ...valid, packageCode: "unlimited", volume: 0, unlimited: true },
        ],
      },
    });
    const result = await loadResellerCatalog({ packageCode: "valid" });
    expect(query).toHaveBeenCalledWith({ data: { packageCode: "valid" } });
    // Unknown or zero commercial terms stay hidden; an explicit unlimited
    // signal is a known term and remains listed.
    expect(result.map((pkg) => pkg.packageCode)).toEqual(["valid", "unlimited"]);
    expect(result[0]!.providerSnapshot).toBe(valid);
    expect(result[0]!.sellingPrice.configSnapshot).toHaveProperty("usdToIdr");
  });

  it("keeps unknown or zero provider fields out of recommendation eligibility", () => {
    const valid = {
      packageCode: "valid",
      locationCode: "JP",
      price: 10000,
      duration: 7,
      volume: 3e9,
    };
    const recommendable = (patch: Record<string, unknown>) =>
      isRecommendablePackage(normalizeEsimAccessPackage({ ...valid, ...patch }));
    expect(recommendable({})).toBe(true);
    expect(recommendable({ price: 0 })).toBe(false);
    expect(recommendable({ duration: 0 })).toBe(false);
    expect(recommendable({ locationCode: undefined, location: undefined })).toBe(false);
    expect(recommendable({ volume: 0 })).toBe(false);
    expect(recommendable({ volume: 0, unlimited: true })).toBe(true);
    expect(recommendable({ available: false })).toBe(false);
  });

  it("does not coerce arbitrary provider fields into positive signals", () => {
    const result = normalizeEsimAccessPackage({
      packageCode: "unknown",
      unlimited: "true",
      available: "true",
      reliabilityScore: 10,
    });
    expect(result).not.toHaveProperty("unlimited");
    expect(result).not.toHaveProperty("available");
    expect(result).not.toHaveProperty("reliabilityScore");
  });
});
