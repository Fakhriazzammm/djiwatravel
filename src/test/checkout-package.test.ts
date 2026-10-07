import { describe, expect, it } from "vitest";
import { resolveCheckoutPackage } from "../lib/checkout-package";

describe("resolveCheckoutPackage", () => {
  it("requires an exact provider package code match", () => {
    const packages = [{ packageCode: "ESIM-TH-7D", name: "Thailand 7 days" }];
    expect(resolveCheckoutPackage(packages, "ESIM-TH-7D")).toEqual(packages[0]);
    expect(resolveCheckoutPackage(packages, "th-7d")).toBeNull();
  });
});
