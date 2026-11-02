import { describe, expect, it } from "vitest";
import { adminPaymentProviderLabel } from "../lib/admin-read-model.server";

describe("admin payment method label", () => {
  it("shows the customer's payment method, not the gateway name", () => {
    expect(adminPaymentProviderLabel("mayar", "qris")).toBe("QRIS");
    expect(adminPaymentProviderLabel("mayar", "va")).toBe("Virtual Account");
    expect(adminPaymentProviderLabel(null, "qris")).toBe("QRIS");
    expect(adminPaymentProviderLabel("mayar", null)).toBe("QRIS");
    expect(adminPaymentProviderLabel("djiwa_pay")).toBe("Djiwa Pay");
    expect(adminPaymentProviderLabel(null, "djiwa_pay")).toBe("Djiwa Pay");
  });

  it("never echoes unknown provider or method values", () => {
    expect(adminPaymentProviderLabel("untrusted-provider")).toBeNull();
    expect(adminPaymentProviderLabel(null, "untrusted-method")).toBeNull();
    expect(adminPaymentProviderLabel("mayar", "<script>")).toBe("QRIS");
  });
});
