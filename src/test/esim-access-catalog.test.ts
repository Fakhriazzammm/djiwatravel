import { describe, expect, it } from "vitest";
import { normalizeEsimAccessPackage } from "@/lib/esim-access-catalog";

describe("normalizeEsimAccessPackage", () => {
  it("omits optional speed when provider data does not include it", () => {
    const result = normalizeEsimAccessPackage({
      packageCode: "TH-1",
      locationCode: "TH",
      price: 100,
    });
    expect(result).not.toHaveProperty("speed");
  });
});
