import { describe, expect, it } from "vitest";
import { clearResellerCatalogCache } from "@/lib/reseller-catalog-cache";

describe("reseller catalog cache", () => {
  it("exposes an explicit cache reset for test/admin sync boundaries", () => {
    clearResellerCatalogCache();
    expect(true).toBe(true);
  });
});
