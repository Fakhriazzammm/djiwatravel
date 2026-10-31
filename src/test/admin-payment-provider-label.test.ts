import { describe, expect, it } from "vitest";
import { adminPaymentProviderLabel } from "../lib/admin-read-model.server";

describe("admin payment provider label", () => {
  it("labels Pay-owned wallet charges without exposing unknown provider values", () => {
    expect(adminPaymentProviderLabel("djiwa_pay")).toBe("Djiwa Pay");
    expect(adminPaymentProviderLabel(null, "djiwa_pay")).toBe("Djiwa Pay");
    expect(adminPaymentProviderLabel("unknown", "djiwa_pay")).toBeNull();
    expect(adminPaymentProviderLabel("mayar")).toBe("Mayar");
    expect(adminPaymentProviderLabel("untrusted-provider")).toBeNull();
  });
});
